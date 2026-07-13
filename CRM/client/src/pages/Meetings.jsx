import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalIcon, Plus, Video, Trash2, RefreshCw, List as ListIcon,
  ChevronLeft, ChevronRight, Clock, Users, MapPin, ExternalLink,
} from 'lucide-react';
import { getUpcomingMeetings, getPastMeetings, deleteMeeting, syncMeetings } from '../api';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal';

const AVATAR_COLORS = ['#ee6a1f', '#784bd1', '#0ea5e9', '#16a34a', '#e11d48', '#d97706'];

// ── helpers ──────────────────────────────────────────────────────────────────
const fmtTime = (iso) => { try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)); } catch { return ''; } };
const fmtDayLong = (d) => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(d);
const fmtDur = (min) => { if (!min) return ''; const h = Math.floor(min / 60), m = min % 60; return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`; };
const stripHtml = (s) => (s ? String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
// All-day blocks / OOO clutter the list — treat 12h+ or OOO-titled events as "blocks".
const isBlock = (m) => (m.duration_minutes && m.duration_minutes >= 720) || /out of office|ooo|busy/i.test(m.title || '');

function Avatars({ participants = [], max = 4 }) {
  const shown = participants.slice(0, max);
  const extra = participants.length - max;
  if (!participants.length) return <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((p, i) => {
        const ch = (p.name || p.email || '?')[0].toUpperCase();
        const c = AVATAR_COLORS[i % AVATAR_COLORS.length];
        return (
          <div key={i} title={p.email || p.name} style={{ width: 26, height: 26, borderRadius: '50%', marginLeft: i ? -7 : 0, background: c + '22', border: `2px solid ${c}`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>{ch}</div>
        );
      })}
      {extra > 0 && <div style={{ marginLeft: -7, width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', border: '2px solid var(--surface)', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>+{extra}</div>}
    </div>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────
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
          }}>{o.icon}{o.label}{o.count != null && <span style={{ fontSize: 11, color: on ? 'var(--orange)' : 'var(--muted)' }}>{o.count}</span>}</button>
        );
      })}
    </div>
  );
}

export default function Meetings() {
  const navigate = useNavigate();
  const [view, setView] = useState('list');      // list | calendar
  const [tab, setTab] = useState('upcoming');     // upcoming | past
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, p] = await Promise.all([getUpcomingMeetings(), getPastMeetings()]);
      setUpcoming(u || []); setPast(p || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try { await syncMeetings(); await load(); } catch (e) { console.error(e); } finally { setSyncing(false); }
  };
  const handleDelete = async (m) => {
    if (!window.confirm(`Delete "${m.title}"?`)) return;
    try { await deleteMeeting(m.id); await load(); } catch (e) { console.error(e); }
  };

  const all = useMemo(() => {
    const map = new Map();
    [...upcoming, ...past].forEach(m => map.set(m.id, m));
    return [...map.values()];
  }, [upcoming, past]);

  const listItems = useMemo(() => {
    const src = tab === 'upcoming' ? upcoming : past;
    return (src || []).filter(m => showBlocks || !isBlock(m));
  }, [tab, upcoming, past, showBlocks]);

  // group list by day
  const grouped = useMemo(() => {
    const g = [];
    let cur = null;
    listItems.forEach(m => {
      const k = dayKey(m.start_time);
      if (!cur || cur.key !== k) { cur = { key: k, date: new Date(m.start_time), items: [] }; g.push(cur); }
      cur.items.push(m);
    });
    return g;
  }, [listItems]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 'auto' }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,155,38,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CalIcon size={18} style={{ color: 'var(--orange)' }} /></div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Meetings</div>
        </div>
        <Segmented value={view} onChange={setView} options={[
          { key: 'list', label: 'List', icon: <ListIcon size={14} /> },
          { key: 'calendar', label: 'Calendar', icon: <CalIcon size={14} /> },
        ]} />
        <button className="btn-ghost" onClick={handleSync} disabled={syncing}>
          <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} /> {syncing ? 'Syncing…' : 'Sync'}
        </button>
        <button className="btn-primary" onClick={() => setScheduleOpen(true)}><Plus size={15} /> Schedule Meeting</button>
      </div>

      <div style={{ padding: '0 24px 40px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60 }}>Loading…</div>
        ) : view === 'calendar' ? (
          <CalendarView month={calMonth} setMonth={setCalMonth} meetings={all} onOpen={m => navigate(`/appointments/${m.id}`)} />
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <Segmented value={tab} onChange={setTab} options={[
                { key: 'upcoming', label: 'Upcoming', count: upcoming.filter(m => !isBlock(m)).length },
                { key: 'past', label: 'Past', count: past.filter(m => !isBlock(m)).length },
              ]} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={showBlocks} onChange={e => setShowBlocks(e.target.checked)} /> Show blocked time / OOO
              </label>
            </div>

            {grouped.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}>
                <CalIcon size={28} style={{ opacity: 0.4, marginBottom: 8 }} /><div>No {tab} meetings.</div>
              </div>
            ) : grouped.map(group => (
              <div key={group.key} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: sameDay(group.date, new Date()) ? 'var(--orange)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: 'var(--font-display)' }}>
                  {sameDay(group.date, new Date()) ? 'Today · ' : ''}{fmtDayLong(group.date)}
                </div>
                {group.items.map(m => (
                  <div key={m.id} onClick={() => navigate(`/appointments/${m.id}`)} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', marginBottom: 8,
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                  }}>
                    <div style={{ textAlign: 'center', minWidth: 62 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{fmtTime(m.start_time)}</div>
                      {m.duration_minutes ? <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtDur(m.duration_minutes)}</div> : null}
                    </div>
                    <div style={{ width: 3, alignSelf: 'stretch', background: 'var(--orange)', borderRadius: 3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                      {stripHtml(m.description) && <div style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{stripHtml(m.description)}</div>}
                    </div>
                    <Avatars participants={m.participants} />
                    {m.meet_link && (
                      <a href={m.meet_link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="btn-green" style={{ padding: '7px 14px', fontSize: 12 }}><Video size={13} /> Join</a>
                    )}
                    <button className="btn-ghost" style={{ padding: '6px 8px', color: 'var(--red)' }} onClick={e => { e.stopPropagation(); handleDelete(m); }} title="Delete"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {scheduleOpen && (
        <ScheduleMeetingModal onClose={() => setScheduleOpen(false)} onComplete={() => { setScheduleOpen(false); handleSync(); }} />
      )}
    </div>
  );
}

// ── Calendar (month) view ────────────────────────────────────────────────────
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function CalendarView({ month, setMonth, meetings, onOpen }) {
  const weeks = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const start = new Date(y, m, 1);
    start.setDate(1 - start.getDay());
    const out = [];
    const d = new Date(start);
    for (let w = 0; w < 6; w++) { const row = []; for (let i = 0; i < 7; i++) { row.push(new Date(d)); d.setDate(d.getDate() + 1); } out.push(row); }
    return out;
  }, [month]);

  const byDay = useMemo(() => {
    const map = {};
    (meetings || []).forEach(m => { const k = dayKey(m.start_time); (map[k] = map[k] || []).push(m); });
    Object.values(map).forEach(arr => arr.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)));
    return map;
  }, [meetings]);

  const today = new Date();
  const title = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginRight: 'auto' }}>{title}</div>
        <button className="btn-ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={{ padding: '6px 8px' }}><ChevronLeft size={16} /></button>
        <button className="btn-ghost" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</button>
        <button className="btn-ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={{ padding: '6px 8px' }}><ChevronRight size={16} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {WEEKDAYS.map(w => <div key={w} style={{ padding: '8px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-display)' }}>{w}</div>)}
        {weeks.flat().map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = sameDay(d, today);
          const items = byDay[`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`] || [];
          const timed = items.filter(m => !isBlock(m));
          const blocks = items.filter(isBlock);
          return (
            <div key={i} style={{ minHeight: 108, borderRight: (i % 7 !== 6) ? '1px solid var(--border)' : 'none', borderBottom: '1px solid var(--border)', padding: 6, background: inMonth ? 'var(--surface)' : 'var(--surface-2)', opacity: inMonth ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: isToday ? '#fff' : 'var(--text)', background: isToday ? 'var(--orange)' : 'transparent' }}>{d.getDate()}</div>
              </div>
              {blocks.length > 0 && <div style={{ height: 4, borderRadius: 3, background: 'var(--surface-3)', marginBottom: 3 }} title={`${blocks.length} blocked`} />}
              {timed.slice(0, 3).map(m => (
                <div key={m.id} onClick={() => onOpen(m)} title={`${fmtTime(m.start_time)} · ${m.title}`} style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', marginBottom: 3, borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(255,155,38,0.12)', borderLeft: '2px solid var(--orange)', overflow: 'hidden',
                }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--orange)', flexShrink: 0 }}>{fmtTime(m.start_time).replace(':00', '')}</span>
                  <span style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
                </div>
              ))}
              {timed.length > 3 && <div style={{ fontSize: 10.5, color: 'var(--muted)', paddingLeft: 4 }}>+{timed.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
