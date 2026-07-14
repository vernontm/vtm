const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

// Recurring email-blast automations (admin only). The email-cron endpoint
// fires these; here we just manage the definitions.
//
//   GET    /api/crm/email-automations?client_id=<uuid>
//   POST   /api/crm/email-automations   { client_id, name, group_id, subject, from_name, from_email, body, weekday, send_hour, timezone?, active? }
//   PUT    /api/crm/email-automations?id=<uuid>   { ...fields }
//   DELETE /api/crm/email-automations?id=<uuid>
const tzDate = (timeZone, now = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: WD[p.weekday], hour: parseInt(p.hour, 10) % 24, date: `${p.year}-${p.month}-${p.day}` };
};

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admins only' });

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const client_id = req.query.client_id;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const chk = await assertClientAccess(user, client_id);
      if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
      const rows = await supaFetch(`crm_email_automations?client_id=eq.${client_id}&select=*&order=weekday.asc,send_hour.asc`);
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.client_id) return res.status(400).json({ error: 'client_id required' });
      const chk = await assertClientAccess(user, b.client_id);
      if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
      for (const k of ['name', 'group_id', 'subject', 'from_email', 'body']) {
        if (!b[k] || !String(b[k]).trim()) return res.status(400).json({ error: `${k} required` });
      }
      const tz = b.timezone || 'America/Chicago';
      const weekday = Number.isInteger(b.weekday) ? b.weekday : 3;
      const send_hour = Number.isInteger(b.send_hour) ? b.send_hour : 9;
      // Never fire the same day it's created: if it's already this weekday and
      // past the send hour, mark today as already sent so it starts next week.
      const nowT = tzDate(tz);
      const last_sent_period = (nowT.weekday === weekday && nowT.hour >= send_hour) ? nowT.date : null;

      const [row] = await supaFetch('crm_email_automations', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          client_id: b.client_id, name: b.name.trim(), group_id: String(b.group_id),
          subject: b.subject.trim(), from_name: b.from_name || null, from_email: b.from_email.trim(),
          body: b.body, cadence: 'weekly', weekday, send_hour, timezone: tz,
          active: b.active !== false, last_sent_period, created_by: user.id,
        }),
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, client_id: __, created_by, created_at, last_sent_period, last_sent_at, ...data } = req.body || {};
      data.updated_at = new Date().toISOString();
      const [row] = await supaFetch(`crm_email_automations?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data),
      });
      return res.json(row || {});
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_email_automations?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('email-automations error:', err);
    return res.status(500).json({ error: err.message });
  }
};
