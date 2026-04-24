const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function stripDashes(text) {
  if (!text) return text;
  return String(text).replace(/\u2014/g, '-').replace(/\u2013/g, '-');
}

// POST /api/crm/sequence-agent
// Body: { prompt, client_id?, client_name?, conversation? }
// Returns: { created: true, sequence_id, name, steps_created, reasoning, summary }
// The AI decides the client (if not given), number of emails, delays, subjects + bodies,
// and qualification tags. It then creates the sequence + steps via supaFetch.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tenant guard on any referenced client_id
  {
    const refClient = req.query?.client_id || req.body?.client_id;
    if (refClient) {
      const chk = await assertClientAccess(user, refClient);
      if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    }
  }

  try {
    const { prompt, client_id: bodyClientId, client_name, conversation } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    // ── Resolve client ──
    const clients = await supaFetch('crm_clients?select=id,name,brand_bible,services,target_audience,tone,website') || [];
    let client = null;
    if (bodyClientId) {
      client = clients.find(c => c.id === bodyClientId) || null;
    }
    if (!client && client_name) {
      const nameLc = String(client_name).toLowerCase();
      client = clients.find(c => (c.name || '').toLowerCase() === nameLc)
            || clients.find(c => (c.name || '').toLowerCase().includes(nameLc))
            || null;
    }
    if (!client) {
      // Try to extract a client name from the prompt
      const pLc = prompt.toLowerCase();
      client = clients.find(c => c.name && pLc.includes(c.name.toLowerCase())) || null;
    }
    if (!client) {
      return res.json({
        action: 'ask',
        needs_info: true,
        question: `Which client is this sequence for? Options: ${clients.map(c => c.name).filter(Boolean).join(', ')}`,
      });
    }

    // ── Context: existing tags for this client ──
    const tagContexts = await supaFetch(`crm_email_tag_context?client_id=eq.${client.id}&order=tag.asc`) || [];
    const contactTagRows = await supaFetch(`crm_email_contacts?client_id=eq.${client.id}&select=tags`) || [];
    const tagSet = new Set();
    for (const c of contactTagRows) for (const t of (c.tags || [])) if (t) tagSet.add(t);
    for (const t of tagContexts) if (t.tag) tagSet.add(t.tag);
    const knownTags = Array.from(tagSet);

    // ── Build system prompt ──
    const system = `You are an expert email sequence strategist. Generate a complete multi-email drip sequence.

CLIENT: ${client.name}
${client.services ? `Services: ${client.services}` : ''}
${client.target_audience ? `Target audience: ${client.target_audience}` : ''}
${client.tone ? `Tone: ${client.tone}` : ''}
${client.website ? `Website: ${client.website}` : ''}
${client.brand_bible ? `Brand bible: ${String(client.brand_bible).slice(0, 3000)}` : ''}

EXISTING CONTACT TAGS (use these if relevant, or invent new ones that make sense):
${knownTags.length ? knownTags.join(', ') : '(none yet)'}

Your job: given the user's request, design a complete email sequence and return JSON ONLY.

DECISIONS YOU MUST MAKE:
- name: short descriptive name for the sequence
- description: one-sentence summary
- trigger_tags_all: array of tag strings a contact must have (use existing tags when possible, or invent a new relevant one like "new_lead" or "welcome")
- trigger_tags_none: array of tags that disqualify contacts (usually empty or ["unsubscribed"])
- steps: array of N email steps. Each step has:
  - step_order: 1-indexed
  - subject: compelling subject line
  - preview_text: 40-90 char preview
  - html_body: full HTML email body (use <p>, <h2>, <a>, etc — NO <html>/<body> wrappers, NO inline CSS unless necessary)
  - delay_amount: integer (days between previous step and this one; step 1 should be 0 or 1)
  - delay_unit: "days" (default) or "hours" or "minutes"
- reasoning: 2-4 sentences explaining WHY this structure — why this many emails, why these intervals, why this content order
- summary: 1-2 sentence user-facing summary

RULES:
- NEVER use em dashes or en dashes. Use hyphens.
- Match the client's tone and audience.
- Intervals: typical welcome = day 0,2,4,7; nurture = day 0,3,7,14; reactivation = day 0,3,7.
- Step 1 usually delay_amount=0 (sends immediately on enrollment).
- Keep HTML simple and readable.
- If the user specifies a count (e.g. "5 emails"), produce exactly that many steps.
- If the user does not specify, pick a sensible count (3-7) based on the goal.

Return JSON ONLY, no code blocks:
{
  "name": "...",
  "description": "...",
  "trigger_tags_all": ["..."],
  "trigger_tags_none": [],
  "steps": [
    { "step_order": 1, "subject": "...", "preview_text": "...", "html_body": "<p>...</p>", "delay_amount": 0, "delay_unit": "days" }
  ],
  "reasoning": "...",
  "summary": "..."
}`;

    const messages = [];
    if (Array.isArray(conversation)) {
      for (const m of conversation) if (m && m.role && m.content) messages.push({ role: m.role, content: String(m.content) });
    }
    messages.push({ role: 'user', content: prompt });

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8192,
        system,
        messages,
      }),
    });
    if (!aiRes.ok) {
      const err = await aiRes.text();
      throw new Error('AI generation failed: ' + err);
    }
    const aiData = await aiRes.json();
    const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('AI did not return valid JSON');
      parsed = JSON.parse(m[0]);
    }

    if (!parsed.name || !Array.isArray(parsed.steps) || !parsed.steps.length) {
      throw new Error('AI response missing name or steps');
    }

    // Clean dashes
    parsed.name = stripDashes(parsed.name);
    parsed.description = stripDashes(parsed.description);
    parsed.reasoning = stripDashes(parsed.reasoning);
    parsed.summary = stripDashes(parsed.summary);
    parsed.steps = parsed.steps.map(s => ({
      ...s,
      subject: stripDashes(s.subject),
      preview_text: stripDashes(s.preview_text),
      html_body: stripDashes(s.html_body),
    }));

    const tagsAll = Array.isArray(parsed.trigger_tags_all) ? parsed.trigger_tags_all.filter(Boolean) : [];
    const tagsNone = Array.isArray(parsed.trigger_tags_none) ? parsed.trigger_tags_none.filter(Boolean) : [];

    // ── Create sequence ──
    const createdRows = await supaFetch('crm_email_sequences', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify([{
        client_id: client.id,
        name: parsed.name,
        description: parsed.description || null,
        trigger_tag: tagsAll[0] || null,
        trigger_tags_all: tagsAll,
        trigger_tags_none: tagsNone,
        active: false, // user should review + activate
        send_days: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        send_timezone: 'America/Chicago',
      }]),
    });
    const sequence = createdRows?.[0];
    if (!sequence) throw new Error('Failed to create sequence row');

    // ── Create steps ──
    const stepPayloads = parsed.steps.map((s, i) => ({
      sequence_id: sequence.id,
      step_order: s.step_order ?? (i + 1),
      subject: s.subject || '',
      preview_text: s.preview_text || null,
      html_body: s.html_body || '',
      delay_amount: Number.isFinite(s.delay_amount) ? s.delay_amount : (i === 0 ? 0 : 2),
      delay_unit: s.delay_unit || 'days',
    }));
    await supaFetch('crm_email_sequence_steps', {
      method: 'POST',
      body: JSON.stringify(stepPayloads),
    });

    return res.json({
      action: 'created_sequence',
      created: true,
      sequence_id: sequence.id,
      client_id: client.id,
      client_name: client.name,
      name: parsed.name,
      steps_created: stepPayloads.length,
      trigger_tags_all: tagsAll,
      trigger_tags_none: tagsNone,
      reasoning: parsed.reasoning || '',
      summary: parsed.summary || `Created a ${stepPayloads.length}-email sequence "${parsed.name}" for ${client.name}.`,
    });
  } catch (err) {
    console.error('sequence-agent error:', err);
    return res.status(500).json({ error: 'Sequence agent failed: ' + err.message });
  }
};
