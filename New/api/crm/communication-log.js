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

    // POST — create a new log entry
    if (req.method === 'POST') {
      const { lead_id: lid, channel, subject, body: bodyText, direction } = req.body || {};
      if (!lid || !channel) return res.status(400).json({ error: 'lead_id and channel required' });
      const row = {
        lead_id: lid,
        channel,
        subject: subject || null,
        body: bodyText || null,
        direction: direction || 'outbound',
      };
      const result = await supaFetch('crm_communication_log', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify([row]),
      });
      return res.json((result || [])[0] || { ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM communication-log error:', err);
    return res.status(500).json({ error: err.message });
  }
}
