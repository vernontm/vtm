import React from 'react';
import { Link } from 'react-router-dom';

// Shared pieces for the role homes on the web dashboard: the formatting the
// iPhone app uses, the card shell, and the small bits every tile repeats.
// Nothing here fetches. Dashboard calls GET /home once and passes the reply
// down. Shapes: docs/engineer/role-homes-contracts.md. The phone versions of
// these live in mobile/components/homes/shared.js, so keep them in step.

// Money reads as whole dollars: $1,234 (the /home reply is in dollars).
export const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

// Minutes read as hours and minutes: 2h 10m, 38h, 45m.
export const fmtHM = (min) => {
  const m = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
};

// VTM runs on Central time, so a tile reads the same wherever the browser is.
export const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  try { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }); }
  catch (_) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
};

// A date only string (2026-10-01) is read as local noon so it never slips a day.
export const fmtDay = (v) => {
  if (!v) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T12:00:00` : v);
  return isNaN(d) ? String(v) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const fmtAge = (hours) => {
  const h = Math.max(0, Math.round(Number(hours) || 0));
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const plural = (n, one, many) => `${Number(n) || 0} ${Number(n) === 1 ? one : (many || `${one}s`)}`;
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
export const initials = (name) => String(name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

// Directions from a place. maps_url on a route row wins when the server sent one.
export const mapsUrl = (location) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location || '')}`;

// The day's counters in words: "12 leads added · 1 meeting booked · 9 texts".
const COUNTER_WORDS = [
  ['lead_created', 'lead added', 'leads added'],
  ['meeting_created', 'meeting booked', 'meetings booked'],
  ['text_sent', 'text', 'texts'],
  ['chat_sent', 'chat', 'chats'],
];
export const countersInWords = (counters) => COUNTER_WORDS
  .filter(([k]) => Number(counters?.[k]) > 0)
  .map(([k, one, many]) => plural(Number(counters[k]), one, many))
  .join(' · ');

// A stable, distinct color per person, the same palette the Inbox uses.
const EMP_COLORS = ['#2563eb', '#7c3aed', '#c026d3', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#4f46e5'];
export function colorForEmployee(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EMP_COLORS[h % EMP_COLORS.length];
}

export const GREEN = '#16a34a';
export const RED = '#ef4444';
export const AMBER = '#f59e0b';
export const SLATE = '#94a3b8';
export const VIOLET = '#7c3aed';

// One style block for every role home. Only one role renders at a time, so
// this lands on the page once.
export function HomeStyles() {
  return (
    <style>{`
      .home-tile {
        background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
        padding: 16px 18px; display: flex; flex-direction: column; gap: 10px;
        color: inherit; text-decoration: none; font-family: var(--font-display);
        transition: transform 150ms var(--ease-out, cubic-bezier(0.4,0,0.2,1)), border-color 150ms, box-shadow 150ms;
      }
      a.home-tile, button.home-tile { cursor: pointer; }
      a.home-tile:hover, button.home-tile:hover {
        transform: translateY(-2px); border-color: rgba(37,99,235,0.45); box-shadow: var(--shadow-md);
      }
      .home-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
      .home-row:last-child { border-bottom: none; padding-bottom: 0; }
      .home-clip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .home-link { font-size: 12px; font-weight: 700; color: var(--link); text-decoration: none; flex-shrink: 0; white-space: nowrap; }
      .home-link:hover { text-decoration: underline; }
      .home-pill {
        display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; cursor: pointer;
        font-size: 12px; font-weight: 700; font-family: var(--font-display);
        color: var(--orange); background: rgba(37,99,235,0.10);
        border: 1px solid rgba(37,99,235,0.30); border-radius: 8px; padding: 5px 10px;
      }
      .home-pill:hover { background: rgba(37,99,235,0.18); }
      .home-pill:disabled { opacity: 0.5; cursor: default; }
      .home-input {
        flex: 1; min-width: 0; background: var(--surface-2); border: 1px solid var(--border);
        border-radius: 9px; padding: 9px 11px; color: var(--text); font-size: 13.5;
        font-family: var(--font-display); outline: none;
      }
      .home-input:focus { border-color: var(--orange); box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
    `}</style>
  );
}

// The grid every role home sits in. auto-fit plus a real minimum, so a wide
// screen gets columns and a narrow one stacks without a horizontal scrollbar.
export function HomeGrid({ children, min = 340, gap = 16, style }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap, alignItems: 'start', ...style }}>
      {children}
    </div>
  );
}

// The card shell. `to` makes the whole card a link; use a plain card with a
// header link instead whenever the rows inside hold their own buttons.
export function Tile({ to, onClick, full, style, children, title, className = '' }) {
  const s = { ...(full ? { gridColumn: '1 / -1' } : null), ...style };
  const cls = `home-tile ${className}`.trim();
  if (to) return <Link to={to} title={title} className={cls} style={s}>{children}</Link>;
  if (onClick) return <button type="button" title={title} onClick={onClick} className={cls} style={{ textAlign: 'left', ...s }}>{children}</button>;
  return <div title={title} className={cls} style={s}>{children}</div>;
}

// The small uppercase caption at the top of a tile, with a link or a count
// on the right.
export function TileHead({ label, right, to, linkLabel = 'View all' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      {to ? <Link to={to} className="home-link">{linkLabel} &rarr;</Link>
        : right != null ? <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{right}</span> : null}
    </div>
  );
}

export function Dot({ color = SLATE, size = 9, title }) {
  return <span title={title} style={{ width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block', boxShadow: `0 0 0 3px ${color}22` }} />;
}

// A big number over a word, the way the phone's tiles read.
export function Big({ children, color = 'var(--text)', size = 28 }) {
  return <div className="private-value" style={{ fontSize: size, fontWeight: 800, color, fontFamily: 'var(--font-display)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>{children}</div>;
}

export function Sub({ children, color = 'var(--muted)' }) {
  return <div className="private-value home-clip" style={{ fontSize: 12, color }}>{children}</div>;
}

// A white stat box inside a tile: a number over a word.
export function Stat({ n, label }) {
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>{Number(n) || 0}</div>
      <div className="home-clip" style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</div>
    </div>
  );
}

// Progress bar for a count toward a target.
export function Bar({ value, color = 'var(--orange)' }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0)) * 100;
  return (
    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: color, transition: 'width 250ms ease' }} />
    </div>
  );
}

// Initials on the person's own color.
export function Initials({ id, name, size = 34 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: colorForEmployee(id || name), color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 800, letterSpacing: '0.02em',
    }}>{initials(name)}</span>
  );
}

// An icon in a soft round chip, the shape the row tiles use.
export function IconChip({ icon: Icon, color = 'var(--orange)', size = 34 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: `${color}18`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={Math.round(size * 0.45)} color={color} />
    </span>
  );
}

export function EmptyNote({ children }) {
  return <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{children}</div>;
}
