const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');
const { scheduleThankYou, normalizePhone, missingTable } = require('../_lib/followups.js');

// Scheduled follow-up texts (see _lib/followups.js).
//   GET    /api/crm/followups            -> { followups: [scheduled + last 7 days sent] }
//   POST   /api/crm/followups            { meeting_id?, meeting_title?, phone, client_id?, end_time }  (schedule a thank-you by hand)
//   DELETE /api/crm/followups?id=<uuid>  (cancel)
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const rows = await supaFetch(`crm_followups?or=(status.eq.scheduled,and(status.eq.sent,sent_at.gte.${since}))&order=send_at.asc&limit=100`);
      return res.json({ followups: rows || [] });
    }

    if (req.method === 'POST') {
      const { meeting_id, meeting_title, phone, client_id, end_time } = req.body || {};
      if (!normalizePhone(phone)) return res.status(400).json({ error: 'Valid phone required' });
      if (!end_time || isNaN(new Date(end_time))) return res.status(400).json({ error: 'end_time required' });
      const row = await scheduleThankYou({ meetingId: meeting_id, title: meeting_title, endTime: end_time, phone, clientId: client_id, createdBy: user.id });
      if (!row) return res.status(503).json({ error: 'Follow-ups need the crm_followups table. Run docs/sql/followups.sql in Supabase.' });
      return res.status(201).json(row);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_followups?id=eq.${id}&status=eq.scheduled`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled', cancelled_by: user.id }) });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (missingTable(err)) {
      if (req.method === 'GET') return res.json({ followups: [], needs_migration: true });
      return res.status(503).json({ error: 'Follow-ups need the crm_followups table. Run docs/sql/followups.sql in Supabase.' });
    }
    console.error('followups error:', err);
    return res.status(500).json({ error: err.message });
  }
};
