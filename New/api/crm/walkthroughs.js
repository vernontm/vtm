const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Step-by-step walkthroughs / SOPs. Each walkthrough has an ordered list of
// steps (stored as JSONB); a step can hold text, clickable links, and media
// (images, video, PDFs, docs) that were uploaded via /api/crm/upload.
//
//   GET    /api/crm/walkthroughs            -> [{...}]  (list, no steps for speed)
//   GET    /api/crm/walkthroughs?id=<uuid>  -> {...}    (full, with steps)
//   POST   /api/crm/walkthroughs            { title, description?, category?, steps? }
//   PUT    /api/crm/walkthroughs?id=<uuid>  { ...fields }
//   DELETE /api/crm/walkthroughs?id=<uuid>
//
// Read is open to any signed-in user; create/edit/delete are admin-only.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  const adminOnly = () => { if (!user.is_admin) { res.status(403).json({ error: 'Admin only' }); return true; } return false; };

  try {
    if (req.method === 'GET') {
      if (id) {
        const [row] = await supaFetch(`crm_walkthroughs?id=eq.${id}&select=*`);
        if (!row) return res.status(404).json({ error: 'Not found' });
        return res.json(row);
      }
      // list without the (potentially large) steps payload; include a count
      const rows = await supaFetch('crm_walkthroughs?select=id,title,description,category,steps,created_at,updated_at&order=created_at.desc');
      const list = (rows || []).map(r => ({
        id: r.id, title: r.title, description: r.description, category: r.category,
        step_count: Array.isArray(r.steps) ? r.steps.length : 0,
        created_at: r.created_at, updated_at: r.updated_at,
      }));
      return res.json(list);
    }

    if (req.method === 'POST') {
      if (adminOnly()) return;
      const { title, description, category, steps } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
      const [row] = await supaFetch('crm_walkthroughs', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          title: title.trim(),
          description: description || '',
          category: (category || 'SOPs').trim() || 'SOPs',
          steps: Array.isArray(steps) ? steps : [],
        }),
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT' && id) {
      if (adminOnly()) return;
      const { id: _, created_at, ...data } = req.body || {};
      data.updated_at = new Date().toISOString();
      const [row] = await supaFetch(`crm_walkthroughs?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data),
      });
      return res.json(row || {});
    }

    if (req.method === 'DELETE' && id) {
      if (adminOnly()) return;
      await supaFetch(`crm_walkthroughs?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('walkthroughs error:', err);
    return res.status(500).json({ error: err.message });
  }
};
