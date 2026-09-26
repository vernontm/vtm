const { setCors, requireCrmUser, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { centralToInstant, normalizePhone } = require('../_lib/followups.js');
const N = require('../_lib/nudges.js');

// One call per home load: who the caller is (their role) plus the sections
// that role's home shows (docs/engineer/role-homes-contracts.md). Sections
// load in parallel and independently: a source that fails drops its section,
// never the whole home. Money is in dollars, dates are ISO strings, "today"
// and "this month" are America/Chicago.
//
//   GET /api/crm/home?role=<ceo|hr|assistant|sales|general>
//
// The role comes from, in order: the crm_app_settings home_roles map (admins
// edit it in the app), auth admin = ceo, the roster title, else general.
// ?role= overrides it for admins (to look at another home); everyone else
// can only ask for the plain general home.
const ROLES = ['ceo', 'hr', 'assistant', 'sales', 'general'];
const SECTIONS = {
  ceo: ['next_up', 'team_today', 'held_up', 'money', 'team_unread', 'clients_active', 'payroll'],
  hr: ['next_up', 'team_today', 'review_queue', 'onboarding', 'payroll', 'team_unread'],
  assistant: ['next_up', 'route', 'outreach', 'team_unread', 'leads'],
  sales: ['next_up', 'outreach', 'leads', 'before_call', 'team_unread'],
  general: ['next_up', 'leads', 'team_unread'],
};
const CENTRAL = 'America/Chicago';
const DAY = 24 * 60 * 60 * 1000;
const WEEK_TARGET_MINUTES = 60 * 60;   // 60 hours across the team
const CLIENT_COLS = N.CLIENT_COLS;
const MEETING_COLS = 'id,summary,title,start_time,end_time,location,meet_link,attendees,all_day';
// Journey stages that do not count as an active client: lead is its own list, paused is on hold.
const NOT_ACTIVE = new Set(['lead', 'paused', 'churned', 'lost', 'inactive', 'cancelled', 'canceled', 'archived']);
const q = encodeURIComponent;
const num = N.num;
const missingTable = (e) => /schema cache|does not exist|could not find/i.test(String(e?.message || e || ''));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// A failing query is an empty input for its section, never a broken home.
const safe = (p) => Promise.resolve(p).then(r => r || []).catch(e => { console.error('home query failed:', e.message); return []; });

// ── Central calendar ────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
function centralYmd(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => +parts.find(p => p.type === t)?.value;
  return { y: get('year'), m: get('month'), d: get('day') };
}
const ymdStr = ({ y, m, d }) => `${y}-${pad(m)}-${pad(d)}`;
function shift({ y, m, d }, days) {
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
const startOf = (ymd) => centralToInstant(ymd.y, ymd.m, ymd.d, 0, 0);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// Everything "today", "this week" and "this month" mean, computed once per request.
function calendar(now = new Date()) {
  const today = centralYmd(now);
  const dow = (new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay() + 6) % 7;   // 0 = Monday
  const monday = shift(today, -dow);
  const prevMonth = today.m === 1 ? { y: today.y - 1, m: 12, d: 1 } : { y: today.y, m: today.m - 1, d: 1 };
  const nextMonth = today.m === 12 ? { y: today.y + 1, m: 1, d: 1 } : { y: today.y, m: today.m + 1, d: 1 };
  return {
    now, today, todayStr: ymdStr(today), todayStart: startOf(today), tomorrowStart: startOf(shift(today, 1)),
    weekStartStr: ymdStr(monday), weekStart: startOf(monday),
    monthStart: startOf({ y: today.y, m: today.m, d: 1 }), prevMonthStart: startOf(prevMonth), nextMonthStart: startOf(nextMonth),
    monthName: new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, month: 'long' }).format(now),
    monthShort: new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, month: 'short' }).format(now),
  };
}
// The next monthly anniversary of a start date, as a Central calendar day.
function nextMonthly(startIso, cal) {
  const start = N.toYmd(startIso);
  if (!start) return null;
  let [y, m, d] = start.split('-').map(Number);
  for (let i = 0; i < 240; i++) {
    const cand = ymdStr({ y, m, d: Math.min(d, daysInMonth(y, m)) });
    if (cand >= cal.todayStr) return cand;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return null;
}

// ── People ──────────────────────────────────────────────────────────────────
// Roster first (that is where titles and names live), then the login's own
// name, then the email's local part.
async function loadPeople() {
  const [roster, auth] = await Promise.all([
    safe(supaFetch('crm_team_members?select=id,name,email,user_id,title,role,status,invite_status,started_on,created_at')),
    fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
      .then(r => r.json()).then(j => (Array.isArray(j?.users) ? j.users : [])).catch(() => []),
  ]);
  const byUser = new Map(), byEmail = new Map();
  for (const r of roster) {
    if (r.user_id) byUser.set(r.user_id, r);
    if (r.email) byEmail.set(String(r.email).toLowerCase(), r);
  }
  const authById = new Map(auth.map(u => [u.id, u]));
  const authByEmail = new Map(auth.filter(u => u.email).map(u => [String(u.email).toLowerCase(), u]));
  const isAdmin = (u) => !!(u?.user_metadata?.is_admin || u?.app_metadata?.is_admin);
  const nameOf = (userId, email) => {
    const em = String(email || '').toLowerCase();
    const r = (userId && byUser.get(userId)) || (em && byEmail.get(em));
    if (r?.name) return r.name;
    const u = (userId && authById.get(userId)) || (em && authByEmail.get(em));
    const meta = u?.user_metadata || {};
    // An email prefix is the last resort, so at least capitalize it.
    const local = String(u?.email || email || '').split('@')[0];
    return meta.name || meta.full_name || (local ? local[0].toUpperCase() + local.slice(1) : 'Someone');
  };
  return {
    roster,
    active: roster.filter(r => r.status == null || r.status === 'active'),
    rosterFor: (user) => byUser.get(user.id) || byEmail.get(String(user.email || '').toLowerCase()) || null,
    nameOf,
    firstNameOf: (email) => nameOf(null, email).split(/\s+/)[0],
    // Someone on our side: on the roster, or an admin login. Client logins are not.
    isTeamEmail: (email) => { const em = String(email || '').toLowerCase(); return byEmail.has(em) || isAdmin(authByEmail.get(em)); },
  };
}

// ── Role ────────────────────────────────────────────────────────────────────
async function homeRolesMap() {
  try {
    const rows = await supaFetch('crm_app_settings?key=eq.home_roles&select=value&limit=1');
    const raw = rows?.[0]?.value;
    const map = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return map && typeof map === 'object' ? map : {};
  } catch (_) { return {}; }
}
function roleFromRoster(row) {
  if (!row) return null;
  const t = String(row.title || '').toLowerCase();
  if (/appointment|sales|setter|outreach/.test(t)) return 'sales';
  if (/assistant|scheduler|coordinator/.test(t)) return 'assistant';
  if (/\bhr\b|creative|director/.test(t)) return 'hr';
  if (String(row.role || '').toLowerCase() === 'admin') return 'hr';
  return null;
}
async function resolveRole(user, people) {
  const map = await homeRolesMap();
  const pinned = map[user.id] || map[String(user.email || '').toLowerCase()];
  if (ROLES.includes(pinned)) return pinned;
  if (user.is_admin) return 'ceo';
  return roleFromRoster(people.rosterFor(user)) || 'general';
}

// ── Lookups ─────────────────────────────────────────────────────────────────
async function byIds(table, ids, select) {
  const list = [...new Set(ids.filter(v => /^[\w-]{1,64}$/.test(String(v || ''))))];
  const out = new Map();
  for (let i = 0; i < list.length; i += 100) {
    const rows = await safe(supaFetch(`${table}?id=in.(${list.slice(i, i + 100).join(',')})&select=${select}`));
    for (const r of rows) out.set(r.id, r);
  }
  return out;
}
async function clientsByEmail(emails) {
  const list = [...new Set(emails.map(e => String(e || '').trim().toLowerCase()).filter(e => e.includes('@')))];
  const map = new Map();
  if (!list.length) return map;
  const rows = await safe(supaFetch(`crm_clients?contact_email=in.(${list.map(e => q(`"${e}"`)).join(',')})&select=${CLIENT_COLS}&limit=200`));
  for (const c of rows) map.set(String(c.contact_email || '').toLowerCase(), c);
  return map;
}
const contactOf = (c) => ({ client_id: c?.id || null, client_name: c?.business_name || c?.owner_name || '', phone: c?.contact_phone || null, email: c?.contact_email || null });

// ── Meetings ────────────────────────────────────────────────────────────────
function parseAttendees(a) {
  let list = a;
  if (typeof a === 'string') { try { list = JSON.parse(a); } catch (_) { list = []; } }
  return (Array.isArray(list) ? list : []).map(x => String((x && x.email) || x || '').toLowerCase()).filter(e => e.includes('@'));
}
const meetingShape = (m) => ({
  id: m.id, title: m.title || m.summary || '(no title)', start_time: m.start_time, end_time: m.end_time,
  location: m.location || null, meet_link: m.meet_link || null, attendees: parseAttendees(m.attendees),
});
// Current or upcoming timed events (all-day blocks are out of office, not meetings).
async function upcomingMeetings(cal, extra = '', limit = 30) {
  const rows = await supaFetch(`crm_meetings?end_time=gte.${q(cal.now.toISOString())}${extra}&or=(all_day.is.null,all_day.eq.false)&order=start_time.asc&limit=${limit}&select=${MEETING_COLS}`) || [];
  return rows.map(meetingShape);
}
async function nextUp(cal, me, onlyMine) {
  const list = await upcomingMeetings(cal);
  const mine = onlyMine ? list.filter(m => m.attendees.includes(String(me.email || '').toLowerCase())) : list;
  return mine[0] || null;
}
const mapsUrl = (loc) => { const s = String(loc || '').trim(); return !s || /^https?:\/\//i.test(s) ? null : `https://maps.apple.com/?q=${encodeURIComponent(s)}`; };
async function route(cal, people) {
  const list = await upcomingMeetings(cal, `&start_time=lt.${q(cal.tomorrowStart.toISOString())}`);
  return list.map(m => ({
    id: m.id, title: m.title, start_time: m.start_time, end_time: m.end_time, location: m.location,
    maps_url: mapsUrl(m.location), who: m.attendees.filter(people.isTeamEmail).map(people.firstNameOf),
  }));
}
// What to know before the next call: the lead or contact on the invite, their
// notes, and the last few texts with them.
async function beforeCall(cal, me, people) {
  const next = await nextUp(cal, me, true);
  if (!next) return null;
  // Outside emails only, and only ones that are safe inside a PostgREST filter.
  const emails = next.attendees.filter(e => e !== String(me.email || '').toLowerCase() && !people.isTeamEmail(e) && /^[\w.+@-]+$/.test(e));
  if (!emails.length) return null;
  const orList = (col) => emails.map(e => `${col}.ilike.${q(e)}`).join(',');
  const [clients, contacts] = await Promise.all([
    safe(supaFetch(`crm_clients?or=(${orList('contact_email')})&select=${CLIENT_COLS},notes,last_contact_summary,discovery_notes_url&limit=3`)),
    safe(supaFetch(`crm_contacts?or=(${orList('email')})&select=id,name,email,phone,company,notes&limit=3`)),
  ]);
  const c = clients[0], ct = contacts[0];
  if (!c && !ct) return null;
  const phone = normalizePhone(c?.contact_phone || ct?.phone);
  const texts = phone ? await safe(supaFetch(`crm_sms_messages?phone=eq.${q(phone)}&order=created_at.desc&limit=5&select=direction,body,created_at`)) : [];
  return {
    client_id: c?.id || null,
    name: c?.owner_name || ct?.name || c?.business_name || '',
    business: c?.business_name || ct?.company || '',
    notes: c?.notes || ct?.notes || '',
    last_contact_summary: c?.last_contact_summary || null,
    discovery_notes_url: c?.discovery_notes_url || null,
    last_texts: texts.reverse().map(t => ({ direction: t.direction, body: t.body || '', created_at: t.created_at })),
  };
}

// ── Team ────────────────────────────────────────────────────────────────────
// { user_id: { action_name: n } } for today's app actions. No table yet means no counters.
async function actionCounts(cal) {
  try {
    const rows = await supaFetch(`crm_app_events?event=eq.action&at=gte.${q(cal.todayStart.toISOString())}&select=user_id,name&limit=5000`) || [];
    const out = {};
    for (const r of rows) { const u = out[r.user_id] || (out[r.user_id] = {}); u[r.name] = (u[r.name] || 0) + 1; }
    return out;
  } catch (e) {
    if (missingTable(e)) return {};
    throw e;
  }
}
async function teamToday(cal, people) {
  const [week, open, events] = await Promise.all([
    safe(supaFetch(`crm_time_entries?work_date=gte.${cal.weekStartStr}&select=user_id,user_email,work_date,minutes&limit=3000`)),
    safe(supaFetch('crm_time_entries?ended_at=is.null&started_at=not.is.null&select=user_id,user_email,started_at')),
    actionCounts(cal).catch(() => ({})),
  ]);
  const rows = new Map();
  const row = (uid, email) => {
    if (!rows.has(uid)) rows.set(uid, { user_id: uid, name: people.nameOf(uid, email), minutes_today: 0, clocked_in: false, since: null, counters: {} });
    return rows.get(uid);
  };
  // Everyone on the roster with a login shows, so "not in yet" is visible too.
  for (const r of people.active) if (r.user_id) row(r.user_id, r.email);
  let weekMinutes = 0;
  for (const e of week) {
    const p = row(e.user_id, e.user_email);
    const m = num(e.minutes);
    weekMinutes += m;
    if (e.work_date === cal.todayStr) p.minutes_today += m;
  }
  // An open entry has minutes 0 until clock-out; count what has run so far (capped: a forgotten clock-in is not a 30-hour day).
  for (const e of open) {
    const p = row(e.user_id, e.user_email);
    const running = Math.min(720, Math.max(0, Math.round((cal.now - new Date(e.started_at)) / 60000)));
    p.clocked_in = true;
    p.since = e.started_at;
    p.minutes_today += running;
    weekMinutes += running;
  }
  for (const [uid, counters] of Object.entries(events)) if (rows.has(uid)) rows.get(uid).counters = counters;
  const list = [...rows.values()].sort((a, b) => Number(b.clocked_in) - Number(a.clocked_in) || b.minutes_today - a.minutes_today || a.name.localeCompare(b.name));
  return { week_minutes: weekMinutes, week_target_minutes: WEEK_TARGET_MINUTES, people: list };
}
async function teamUnread(me) {
  try {
    const mine = await supaFetch(`crm_chat_members?user_id=eq.${me.id}&select=room_id,last_read_at`) || [];
    if (!mine.length) return 0;
    const readAt = Object.fromEntries(mine.map(m => [m.room_id, m.last_read_at || '1970-01-01T00:00:00Z']));
    const since = Object.values(readAt).sort()[0];
    const rows = await supaFetch(`crm_chat_messages?room_id=in.(${mine.map(m => m.room_id).join(',')})&sender_id=neq.${me.id}&created_at=gt.${q(since)}&select=room_id,created_at&limit=2000`) || [];
    return rows.filter(r => r.created_at > readAt[r.room_id]).length;
  } catch (e) {
    if (missingTable(e)) return 0;
    throw e;
  }
}
async function reviewQueue(cal, me) {
  const rows = await supaFetch(`crm_team_todos?assigned_to=eq.${me.id}&or=(done.is.null,done.eq.false)&order=created_at.desc&limit=25&select=id,title,created_by_name,created_at,urgent,link_label`) || [];
  return rows.map(t => ({
    id: t.id, title: t.title, from_name: t.created_by_name || null,
    age_hours: Math.max(0, Math.round((cal.now - new Date(t.created_at)) / 3600000)), urgent: !!t.urgent, link_label: t.link_label || null,
  }));
}
// New hires: invite pending, or started in the last 30 days.
async function onboarding(cal, people) {
  const since = ymdStr(shift(cal.today, -30));
  const rows = people.active.filter(r => r.invite_status === 'pending' || (r.started_on && String(r.started_on) >= since) || (!r.started_on && String(r.created_at || '').slice(0, 10) >= since));
  if (!rows.length) return [];
  const ids = rows.map(r => r.user_id).filter(Boolean);
  const [tokens, clockins, contracts] = await Promise.all([
    ids.length ? safe(supaFetch(`crm_push_tokens?user_id=in.(${ids.join(',')})&select=user_id`)) : [],
    ids.length ? safe(supaFetch(`crm_time_entries?user_id=in.(${ids.join(',')})&select=user_id&limit=2000`)) : [],
    safe(supaFetch('crm_agreements?client_id=is.null&select=id,title,status,signed_at,terms')),
  ]);
  const onApp = new Set(tokens.map(t => t.user_id));
  const clocked = new Set(clockins.map(t => t.user_id));
  const contractsFor = (email) => {
    const em = String(email || '').toLowerCase();
    return contracts.filter(a => /contractor/i.test(a.title || '') && String(a.terms?.signer?.email || '').toLowerCase() === em);
  };
  return rows.map(r => {
    const mine = contractsFor(r.email);
    const steps = [
      { label: 'Invite sent', done: r.invite_status === 'active' || !!r.user_id },
      { label: 'Has a login', done: !!r.user_id },
      { label: 'App installed', done: !!r.user_id && onApp.has(r.user_id) },
      { label: 'First clock-in', done: !!r.user_id && clocked.has(r.user_id) },
    ];
    // No contractor agreement for this email yet: nothing to sign, skip the step.
    if (mine.length) steps.push({ label: 'Sign the contractor agreement', done: mine.some(a => a.status === 'signed' || !!a.signed_at) });
    const next = steps.find(s => !s.done);
    return { member_id: r.id, name: r.name, steps_done: steps.filter(s => s.done).length, steps_total: steps.length, next_step: next ? next.label : null };
  });
}
// The half-month period holding today, unpaid minutes times each person's rate.
async function payroll(cal, people) {
  const { y, m, d } = cal.today;
  const start = d <= 15 ? 1 : 16;
  const end = d <= 15 ? 15 : daysInMonth(y, m);
  const from = ymdStr({ y, m, d: start }), to = ymdStr({ y, m, d: end });
  const [entries, rates] = await Promise.all([
    safe(supaFetch(`crm_time_entries?work_date=gte.${from}&work_date=lte.${to}&paid_at=is.null&select=user_id,user_email,minutes,billable_minutes&limit=3000`)),
    safe(supaFetch('crm_employee_rates?select=user_id,hourly_rate')),
  ]);
  const rate = new Map(rates.map(r => [r.user_id, num(r.hourly_rate)]));
  const byUser = new Map();
  for (const e of entries) {
    const p = byUser.get(e.user_id) || { user_id: e.user_id, name: people.nameOf(e.user_id, e.user_email), minutes: 0 };
    p.minutes += num(e.billable_minutes || e.minutes);   // shoots pay their frozen billable minutes
    byUser.set(e.user_id, p);
  }
  const list = [...byUser.values()]
    .map(p => ({ ...p, amount: Math.round((p.minutes / 60) * (rate.get(p.user_id) || 0) * 100) / 100 }))
    .sort((a, b) => b.amount - a.amount || b.minutes - a.minutes);
  return {
    period_label: `${cal.monthShort} ${start} to ${end}`,
    due_on: ymdStr(shift({ y, m, d: end }, 1)),
    total: Math.round(list.reduce((s, p) => s + p.amount, 0) * 100) / 100,
    people: list,
  };
}

// ── Sales and outreach ──────────────────────────────────────────────────────
async function routineChecks(periodKey) {
  // The column is done_count (a bare "count" in a PostgREST select is the aggregate).
  try { return await supaFetch(`crm_routine_checks?period_key=eq.${q(periodKey)}&select=item_id,done_count`) || []; }
  catch (e) {
    // Before the count column exists a ticked row is simply "done".
    if (/count/i.test(String(e.message)) && missingTable(e)) return await supaFetch(`crm_routine_checks?period_key=eq.${q(periodKey)}&select=item_id`) || [];
    throw e;
  }
}
async function outreach(cal, me) {
  const [routines, checks, events] = await Promise.all([
    safe(supaFetch('crm_routines?cadence=eq.daily&select=id,title,items&order=position.asc,created_at.asc')),
    routineChecks(cal.todayStr).catch(() => []),
    actionCounts(cal).catch(() => ({})),
  ]);
  const checkFor = new Map(checks.map(c => [c.item_id, c]));
  const items = [];
  for (const r of routines) {
    for (const it of (Array.isArray(r.items) ? r.items : [])) {
      const target = Number(it?.target);
      if (!(target > 0)) continue;
      const c = checkFor.get(it.id);
      // A row without a count was ticked the old way: fully done.
      const count = c ? (c.done_count == null ? target : num(c.done_count)) : 0;
      items.push({ routine_id: r.id, item_id: it.id, text: it.text || '', target, count });
    }
  }
  return { period_key: cal.todayStr, items, counters: events[me.id] || {} };
}
async function leads() {
  const rows = await supaFetch('crm_clients?stage=eq.lead&or=(record_type.is.null,record_type.eq.client)&select=id,lead_temperature') || [];
  const temp = (t) => rows.filter(r => r.lead_temperature === t).length;
  return { hot: temp('hot'), warm: temp('warm'), open: rows.length };
}
async function clientsActive() {
  const rows = await supaFetch('crm_clients?stage=neq.lead&or=(record_type.is.null,record_type.eq.client)&select=id,stage') || [];
  return rows.filter(r => !NOT_ACTIVE.has(String(r.stage || '').toLowerCase())).length;
}

// ── Money ───────────────────────────────────────────────────────────────────
// Everything a client still owes: open Stripe invoices (net 7), manual
// invoices (net 14 unless they carry a due date), and installments that came
// due at signing. Each carries who to nudge and when it was last nudged.
async function loadUnpaid(cal) {
  const [invoices, manual, payments, nudged] = await Promise.all([
    safe(supaFetch('crm_invoices?status=in.(open,payment_failed)&select=*&order=created_at.asc&limit=500')),
    safe(supaFetch('crm_manual_invoices?status=not.in.(paid,void,draft,cancelled)&select=*&order=created_at.asc&limit=500')),
    safe(supaFetch('crm_payments?status=eq.pending&select=*&order=created_at.asc&limit=500')),
    N.lastNudgedMap().catch(() => new Map()),
  ]);
  const agreements = await byIds('crm_agreements', payments.map(p => p.agreement_id), 'id,title,status,signed_at,sign_token');
  const deals = await byIds('crm_deals', [...invoices, ...manual].map(r => r.deal_id), 'id,client_id');
  const clients = await byIds('crm_clients', [...payments.map(p => p.client_id), ...[...deals.values()].map(d => d.client_id)], CLIENT_COLS);
  const viaDeal = (row) => clients.get(deals.get(row.deal_id)?.client_id) || null;
  // Invoices never tied to a deal: match the billing email to a client record.
  const byEmail = await clientsByEmail([...invoices, ...manual].filter(r => !viaDeal(r)).map(r => r.email || r.bill_to_email));
  const clientFor = (row) => viaDeal(row) || byEmail.get(String(row.email || row.bill_to_email || '').toLowerCase()) || null;
  const item = (kind, id, label, amount, client, fallback, dueRaw, link) => {
    const due = N.toYmd(dueRaw);
    return {
      kind, id, label, amount: num(amount), ...contactOf(client),
      client_name: contactOf(client).client_name || fallback.name || fallback.email || '', email: client?.contact_email || fallback.email || null,
      due, days_late: N.daysAgo(due), last_nudged_at: nudged.get(`${kind}:${id}`) || null, link: link || null,
    };
  };
  const items = [];
  for (const inv of invoices) {
    if (!clientFor(inv)) continue;   // not a CRM client: not our money
    items.push(item('invoice', inv.id, N.invoiceNumber(inv), inv.amount, clientFor(inv), { name: inv.customer_name || inv.bill_to_name, email: inv.email || inv.bill_to_email }, N.addDays(inv.created_at, 7), inv.stripe_invoice_url));
  }
  for (const m of manual) {
    if (!clientFor(m)) continue;
    items.push(item('manual_invoice', m.id, m.invoice_number || `#${String(m.id).slice(0, 8)}`, m.total != null ? m.total : m.amount, clientFor(m), { name: m.bill_to_name, email: m.bill_to_email }, m.due_date || N.addDays(m.created_at, 14), null));
  }
  for (const p of payments) {
    const ag = agreements.get(p.agreement_id);
    // Only installments that are actually due: the agreement is signed and the trigger says "on signing".
    if (!ag || !(ag.signed_at || ag.status === 'signed') || !/sign/i.test(p.due_condition || '')) continue;
    if (!clients.get(p.client_id)) continue;
    items.push(item('payment', p.id, p.label || 'Payment', p.amount, clients.get(p.client_id) || null, {}, ag.signed_at, p.stripe_invoice_url || (ag.sign_token ? N.PAY_BASE + ag.sign_token : null)));
  }
  return items.sort((a, b) => b.days_late - a.days_late);
}
// money and held_up both need the unpaid list: load it once per request.
function unpaidOnce(cal) {
  if (!cal.unpaid) cal.unpaid = loadUnpaid(cal).catch(e => { console.error('home unpaid failed:', e.message); return []; });
  return cal.unpaid;
}
// Anything waiting on someone else, red first, then by how long it has waited.
async function heldUp(cal) {
  const cutoff = (days) => q(new Date(cal.now.getTime() - days * DAY).toISOString());
  const [unpaid, agreements, deals, hot] = await Promise.all([
    unpaidOnce(cal),
    safe(supaFetch(`crm_agreements?status=eq.sent&client_id=not.is.null&sent_at=lte.${cutoff(3)}&select=id,title,sent_at,total_amount,sign_token,client_id`)),
    safe(supaFetch('crm_deals?subscription_status=eq.past_due&archived=eq.false&select=id,name,value,client_id,updated_at,stripe_invoice_url,projects:crm_projects(recurring_amount)')),
    safe(supaFetch(`crm_clients?stage=eq.lead&lead_temperature=eq.hot&or=(record_type.is.null,record_type.eq.client)&select=${CLIENT_COLS},last_contact_at,created_at`)),
  ]);
  const clients = await byIds('crm_clients', [...agreements.map(a => a.client_id), ...deals.map(d => d.client_id)], CLIENT_COLS);
  const items = [];
  for (const u of unpaid) {
    if (u.kind !== 'payment' && u.days_late < 1) continue;
    const { last_nudged_at, due, days_late, label, ...rest } = u;
    const late = u.kind === 'payment' ? `due since signing on ${N.fmtDate(due)}` : `${plural(days_late, 'day')} late`;
    items.push({ ...rest, title: `${label} · ${N.fmtMoney(u.amount)} ${u.kind === 'payment' ? 'unpaid' : 'overdue'}`, sub: `${u.client_name || 'Unknown'} · ${late}`, days: days_late, severity: 'red' });
  }
  for (const a of agreements) {
    const days = N.daysAgo(a.sent_at);
    const c = clients.get(a.client_id);
    items.push({
      kind: 'agreement', id: a.id, title: `${N.agreementCore(a.title)} unsigned ${plural(days, 'day')}`, sub: `${contactOf(c).client_name || 'Unknown'} · sent ${N.fmtDate(a.sent_at)}`,
      days, severity: days >= 7 ? 'red' : 'amber', ...contactOf(c), amount: num(a.total_amount), link: a.sign_token ? N.SIGN_BASE + a.sign_token : null,
    });
  }
  for (const d of deals) {
    const days = N.daysAgo(d.updated_at);
    const c = clients.get(d.client_id);
    const monthly = N.dealMonthly(d);
    items.push({
      kind: 'plan', id: d.id, title: `${d.name || 'Plan'} past due`, sub: `${contactOf(c).client_name || 'Unknown'} · ${N.fmtMoney(monthly)}/mo · ${plural(days, 'day')}`,
      days, severity: 'red', ...contactOf(c), amount: monthly, link: d.stripe_invoice_url || N.CLIENT_HOME,
    });
  }
  for (const l of hot) {
    const last = l.last_contact_at || l.created_at;
    const days = N.daysAgo(last);
    if (days < 5) continue;
    items.push({
      kind: 'lead', id: l.id, title: `${l.business_name || l.owner_name || 'Hot lead'} is hot, no contact in ${plural(days, 'day')}`, sub: `${l.owner_name || ''}${l.owner_name ? ' · ' : ''}last contact ${l.last_contact_at ? N.fmtDate(l.last_contact_at) : 'never'}`,
      days, severity: days >= 10 ? 'red' : 'amber', ...contactOf(l), amount: null, link: null,
    });
  }
  const rank = { red: 0, amber: 1 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity] || b.days - a.days);
}
async function money(cal) {
  const iso = (d) => q(d.toISOString());
  const [payRows, paidInv, unpaid, deals, maint, tools] = await Promise.all([
    safe(supaFetch(`crm_payments?status=in.(paid,refunded)&paid_at=gte.${iso(cal.prevMonthStart)}&select=id,amount,paid_at,label,source,status,client_id,stripe_invoice_id&order=paid_at.desc&limit=1000`)),
    safe(supaFetch(`crm_invoices?status=eq.paid&paid_at=gte.${iso(cal.prevMonthStart)}&select=id,amount,paid_at,description,customer_name,email,stripe_invoice_id,deal_id&order=paid_at.desc&limit=1000`)),
    unpaidOnce(cal),
    safe(supaFetch('crm_deals?stripe_subscription_id=not.is.null&archived=eq.false&select=id,name,value,client_id,subscription_status,updated_at,stripe_invoice_url,projects:crm_projects(recurring_amount)')),
    safe(supaFetch('crm_agreements?maintenance_subscription_id=not.is.null&select=id,client_id,title,terms,total_amount,maintenance_started_at')),
    safe(supaFetch('crm_subscriptions?or=(status.is.null,status.neq.cancelled)&select=id,service,amount,billing_cycle,next_renewal,category,status')),
  ]);
  // A Stripe payment is logged in crm_payments and mirrored in crm_invoices: count it once.
  const logged = new Set(payRows.map(p => p.stripe_invoice_id).filter(Boolean));
  const extraInv = paidInv.filter(i => !(i.stripe_invoice_id && logged.has(i.stripe_invoice_id)));
  const invDeals = await byIds('crm_deals', extraInv.map(i => i.deal_id), 'id,client_id');
  const clients = await byIds('crm_clients', [
    ...payRows.map(p => p.client_id), ...deals.map(d => d.client_id), ...maint.map(a => a.client_id), ...[...invDeals.values()].map(d => d.client_id),
  ], CLIENT_COLS);
  const nameOf = (id) => contactOf(clients.get(id)).client_name;
  const sum = (rows) => Math.round(rows.reduce((s, r) => s + num(r.amount), 0) * 100) / 100;

  const received = [
    ...payRows.map(p => ({ id: p.id, client_name: nameOf(p.client_id), amount: num(p.amount), paid_at: p.paid_at, label: p.label || 'Payment', source: p.source || 'stripe', refund: p.status === 'refunded' })),
    ...extraInv.map(i => ({ id: i.id, client_name: nameOf(invDeals.get(i.deal_id)?.client_id) || i.customer_name || i.email || '', amount: num(i.amount), paid_at: i.paid_at, label: i.description || 'Stripe invoice', source: 'stripe', refund: false })),
  ].filter(r => r.paid_at).sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)));
  const between = (from, to) => received.filter(r => r.paid_at >= from.toISOString() && r.paid_at < to.toISOString());

  const plans = [
    ...deals.map(d => {
      const c = clients.get(d.client_id);
      const status = d.subscription_status || 'active';
      return {
        id: d.id, client_id: d.client_id || null, client_name: nameOf(d.client_id), label: d.name || 'Plan', amount: N.dealMonthly(d), cadence: 'monthly',
        next_renewal: null, status, days_past_due: status === 'past_due' ? N.daysAgo(d.updated_at) : 0, phone: c?.contact_phone || null, email: c?.contact_email || null,
      };
    }),
    ...maint.map(a => {
      const c = clients.get(a.client_id);
      return {
        id: a.id, client_id: a.client_id || null, client_name: nameOf(a.client_id), label: N.planLabel(a), amount: N.agreementMonthly(a), cadence: 'monthly',
        next_renewal: nextMonthly(a.maintenance_started_at, cal), status: 'active', days_past_due: 0, phone: c?.contact_phone || null, email: c?.contact_email || null,
      };
    }),
  ];
  const live = (p) => ['active', 'trialing', 'past_due'].includes(p.status);

  // Tools: every cycle normalised to a month.
  const perMonth = (t) => {
    const a = num(t.amount);
    const cycle = String(t.billing_cycle || 'monthly').toLowerCase();
    if (/year|annual/.test(cycle)) return a / 12;
    if (/quarter/.test(cycle)) return a / 3;
    if (/week/.test(cycle)) return a * 52 / 12;
    if (/day/.test(cycle)) return a * 365 / 12;
    return a;
  };
  const tools_list = tools.map(t => ({ id: t.id, service: t.service, amount: num(t.amount), billing_cycle: t.billing_cycle || 'monthly', next_renewal: t.next_renewal ? String(t.next_renewal).slice(0, 10) : null, category: t.category || null }));
  const nextTool = tools_list.filter(t => t.next_renewal && t.next_renewal >= cal.todayStr).sort((a, b) => a.next_renewal.localeCompare(b.next_renewal))[0] || null;

  return {
    month: cal.monthName,
    collected_month: sum(between(cal.monthStart, cal.nextMonthStart)),
    collected_prev_month: sum(between(cal.prevMonthStart, cal.monthStart)),
    payments_this_week: between(cal.weekStart, cal.tomorrowStart).filter(r => !r.refund).length,
    outstanding: { total: sum(unpaid), count: unpaid.length, overdue: unpaid.filter(u => u.days_late > 0).length },
    client_plans: { mrr: sum(plans.filter(live)), active: plans.filter(p => p.status === 'active' || p.status === 'trialing').length, past_due: plans.filter(p => p.status === 'past_due').length },
    tools: { monthly: Math.round(tools.reduce((s, t) => s + perMonth(t), 0) * 100) / 100, count: tools.length, next: nextTool ? { service: nextTool.service, date: nextTool.next_renewal } : null },
    unpaid,
    recent_payments: received.filter(r => !r.refund).slice(0, 8).map(({ refund, ...r }) => r),
    plans,
    tools_list,
  };
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const cal = calendar();
    const people = await loadPeople();
    const resolved = await resolveRole(user, people);
    const wanted = String(req.query.role || '');
    const role = ROLES.includes(wanted) && (user.is_admin || wanted === 'general') ? wanted : resolved;
    const me = { id: user.id, name: people.nameOf(user.id, user.email), email: user.email, is_admin: !!user.is_admin };

    const loaders = {
      next_up: () => nextUp(cal, me, role === 'sales'),
      team_today: () => teamToday(cal, people),
      held_up: () => heldUp(cal),
      money: () => money(cal),
      team_unread: () => teamUnread(me),
      clients_active: () => clientsActive(),
      payroll: () => payroll(cal, people),
      review_queue: () => reviewQueue(cal, me),
      onboarding: () => onboarding(cal, people),
      route: () => route(cal, people),
      outreach: () => outreach(cal, me),
      leads: () => leads(),
      before_call: () => beforeCall(cal, me, people),
    };
    const names = SECTIONS[role];
    const results = await Promise.allSettled(names.map(n => loaders[n]()));
    const out = { role, resolved_role: resolved, me };
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') out[names[i]] = r.value;
      else console.error(`home section ${names[i]} failed:`, r.reason?.message || r.reason);
    });
    return res.json(out);
  } catch (err) {
    console.error('home error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
