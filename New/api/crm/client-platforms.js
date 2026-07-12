const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// Platforms / tools a client uses, plus the access we need and its status.
// The AI access-research agent (Phase 2) fills `access_process` and can flip
// `access_status` as invites are sent and accepted.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, client_id } = req.query;

  try {
    // GET — list by client_id, or a single row by id
    if (req.method === 'GET') {
      if (id) {
        const rows = await supaFetch(`crm_client_platforms?id=eq.${id}`);
        return res.json(rows[0] || null);
      }
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch(`crm_client_platforms?client_id=eq.${client_id}&order=created_at.asc`);
      return res.json(rows);
    }

    // POST — create
    if (req.method === 'POST') {
      const data = req.body || {};
      if (!data.client_id) return res.status(400).json({ error: 'client_id required' });
      if (!data.platform_name) return res.status(400).json({ error: 'platform_name required' });
      const rows = await supaFetch('crm_client_platforms', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.status(201).json(rows[0]);
    }

    // PUT — update
    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const data = { ...req.body, updated_at: new Date().toISOString() };
      delete data.id;
      delete data.created_at;
      const rows = await supaFetch(`crm_client_platforms?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.json(rows[0]);
    }

    // DELETE
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_client_platforms?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('client-platforms error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
