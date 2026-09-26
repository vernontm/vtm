import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Receipt, Repeat, Zap, Send, Check, RefreshCw, Siren,
} from 'lucide-react';
import { getHome } from '../api';
import NudgeModal from '../components/NudgeModal';
import Invoices from './Invoices';
import Subscriptions from './Subscriptions';

// Money: what came in this month, what is still out, the client plans and the
// tools we pay for, with a Nudge on anything unpaid. One call (the `money`
// block of GET /home?role=ceo) feeds the Overview tab. The Invoices and
// Subscriptions tabs reuse the pages that already exist, so invoice creation
// and the Gmail receipt scan stay exactly where they were. Same data the
// iPhone app's Money screen reads. Shapes: docs/engineer/role-homes-contracts.md.

const TABS = [
  { key: 'overview',      label: 'Overview',      icon: DollarSign },
  { key: 'invoices',      label: 'Invoices',      icon: Receipt },
  { key: 'subscriptions', label: 'Subscriptions', icon: Repeat },
];

// Whole dollars, like the Dashboard money tiles (the /home reply is in dollars).
const usd = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-US')}`;
// Exact dollars for a row amount, where cents matter.
const money = (v) => {
  const n = Number(v) || 0;
  return `$${n.toLocaleString('en-US', Number.isInteger(n) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
// A date-only string ("2026-09-23") is a local calendar day, not UTC midnight.
const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const plural = (n, one, many) => `${Number(n) || 0} ${Number(n) === 1 ? one : many}`;
const RED = '#ef4444';
const AMBER = '#f59e0b';
const GREEN = '#16a34a';

const panel = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, padding: '14px 18px 4px', marginBottom: 18,
};
const panelHead = {
  display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6,
};
const panelTitle = {
  fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase',
  color: 'var(--muted)', fontFamily: 'var(--font-display)',
};
const rowStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
  borderTop: '1px solid var(--border)',
};
const rowTitle = {
  fontSize: 13.5, fontWeight: 600, color: 'var(--text)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const rowSub = {
  fontSize: 11.5, color: 'var(--muted)',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
const emptyNote = { fontSize: 12.5, color: 'var(--muted)', padding: '10px 0 14px' };

function Tile({ label, value, hint, color, icon: Icon }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon size={12} color={color} /> {label}
      </div>
      <div className="private-value" style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{value}</div>
      <div className="private-value" style={{ fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</div>
    </div>
  );
}

function Dot({ color }) {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: color, boxShadow: `0 0 0 3px ${color}22` }} />;
}

export default function Money() {
  const [tab, setTab] = useState('overview');
  const [m, setM] = useState(null);          // the /home money block
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');    // a real failure, worth showing
  const [pending, setPending] = useState(false); // 503 needs_migration: stay quiet
  const [nudge, setNudge] = useState(null);      // { kind, id, key }
  const [nudged, setNudged] = useState({});      // { 'kind:id': 'sent' | 'scheduled' }

  const load = useCallback(async (quiet) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try {
      const r = await getHome('ceo');
      setM(r?.money || null);
      setError(''); setPending(false);
    } catch (e) {
      setM(null);
      if (e.needs_migration || e.status === 503) { setPending(true); setError(''); }
      else { setPending(false); setError(e.message || 'Could not load money'); }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const unpaid = m?.unpaid || [];
  const recent = m?.recent_payments || [];
  const out = m?.outstanding || {};
  const cp = m?.client_plans || {};
  const tl = m?.tools || {};
  const prev = m?.collected_prev_month;

  const keyOf = (u) => `${u.kind || 'invoice'}:${u.id}`;

  const nudgeButton = (target) => {
    const key = keyOf(target);
    if (nudged[key]) {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: GREEN, fontWeight: 600, flexShrink: 0 }}>
          <Check size={12} /> {nudged[key] === 'scheduled' ? 'Nudge scheduled' : 'Nudged just now'}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setNudge({ kind: target.kind || 'invoice', id: target.id, key })}
        title="Send a reminder by text or email"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--orange)', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
      >
        <Send size={12} /> Nudge
      </button>
    );
  };

  const unpaidRow = (u) => {
    const late = Number(u.days_late) > 0;
    const sub = [
      u.client_name || null,
      u.due ? `due ${fmtDay(u.due)}` : null,
      late ? `${plural(u.days_late, 'day', 'days')} late` : null,
      u.last_nudged_at ? `nudged ${fmtDay(u.last_nudged_at)}` : 'not nudged',
    ].filter(Boolean).join(' · ');
    return (
      <div key={keyOf(u)} style={rowStyle}>
        <Dot color={late ? RED : AMBER} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="private-value" style={rowTitle}>{u.label || 'Invoice'} · {money(u.amount)}</div>
          <div className="private-value" style={rowSub}>{sub}</div>
        </div>
        {nudgeButton(u)}
      </div>
    );
  };

  const paymentRow = (p, i) => (
    <div key={p.id || `pay-${i}`} style={rowStyle}>
      <Dot color={GREEN} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="private-value" style={rowTitle}>{p.client_name || 'Client'} · {money(p.amount)}</div>
        <div className="private-value" style={rowSub}>{[p.label, fmtDay(p.paid_at)].filter(Boolean).join(' · ')}</div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, flexShrink: 0 }}>Paid</span>
    </div>
  );

  const overview = () => {
    if (loading) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading money...</div>;
    if (pending) {
      return (
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 520 }}>
          The money figures are not switched on yet. Invoices and Subscriptions still work from the tabs above.
        </div>
      );
    }
    if (error) {
      return (
        <div style={{ ...panel, borderColor: 'rgba(239,68,68,0.32)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Siren size={15} color={RED} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Could not load money</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>{error}</div>
          <button type="button" className="btn-ghost" onClick={() => load()}>Try again</button>
        </div>
      );
    }
    if (!m) {
      return (
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 520 }}>
          No money figures came back. They come with the CEO home layout.
        </div>
      );
    }
    return (
      <>
        <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          <Tile
            label={`Collected in ${m.month || 'this month'}`}
            value={usd(m.collected_month)}
            hint={prev != null ? `${usd(prev)} last month` : `${plural(m.payments_this_week, 'payment', 'payments')} this week`}
            color={GREEN}
            icon={DollarSign}
          />
          <Tile
            label="Outstanding"
            value={usd(out.total)}
            hint={`${plural(out.count, 'unpaid', 'unpaid')} · ${out.overdue || 0} overdue`}
            color={Number(out.total) > 0 ? RED : 'var(--text)'}
            icon={Receipt}
          />
          <Tile
            label="Client plans per month"
            value={`${usd(cp.mrr)} / mo`}
            hint={`${cp.active || 0} active · ${cp.past_due || 0} past due`}
            color="#2563eb"
            icon={Repeat}
          />
          <Tile
            label="Tools we pay for"
            value={`${usd(tl.monthly)} / mo`}
            hint={tl.next?.service
              ? `${plural(tl.count, 'tool', 'tools')} · next ${tl.next.service} ${fmtDay(tl.next.date)}`
              : plural(tl.count, 'tool', 'tools')}
            color="#7c3aed"
            icon={Zap}
          />
        </div>

        {/* Unpaid: everything still owed to us, each with a Nudge */}
        <div style={panel}>
          <div style={panelHead}>
            <span style={panelTitle}>Unpaid</span>
            {unpaid.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: RED, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999, padding: '1px 8px' }}>{unpaid.length}</span>
            )}
            <div style={{ flex: 1 }} />
            <span className="private-value" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{usd(out.total)} outstanding</span>
          </div>
          {unpaid.length === 0
            ? <div style={emptyNote}>Nothing unpaid. Every invoice is settled.</div>
            : unpaid.map(unpaidRow)}
        </div>

        {/* Recent payments */}
        <div style={panel}>
          <div style={panelHead}>
            <span style={panelTitle}>Recent payments</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {m.payments_this_week ? `${plural(m.payments_this_week, 'payment', 'payments')} this week` : 'nothing this week'}
            </span>
          </div>
          {recent.length === 0
            ? <div style={emptyNote}>No payments yet this month.</div>
            : recent.slice(0, 12).map(paymentRow)}
        </div>
      </>
    );
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Tabs: Overview reads /home, the other two are the pages that already exist */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 28px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {TABS.map(t => {
          const on = tab === t.key;
          const badge = t.key === 'invoices' && unpaid.length ? unpaid.length : null;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 16px',
              background: 'none', border: 'none', borderBottom: `2px solid ${on ? 'var(--orange)' : 'transparent'}`,
              marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap',
              color: on ? 'var(--text)' : 'var(--muted)', fontSize: 13.5, fontWeight: on ? 700 : 600,
              fontFamily: 'var(--font-display)', transition: 'color 0.15s, border-color 0.15s',
            }}>
              <t.icon size={15} style={{ flexShrink: 0 }} /> {t.label}
              {badge != null && (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: Number(out.overdue) > 0 ? RED : 'var(--muted)', background: Number(out.overdue) > 0 ? 'rgba(239,68,68,0.12)' : 'var(--surface-2)', border: `1px solid ${Number(out.overdue) > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, borderRadius: 999, padding: '0 6px' }}>{badge}</span>
              )}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {tab === 'overview' && (
          <button type="button" onClick={() => load(true)} title="Reload the figures" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)',
            padding: '6px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
            fontFamily: 'var(--font-display)', margin: '6px 0',
          }}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
        )}
      </nav>

      {tab === 'overview'
        ? <div style={{ padding: '22px 28px 40px' }}>{overview()}</div>
        : tab === 'invoices'
          ? <Invoices />
          : <Subscriptions embedded />}

      {nudge && (
        <NudgeModal
          kind={nudge.kind}
          id={nudge.id}
          onClose={() => setNudge(null)}
          onSent={(_reply, { scheduled } = {}) => {
            setNudged(prevMap => ({ ...prevMap, [nudge.key]: scheduled ? 'scheduled' : 'sent' }));
            load(true);   // the row's "nudged" date just changed
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
