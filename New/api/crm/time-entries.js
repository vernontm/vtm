const { setCors, requireStaff, supaFetch } = require('../_lib/supabase.js');
const { shootTotal, statementTotal } = require('../_lib/shoot-billing.js');

// Employee time tracking. An employee clocks in/out (or adds manual time) for
// themselves; admins can view any employee, set their hourly rate, and mark
// entries paid. Non-admins are hard-scoped to their own user_id.
//   GET    /time-entries?user_id=&from=&to=   -> { entries, hourly_rate, open, statements }
//   POST   ?action=clock-in | clock-out | add | mark-paid | set-rate
//   POST   ?action=add-shoot | submit-statement | approve-statement | dispute-statement
//   PUT    ?id=<entry>    (edit own logged entry, or admin)
//   DELETE ?id=<entry>
//
// Shoots are time entries with kind='shoot'. They carry a location, mileage and
// a frozen billable_minutes, because an influencer contract pays a per-shoot
// minimum and rounds to the quarter hour. All of that math lives in
// _lib/shoot-billing.js and is applied HERE, server-side: a client never gets to
// tell us what it thinks it is owed.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStaff(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;
  // The user whose time we're touching. Non-admins may only ever be themselves.
  const targetUser = (user.is_admin && (req.query.user_id || req.body?.user_id)) || user.id;

  const rateFor = async (uid) => {
    const [r] = await supaFetch(`crm_employee_rates?user_id=eq.${uid}&select=hourly_rate`).catch(() => []);
    return r ? Number(r.hourly_rate) : 0;
  };

  // The IRS standard business mileage rate in force right now. Each shoot
  // stamps its own copy at creation, because contract 3.5 pays the rate in
  // effect on the travel date and that rate changes annually.
  const currentMileageRate = async () => {
    const [r] = await supaFetch(`crm_app_settings?key=eq.irs_mileage_rate&select=value`).catch(() => []);
    const n = Number(r && r.value);
    return Number.isFinite(n) && n > 0 ? n : 0;
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
      // Recent period payments so "when did I last pay her, and for what?"
      // is always answerable at a glance.
      const payments = scoped
        ? await supaFetch(`crm_time_payments?user_id=eq.${targetUser}&order=paid_at.desc&limit=20`).catch(() => [])
        : [];
      // Invoices raised against those shoots, plus the mileage rate the screen
      // needs to preview a shoot's value before it is saved.
      const statements = scoped
        ? await supaFetch(`crm_time_statements?user_id=eq.${targetUser}&order=created_at.desc&limit=50`).catch(() => [])
        : await supaFetch(`crm_time_statements?status=in.(submitted,disputed,approved)&order=created_at.desc&limit=50`).catch(() => []);
      return res.json({
        entries: entries || [],
        hourly_rate,
        open,
        payments: payments || [],
        statements: statements || [],
        mileage_rate: await currentMileageRate(),
      });
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

      // ── add-shoot: one influencer shoot. The caller supplies what happened
      // (when, where, how long, how far). The server decides what it is worth.
      if (action === 'add-shoot') {
        const b = req.body || {};
        const work_date = b.work_date || new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) return res.status(400).json({ error: 'A valid shoot date is required.' });

        // Minutes come either straight from the caller or from call/wrap times.
        let minutes = parseInt(b.minutes, 10);
        let started_at = null, ended_at = null;
        if (b.call_at && b.wrap_at) {
          started_at = new Date(b.call_at); ended_at = new Date(b.wrap_at);
          if (isNaN(started_at) || isNaN(ended_at)) return res.status(400).json({ error: 'Call and wrap times are not valid.' });
          if (ended_at <= started_at) return res.status(400).json({ error: 'Wrap time has to be after call time.' });
          minutes = Math.round((ended_at - started_at) / 60000);
          started_at = started_at.toISOString(); ended_at = ended_at.toISOString();
        }
        if (!Number.isFinite(minutes) || minutes <= 0) return res.status(400).json({ error: 'Enter how long the shoot ran, or a call and wrap time.' });

        const miles = Math.max(0, Number(b.miles) || 0);
        const mileage_rate = await currentMileageRate();
        const hourly = await rateFor(targetUser);
        const calc = shootTotal({ minutes, miles, hourlyRate: hourly, mileageRate: mileage_rate });

        const row = {
          user_id: targetUser,
          user_email: (targetUser === user.id ? user.email : (b.user_email || '')),
          work_date, started_at, ended_at,
          minutes,
          billable_minutes: calc.billable_minutes,
          kind: 'shoot',
          location: b.location || '',
          miles, mileage_rate,
          note: b.note || '',
          status: 'logged',
        };
        const [created] = await supaFetch('crm_time_entries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
        return res.status(201).json({ ...created, calc });
      }

      // ── pay-range: mark every logged entry in a date window paid, compute the
      // minutes -> hours math, and record ONE payment row for the period. This
      // replaces clicking entries one by one. Admin only.
      if (action === 'pay-range') {
        if (!user.is_admin) return res.status(403).json({ error: 'Admins only' });
        const { from, to, amount, preview } = req.body || {};
        if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
          return res.status(400).json({ error: 'Pick a valid date range.' });
        }
        const rows = await supaFetch(`crm_time_entries?user_id=eq.${targetUser}&status=eq.logged&minutes=gt.0&work_date=gte.${from}&work_date=lte.${to}&select=id,minutes`) || [];
        const minutes = rows.reduce((s, r) => s + (r.minutes || 0), 0);
        const rate = await rateFor(targetUser);
        const suggested = Math.round((minutes / 60) * rate * 100) / 100;
        if (preview) return res.json({ minutes, entry_count: rows.length, hourly_rate: rate, suggested_amount: suggested });
        if (!rows.length) return res.status(400).json({ error: 'No unpaid time in that range.' });

        const now = new Date().toISOString();
        const inList = rows.map(r => r.id).join(',');
        await supaFetch(`crm_time_entries?id=in.(${inList})`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: now, updated_at: now }) });
        const [payment] = await supaFetch('crm_time_payments', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: targetUser, period_start: from, period_end: to,
            minutes, entry_count: rows.length,
            amount: amount != null && amount !== '' ? Number(amount) : suggested,
          }),
        });
        return res.json({ ok: true, payment, minutes, entry_count: rows.length });
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

      // ── submit-statement: the contractor invoices for her shoots. Per-shoot
      // invoicing means this is normally one shoot, but it takes a list so a
      // monthly cadence needs no new code (contract 3.7 allows either).
      if (action === 'submit-statement') {
        const ids = Array.isArray(req.body?.entry_ids) ? req.body.entry_ids.filter(x => typeof x === 'string') : [];
        // Only ever this user's own unbilled, unpaid shoots. Scoping by
        // targetUser here is what stops one contractor invoicing another's work.
        let path = `crm_time_entries?user_id=eq.${targetUser}&kind=eq.shoot&status=eq.logged&statement_id=is.null`;
        if (ids.length) path += `&id=in.(${ids.map(x => `"${x}"`).join(',')})`;
        const shoots = await supaFetch(path + '&select=id,minutes,miles,mileage_rate,work_date') || [];
        if (!shoots.length) return res.status(400).json({ error: 'No shoots are waiting to be invoiced.' });

        const hourly = await rateFor(targetUser);
        const totals = statementTotal(shoots, hourly);
        const dates = shoots.map(x => x.work_date).sort();
        const now = new Date().toISOString();

        const [statement] = await supaFetch('crm_time_statements', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: targetUser,
            kind: shoots.length === 1 ? 'shoot' : 'period',
            period_start: dates[0], period_end: dates[dates.length - 1],
            status: 'submitted', submitted_at: now,
            billable_minutes: totals.billable_minutes, miles: totals.miles,
            hours_amount: totals.hours_amount, mileage_amount: totals.mileage_amount,
            total_amount: totals.total_amount,
          }),
        });
        await supaFetch(`crm_time_entries?id=in.(${shoots.map(x => `"${x.id}"`).join(',')})`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ statement_id: statement.id, updated_at: now }),
        });
        return res.status(201).json({ ok: true, statement, shoot_count: shoots.length });
      }

      // ── approve / dispute / pay a submitted invoice. Admin only.
      if (action === 'approve-statement' || action === 'dispute-statement' || action === 'pay-statement') {
        if (!user.is_admin) return res.status(403).json({ error: 'Admins only' });
        const sid = req.body?.statement_id;
        if (!sid) return res.status(400).json({ error: 'statement_id required' });
        const [st] = await supaFetch(`crm_time_statements?id=eq.${sid}`);
        if (!st) return res.status(404).json({ error: 'Invoice not found' });
        const now = new Date().toISOString();

        if (action === 'approve-statement') {
          if (st.status === 'paid') return res.status(400).json({ error: 'That invoice is already paid.' });
          const [updated] = await supaFetch(`crm_time_statements?id=eq.${sid}`, {
            method: 'PATCH', headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: 'approved', approved_at: now, disputed_at: null, dispute_note: null }),
          });
          return res.json({ ok: true, statement: updated });
        }

        if (action === 'dispute-statement') {
          if (st.status === 'paid') return res.status(400).json({ error: 'That invoice is already paid.' });
          const [updated] = await supaFetch(`crm_time_statements?id=eq.${sid}`, {
            method: 'PATCH', headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: 'disputed', disputed_at: now, dispute_note: req.body?.note || '' }),
          });
          return res.json({ ok: true, statement: updated });
        }

        // pay-statement: money actually moves. Mark the shoots paid, record one
        // payment row for the invoice, and link the two so the history is
        // answerable later.
        if (st.status === 'paid') return res.json({ ok: true, already: true, statement: st });
        const entries = await supaFetch(`crm_time_entries?statement_id=eq.${sid}&select=id`) || [];
        if (entries.length) {
          await supaFetch(`crm_time_entries?statement_id=eq.${sid}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ status: 'paid', paid_at: now, updated_at: now }),
          });
        }
        const [payment] = await supaFetch('crm_time_payments', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            user_id: st.user_id, period_start: st.period_start, period_end: st.period_end,
            minutes: st.billable_minutes, entry_count: entries.length,
            amount: req.body?.amount != null && req.body.amount !== '' ? Number(req.body.amount) : Number(st.total_amount) || 0,
            note: req.body?.note || null,
          }),
        });
        const [updated] = await supaFetch(`crm_time_statements?id=eq.${sid}`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ status: 'paid', payment_id: payment.id }),
        });
        return res.json({ ok: true, statement: updated, payment });
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
