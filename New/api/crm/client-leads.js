const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, client_id } = req.query;

  // GET — list leads for a client
  if (req.method === 'GET') {
    if (id) {
      const rows = await supaFetch(`crm_client_leads?id=eq.${id}`);
      return res.json(rows[0] || null);
    }
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const rows = await supaFetch(`crm_client_leads?client_id=eq.${client_id}&order=created_at.desc`);
    return res.json(rows);
  }

  // POST — create lead(s)
  if (req.method === 'POST') {
    const data = req.body;
    // Support bulk insert (array)
    const rows = await supaFetch('crm_client_leads', {
      method: 'POST',
      body: JSON.stringify(Array.isArray(data) ? data : data),
    });
    return res.json(rows);
  }

  // PUT — update
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = { ...req.body, updated_at: new Date().toISOString() };
    const rows = await supaFetch(`crm_client_leads?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0]);
  }

  // DELETE — single or clear all for a client
  if (req.method === 'DELETE') {
    const { action } = req.query;
    if (action === 'clear-all' && client_id) {
      await supaFetch(`crm_client_leads?client_id=eq.${client_id}`, { method: 'DELETE' });
      return res.json({ success: true, cleared: 'all' });
    }
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_client_leads?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
