// ─────────────────────────────────────────────────────────────
// Table Cell Library
//
// Every table in the CRM should use these components rather than
// hand-rolling <td> content. That guarantees a Value cell renders
// identically on Projects, Deals, Clients — and stops the "why is
// this row styled differently?" bug from ever coming back.
//
// Design tokens live in index.css (:root). These cells reference them
// via var(--…) so a design refresh happens automatically everywhere.
// ─────────────────────────────────────────────────────────────

import React from 'react';
import { DollarSign, Calendar, User as UserIcon, Mail, Check, Circle, ExternalLink } from 'lucide-react';

// A single shared "empty" placeholder used everywhere.
const EmptyStub = () => <span style={{ color: '#c4c9d1', fontWeight: 500 }}>—</span>;

// ─── Text / heading ─────────────────────────────────────────────
// Used for the primary label of a row (project name, deal title, etc).
export function TextCell({ value, weight = 600, className = 'private-value', mono = false, size = 13 }) {
  if (!value) return <EmptyStub />;
  return (
    <span className={className} style={{
      fontSize: size, fontWeight: weight, color: 'var(--text)',
      fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
    }}>{value}</span>
  );
}

// ─── Money ──────────────────────────────────────────────────────
// Renders "$ 2,500" with optional /mo suffix and a subtle paid indicator.
// The paid indicator is a small colored ring on the left edge — quiet by
// default, obvious when something needs attention. Click anywhere in the
// amount block to open a mark-paid handler if provided.
export function MoneyCell({
  value = 0,
  recurring = 0,
  paid = 0,
  onMarkPaid,       // optional: click handler
  hidePaidIndicator = false,
}) {
  const v = Number(value) || 0;
  const r = Number(recurring) || 0;
  const p = Number(paid) || 0;
  const total = v + r;

  if (!v && !r) return <EmptyStub />;

  const isFull    = total > 0 && p >= total;
  const isPartial = p > 0 && !isFull;
  // Left-edge indicator strip: gray → amber → green. Nothing loud.
  const stripColor = isFull ? '#22c55e' : isPartial ? '#f59e0b' : '#d1d5db';
  const stripTitle = isFull
    ? `Paid in full — $${p.toLocaleString()}`
    : isPartial
      ? `Partial: $${p.toLocaleString()} of $${total.toLocaleString()} (${Math.round((p/total)*100)}%)`
      : 'Unpaid — click to record a payment';

  const line = (amount, suffix) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2 }}>
      <DollarSign size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
      <span>
        {amount.toLocaleString()}
        {suffix && <span style={{ color: 'var(--muted)', fontSize: 11.5, marginLeft: 2, fontWeight: 500 }}>{suffix}</span>}
      </span>
    </div>
  );

  const block = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {!hidePaidIndicator && (
        <span
          title={stripTitle}
          style={{ width: 3, alignSelf: 'stretch', minHeight: 20, borderRadius: 3, background: stripColor, flexShrink: 0 }}
        />
      )}
      <div className="pii-money" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {v > 0 && line(v)}
        {r > 0 && line(r, '/mo')}
        {isPartial && !hidePaidIndicator && (
          <span style={{ fontSize: 10.5, color: '#c2860f', fontWeight: 600 }}>
            {Math.round((p/total)*100)}% paid · ${(total - p).toLocaleString()} left
          </span>
        )}
        {isFull && !hidePaidIndicator && (
          <span style={{ fontSize: 10.5, color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <Check size={9} /> Paid
          </span>
        )}
      </div>
    </div>
  );

  if (!onMarkPaid) return block;
  return (
    <button
      onClick={onMarkPaid}
      title={stripTitle}
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
      {block}
    </button>
  );
}

// ─── Person ─────────────────────────────────────────────────────
// Name + optional secondary (email/role). Optional avatar.
export function PersonCell({ name, secondary, avatar, showAvatar = false, size = 32 }) {
  if (!name && !secondary) return <EmptyStub />;
  const initial = (name || secondary || '?').trim().charAt(0).toUpperCase();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {showAvatar && (
        avatar
          ? <img src={avatar} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          : (
            <div style={{
              width: size, height: size, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--surface-2), var(--surface-3))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: size * 0.42, fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
            }}>{initial}</div>
          )
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        {name && (
          <span className="pii-name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        )}
        {secondary && (
          <span className="pii-name" style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secondary}</span>
        )}
      </div>
    </div>
  );
}

