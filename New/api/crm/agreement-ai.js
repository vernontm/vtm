const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-5';

// VTM reference pricing so the AI can spot gaps (from the Partner Playbook).
const PLAYBOOK = `VTM service lines & pricing (reference):
- Websites: Basic $500 upfront +$19/mo, Premium $1,500 +$29/mo, Elite $3,500 +$49/mo (one-time build + monthly hosting/upkeep).
- Apps & CRMs: from $2,500.
- Marketing: from $999/mo.
- AI Services: from $1,500.
- Coaching: from $497/mo.
Frame value as "save them money or make them money," never sell on price. Most website deals carry a recurring monthly hosting/upkeep fee.`;

async function callClaude(system, user, maxTokens = 4096) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Claude API error: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).find(c => c.type === 'text')?.text || '';
}

// Escape bare control characters (raw newlines/tabs/returns) that appear INSIDE
// string values — LLMs sometimes emit these unescaped in long markdown fields,
// which breaks JSON.parse. Tracks string vs. structure so we only touch strings.
function escapeBareControls(s) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
    }
    out += ch;
  }
  return out;
}

// Remove em/en dashes from any generated text (an "AI tell" Ray dislikes).
// Em dash → ", " (clause break); en dash → "-" (ranges). Collapse doubled commas.
function stripDashes(s) {
  return s.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, '-').replace(/,\s*,/g, ',');
}
function stripDashesDeep(v) {
  if (typeof v === 'string') return stripDashes(v);
  if (Array.isArray(v)) return v.map(stripDashesDeep);
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = stripDashesDeep(v[k]); return v; }
  return v;
}

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Model did not return JSON');
  const raw = m[0];
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    try { parsed = JSON.parse(escapeBareControls(raw)); }
    catch (e2) { throw new Error('The AI returned a malformed response — please try again.'); }
  }
  return stripDashesDeep(parsed);
}

async function loadContext(clientId) {
  const clients = await supaFetch(`crm_clients?id=eq.${clientId}&select=business_name,owner_name,contact_email,contact_phone,industry,location_city,location_state,client_type,notes,discovery_notes_url`);
  const client = clients && clients[0];
  if (!client) throw new Error('Client not found');
  const projects = await supaFetch(`crm_projects?client_id=eq.${clientId}&select=name,scope,value,status&order=created_at.asc`);
  // Discovery/call notes and AI summaries from the lead Overview timeline — this
  // is where the discussed pricing (e.g. $5,000 total, payment plan) lives.
  const activity = await supaFetch(`crm_client_activity?client_id=eq.${clientId}&type=eq.note&select=tag,body,created_at&order=created_at.desc&limit=40`).catch(() => []);
  return { client, projects: projects || [], activity: activity || [] };
}

