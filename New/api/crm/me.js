const { setCors, requireCrmUser, loadUserAccess } = require('../_lib/supabase.js');

// GET /api/crm/me
// Returns: { user: { id, email, is_admin }, clients: [{ id, name, role, allowed_pages, ... }] }
// Called on app boot to seed the ClientContext.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const access = await loadUserAccess(user.id, user.is_admin, user.allowed_pages_global);
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        is_admin: user.is_admin,
        allowed_pages_global: user.allowed_pages_global || null,
      },
      clients: access.clients,
    });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: err.message });
  }
};
