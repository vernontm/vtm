const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Recurring checklists ("routines"). Each routine has a cadence (daily /
// weekly / monthly) and an ordered list of items (JSONB: [{ id, text, target? }]).
// Completion is tracked per (item, period_key) in crm_routine_checks: the
// client computes the current period key, so a checklist visually resets when
// the day / week / month rolls over. Checks are team-wide: anyone can tick an
// item and it counts as done for that period.
//
// An item may carry a numeric target ("Reach out to 50 leads"). Those are
// counted rather than ticked: crm_routine_checks.count holds how many so far
// and the item is done once count >= target (column from docs/sql/role-homes.sql).
//
//   GET    /api/crm/routines                 -> { routines: [...], checks: [...recent, each with count] }
//   POST   /api/crm/routines                 { title, cadence?, description?, items? }   (admin)
//   PUT    /api/crm/routines?id=<uuid>       { ...fields }                               (admin)
//   DELETE /api/crm/routines?id=<uuid>                                                   (admin)
//   POST   /api/crm/routines?action=check    { routine_id, item_id, period_key, done }   (any user)
//   POST   /api/crm/routines?action=count    { routine_id, item_id, period_key, count }  (any user)
const MIGRATION_MSG = 'Count-to-target items need the count column. Run docs/sql/role-homes.sql in Supabase.';
const missingCount = (e) => { const m = String(e?.message || e || ''); return /count/i.test(m) && /schema cache|does not exist|could not find/i.test(m); };
const q = encodeURIComponent;

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;
  const adminOnly = () => { if (!user.is_admin) { res.status(403).json({ error: 'Admin only' }); return true; } return false; };
  const nameOf = () => user.email || 'Someone';

  try {
    // Toggle a checklist item for the current period (any signed-in user).
    if (action === 'check') {
      const { routine_id, item_id, period_key, done } = req.body || {};
      if (!item_id || !period_key) return res.status(400).json({ error: 'item_id and period_key required' });
      if (done) {
        // idempotent upsert on the (item_id, period_key) unique constraint
        await supaFetch('crm_routine_checks?on_conflict=item_id,period_key', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify({ routine_id: routine_id || null, item_id, period_key, done_by: user.id, done_by_name: nameOf() }),
        });
      } else {
        await supaFetch(`crm_routine_checks?item_id=eq.${q(item_id)}&period_key=eq.${q(period_key)}`, { method: 'DELETE' });
      }
      return res.json({ ok: true });
    }

    // Record progress on a count-to-target item. A count of zero clears the
    // row, the same as unticking; anything else is upserted with the count.
    if (action === 'count') {
      const { routine_id, item_id, period_key } = req.body || {};
      if (!item_id || !period_key) return res.status(400).json({ error: 'item_id and period_key required' });
      const raw = Number(req.body?.count);
      if (!Number.isFinite(raw)) return res.status(400).json({ error: 'count must be a number' });
      const count = Math.max(0, Math.floor(raw));
      const target = await targetOf(routine_id, item_id);
      try {
        if (count <= 0) {
          await supaFetch(`crm_routine_checks?item_id=eq.${q(item_id)}&period_key=eq.${q(period_key)}`, { method: 'DELETE' });
        } else {
          await supaFetch('crm_routine_checks?on_conflict=item_id,period_key', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            // The column is done_count: PostgREST reads a bare "count" in a select as the aggregate.
            body: JSON.stringify({ routine_id: routine_id || null, item_id, period_key, done_count: count, done_by: user.id, done_by_name: nameOf(), done_at: new Date().toISOString() }),
          });
        }
      } catch (e) {
        if (missingCount(e)) return res.status(503).json({ error: MIGRATION_MSG, needs_migration: true });
        throw e;
      }
      return res.json({ ok: true, count, target, done: target ? count >= target : count > 0 });
    }

    if (req.method === 'GET') {
      const routines = await supaFetch('crm_routines?select=*&order=position.asc,created_at.asc');
      // Recent checks only (older periods are irrelevant: the list has reset).
      const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      let checks;
      try {
        checks = await supaFetch(`crm_routine_checks?select=item_id,period_key,done_by_name,done_at,done_count&done_at=gte.${since}`);
      } catch (e) {
        // Before the done_count column exists the list still has to load.
        if (!missingCount(e)) throw e;
        checks = await supaFetch(`crm_routine_checks?select=item_id,period_key,done_by_name,done_at&done_at=gte.${since}`);
      }
      // The app and the web read `count`; the column is named done_count.
      const out = (checks || []).map(({ done_count, ...r }) => ({ ...r, count: done_count == null ? null : done_count }));
      return res.json({ routines: routines || [], checks: out });
    }

    if (req.method === 'POST') {
      if (adminOnly()) return;
      const { title, cadence, description, items, position } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
      const [row] = await supaFetch('crm_routines', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          title: title.trim(),
          cadence: (cadence || 'daily'),
          description: description || '',
          items: Array.isArray(items) ? items : [],
          position: Number.isFinite(position) ? position : 0,
        }),
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT' && id) {
      if (adminOnly()) return;
      const { id: _, created_at, ...data } = req.body || {};
      data.updated_at = new Date().toISOString();
      const [row] = await supaFetch(`crm_routines?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data),
      });
      return res.json(row || {});
    }

    if (req.method === 'DELETE' && id) {
      if (adminOnly()) return;
      await supaFetch(`crm_routine_checks?routine_id=eq.${id}`, { method: 'DELETE' });
      await supaFetch(`crm_routines?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('routines error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// The item's target, so the reply can say whether the count finished it.
async function targetOf(routineId, itemId) {
  if (!routineId || !/^[\w-]{1,64}$/.test(String(routineId))) return null;
  try {
    const [r] = await supaFetch(`crm_routines?id=eq.${routineId}&select=items`) || [];
    const item = (Array.isArray(r?.items) ? r.items : []).find(i => i && i.id === itemId);
    const t = Number(item?.target);
    return t > 0 ? t : null;
  } catch (_) { return null; }
}
