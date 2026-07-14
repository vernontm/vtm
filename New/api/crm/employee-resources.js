const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Internal resource hub for the team (SOPs, guides, tool logins, templates,
// links). Any signed-in user with the page grant can read; only admins can
// add / edit / delete.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  const adminOnly = () => { if (!user.is_admin) { res.status(403).json({ error: 'Admin only' }); return true; } return false; };

  try {
    if (req.method === 'GET') {
      return res.json(await supaFetch('crm_employee_resources?order=category.asc,created_at.desc'));
    }
    if (req.method === 'POST') {
      if (adminOnly()) return;
      const { title, description, url, category } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
      const [row] = await supaFetch('crm_employee_resources', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ title: title.trim(), description: description || '', url: url || '', category: (category || 'General').trim() || 'General' }),
      });
      return res.status(201).json(row);
    }
    if (req.method === 'PUT' && id) {
      if (adminOnly()) return;
      const { id: _, ...data } = req.body || {};
      data.updated_at = new Date().toISOString();
      const [row] = await supaFetch(`crm_employee_resources?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data) });
      return res.json(row || {});
    }
    if (req.method === 'DELETE' && id) {
      if (adminOnly()) return;
      await supaFetch(`crm_employee_resources?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('employee-resources error:', err);
    return res.status(500).json({ error: err.message });
  }
};
