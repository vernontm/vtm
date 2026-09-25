const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// Availability finder for scheduling in-person meetups. Deterministic (no LLM):
// takes the team's work hours + the synced calendar (crm_meetings) and returns
// open slots. Used directly by the Inbox smart suggestions and as a tool the
// assistant calls. All slot math is done in the configured timezone so DST is
// handled correctly.

// Default: Monday-Thursday, 8am-8pm Central. A 60-min meeting's last start is
// 7pm so it finishes by 8. Override via the crm_app_settings 'scheduling_hours'
// row: { "days":[1,2,3,4], "start":"08:00", "end":"20:00", "tz":"America/Chicago" }.
const DEFAULT_HOURS = { days: [1, 2, 3, 4], start: '08:00', end: '20:00', tz: 'America/Chicago' };
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const hm = (s) => { const [h, m] = String(s || '').split(':').map(Number); return { h: h || 0, m: m || 0 }; };

// Offset (ms) of a timezone at a given instant; positive = ahead of UTC.
function tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {}; for (const x of dtf.formatToParts(date)) p[x.type] = x.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}
// The UTC instant for a wall-clock time in tz (mo is 0-based).
function zonedToUtc(y, mo, d, hh, mm, tz) {
  const naive = Date.UTC(y, mo, d, hh, mm);
  return new Date(naive - tzOffsetMs(new Date(naive), tz));
}
// The calendar y/m/d + weekday for an instant, as seen in tz.
function ymdInTz(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
  const p = {}; for (const x of dtf.formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month - 1, d: +p.day, weekday: p.weekday };
}

// Pure, testable. now = Date, meetings = [{start_time,end_time}].
function computeSlots({ now, days, durationMin, stepMin, workHours, meetings, limit }) {
  const wh = { ...DEFAULT_HOURS, ...(workHours || {}) };
  const tz = wh.tz || DEFAULT_HOURS.tz;
  const startHM = hm(wh.start), endHM = hm(wh.end);
  const workDays = new Set(wh.days);
  const busy = (meetings || []).map(m => {
    const s = new Date(m.start_time).getTime();
    const e = m.end_time ? new Date(m.end_time).getTime() : s + 60 * 60000;
    return [s, e];
  }).filter(([s, e]) => !isNaN(s) && !isNaN(e));
  const overlaps = (s, e) => busy.some(([bs, be]) => s < be && e > bs);

  const slots = [];
  const nowMs = now.getTime();
  const today = ymdInTz(now, tz);
  const lastStartMin = endHM.h * 60 + endHM.m - durationMin;
  for (let off = 0; off < days && slots.length < limit; off++) {
    // Anchor at noon UTC so advancing the day count never lands on the wrong
    // calendar day in Central time.
    const anchor = new Date(Date.UTC(today.y, today.mo, today.d + off, 12, 0));
    const ymd = ymdInTz(anchor, tz);
    if (!workDays.has(DOW[ymd.weekday])) continue;
    for (let t = startHM.h * 60 + startHM.m; t <= lastStartMin; t += stepMin) {
      const ss = zonedToUtc(ymd.y, ymd.mo, ymd.d, Math.floor(t / 60), t % 60, tz).getTime();
      const se = ss + durationMin * 60000;
      if (ss <= nowMs) continue;          // future only
      if (overlaps(ss, se)) continue;     // not during a booked meeting
      slots.push({
        start: new Date(ss).toISOString(),
        end: new Date(se).toISOString(),
        label: new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ss)),
      });
      if (slots.length >= limit) break;
    }
  }
  return slots;
}

async function loadWorkHours() {
  try {
    const rows = await supaFetch('crm_app_settings?key=eq.scheduling_hours&select=value&limit=1');
    const v = rows && rows[0] && rows[0].value;
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    if (parsed && Array.isArray(parsed.days)) return { ...DEFAULT_HOURS, ...parsed };
  } catch (_) {}
  return DEFAULT_HOURS;
}

// Reusable: load work hours + booked calendar and return open slots. Shared by
// this endpoint and the assistant's find_availability tool.
async function findAvailability({ durationMin = 60, days = 7, stepMin = 30, limit = 12 } = {}) {
  const workHours = await loadWorkHours();
  const now = new Date();
  const to = new Date(now.getTime() + days * 24 * 60 * 60000);
  const meetings = await supaFetch(
    `crm_meetings?start_time=gte.${encodeURIComponent(now.toISOString())}&start_time=lte.${encodeURIComponent(to.toISOString())}&select=start_time,end_time,status`
  ).catch(() => []);
  const active = (meetings || []).filter(m => String(m.status || '') !== 'cancelled');
  const slots = computeSlots({ now, days, durationMin, stepMin, workHours, meetings: active, limit });
  return { tz: workHours.tz || DEFAULT_HOURS.tz, duration_minutes: durationMin, work_hours: workHours, slots };
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const durationMin = Math.min(480, Math.max(15, parseInt(req.query.duration, 10) || 60));
    const days = Math.min(21, Math.max(1, parseInt(req.query.days, 10) || 7));
    const stepMin = Math.min(120, Math.max(15, parseInt(req.query.step, 10) || 30));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    return res.json(await findAvailability({ durationMin, days, stepMin, limit }));
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};

// Exposed for the assistant tool + unit testing.
module.exports.computeSlots = computeSlots;
module.exports.findAvailability = findAvailability;
module.exports.DEFAULT_HOURS = DEFAULT_HOURS;
