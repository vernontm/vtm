const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Personal dashboard to-do list. Each user sees and manages only their own
// items (crm_todos.user_id = caller). Urgent items float to the top.
//
//   GET    /api/crm/todos                 -> { todos: [...] }
//   POST   /api/crm/todos                 { title, urgent?, due_date? }
//   PUT    /api/crm/todos?id=<uuid>       { title?, done?, urgent?, due_date? }
//   DELETE /api/crm/todos?id=<uuid>
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const rows = await supaFetch(
        `crm_todos?user_id=eq.${user.id}&order=done.asc,urgent.desc,created_at.desc`
      );
      return res.json({ todos: rows || [] });
    }

    if (req.method === 'POST') {
      const { title, urgent, due_date } = req.body || {};
      if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
      const rows = await supaFetch('crm_todos', {
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id,
          title: String(title).trim(),
          urgent: !!urgent,
          due_date: due_date || null,
        }),
      });
      return res.json({ todo: rows?.[0] || null });
    }

    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    // Scope every mutation to the caller's own rows.
    const owned = await supaFetch(`crm_todos?id=eq.${id}&user_id=eq.${user.id}&select=id`);
    if (!owned || owned.length === 0) return res.status(404).json({ error: 'Not found' });

    if (req.method === 'PUT') {
      const { title, done, urgent, due_date } = req.body || {};
      const patch = {};
      if (title !== undefined)    patch.title = String(title).trim();
      if (urgent !== undefined)   patch.urgent = !!urgent;
      if (due_date !== undefined) patch.due_date = due_date || null;
      if (done !== undefined) {
        patch.done = !!done;
        patch.done_at = done ? new Date().toISOString() : null;
      }
      const rows = await supaFetch(`crm_todos?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      return res.json({ todo: rows?.[0] || null });
    }

    if (req.method === 'DELETE') {
      await supaFetch(`crm_todos?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('todos error:', err);
    return res.status(500).json({ error: err.message });
  }
};
