const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Summarize a piece of client activity (call notes, meeting notes, etc.) with
// Claude and store it on the client's file as a summary activity. Returns the
// structured summary so the lead page can show it and the close-deal pipeline
// can pull terms from it later.
//
//   POST /api/crm/client-summary  { client_id, text, title? }
async function summarize(text, title) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error('AI is not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      system: `You summarize sales/client interactions for a CRM. Be concrete and faithful — never invent details.
Return ONLY JSON:
{
  "summary": "3-5 sentence plain-English summary of what was discussed and decided",
  "key_points": ["the most important points"],
  "action_items": ["concrete follow-ups, with owner if stated"]
}`,
      messages: [{ role: 'user', content: `Summarize this ${title ? `(${title})` : 'client interaction'}:\n\n${text}` }],
    }),
  });
  if (!res.ok) throw new Error(`Claude summary failed: ${res.status}`);
  const data = await res.json();
  const raw = data?.content?.[0]?.text || '{}';
  const m = raw.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : raw); }
  catch { return { summary: raw, key_points: [], action_items: [] }; }
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { client_id, text, title } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    if (!text || !text.trim()) return res.status(400).json({ error: 'Nothing to summarize' });

    const a = await summarize(text.trim(), title);
    const bodyLines = [
      a.summary || '',
      (a.key_points || []).length ? `\nKey points:\n- ${a.key_points.join('\n- ')}` : '',
      (a.action_items || []).length ? `\nAction items:\n- ${a.action_items.join('\n- ')}` : '',
    ].filter(Boolean).join('\n');

    const [row] = await supaFetch('crm_client_activity', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        client_id,
        type: 'note',
        tag: 'Summary',
        author: user.email || 'AI',
        body: `📝 Summary${title ? ` — ${title}` : ''}\n\n${bodyLines}`,
      }),
    });

    return res.json({ ok: true, summary: a.summary, key_points: a.key_points || [], action_items: a.action_items || [], activity: row });
  } catch (err) {
    console.error('client-summary error:', err);
    return res.status(500).json({ error: err.message });
  }
};