function contextBlock(client, projects, activity = []) {
  // Summaries first (most decision-dense), then the rest of the notes.
  const notes = [...activity].sort((a, b) => (b.tag === 'Summary' ? 1 : 0) - (a.tag === 'Summary' ? 1 : 0));
  const notesBlock = notes.length
    ? notes.map(a => `- [${a.tag || 'note'}] ${(a.body || '').toString().slice(0, 1500)}`).join('\n').slice(0, 8000)
    : 'none';
  return `CLIENT: ${client.business_name} (owner: ${client.owner_name}, ${client.contact_email || 'no email'}, ${client.contact_phone || 'no phone'}, ${[client.location_city, client.location_state].filter(Boolean).join(', ')})
Service types: ${(client.client_type || []).join(', ') || 'unspecified'}
Notes: ${client.notes || 'none'}

DISCOVERY NOTES, CALL NOTES & AI SUMMARIES (contains the pricing / payment plan discussed with the client — use these to set the total and payment schedule):
${notesBlock}

PROJECTS / SCOPE:
${projects.length ? projects.map((p, i) => `${i + 1}. ${p.name} — value $${p.value || 0}\n   ${p.scope || 'no scope yet'}`).join('\n') : 'none logged'}`;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  try {
    // ── analyze: propose billing + surface gaps/questions before drafting ──
    if (req.method === 'POST' && action === 'analyze') {
      const { client_id } = req.body || {};
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { client, projects, activity } = await loadContext(client_id);

      const system = `You are a deal strategist for Vernon Tech & Media (VTM), a Katy, Texas agency (Rayvaughn Vernon, dba Vernon Tech & Media). You prepare service agreements. Be sharp about what a founder might FORGET to charge for or specify. ${PLAYBOOK}
Return ONLY JSON with this shape:
{
  "suggested_total": number,
  "suggested_structure": "short human description of a sensible payment split",
  "suggested_installments": [{"label": string, "amount": number, "trigger": string}],
  "suggested_monthly": [{"item": string, "amount": number}],
  "questions": [ up to 6 concise questions to ask Ray about billing/timing ],
  "flags": [ up to 6 concrete gaps or add-ons Ray may be leaving out (e.g. missing monthly hosting on a website, no revision cap, no deposit, change-order terms, rush fees, third-party costs, maintenance) ]
}`;
      const user = `Analyze this deal and propose billing + flag anything missing. Base the total and payment schedule on the pricing actually discussed in the discovery notes/summaries below.\n\n${contextBlock(client, projects, activity)}`;
      const out = await callClaude(system, user, 2048);
      return res.json(parseJson(out));
    }

    // ── generate: draft the full agreement + NDA as reviewable text ──
    if (req.method === 'POST' && action === 'generate') {
      const { client_id, terms, base, mode } = req.body || {};
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { client, projects, activity } = await loadContext(client_id);

      // Revise-mode: an existing document is supplied. Apply ONLY the requested
      // change and keep everything else byte-for-byte, so regenerating tweaks the
      // doc instead of rewriting it in a new style.
      if (base && base.agreement_markdown) {
        const system = `You revise an existing Service Agreement / Mutual NDA for Vernon Tech & Media. You are given the CURRENT documents and a change request. Apply ONLY the requested change. NEVER use em dashes or en dashes ("—" or "–"); use commas, periods, or hyphens instead (also replace any existing dashes you come across). Preserve everything else EXACTLY — same headings, same section numbering and order, same wording, same bullet formatting, same "not legal advice" note. Do not re-style, re-order, re-title, or re-word any section the change does not touch. Never add signature blocks or date lines. If the change does not affect billing, keep total/installments/monthly identical to the current values.
Output STRICT, valid JSON only — inside the markdown string values, escape every double quote as \\" and every line break as \\n (never put a raw newline or unescaped quote inside a JSON string). Return ONLY JSON with the FULL revised documents:
{
  "summary": "one line",
  "total": number,
  "installments": [{"label": string, "amount": number, "trigger": string, "status": "pending"}],
  "monthly": [{"item": string, "amount": number}],
  "agreement_markdown": "full revised service agreement in markdown",
  "nda_markdown": "full revised mutual NDA in markdown"
}`;
        const user = `CHANGE REQUEST (apply only this, preserve all other formatting and wording):\n"""${(terms || '').toString().slice(0, 4000)}"""

CURRENT total: ${base.total ?? 'n/a'}
CURRENT installments: ${JSON.stringify(base.installments || [])}
CURRENT monthly: ${JSON.stringify(base.monthly || [])}

CURRENT SERVICE AGREEMENT (markdown):
"""${(base.agreement_markdown || '').toString().slice(0, 12000)}"""

CURRENT MUTUAL NDA (markdown):
"""${(base.nda_markdown || '').toString().slice(0, 8000)}"""`;
        const out = await callClaude(system, user, 8192);
        return res.json(parseJson(out));
      }

      const system = `You are drafting a Service Agreement and a Mutual NDA for Vernon Tech & Media (VTM) — Rayvaughn Vernon, dba Vernon Tech & Media, Katy, Texas, ray@vernontm.com. Governing law: Texas.
Mirror this proven structure for the Service Agreement: Parties; 1. Scope of Work (list each project from the scope); 2. Priority & Timeline; 3. Total Price & Payment Schedule (a clear bullet list of installments and what each is tied to — do NOT use markdown tables); 4. Milestone Acceptance; 5. Revisions; 6. Ownership (client owns deliverables upon final payment); 7. Confidentiality (references the NDA); 8. Refund Policy; 9. Commitment; 10. Governing Law. Do NOT include signature blocks, "Signature: ___", or date lines — the e-sign page adds the real signature fields automatically. End with a one-line "not legal advice" note.
Section 8 Refund Policy: state plainly that because this is custom development work, ALL payments are non-refundable (deposit, build installments, and maintenance) — no refunds are issued. Section 9 Commitment: once the project has started, the Client agrees to see it through to completion and to fulfill the full build payment schedule; all charges are authorized by the Client's signature and recurring-billing consent. Do NOT use the word "chargeback" or frame the client as a dispute risk. Include milestone acceptance sign-off and card-authorization / recurring-billing consent. Keep language clear and professional (not legalese-heavy). Note it is not legal advice.
Use the billing terms Ray provides verbatim where given. If Ray's billing terms are brief or blank, derive the total, installments, and payment schedule from the discovery notes / call summaries in the context (that is where the discussed pricing lives); never default the total to 0. NEVER use em dashes or en dashes ("—" or "–") anywhere; use commas, periods, hyphens, or the word "to" instead.${mode === 'custom' ? ` CUSTOM PLAN MODE: The client chooses their payment plan later in their portal, so DO NOT list any amounts, installments, or dates anywhere. For section 3 (Total Price & Payment Schedule), write the heading and then a single line containing exactly the token {{PAYMENT_SCHEDULE}} and nothing else. Set "total" to the build value from the terms/notes, and return installments: [] and monthly: []. Also fill "recap": a warm, client-facing 2-4 sentence summary of everything included, and EXPLICITLY call out (with enthusiasm) any bonus feature added at no additional cost or any goodwill on timeline mentioned in the notes. Also fill "features": an array of 5 to 8 objects { "title": short bold label (2-4 words), "detail": one concise client-facing sentence }, covering the key deliverables and capabilities in this package (pull them from the Scope of Work / notes; include the no-cost bonus as one of them).` : ''} Output STRICT, valid JSON only — inside the markdown string values, escape every double quote as \\" and every line break as \\n (never put a raw newline or unescaped quote inside a JSON string). Return ONLY JSON:
{
  "summary": "one line",
  "recap": "client-facing 2-4 sentence recap of what's included (custom mode: highlight any no-cost bonus)",
  "features": [{"title": "short bold label", "detail": "one client-facing sentence"}],
  "total": number,
  "installments": [{"label": string, "amount": number, "trigger": string, "status": "pending"}],
  "monthly": [{"item": string, "amount": number}],
  "agreement_markdown": "full service agreement in markdown",
  "nda_markdown": "full mutual NDA in markdown"
}`;
      const user = `Draft the agreement using these billing terms from Ray:\n"""${(terms || '').toString().slice(0, 4000)}"""\n\n${contextBlock(client, projects, activity)}`;
      const out = await callClaude(system, user, 8192);
      return res.json(parseJson(out));
    }

    // ── client-email: draft the cover email to the client after sending the
    //    agreement, in a chosen tone (professional / friendly / gain). ──
    if (req.method === 'POST' && action === 'client-email') {
      const { client_id, tone, portal_url, sign_url } = req.body || {};
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { client, projects, activity } = await loadContext(client_id);
      const agRows = await supaFetch(`crm_agreements?client_id=eq.${client_id}&select=total_amount,terms,payment_mode&order=created_at.desc&limit=1`).catch(() => []);
      const ag = agRows && agRows[0];
      const t = ag?.terms || {};
      const isCustom = ag?.payment_mode === 'custom';

      const toneGuide = {
        professional: 'Polished, businesslike, and concise. Courteous and clear, no slang.',
        friendly: 'Warm, personable, and conversational, like a trusted partner. Upbeat but genuine, contractions are fine.',
        gain: 'Value- and outcome-focused. Lead with what the client gains and the momentum ahead; call out any bonus/extra feature included at no cost and any goodwill on timeline as wins. Motivating but sincere.',
      }[tone] || 'Polished, businesslike, and concise.';

      const cta = isCustom
        ? `CALL TO ACTION: The client will CHOOSE their payment plan on the signing page. Say something like: "We put together a few payment options so you can choose the one that fits you best, and to get started you just sign the contract." The email's single link is the SIGNING LINK below. Present it as "Choose your plan and sign:" followed by the exact URL. Do NOT mention any deposit, installment, monthly, or dollar amounts anywhere, since the numbers depend on the plan they pick. Do NOT invent links.`
        : `CALL TO ACTION: The email's single main link is the SIGNING LINK below, this client's personal link that opens their agreement so they can review the terms and sign it (no account or login needed). Present it as "Review and sign your agreement:" followed by the exact URL. Tell them that once they sign, they'll set up their client portal and complete the deposit. Do NOT include a separate generic portal URL, and do NOT invent links.`;

      const system = `You are Ray (Rayvaughn Vernon) of Vernon Tech & Media, writing a short email to a client to send over their service agreement. First person, human, warm, never robotic. Reference what was actually agreed using the discovery notes below. If the notes mention a bonus feature added at no extra cost, or an adjusted/extended delivery timeline, weave it in as a positive. Keep it tight (roughly 120 to 180 words). Sign off as Ray, Vernon Tech & Media.
NEVER use em dashes or en dashes ("—" or "–") anywhere. Use commas, periods, or the word "to" instead.
TONE: ${toneGuide}
${cta}
Return ONLY JSON: { "subject": string, "body": string }`;
      const user = `Draft the email.
Client: ${client.business_name}, contact ${client.owner_name || 'there'}
SIGNING LINK (their personal link, use this exact URL as the call to action): ${sign_url || '(will be added when you send)'}
${isCustom ? 'This is a CUSTOM PLAN: the client picks their payment plan on the signing page. Do NOT state any amounts.' : `Agreement total: ${ag?.total_amount ?? 'n/a'}\nInstallments: ${JSON.stringify(t.installments || [])}\nMonthly: ${JSON.stringify(t.monthly || [])}`}

${contextBlock(client, projects, activity)}`;
      const out = await callClaude(system, user, 1200);
      return res.json(parseJson(out));
    }

    // ── access-instructions: write/refine client-facing access instructions ──
    if (req.method === 'POST' && action === 'access-instructions') {
      const { title, notes } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title required' });
      const system = `You write concise, client-facing instructions for granting Vernon Tech & Media (VTM) access to a specific platform or tool. The invite/admin email to use is ray@vernontm.com. Rules: 2–4 sentences, concrete (name the actual menu path where you can, e.g. "Settings → Team → Invite"), friendly and plain, no fluff or preamble. If Ray provides notes or an edited draft, follow them and incorporate what he wrote. Return ONLY JSON: { "description": string }`;
      const user = `Platform / tool: ${title}\n\nRay's notes or edited draft to incorporate (may be blank):\n"""${(notes || '').toString().slice(0, 2000)}"""`;
      const out = await callClaude(system, user, 700);
      return res.json(parseJson(out));
    }

    // ── suggest-projects: turn the agreement into billable project line items ──
    if (req.method === 'POST' && action === 'suggest-projects') {
      const { client_id } = req.body || {};
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { client, projects, activity } = await loadContext(client_id);
      const agRows = await supaFetch(`crm_agreements?client_id=eq.${client_id}&select=total_amount,terms&order=created_at.desc&limit=1`).catch(() => []);
      const ag = agRows && agRows[0];
      const t = ag?.terms || {};

      const system = `You turn a service agreement into the billable PROJECT LINE ITEMS for a CRM deal — the things that actually get invoiced.
Rules:
- Usually ONE one-time build project (value = the one-time build total) PLUS one recurring maintenance project (recurring = the monthly amount) if the agreement includes maintenance.
- Only split the build into multiple one-time projects if the agreement EXPLICITLY prices them separately. If you split, the one-time values MUST sum to the build total exactly — never invent per-item prices.
- Each project needs: a clear name, a 1–2 sentence scope taken from the agreement's Scope of Work (concrete, faithful — no invented deliverables), value (one-time dollars; 0 if none), recurring (dollars per month; 0 if none).
Return ONLY JSON: { "projects": [ { "name": string, "scope": string, "value": number, "recurring": number } ] }`;
      const user = `Build the project line items for this deal.
AGREEMENT total: ${ag?.total_amount ?? 'n/a'}
INSTALLMENTS: ${JSON.stringify(t.installments || [])}
MONTHLY: ${JSON.stringify(t.monthly || [])}

AGREEMENT (markdown):
"""${(t.agreement_markdown || '').toString().slice(0, 10000)}"""

${contextBlock(client, projects, activity)}`;
      const out = await callClaude(system, user, 2048);
      return res.json(parseJson(out));
    }

    // ── approve: persist the agreement + payment schedule ──
    if (req.method === 'POST' && action === 'approve') {
      const { client_id, draft } = req.body || {};
      if (!client_id || !draft) return res.status(400).json({ error: 'client_id and draft required' });

      const payload = {
        client_id,
        title: `Service Agreement — Vernon Tech & Media`,
        total_amount: draft.total || null,
        status: 'approved',
        payment_mode: 'fixed',
        plan_options: null,
        terms: {
          summary: draft.summary || null,
          installments: draft.installments || [],
          monthly: draft.monthly || [],
          agreement_markdown: draft.agreement_markdown || '',
          nda_markdown: draft.nda_markdown || '',
        },
      };

      // Reuse a stale placeholder agreement (e.g. an empty custom-mode row left
      // over from toggling the payment-plan option) instead of duplicating.
      const priorRows = await supaFetch(`crm_agreements?client_id=eq.${client_id}&status=neq.signed&order=created_at.desc&limit=1&select=id,terms`).catch(() => []);
      const prior = priorRows && priorRows[0];
      let agreement;
      if (prior && !(prior.terms && prior.terms.agreement_markdown)) {
        await supaFetch(`crm_agreements?id=eq.${prior.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        await supaFetch(`crm_payments?agreement_id=eq.${prior.id}`, { method: 'DELETE' }).catch(() => {});
        agreement = { id: prior.id };
      } else {
        const agRows = await supaFetch('crm_agreements', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
        agreement = agRows[0];
      }

      // Build the payment schedule rows.
      const installments = Array.isArray(draft.installments) ? draft.installments : [];
      if (installments.length) {
        const rows = installments.map(i => ({
          client_id,
          agreement_id: agreement.id,
          label: i.label || 'Payment',
          amount: i.amount || 0,
          status: i.status === 'paid' ? 'paid' : 'pending',
          due_condition: i.trigger || null,
          source: 'agreement',
        }));
        await supaFetch('crm_payments', { method: 'POST', body: JSON.stringify(rows) });
      }
      return res.json({ ok: true, agreement_id: agreement.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('agreement-ai error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
