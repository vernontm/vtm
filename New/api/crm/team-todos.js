const { setCors, requireCrmUser, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

// Shared team to-do list. Every signed-in user can see the whole list and add
// items. A to-do can be linked to a client / project / other, and either left
// open (anyone may complete it) or assigned/locked to one user (only that user
// — or an admin — may mark it done). Editing meta / deleting is limited to the
// creator or an admin.
//
//   GET    /api/crm/team-todos           -> [{...}]
//   GET    /api/crm/team-todos?members=1 -> [{ id, name }]  (roster for the "assign to" picker)
//   POST   /api/crm/team-todos           { title, urgent?, assigned_to?, assigned_to_name?, link_type?, link_id?, link_label? }
//   PUT    /api/crm/team-todos?id=<uuid>  { done? | title? | urgent? | assigned_to? | link_* }
//   DELETE /api/crm/team-todos?id=<uuid>
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id, members } = req.query;
  const nameOf = (u) => u?.user_metadata?.name || u?.user_metadata?.full_name || u?.email || 'Someone';

  try {
    if (req.method === 'GET') {
      // Roster for the assignee picker — any signed-in user can read it.
      if (members) {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, {
          headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
        });
        const j = await r.json().catch(() => ({}));
        const list = (Array.isArray(j?.users) ? j.users : []).map(u => ({ id: u.id, name: nameOf(u) }));
        return res.json(list);
      }
      const rows = await supaFetch('crm_team_todos?select=*&order=done.asc,urgent.desc,created_at.desc');
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const { title, urgent, assigned_to, assigned_to_name, link_type, link_id, link_label } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
      const [row] = await supaFetch('crm_team_todos', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          title: title.trim(),
          created_by: user.id,
          created_by_name: nameOf(user),
          assigned_to: assigned_to || null,
          assigned_to_name: assigned_to ? (assigned_to_name || null) : null,
          link_type: link_type || null,
          link_id: link_id || null,
          link_label: link_label || null,
          urgent: !!urgent,
        }),
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT' && id) {
      const [existing] = await supaFetch(`crm_team_todos?id=eq.${id}&select=*`);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const body = req.body || {};
      const patch = {};

      // Completion follows the lock rule.
      if (body.done !== undefined) {
        const locked = !!existing.assigned_to;
        const canComplete = !locked || existing.assigned_to === user.id || user.is_admin;
        if (!canComplete) return res.status(403).json({ error: `This task is locked to ${existing.assigned_to_name || 'another user'}.` });
        patch.done = !!body.done;
        patch.done_by = body.done ? user.id : null;
        patch.done_by_name = body.done ? nameOf(user) : null;
        patch.done_at = body.done ? new Date().toISOString() : null;
      }

      // Any other edit is creator/admin only.
      const metaKeys = ['title', 'urgent', 'assigned_to', 'assigned_to_name', 'link_type', 'link_id', 'link_label'];
      const touchesMeta = metaKeys.some(k => body[k] !== undefined);
      if (touchesMeta) {
        if (user.id !== existing.created_by && !user.is_admin) return res.status(403).json({ error: 'Only the person who added this can edit it.' });
        for (const k of metaKeys) if (body[k] !== undefined) patch[k] = body[k];
        if (body.assigned_to !== undefined && !body.assigned_to) patch.assigned_to_name = null;
      }

      const [row] = await supaFetch(`crm_team_todos?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch),
      });
      return res.json(row || {});
    }

    if (req.method === 'DELETE' && id) {
      const [existing] = await supaFetch(`crm_team_todos?id=eq.${id}&select=created_by`);
      if (existing && existing.created_by !== user.id && !user.is_admin) {
        return res.status(403).json({ error: 'Only the person who added this can delete it.' });
      }
      await supaFetch(`crm_team_todos?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('team-todos error:', err);
    return res.status(500).json({ error: err.message });
  }
};