// ─── Date / Timeline ────────────────────────────────────────────
// One date or a start → end range. Icon in accent color to match Money.
export function DateCell({ value, endValue, format }) {
  if (!value && !endValue) return <EmptyStub />;
  const f = format || defaultDateFormat;
  const text = value && endValue
    ? `${f(value)} → ${f(endValue)}`
    : value ? f(value) : f(endValue);

  return (
    <div className="private-value" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
      <Calendar size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}
function defaultDateFormat(d) {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Status ─────────────────────────────────────────────────────
// Small colored pill for lifecycle status. Supply { colorFor } to map
// custom status strings to hex; falls back to a subtle gray.
export function StatusCell({ value, colorFor, onClick }) {
  if (!value) return <EmptyStub />;
  const color = (colorFor && colorFor(value)) || 'var(--muted)';
  return (
    <span onClick={onClick} title={onClick ? 'Click to change' : undefined} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.01em',
      background: `${color}18`, color, border: `1px solid ${color}40`,
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform 0.12s',
    }}>
      {value}
    </span>
  );
}

// ─── Progress ───────────────────────────────────────────────────
// Bar + percentage OR "Ongoing" pill.
export function ProgressCell({ value = 0, total = 100, ongoing = false }) {
  if (ongoing) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 999,
        fontSize: 11, fontWeight: 700,
        background: '#22c55e18', color: '#16a34a', border: '1px solid #22c55e40',
      }}>Ongoing</span>
    );
  }
  const pct = Math.max(0, Math.min(100, Math.round((value / (total || 100)) * 100)));
  const barColor = pct >= 100 ? '#22c55e' : pct >= 60 ? 'var(--orange)' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)', width: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
    </div>
  );
}

// ─── Email ──────────────────────────────────────────────────────
export function EmailCell({ value, mailtoOnClick = false }) {
  if (!value) return <EmptyStub />;
  return (
    <a
      href={mailtoOnClick ? `mailto:${value}` : undefined}
      onClick={mailtoOnClick ? undefined : (e => e.preventDefault())}
      className="pii-name"
      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500, color: 'var(--muted)', textDecoration: 'none' }}>
      <Mail size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </a>
  );
}

// ─── Phone ──────────────────────────────────────────────────────
export function PhoneCell({ value }) {
  if (!value) return <EmptyStub />;
  return (
    <a href={`tel:${value}`} className="pii-name" style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </a>
  );
}

// ─── Link ──────────────────────────────────────────────────────
export function LinkCell({ href, label, truncate = 24 }) {
  if (!href) return <EmptyStub />;
  const text = label || (href.length > truncate ? href.slice(0, truncate) + '…' : href);
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 500, color: 'var(--orange)', textDecoration: 'none' }}>
      {text} <ExternalLink size={11} />
    </a>
  );
}

// ─── Tag list ──────────────────────────────────────────────────
export function TagsCell({ tags = [], max = 3, colorFor }) {
  if (!tags.length) return <EmptyStub />;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {shown.map(t => {
        const c = (colorFor && colorFor(t)) || 'var(--muted)';
        return (
          <span key={t} style={{
            fontSize: 10.5, fontWeight: 600,
            padding: '2px 8px', borderRadius: 999,
            background: `${c}18`, color: c, border: `1px solid ${c}30`,
          }}>{t}</span>
        );
      })}
      {rest > 0 && (
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--muted)', padding: '2px 6px' }}>+{rest}</span>
      )}
    </div>
  );
}

// ─── Boolean / check ───────────────────────────────────────────
export function CheckCell({ checked, size = 14 }) {
  return checked
    ? <Check size={size} style={{ color: '#22c55e' }} />
    : <Circle size={size} style={{ color: 'var(--muted)', opacity: 0.4 }} />;
}

// ─── Row hover-action tray ─────────────────────────────────────
// Renders children only when parent row is hovered. Use inside a <td>.
export function RowActions({ children }) {
  return (
    <span className="row-actions" style={{
      display: 'inline-flex', gap: 4, alignItems: 'center',
      opacity: 0, transform: 'translateX(4px)',
      transition: 'opacity 0.15s, transform 0.15s',
    }}>
      {children}
    </span>
  );
}
// Attach on the parent <tr> to reveal RowActions on hover:
//   <tr className="hover-reveal">
export const HOVER_REVEAL_CSS = `
  tr.hover-reveal:hover .row-actions { opacity: 1; transform: translateX(0); }
`;

export { EmptyStub };
