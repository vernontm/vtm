const { setCors, requireCrmUser, supaFetch, loadUserAccess } = require('../_lib/supabase.js');

// crm_content_clients is the tenant table itself.
// - GET: admins see all; non-admins see only clients they have grants for
// - POST/PUT/DELETE: admin-only (client creation moved out of Content page
//   into the admin Users & Access UI per Phase 2)
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  if (req.method === 'GET') {
    if (id) {
      // Non-admins can only read their own clients
      if (!user.is_admin) {
        const grants = await supaFetch(`crm_user_access?user_id=eq.${user.id}&client_id=eq.${id}&select=client_id`);
        if (!grants || !grants.length) return res.status(403).json({ error: 'Forbidden' });
      }
      const rows = await supaFetch(`crm_content_clients?id=eq.${id}`);
      return res.json(rows[0] || null);
    }
    if (user.is_admin) {
      const rows = await supaFetch('crm_content_clients?order=business_name.asc');
      return res.json(rows);
    }
    // Non-admin: derive the accessible set from their grants
    const { clients } = await loadUserAccess(user.id, false);
    const ids = clients.map(c => c.id);
    if (!ids.length) return res.json([]);
    const inList = ids.map(x => `"${x}"`).join(',');
    const rows = await supaFetch(`crm_content_clients?id=in.(${inList})&order=business_name.asc`);
    return res.json(rows);
  }

  // Mutations: admin only
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  if (req.method === 'POST') {
    const rows = await supaFetch('crm_content_clients', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    return res.json(rows[0] || rows);
  }

  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = { ...req.body, updated_at: new Date().toISOString() };
    const rows = await supaFetch(`crm_content_clients?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0] || null);
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_content_clients?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
