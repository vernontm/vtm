const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Recurring checklists ("routines"). Each routine has a cadence (daily /
// weekly / monthly) and an ordered list of items (JSONB: [{ id, text }]).
// Completion is tracked per (item, period_key) in crm_routine_checks — the
// client computes the current period key, so a checklist visually resets when
// the day / week / month rolls over. Checks are team-wide: anyone can tick an
// item and it counts as done for that period.
//
//   GET    /api/crm/routines                 -> { routines: [...], checks: [...recent] }
//   POST   /api/crm/routines                 { title, cadence?, description?, items? }   (admin)
//   PUT    /api/crm/routines?id=<uuid>       { ...fields }                               (admin)
//   DELETE /api/crm/routines?id=<uuid>                                                   (admin)
//   POST   /api/crm/routines?action=check    { routine_id, item_id, period_key, done }   (any user)
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
        await supaFetch(`crm_routine_checks?item_id=eq.${encodeURIComponent(item_id)}&period_key=eq.${encodeURIComponent(period_key)}`, { method: 'DELETE' });
      }
      return res.json({ ok: true });
    }

    if (req.method === 'GET') {
      const routines = await supaFetch('crm_routines?select=*&order=position.asc,created_at.asc');
      // Recent checks only (older periods are irrelevant — the list has reset).
      const since = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
      const checks = await supaFetch(`crm_routine_checks?select=item_id,period_key,done_by_name,done_at&done_at=gte.${since}`);
      return res.json({ routines: routines || [], checks: checks || [] });
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
