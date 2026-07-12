const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// Admin-side feed of client portal events (e.g. a client checked a task off).
// Populated by portal.js. GET lists recent alerts (joined with client name);
// PATCH marks one read; POST action=read-all clears the unread badge.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action, unread } = req.query;

  try {
    if (req.method === 'GET') {
      let path = 'crm_client_alerts?select=*,client:crm_clients(business_name,logo_url)&order=created_at.desc&limit=50';
      if (unread === '1' || unread === 'true') path += '&read=eq.false';
      const rows = await supaFetch(path);
      return res.json(rows || []);
    }

    if (req.method === 'POST' && action === 'read-all') {
      await supaFetch('crm_client_alerts?read=eq.false', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      });
      return res.json({ success: true });
    }

    if (req.method === 'PATCH') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const read = req.body && req.body.read === false ? false : true;
      const rows = await supaFetch(`crm_client_alerts?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ read }),
      });
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_client_alerts?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('client-alerts error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
