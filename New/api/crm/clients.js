const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  // GET — list all or single
  if (req.method === 'GET') {
    if (id) {
      const rows = await supaFetch(`crm_clients?id=eq.${id}`);
      return res.json(rows[0] || null);
    }
    const rows = await supaFetch('crm_clients?order=created_at.desc');
    return res.json(rows);
  }

  // POST — create
  if (req.method === 'POST') {
    const data = req.body;
    const rows = await supaFetch('crm_clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json(rows[0]);
  }

  // PUT — update
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = { ...req.body, updated_at: new Date().toISOString() };
    const rows = await supaFetch(`crm_clients?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0]);
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_clients?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
