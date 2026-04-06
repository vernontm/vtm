import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, lead_id, action } = req.query;

  try {
    if (req.method === 'GET') {
      let query = 'crm_communication_log?order=created_at.desc';
      if (lead_id) query += `&lead_id=eq.${lead_id}`;
      return res.json(await supaFetch(query));
    }

    // PUT /api/crm/communication-log?id=xxx&action=reply
    if (req.method === 'PUT' && id && action === 'reply') {
      await supaFetch(`crm_communication_log?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ reply_received: true, reply_received_at: new Date().toISOString() }),
      });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM communication-log error:', err);
    return res.status(500).json({ error: err.message });
  }
}
