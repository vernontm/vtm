const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// Per-client activity feed: notes, calls, tasks, comments. One table, filtered
// by `type`. Backs the Activity tab on a client/lead.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, client_id, type } = req.query;

  try {
    if (req.method === 'GET') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      let path = `crm_client_activity?client_id=eq.${client_id}&order=created_at.desc`;
      if (type) path += `&type=eq.${encodeURIComponent(type)}`;
      const rows = await supaFetch(path);
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const d = req.body || {};
      if (!d.client_id) return res.status(400).json({ error: 'client_id required' });
      if (!d.type) d.type = 'note';
      const rows = await supaFetch('crm_client_activity', { method: 'POST', body: JSON.stringify(d) });
      return res.status(201).json(rows[0]);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const d = { ...req.body, updated_at: new Date().toISOString() };
      delete d.id; delete d.created_at;
      if (Object.prototype.hasOwnProperty.call(d, 'status')) {
        d.completed_at = d.status === 'done' ? new Date().toISOString() : null;
      }
      const rows = await supaFetch(`crm_client_activity?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(d) });
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_client_activity?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('client-activity error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
