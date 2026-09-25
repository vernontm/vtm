// App usage tracking: the iPhone app posts batches of screen views and key
// actions here; admins read a daily rollup to see what the team actually
// uses. Bodies of texts, notes and prompts are never sent, only the names.
//
//   POST /api/crm/app-events           { events: [{ event, name, props, at, session_id }], platform, app_version }
//   GET  /api/crm/app-events?days=30   admin only: { days, rows: [{ user_id, user_name, event, name, day, n }] }
//
// Table + view: docs/sql/app-events.sql
const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

const MIGRATION_MSG = 'App usage tracking is not set up yet: run docs/sql/app-events.sql in Supabase.';
const needsMigration = (e) => /crm_app_events|schema cache|does not exist/i.test(String(e?.message || e || ''));
const clean = (s, n) => String(s || '').slice(0, n);

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'POST') {
      const { events, platform, app_version } = req.body || {};
      if (!Array.isArray(events) || !events.length) return res.status(400).json({ error: 'events required' });
      const name = user.name || user.email || '';
      const rows = events.slice(0, 200).map((e) => ({
        user_id: user.id,
        user_name: clean(name, 80),
        event: clean(e?.event, 20) === 'action' ? 'action' : 'screen',
        name: clean(e?.name, 80) || 'unknown',
        props: e?.props && typeof e.props === 'object' ? JSON.parse(JSON.stringify(e.props).slice(0, 600)) : null,
        session_id: clean(e?.session_id, 40) || null,
        platform: clean(platform, 16) || null,
        app_version: clean(app_version, 24) || null,
        at: e?.at && !isNaN(new Date(e.at)) ? new Date(e.at).toISOString() : new Date().toISOString(),
      })).filter((r) => r.name);
      await supaFetch('crm_app_events', { method: 'POST', body: JSON.stringify(rows) });
      return res.status(201).json({ ok: true, saved: rows.length });
    }

    if (req.method === 'GET') {
      if (!user.is_admin) return res.status(403).json({ error: 'Admins only' });
      const days = Math.min(120, Math.max(1, Number(req.query.days) || 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const rows = await supaFetch(`crm_app_events_daily?day=gte.${since}&order=day.desc&limit=5000`);
      return res.json({ days, rows: rows || [] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (needsMigration(err)) return res.status(503).json({ error: MIGRATION_MSG });
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
