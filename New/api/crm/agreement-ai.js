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

function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Model did not return JSON');
  return JSON.parse(m[0]);
}

async function loadContext(clientId) {
  const clients = await supaFetch(`crm_clients?id=eq.${clientId}&select=business_name,owner_name,contact_email,contact_phone,industry,location_city,location_state,client_type,notes,discovery_notes_url`);
  const client = clients && clients[0];
  if (!client) throw new Error('Client not found');
  const projects = await supaFetch(`crm_projects?client_id=eq.${clientId}&select=name,scope,value,status&order=created_at.asc`);
  return { client, projects: projects || [] };
}

function contextBlock(client, projects) {
  return `CLIENT: ${client.business_name} (owner: ${client.owner_name}, ${client.contact_email || 'no email'}, ${client.contact_phone || 'no phone'}, ${[client.location_city, client.location_state].filter(Boolean).join(', ')})
Service types: ${(client.client_type || []).join(', ') || 'unspecified'}
Notes: ${client.notes || 'none'}

PROJECTS / SCOPE:
${projects.map((p, i) => `${i + 1}. ${p.name} — value $${p.value || 0}\n   ${p.scope || 'no scope yet'}`).join('\n')}`;
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
      const { client, projects } = await loadContext(client_id);

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
      const user = `Analyze this deal and propose billing + flag anything missing.\n\n${contextBlock(client, projects)}`;
      const out = await callClaude(system, user, 2048);
      return res.json(parseJson(out));
    }

    // ── generate: draft the full agreement + NDA as reviewable text ──
    if (req.method === 'POST' && action === 'generate') {
      const { client_id, terms } = req.body || {};
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const { client, projects } = await loadContext(client_id);

      const system = `You are drafting a Service Agreement and a Mutual NDA for Vernon Tech & Media (VTM) — Rayvaughn Vernon, dba Vernon Tech & Media, Katy, Texas, ray@vernontm.com. Governing law: Texas.
Mirror this proven structure for the Service Agreement: Parties; 1. Scope of Work (list each project from the scope); 2. Priority & Timeline; 3. Total Price & Payment Schedule (a clear bullet list of installments and what each is tied to — do NOT use markdown tables); 4. Milestone Acceptance; 5. Revisions; 6. Ownership (client owns deliverables upon final payment); 7. Confidentiality (references the NDA); 8. Refund Policy; 9. Commitment; 10. Governing Law. Do NOT include signature blocks, "Signature: ___", or date lines — the e-sign page adds the real signature fields automatically. End with a one-line "not legal advice" note.
Section 8 Refund Policy: state plainly that because this is custom development work, ALL payments are non-refundable (deposit, build installments, and maintenance) — no refunds are issued. Section 9 Commitment: once the project has started, the Client agrees to see it through to completion and to fulfill the full build payment schedule; all charges are authorized by the Client's signature and recurring-billing consent. Do NOT use the word "chargeback" or frame the client as a dispute risk. Include milestone acceptance sign-off and card-authorization / recurring-billing consent. Keep language clear and professional (not legalese-heavy). Note it is not legal advice.
Use the billing terms Ray provides verbatim where given. Return ONLY JSON:
{
  "summary": "one line",
  "total": number,
  "installments": [{"label": string, "amount": number, "trigger": string, "status": "pending"}],
  "monthly": [{"item": string, "amount": number}],
  "agreement_markdown": "full service agreement in markdown",
  "nda_markdown": "full mutual NDA in markdown"
}`;
      const user = `Draft the agreement using these billing terms from Ray:\n"""${(terms || '').toString().slice(0, 4000)}"""\n\n${contextBlock(client, projects)}`;
      const out = await callClaude(system, user, 8192);
      return res.json(parseJson(out));
    }

    // ── approve: persist the agreement + payment schedule ──
    if (req.method === 'POST' && action === 'approve') {
      const { client_id, draft } = req.body || {};
      if (!client_id || !draft) return res.status(400).json({ error: 'client_id and draft required' });

      const agRows = await supaFetch('crm_agreements', {
        method: 'POST',
        body: JSON.stringify({
          client_id,
          title: `Service Agreement — Vernon Tech & Media`,
          total_amount: draft.total || null,
          status: 'approved',
          terms: {
            summary: draft.summary || null,
            installments: draft.installments || [],
            monthly: draft.monthly || [],
            agreement_markdown: draft.agreement_markdown || '',
            nda_markdown: draft.nda_markdown || '',
          },
        }),
      });
      const agreement = agRows[0];

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
