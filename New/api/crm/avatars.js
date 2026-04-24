const { setCors, supaFetch, requireClientScope } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { clientId, all } = scope;
  const scopeFilter = all ? '' : `&client_id=eq.${clientId}`;

  const { id } = req.query;

  if (req.method === 'GET') {
    if (id) {
      const rows = await supaFetch(`crm_avatars?id=eq.${id}${scopeFilter}`);
      return res.json(rows[0] || null);
    }
    const filter = all ? '' : `client_id=eq.${clientId}&`;
    const rows = await supaFetch(`crm_avatars?${filter}order=name.asc`);
    return res.json(rows);
  }

  if (req.method === 'POST') {
    if (!clientId) return res.status(400).json({ error: 'X-Client-Id header required for create' });
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'name required' });
    const payload = { ...body, client_id: clientId };
    const rows = await supaFetch('crm_avatars', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json(rows[0] || rows);
  }

  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const { client_id: _, ...rest } = req.body || {};
    const rows = await supaFetch(`crm_avatars?id=eq.${id}${scopeFilter}`, {
      method: 'PATCH',
      body: JSON.stringify(rest),
    });
    return res.json(rows[0] || null);
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_avatars?id=eq.${id}${scopeFilter}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
