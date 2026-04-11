const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, client_id, action } = req.query;

  // GET — list by client_id, ordered by sort_order asc, created_at asc
  if (req.method === 'GET') {
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const rows = await supaFetch(
      `crm_content_scripts?client_id=eq.${client_id}&order=sort_order.asc,created_at.asc`
    );
    return res.json(rows);
  }

  // POST — create one or array of scripts (bulk import)
  if (req.method === 'POST') {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];
    if (!items.length || !items[0].client_id) {
      return res.status(400).json({ error: 'client_id required in body' });
    }
    const rows = await supaFetch('crm_content_scripts', {
      method: 'POST',
      body: JSON.stringify(items),
    });
    return res.json(rows);
  }

  // PUT — update by id
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = { ...req.body, updated_at: new Date().toISOString() };
    const rows = await supaFetch(`crm_content_scripts?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0] || null);
  }

  // DELETE — by id, or clear-all for a client
  if (req.method === 'DELETE') {
    if (action === 'clear-all') {
      if (!client_id) return res.status(400).json({ error: 'client_id required for clear-all' });
      const rows = await supaFetch(`crm_content_scripts?client_id=eq.${client_id}`, {
        method: 'DELETE',
      });
      return res.json({ deleted: rows ? rows.length : 0 });
    }
    if (!id) return res.status(400).json({ error: 'id required' });
    const rows = await supaFetch(`crm_content_scripts?id=eq.${id}`, {
      method: 'DELETE',
    });
    return res.json(rows[0] || null);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
