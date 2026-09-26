import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Calendar as CalIcon, Plus, Video, Trash2, RefreshCw, ChevronLeft, ChevronRight,
  MapPin, Pencil, Users, ArrowUpRight, Clock,
} from 'lucide-react';
import { getUpcomingMeetings, getPastMeetings, getClients, deleteMeeting, syncMeetings } from '../api';
import * as crmApi from '../api';
import { useScheduleMeeting } from '../context/ScheduleMeetingContext';

// Calendar. Three jobs, in this order: what is coming, what happened recently,
// and getting into a meeting fast.
//
// There is no "missed" on this page and nothing to tick off as done. A meeting
// whose end time has passed is simply a past meeting: it stays on the calendar,
// quiet and grey, so the history reads as history instead of a scoreboard.
//
// Every date and time here is Central (America/Chicago) and reads as 12 hour
// with AM and PM, whatever zone the browser happens to be in. The approach is
// the one the iPhone app already ships in mobile/screens/CalendarScreen.js:
// bucket by a Central day string, format with an explicit timeZone, and never
// let a raw Date's local getters decide which calendar day an event lands on.

// ── Central time ─────────────────────────────────────────────────────────────
const TZ = 'America/Chicago';
const pad = (n) => String(n).padStart(2, '0');

// The wall clock of an instant in Central. Falls back to the browser's own
// clock on an engine without formatToParts, so a format never throws.
function partsIn(date) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    for (const x of f.formatToParts(date)) if (x.type !== 'literal') p[x.type] = Number(x.value);
    if (!p.year) throw new Error('no parts');
    return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second || 0 };
  } catch (_) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds() };
  }
}
// The Central calendar day an instant falls on: "2026-09-26".
const centralDay = (input) => {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return '';
  const p = partsIn(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};
// How far Central sits from UTC at that instant, in milliseconds.
const offsetAt = (ms) => {
  const p = partsIn(new Date(ms));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
};
// A Central wall clock (day plus minutes past midnight) as the real instant.
// Two passes so a clock-change morning still lands right.
const centralInstant = (day, minutes) => {
  const [y, m, d] = String(day).split('-').map(Number);
  const wall = Date.UTC(y, (m || 1) - 1, d || 1, Math.floor(minutes / 60), minutes % 60, 0);
  let inst = wall - offsetAt(wall);
  inst = wall - offsetAt(inst);
  return new Date(inst);
};
// Day-string maths anchored at UTC midnight, so a clock change never shifts it.
const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);
const addDays = (day, n) => new Date(dayMs(day) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / 86400000);
const weekdayOf = (day) => new Date(dayMs(day)).getUTCDay();
const startOfWeek = (day) => addDays(day, -weekdayOf(day));
const startOfMonth = (day) => `${day.slice(0, 7)}-01`;
const addMonths = (day, n) => {
  const [y, m] = day.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${String(Math.floor(t / 12)).padStart(4, '0')}-${pad((t % 12) + 1)}-01`;
};
// A day string reads as words off a noon anchor, so no zone can move it.
const noon = (day) => new Date(`${day}T12:00:00`);
const fmtDayLong  = (day) => noon(day).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const fmtDayShort = (day) => noon(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtMonth    = (day) => noon(day).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
// 12 hour with AM and PM, always Central.
const fmtTime = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); };
const fmtTimeShort = (iso) => fmtTime(iso).replace(':00', '');

// ── Event shape ──────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#334155', '#784bd1', '#0ea5e9', '#16a34a', '#b45309', '#be185d'];
const BLOCK_INK = '#b45309';
const BLOCK_EDGE = 'rgba(245,158,11,0.55)';
const BLOCK_FILL = 'repeating-linear-gradient(45deg, rgba(245,158,11,0.10), rgba(245,158,11,0.10) 6px, rgba(245,158,11,0.20) 6px, rgba(245,158,11,0.20) 12px)';

const titleOf = (m) => m.title || m.summary || '(no title)';
const stripHtml = (s) => (s ? String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
const endOf = (m) => new Date(m.end_time || new Date(new Date(m.start_time).getTime() + (m.duration_minutes || 30) * 60000));
const isOver = (m) => endOf(m).getTime() < Date.now();
const isLive = (m) => new Date(m.start_time).getTime() <= Date.now() && !isOver(m);
const isAllDay = (m) => m.all_day === true || (m.duration_minutes && m.duration_minutes >= 1380);
// All-day blocks and OOO clutter a day, so they get their own hatched treatment.
const isBlock = (m) => m.all_day === true || (m.duration_minutes && m.duration_minutes >= 720) || /out of office|ooo|busy|unavailable|blocked/i.test(titleOf(m));
// Personal commitments (school and the like) hard-block time the way an OOO does.
const isCommitment = (m) => /\bclass\b/i.test(titleOf(m));
const guestsOf = (m) => (Array.isArray(m?.participants) ? m.participants : []).map(p => (typeof p === 'string' ? { email: p } : p)).filter(p => p && (p.email || p.name));
const emailsOf = (m) => guestsOf(m).map(p => String(p.email || '').toLowerCase()).filter(Boolean);
const timeRange = (m) => {
  if (isAllDay(m)) return 'All day';
  const s = fmtTime(m.start_time);
  const e = m.end_time ? fmtTime(m.end_time) : '';
  return e && e !== s ? `${s} to ${e}` : s;
};
const fmtDur = (min) => { if (!min) return ''; const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };
const mapsUrl = (where) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;

// How soon, in plain words. Never a scold, just a distance.
const whenWords = (m) => {
  const startMs = new Date(m.start_time).getTime();
  const diff = startMs - Date.now();
  if (isLive(m)) return 'happening now';
  const day = centralDay(m.start_time);
  const today = centralDay(new Date());
  if (diff > 0 && diff < 3600000) return `in ${Math.max(1, Math.round(diff / 60000))} min`;
  if (day === today) return `today at ${fmtTime(m.start_time)}`;
  if (day === addDays(today, 1)) return `tomorrow at ${fmtTime(m.start_time)}`;
  return `${fmtDayShort(day)} at ${fmtTime(m.start_time)}`;
};

// ── Small pieces ─────────────────────────────────────────────────────────────
function Avatars({ guests = [], max = 4 }) {
  const shown = guests.slice(0, max);
  const extra = guests.length - max;
  if (!guests.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((p, i) => {
        const ch = String(p.name || p.email || '?')[0].toUpperCase();
        const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
        return (
          <div key={i} title={p.email || p.name} className="private-value" style={{ width: 24, height: 24, borderRadius: '50%', marginLeft: i ? -7 : 0, background: c + '22', border: `2px solid ${c}`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{ch}</div>
        );
      })}
      {extra > 0 && <div style={{ marginLeft: -7, width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-3)', border: '2px solid var(--surface)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>+{extra}</div>}
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
      {options.map(o => {
        const on = value === o.key;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)',
            background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)',
            boxShadow: on ? 'var(--shadow-sm)' : 'none',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

// The record this event belongs to, when an attendee (or the title) matches one.
function RecordChip({ record }) {
  if (!record) return null;
  const isLead = record.stage === 'lead';
  const name = record.business_name || record.owner_name || record.contact_email;
  return (
    <Link
      to={`${isLead ? '/leads' : '/clients'}?open=${record.id}`}
      onClick={e => e.stopPropagation()}
      className="pii-name"
      title={`Open ${name} in the CRM`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, textDecoration: 'none',
        fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
        color: 'var(--link)', background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.22)',
      }}
    >
      {name} <ArrowUpRight size={11} />
    </Link>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Meetings() {
  const navigate = useNavigate();
  // A half minute tick, so "in 12 min" counts down, an event rolls from up next
  // to happening now on its own, and the page turns over at midnight.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const today = useMemo(() => centralDay(new Date(now)), [now]);

  const [events, setEvents] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState('month');       // month | week
  const [cursor, setCursor] = useState(today);     // any day inside the shown period
  const [selected, setSelected] = useState(today);
  const [showBlocks, setShowBlocks] = useState(true);
  const { openModal: openScheduleMeeting } = useScheduleMeeting();

  const load = useCallback(async () => {
    try {
      // The upcoming call is also what runs the throttled Google Calendar sync,
      // so it goes first. crmApi.getAllMeetings is GET /api/crm/meetings with no
      // action, which already returns every stored row: a calendar needs the
      // whole history, not just the newest 50 past events. Until that one line
      // lands in api.js this falls back to the past list.
      const upcoming = await getUpcomingMeetings().catch(() => []);
      const rest = crmApi.getAllMeetings
        ? await crmApi.getAllMeetings().catch(() => [])
        : await getPastMeetings().catch(() => []);
      const map = new Map();
      [...(rest || []), ...(upcoming || [])].forEach(m => { if (m && m.id) map.set(m.id, m); });
      setEvents([...map.values()].sort((a, b) => new Date(a.start_time) - new Date(b.start_time)));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getClients().then(rows => setRecords(rows || [])).catch(() => {}); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try { await syncMeetings(); await load(); } catch (e) { console.error(e); } finally { setSyncing(false); }
  };
  const handleDelete = async (m) => {
    if (!window.confirm(`Delete "${titleOf(m)}"? This removes it from Google Calendar too.`)) return;
    setEvents(prev => prev.filter(x => x.id !== m.id));
    try { await deleteMeeting(m.id); } catch (e) { console.error(e); load(); }
  };
  const openEvent = (m) => navigate(`/appointments/${m.id}`);
  const openEditor = (m) => navigate(`/appointments/${m.id}`, { state: { edit: true } });

  // Attendee email is the reliable join to a CRM record; a business name in the
  // title is the fallback for an event booked without the client on the invite.
  const recordFor = useCallback((m) => {
    if (!m || !records.length) return null;
    const mails = emailsOf(m);
    if (mails.length) {
      const hit = records.find(r => r.contact_email && mails.includes(String(r.contact_email).toLowerCase()));
      if (hit) return hit;
    }
    const t = titleOf(m).toLowerCase();
    return records.find(r => {
      const name = String(r.business_name || '').toLowerCase();
      return name.length >= 4 && t.includes(name);
    }) || null;
  }, [records]);

  const visible = useMemo(() => events.filter(m => showBlocks || !isBlock(m)), [events, showBlocks]);

  // Every event bucketed onto the Central days it covers. Blocks span every day
  // they touch, so a three day OOO shows on all three. Timed events sit on the
  // day they start. Capped at 62 days as a runaway guard.
  const byDay = useMemo(() => {
    const map = {};
    visible.forEach(m => {
      const startDay = centralDay(m.start_time);
      if (!startDay) return;
      let span = 0;
      if (isBlock(m)) {
        const start = new Date(m.start_time);
        const end = new Date(m.end_time || m.start_time);
        // A block ending exactly at midnight does not cover that next day, so
        // step the end back 1ms before counting calendar days.
        const endAdj = end > start ? new Date(end.getTime() - 1) : end;
        span = Math.min(Math.max(0, daysBetween(startDay, centralDay(endAdj))), 62);
      }
      for (let i = 0; i <= span; i++) { const d = addDays(startDay, i); (map[d] = map[d] || []).push(m); }
    });
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)));
    return map;
  }, [visible]);

  const timed = useMemo(() => events.filter(m => !isBlock(m)), [events]);
  const nextUp = useMemo(() => timed.find(isLive) || timed.find(m => new Date(m.start_time).getTime() > now) || null, [timed, now]);
  const recent = useMemo(() => timed.filter(isOver).slice(-5).reverse(), [timed, now]);
  const todayItems = byDay[today] || [];
  const todayCount = todayItems.filter(m => !isBlock(m)).length;

  const weeks = useMemo(() => {
    if (view === 'week') return [Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))];
    const first = startOfMonth(cursor);
    const gridStart = startOfWeek(first);
    // Five rows cover most months, six when the month spills over.
    const rows = daysBetween(gridStart, addDays(addMonths(first, 1), -1)) >= 35 ? 6 : 5;
    return Array.from({ length: rows }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i)));
  }, [view, cursor]);

  const goToday = () => { setCursor(today); setSelected(today); };
  const step = (dir) => setCursor(c => (view === 'week' ? addDays(startOfWeek(c), dir * 7) : addMonths(startOfMonth(c), dir)));
  const pickDay = (day) => { setSelected(day); setCursor(day); };
  const periodLabel = view === 'week'
    ? `${fmtDayShort(startOfWeek(cursor))} to ${fmtDayShort(addDays(startOfWeek(cursor), 6))}`
    : fmtMonth(startOfMonth(cursor));

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalIcon size={18} style={{ color: 'var(--link)' }} /></div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.15 }}>Calendar</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {fmtDayLong(today)} · Central time{todayCount ? ` · ${todayCount} ${todayCount === 1 ? 'event' : 'events'} today` : ' · nothing today'}
            </div>
          </div>
        </div>
        <button className="btn-ghost" onClick={handleSync} disabled={syncing}>
          <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} /> {syncing ? 'Syncing…' : 'Sync'}
        </button>
        <button className="btn-ghost" onClick={() => openScheduleMeeting({ onComplete: () => handleSync() })}><Video size={15} /> Quick meeting</button>
        <button className="btn-primary" onClick={() => openScheduleMeeting({ pickType: true, onComplete: () => handleSync() })}><Plus size={15} /> New event</button>
      </div>

      <div style={{ padding: '0 24px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60 }}>Loading…</div>
        ) : (
          <>
            {/* What is coming, and what just happened */}
            <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 330px', gap: 16, alignItems: 'start', marginBottom: 18 }}>
              <UpNext
                event={nextUp}
                record={recordFor(nextUp)}
                onOpen={openEvent}
                onEdit={openEditor}
                onNew={() => openScheduleMeeting({ pickType: true, onComplete: () => handleSync() })}
              />
              <RecentPanel items={recent} onOpen={openEvent} />
            </div>

            {/* Overview */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginRight: 'auto' }}>{periodLabel}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showBlocks} onChange={e => setShowBlocks(e.target.checked)} /> Blocked time
                </label>
                <Segmented value={view} onChange={setView} options={[{ key: 'month', label: 'Month' }, { key: 'week', label: 'Week' }]} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="btn-ghost" onClick={() => step(-1)} style={{ padding: '6px 8px' }} title="Previous"><ChevronLeft size={16} /></button>
                  <button className="btn-ghost" onClick={goToday}>Today</button>
                  <button className="btn-ghost" onClick={() => step(1)} style={{ padding: '6px 8px' }} title="Next"><ChevronRight size={16} /></button>
                </div>
              </div>
              <Grid
                view={view}
                weeks={weeks}
                monthOf={startOfMonth(cursor).slice(0, 7)}
                byDay={byDay}
                today={today}
                selected={selected}
                onPickDay={pickDay}
                onOpen={openEvent}
              />
            </div>

            {/* The selected day, in full */}
            <DayPanel
              day={selected}
              items={byDay[selected] || []}
              today={today}
              recordFor={recordFor}
              onOpen={openEvent}
              onEdit={openEditor}
              onDelete={handleDelete}
              onNew={() => openScheduleMeeting({ pickType: true, onComplete: () => handleSync() })}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Up next ──────────────────────────────────────────────────────────────────
function UpNext({ event, record, onOpen, onEdit, onNew }) {
  if (!event) {
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '26px 22px', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalIcon size={20} style={{ color: 'var(--muted)' }} /></div>
        <div style={{ marginRight: 'auto' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Nothing coming up</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>The calendar is clear. Add something when you are ready.</div>
        </div>
        <button className="btn-primary" onClick={onNew}><Plus size={15} /> New event</button>
      </div>
    );
  }
  const live = isLive(event);
  const guests = guestsOf(event);
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
      boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
    }}>
      <div style={{ height: 3, background: live ? 'var(--green)' : 'var(--orange)' }} />
      <div style={{ padding: '18px 22px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: live ? 'var(--green)' : 'var(--link)', fontFamily: 'var(--font-display)' }}>
            {live ? 'Happening now' : 'Up next'}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{whenWords(event)}</span>
          <RecordChip record={record} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="pii-name" onClick={() => onOpen(event)} style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2, cursor: 'pointer' }}>
              {titleOf(event)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={13} /> {timeRange(event)}{event.duration_minutes && !isAllDay(event) ? ` · ${fmtDur(event.duration_minutes)}` : ''}</span>
              {event.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}><MapPin size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{event.location}</span></span>}
              {guests.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={13} /> <Avatars guests={guests} /></span>}
            </div>
            {stripHtml(event.description) && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stripHtml(event.description)}</div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {event.meet_link && (
              <a href={event.meet_link} target="_blank" rel="noreferrer" className="btn-green" style={{ fontSize: 13, padding: '9px 18px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Video size={14} /> Join
              </a>
            )}
            {event.location && (
              <a href={mapsUrl(event.location)} target="_blank" rel="noreferrer" className="btn-ghost" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} /> Directions
              </a>
            )}
            <button className="btn-ghost" onClick={() => onEdit(event)} title="Edit this event"><Pencil size={14} /> Edit</button>
            <button className="btn-ghost" onClick={() => onOpen(event)}>Open</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Recently ─────────────────────────────────────────────────────────────────
// Past events, present and browsable, styled to stay out of the way.
function RecentPanel({ items, onOpen }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px 6px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-display)', paddingBottom: 8 }}>
        Recently
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '4px 0 14px' }}>No past events yet.</div>
      ) : items.map(m => (
        <div key={m.id} onClick={() => onOpen(m)} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
          borderTop: '1px solid var(--border)', cursor: 'pointer',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="pii-name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(m)}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDayShort(centralDay(m.start_time))} · {fmtTime(m.start_time)}</div>
          </div>
          <ChevronRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

// ── Month and week grid ──────────────────────────────────────────────────────
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Grid({ view, weeks, monthOf, byDay, today, selected, onPickDay, onOpen }) {
  const week = view === 'week';
  const cellHeight = week ? 340 : 124;
  const maxChips = week ? 12 : 3;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
      {WEEKDAYS.map(w => (
        <div key={w} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)' }}>{w}</div>
      ))}
      {weeks.flat().map((day, i) => {
        const inPeriod = week || day.slice(0, 7) === monthOf;
        const isToday = day === today;
        const isSelected = day === selected;
        const items = byDay[day] || [];
        const count = items.filter(m => !isBlock(m)).length;
        // Midnight to midnight in Central, which is 23 or 25 hours on the two
        // clock-change days. A block gets clipped to that, not to UTC midnight.
        const dayStartMs = centralInstant(day, 0).getTime();
        const dayEndMs = centralInstant(addDays(day, 1), 0).getTime();
        const fullyBlocked = items.some(m => isBlock(m) && isAllDay(m));
        const past = day < today;
        return (
          <div
            key={day + i}
            onClick={() => onPickDay(day)}
            style={{
              height: cellHeight, boxSizing: 'border-box', overflow: week ? 'auto' : 'hidden', cursor: 'pointer',
              borderRight: (i % 7 !== 6) ? '1px solid var(--border)' : 'none',
              borderBottom: '1px solid var(--border)',
              padding: 6,
              background: isSelected ? 'rgba(37,99,235,0.05)' : fullyBlocked && inPeriod ? 'rgba(245,158,11,0.06)' : inPeriod ? 'var(--surface)' : 'var(--surface-2)',
              boxShadow: isSelected ? 'inset 0 0 0 2px rgba(37,99,235,0.35)' : 'none',
              opacity: inPeriod ? 1 : 0.55,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
              {count > 0 && (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)' }}>
                  {count} {count === 1 ? 'event' : 'events'}
                </span>
              )}
              <div style={{
                marginLeft: 'auto', minWidth: 24, height: 24, padding: '0 6px', borderRadius: 999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12.5, fontWeight: 800, fontFamily: 'var(--font-display)',
                color: isToday ? '#fff' : past ? 'var(--muted)' : 'var(--text)',
                background: isToday ? 'var(--orange)' : 'transparent',
              }}>
                {week ? `${WEEKDAYS[weekdayOf(day)]} ${Number(day.slice(8, 10))}` : Number(day.slice(8, 10))}
              </div>
            </div>

            {items.slice(0, maxChips).map(m => (
              <Chip key={`${m.id}-${day}`} m={m} dayStartMs={dayStartMs} dayEndMs={dayEndMs} onOpen={onOpen} />
            ))}
            {items.length > maxChips && (
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', paddingLeft: 4 }}>+{items.length - maxChips} more</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// One event on one day. Ahead of now it carries the accent, behind now it goes
// grey and quiet. Blocked time keeps its hatched amber so it still reads as
// "cannot book over this".
function Chip({ m, dayStartMs, dayEndMs, onOpen }) {
  const open = (e) => { e.stopPropagation(); onOpen(m); };
  if (isBlock(m)) {
    const s = Math.max(new Date(m.start_time).getTime(), dayStartMs);
    const e = Math.min(new Date(m.end_time || m.start_time).getTime(), dayEndMs);
    const allDay = (e - s) >= 23 * 3600000;
    const label = allDay ? 'All day' : `${fmtTimeShort(new Date(s))} to ${e >= dayEndMs ? '12 AM' : fmtTimeShort(new Date(e))}`;
    return (
      <div onClick={open} title={`${label} busy: ${titleOf(m)}`} style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '3px 7px', marginBottom: 3, borderRadius: 6, cursor: 'pointer',
        background: BLOCK_FILL, border: `1px dashed ${BLOCK_EDGE}`, overflow: 'hidden',
      }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: BLOCK_INK, flexShrink: 0, whiteSpace: 'nowrap' }}>{label}</span>
        <span className="pii-name" style={{ fontSize: 11.5, fontWeight: 700, color: BLOCK_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(m)}</span>
      </div>
    );
  }
  const over = isOver(m);
  const ink = over ? 'var(--muted)' : 'var(--link)';
  return (
    <div onClick={open} title={`${timeRange(m)} · ${titleOf(m)}`} style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px', marginBottom: 3, borderRadius: 6, cursor: 'pointer',
      background: over ? 'var(--surface-2)' : 'rgba(37,99,235,0.10)',
      borderLeft: `3px solid ${over ? 'var(--border-light)' : 'var(--link)'}`,
      overflow: 'hidden',
    }}>
      {isCommitment(m) && <span style={{ fontSize: 10, flexShrink: 0, color: BLOCK_INK, fontWeight: 800 }}>HOLD</span>}
      <span style={{ fontSize: 11, fontWeight: 800, color: ink, flexShrink: 0 }}>{fmtTimeShort(m.start_time)}</span>
      <span className="pii-name" style={{ fontSize: 12, fontWeight: 600, color: over ? 'var(--muted)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(m)}</span>
    </div>
  );
}

// ── The selected day ─────────────────────────────────────────────────────────
function DayPanel({ day, items, today, recordFor, onOpen, onEdit, onDelete, onNew }) {
  const ahead = items.filter(m => !isOver(m));
  const done = items.filter(isOver);
  const label = day === today ? `Today, ${fmtDayLong(day)}` : day === addDays(today, 1) ? `Tomorrow, ${fmtDayLong(day)}` : fmtDayLong(day);
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, marginTop: 18, padding: '14px 18px 18px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginRight: 'auto' }}>{label}</div>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{items.length ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : 'Nothing scheduled'}</span>
        <button className="btn-ghost" onClick={onNew}><Plus size={14} /> New event</button>
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '18px 0 8px' }}>
          This day is open. Pick another day on the calendar above, or add an event.
        </div>
      ) : (
        <>
          {ahead.map(m => <DayRow key={m.id} m={m} record={recordFor(m)} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />)}
          {done.length > 0 && (
            <>
              {ahead.length > 0 && (
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-display)', margin: '14px 0 6px' }}>Earlier</div>
              )}
              {done.map(m => <DayRow key={m.id} m={m} record={recordFor(m)} past onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

function DayRow({ m, record, past, onOpen, onEdit, onDelete }) {
  const block = isBlock(m);
  const guests = guestsOf(m);
  const where = m.location || (m.meet_link ? 'Google Meet' : '');
  return (
    <div onClick={() => onOpen(m)} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', marginBottom: 8,
      background: past ? 'var(--surface-2)' : 'var(--surface)',
      border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer',
      boxShadow: past ? 'none' : 'var(--shadow-sm)', opacity: past ? 0.8 : 1,
    }}>
      <div style={{ textAlign: 'center', minWidth: 74 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: past ? 'var(--muted)' : 'var(--text)' }}>{isAllDay(m) ? 'All day' : fmtTime(m.start_time)}</div>
        {!isAllDay(m) && m.duration_minutes ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDur(m.duration_minutes)}</div> : null}
      </div>
      <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 3, background: block ? BLOCK_EDGE : past ? 'var(--border-light)' : 'var(--link)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="pii-name" style={{ fontSize: 14.5, fontWeight: 700, color: past ? 'var(--muted)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titleOf(m)}</span>
          {block && <span style={{ fontSize: 10.5, fontWeight: 700, color: BLOCK_INK, background: 'rgba(245,158,11,0.12)', border: `1px solid ${BLOCK_EDGE}`, borderRadius: 999, padding: '1px 8px' }}>Blocked</span>}
          <RecordChip record={record} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {timeRange(m)}{where ? ` · ${where}` : ''}
        </div>
      </div>
      <Avatars guests={guests} max={3} />
      {m.meet_link && !past && (
        <a href={m.meet_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="btn-green" style={{ padding: '7px 14px', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Video size={13} /> Join
        </a>
      )}
      {m.location && (
        <a href={mapsUrl(m.location)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="btn-ghost" style={{ padding: '7px 12px', fontSize: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <MapPin size={13} /> Directions
        </a>
      )}
      <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={e => { e.stopPropagation(); onEdit(m); }} title="Edit"><Pencil size={14} /></button>
      <button className="btn-ghost" style={{ padding: '6px 8px' }} onClick={e => { e.stopPropagation(); onDelete(m); }} title="Delete"><Trash2 size={14} /></button>
    </div>
  );
}
