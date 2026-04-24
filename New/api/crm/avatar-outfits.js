const { setCors, supaFetch, requireClientScope } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { clientId, all } = scope;
  const scopeFilter = all ? '' : `&client_id=eq.${clientId}`;

  const { id, avatar_id } = req.query;

  if (req.method === 'GET') {
    if (!avatar_id) return res.status(400).json({ error: 'avatar_id required' });
    const rows = await supaFetch(
      `crm_avatar_outfits?avatar_id=eq.${avatar_id}${scopeFilter}&order=sort_order.asc,created_at.asc`
    );
    return res.json(rows);
  }

  if (req.method === 'POST') {
    if (!clientId) return res.status(400).json({ error: 'X-Client-Id header required for create' });
    const body = req.body || {};
    if (!body.avatar_id || !body.name) return res.status(400).json({ error: 'avatar_id and name required' });
    const payload = { ...body, client_id: clientId };
    const rows = await supaFetch('crm_avatar_outfits', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json(rows[0] || rows);
  }

  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const { client_id: _, ...rest } = req.body || {};
    const rows = await supaFetch(`crm_avatar_outfits?id=eq.${id}${scopeFilter}`, {
      method: 'PATCH',
      body: JSON.stringify(rest),
    });
    return res.json(rows[0] || null);
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_avatar_outfits?id=eq.${id}${scopeFilter}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
