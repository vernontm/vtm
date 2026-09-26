const { setCors, requireStaff, supaFetch } = require('../_lib/supabase.js');
const { pushUser } = require('../_lib/push.js');

// Reminders: a push at a time, for yourself or for a teammate. Any task can
// carry one (task_type + task_id link it), or it can stand on its own, or
// come from telling the assistant. The person it is FOR gets the push at
// remind_at (reminders-cron.js) and, when someone else set it, a push right
// away so it is not a surprise; the person who SET it gets a push when it is
// checked off.
//
//   GET    /api/crm/reminders            -> { reminders: [...mine and the ones I sent] }
//   POST   /api/crm/reminders            { title, remind_at, for_user?, for_user_name?, task_type?, task_id?, source? }
//   PUT    /api/crm/reminders?id=<uuid>  { done? | title? | remind_at? }
//   DELETE /api/crm/reminders?id=<uuid>
//
// Table: crm_reminders (docs/sql/reminders.sql). Until it exists the GET
// answers { reminders: [], needs_migration: true } so the app can say so.
const MIGRATION_MSG = 'Reminders need the crm_reminders table. Run docs/sql/reminders.sql in Supabase.';
const needsMigration = (e) => /crm_reminders|schema cache|does not exist/i.test(String(e?.message || e || ''));
const nameOf = (u) => u?.user_metadata?.name || u?.user_metadata?.full_name || (u?.email || '').split('@')[0] || 'Someone';
const fmtWhen = (iso) => {
  try { return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
};

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStaff(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { id } = req.query;
  const me = user.id;
  const myName = nameOf(user);

  try {
    if (req.method === 'GET') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const rows = await supaFetch(`crm_reminders?or=(for_user.eq.${me},created_by.eq.${me})&or=(status.neq.done,done_at.gte.${since})&order=remind_at.asc`);
      return res.json({ reminders: rows || [] });
    }

    if (req.method === 'POST') {
      const { title, remind_at, for_user, for_user_name, task_type, task_id, source } = req.body || {};
      if (!title || !String(title).trim()) return res.status(400).json({ error: 'title required' });
      const when = new Date(remind_at || '');
      if (isNaN(when)) return res.status(400).json({ error: 'remind_at must be a date' });
      const target = for_user || me;
      const [row] = await supaFetch('crm_reminders', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          title: String(title).trim(),
          remind_at: when.toISOString(),
          for_user: target,
          for_user_name: target === me ? myName : (for_user_name || null),
          created_by: me,
          created_by_name: myName,
          task_type: task_type || null,
          task_id: task_id ? String(task_id) : null,
          source: source || 'app',
          status: 'scheduled',
        }),
      });
      // Someone else's reminder lands with a heads-up now; the real one comes at remind_at.
      if (target !== me) {
        pushUser(target, { title: `Reminder from ${myName}`, body: `${row.title} · ${fmtWhen(row.remind_at)}`, data: { type: 'reminder', id: row.id } }).catch(() => {});
      }
      return res.status(201).json(row);
    }

    if (req.method === 'PUT' && id) {
      const [existing] = await supaFetch(`crm_reminders?id=eq.${id}&select=*`);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.for_user !== me && existing.created_by !== me && !user.is_admin) return res.status(403).json({ error: 'Not yours' });
      const body = req.body || {};
      const patch = {};
      if (body.done !== undefined) {
        patch.status = body.done ? 'done' : (new Date(existing.remind_at) > new Date() ? 'scheduled' : 'sent');
        patch.done_at = body.done ? new Date().toISOString() : null;
        patch.done_by = body.done ? me : null;
      }
      if (body.title !== undefined) patch.title = String(body.title).trim();
      if (body.remind_at !== undefined) {
        const when = new Date(body.remind_at);
        if (isNaN(when)) return res.status(400).json({ error: 'remind_at must be a date' });
        patch.remind_at = when.toISOString();
        patch.status = 'scheduled';
        patch.sent_at = null;
      }
      const [row] = await supaFetch(`crm_reminders?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch),
      });
      // Tell whoever set it that it is done.
      if (body.done && existing.created_by && existing.created_by !== me) {
        pushUser(existing.created_by, { title: `${myName} finished a reminder`, body: existing.title, data: { type: 'reminder', id } }).catch(() => {});
      }
      return res.json(row || {});
    }

    if (req.method === 'DELETE' && id) {
      const [existing] = await supaFetch(`crm_reminders?id=eq.${id}&select=for_user,created_by`);
      if (existing && existing.for_user !== me && existing.created_by !== me && !user.is_admin) return res.status(403).json({ error: 'Not yours' });
      await supaFetch(`crm_reminders?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (needsMigration(err)) {
      if (req.method === 'GET') return res.json({ reminders: [], needs_migration: true });
      return res.status(503).json({ error: MIGRATION_MSG });
    }
    console.error('reminders error:', err);
    return res.status(500).json({ error: err.message });
  }
};
