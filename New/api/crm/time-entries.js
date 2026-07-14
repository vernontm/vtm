const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Employee time tracking. An employee clocks in/out (or adds manual time) for
// themselves; admins can view any employee, set their hourly rate, and mark
// entries paid. Non-admins are hard-scoped to their own user_id.
//   GET    /time-entries?user_id=&from=&to=   -> { entries, hourly_rate, open }
//   POST   ?action=clock-in | clock-out | add | mark-paid | set-rate
//   PUT    ?id=<entry>    (edit own logged entry, or admin)
//   DELETE ?id=<entry>
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;
  // The user whose time we're touching. Non-admins may only ever be themselves.
  const targetUser = (user.is_admin && (req.query.user_id || req.body?.user_id)) || user.id;

  const rateFor = async (uid) => {
    const [r] = await supaFetch(`crm_employee_rates?user_id=eq.${uid}&select=hourly_rate`).catch(() => []);
    return r ? Number(r.hourly_rate) : 0;
  };

  try {
    // ── GET ────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const { from, to } = req.query;
      // Admin with no user_id => everyone; otherwise scoped to targetUser.
      const scoped = !(user.is_admin && !req.query.user_id);
      let path = 'crm_time_entries?order=work_date.desc,created_at.desc&limit=500';
      if (scoped) path += `&user_id=eq.${targetUser}`;
      if (from) path += `&work_date=gte.${from}`;
      if (to) path += `&work_date=lte.${to}`;
      const entries = await supaFetch(path);
      const open = (entries || []).find(e => e.user_id === (scoped ? targetUser : e.user_id) && !e.ended_at && e.started_at) || null;
      const hourly_rate = scoped ? await rateFor(targetUser) : 0;
      return res.json({ entries: entries || [], hourly_rate, open });
    }

    // ── POST actions ─────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      if (action === 'clock-in') {
        const [existing] = await supaFetch(`crm_time_entries?user_id=eq.${targetUser}&ended_at=is.null&started_at=not.is.null&order=started_at.desc&limit=1`);
        if (existing) return res.json(existing); // already clocked in — idempotent
        const now = new Date().toISOString();
        const row = { user_id: targetUser, user_email: (targetUser === user.id ? user.email : (req.body?.user_email || '')), started_at: now, work_date: (req.body?.work_date || now.slice(0, 10)), minutes: 0, status: 'logged' };
        const [created] = await supaFetch('crm_time_entries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
        return res.status(201).json(created);
      }

      if (action === 'clock-out') {
        const [open] = await supaFetch(`crm_time_entries?user_id=eq.${targetUser}&ended_at=is.null&started_at=not.is.null&order=started_at.desc&limit=1`);
        if (!open) return res.status(400).json({ error: 'Not clocked in.' });
        const endedAt = new Date();
        const minutes = Math.max(1, Math.round((endedAt.getTime() - new Date(open.started_at).getTime()) / 60000));
        const [updated] = await supaFetch(`crm_time_entries?id=eq.${open.id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ended_at: endedAt.toISOString(), minutes, updated_at: endedAt.toISOString() }) });
        return res.json(updated);
      }

      if (action === 'add') {
        const minutes = parseInt(req.body?.minutes, 10);
        if (!minutes || minutes <= 0) return res.status(400).json({ error: 'minutes required' });
        const row = { user_id: targetUser, user_email: (targetUser === user.id ? user.email : (req.body?.user_email || '')), work_date: req.body?.work_date || new Date().toISOString().slice(0, 10), minutes, note: req.body?.note || '', status: 'logged' };
        const [created] = await supaFetch('crm_time_entries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
        return res.status(201).json(created);
      }

      if (action === 'mark-paid') {
        if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
        const now = new Date().toISOString();
        if (Array.isArray(req.body?.ids) && req.body.ids.length) {
          const inList = req.body.ids.map(x => `"${x}"`).join(',');
          await supaFetch(`crm_time_entries?id=in.(${inList})`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: now, updated_at: now }) });
        } else if (req.body?.user_id) {
          // pay all of this user's logged entries
          await supaFetch(`crm_time_entries?user_id=eq.${req.body.user_id}&status=eq.logged`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: now, updated_at: now }) });
        }
        return res.json({ ok: true });
      }

      if (action === 'set-rate') {
        if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
        const { user_id, hourly_rate } = req.body || {};
        if (!user_id) return res.status(400).json({ error: 'user_id required' });
        await supaFetch('crm_employee_rates?on_conflict=user_id', {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ user_id, hourly_rate: Number(hourly_rate) || 0, updated_at: new Date().toISOString() }),
        });
        return res.json({ ok: true, hourly_rate: Number(hourly_rate) || 0 });
      }

      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── PUT (edit) ────────────────────────────────────────────────────────────
    if (req.method === 'PUT' && id) {
      const [entry] = await supaFetch(`crm_time_entries?id=eq.${id}`);
      if (!entry) return res.status(404).json({ error: 'Not found' });
      if (!user.is_admin && (entry.user_id !== user.id || entry.status === 'paid')) return res.status(403).json({ error: 'Not allowed' });
      const d = {};
      if (req.body.minutes != null) d.minutes = parseInt(req.body.minutes, 10) || 0;
      if (req.body.note != null) d.note = req.body.note;
      if (req.body.work_date != null) d.work_date = req.body.work_date;
      d.updated_at = new Date().toISOString();
      const [updated] = await supaFetch(`crm_time_entries?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(d) });
      return res.json(updated);
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE' && id) {
      const [entry] = await supaFetch(`crm_time_entries?id=eq.${id}`);
      if (!entry) return res.json({ success: true });
      if (!user.is_admin && (entry.user_id !== user.id || entry.status === 'paid')) return res.status(403).json({ error: 'Not allowed' });
      await supaFetch(`crm_time_entries?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('time-entries error:', err);
    return res.status(500).json({ error: err.message });
  }
};
