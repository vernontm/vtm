const { setCors, supaFetch, requireClientScope } = require('../_lib/supabase.js');

// Looks endpoint (tenant-scoped via X-Client-Id header).
// - GET ?avatar_id=&outfit_id=<uuid|unassigned>  — list looks for an avatar, optionally filtered
// - POST                                         — single or array (bulk import from HeyGen)
// - PUT  ?id=                                    — update one (e.g. reassign outfit)
// - PUT  ?action=bulk-assign                     — { ids:[], outfit_id:null|uuid }
// - DELETE ?id=                                  — remove one look from the CRM (does not touch HeyGen)

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { clientId, all } = scope;
  const scopeFilter = all ? '' : `&client_id=eq.${clientId}`;

  const { id, avatar_id, outfit_id, action } = req.query;

  if (req.method === 'GET') {
    if (!avatar_id) return res.status(400).json({ error: 'avatar_id required' });
    let q = `crm_avatar_looks?avatar_id=eq.${avatar_id}${scopeFilter}&order=angle_order.asc,created_at.asc`;
    if (outfit_id === 'unassigned') q += '&outfit_id=is.null';
    else if (outfit_id) q += `&outfit_id=eq.${outfit_id}`;
    const rows = await supaFetch(q);
    return res.json(rows);
  }

  if (req.method === 'POST') {
    if (!clientId) return res.status(400).json({ error: 'X-Client-Id header required for create' });
    const body = req.body;
    const items = (Array.isArray(body) ? body : [body]).map(it => ({ ...it, client_id: clientId }));
    if (!items.length || !items[0].avatar_id || !items[0].image_url) {
      return res.status(400).json({ error: 'avatar_id and image_url required' });
    }
    const rows = await supaFetch('crm_avatar_looks', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation,resolution=ignore-duplicates' },
      body: JSON.stringify(items),
    });
    return res.json(rows);
  }

  if (req.method === 'PUT') {
    if (action === 'bulk-assign') {
      const { ids, outfit_id: target } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids[] required' });
      const inList = ids.map(s => `"${s}"`).join(',');
      const rows = await supaFetch(`crm_avatar_looks?id=in.(${inList})${scopeFilter}`, {
        method: 'PATCH',
        body: JSON.stringify({ outfit_id: target || null }),
      });
      return res.json(rows);
    }
    if (!id) return res.status(400).json({ error: 'id required' });
    const { client_id: _, ...rest } = req.body || {};
    const rows = await supaFetch(`crm_avatar_looks?id=eq.${id}${scopeFilter}`, {
      method: 'PATCH',
      body: JSON.stringify(rest),
    });
    return res.json(rows[0] || null);
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_avatar_looks?id=eq.${id}${scopeFilter}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
