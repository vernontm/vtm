const { setCors, supaFetch, requireClientScope, assertClientAccess } = require('../_lib/supabase.js');

// Content scripts (scheduler posts). Always scoped by client_id.
// Reads take client_id from the X-Client-Id header (admin bypass permitted)
// or from ?client_id=, then enforce access.
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { user, clientId: headerClient, all } = scope;

  const { id, client_id: queryClient, action } = req.query;
  // Prefer explicit query param when the UI is calling into a specific
  // client (ContentScheduler passes ?client_id=...); fall back to header.
  const targetClient = queryClient || headerClient;

  // If a non-admin passed a query client, ensure they actually have it.
  if (queryClient) {
    const chk = await assertClientAccess(user, queryClient);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
  }

  // GET — list, ordered by sort_order
  if (req.method === 'GET') {
    if (!targetClient && !all) return res.status(400).json({ error: 'client_id required' });
    const filter = targetClient ? `client_id=eq.${targetClient}&` : '';
    const rows = await supaFetch(
      `crm_content_scripts?${filter}order=sort_order.asc,created_at.asc`
    );
    return res.json(rows);
  }

  // POST — create one or array (bulk import). Every item must belong to
  // a client the caller can see.
  if (req.method === 'POST') {
    const body = req.body;
    const items = Array.isArray(body) ? body : [body];
    if (!items.length) return res.status(400).json({ error: 'No items' });
    for (const it of items) {
      const cid = it?.client_id || targetClient;
      if (!cid) return res.status(400).json({ error: 'client_id required in body' });
      it.client_id = cid;
      const chk = await assertClientAccess(user, cid);
      if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    }
    const rows = await supaFetch('crm_content_scripts', {
      method: 'POST',
      body: JSON.stringify(items),
    });
    return res.json(rows);
  }

  // PUT — update by id. Verify target row is in a client the caller can see.
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const existing = await supaFetch(`crm_content_scripts?id=eq.${id}&select=client_id`);
    if (!existing || !existing.length) return res.status(404).json({ error: 'Not found' });
    const chk = await assertClientAccess(user, existing[0].client_id);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    const { client_id: _, ...rest } = req.body || {};
    const data = { ...rest, updated_at: new Date().toISOString() };
    const rows = await supaFetch(`crm_content_scripts?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0] || null);
  }

  // DELETE — single id, or clear-all for a client
  if (req.method === 'DELETE') {
    if (action === 'clear-all') {
      if (!targetClient) return res.status(400).json({ error: 'client_id required for clear-all' });
      const rows = await supaFetch(`crm_content_scripts?client_id=eq.${targetClient}`, {
        method: 'DELETE',
      });
      return res.json({ deleted: rows ? rows.length : 0 });
    }
    if (!id) return res.status(400).json({ error: 'id required' });
    const existing = await supaFetch(`crm_content_scripts?id=eq.${id}&select=client_id`);
    if (!existing || !existing.length) return res.json({ success: true });
    const chk = await assertClientAccess(user, existing[0].client_id);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    const rows = await supaFetch(`crm_content_scripts?id=eq.${id}`, { method: 'DELETE' });
    return res.json(rows?.[0] || { success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
