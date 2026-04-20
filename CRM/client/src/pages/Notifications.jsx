import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, AlertTriangle, Clock, TrendingDown, Briefcase,
  FolderOpen, Users, CreditCard, Check, RefreshCw, X,
  ChevronRight, Filter, Trash2,
} from 'lucide-react';
import { getNotifications, dismissNotification, dismissAllNotifications, resetDismissed } from '../api';

// ── Type config ───────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  payment_overdue:  { label: 'Payment Overdue',   icon: CreditCard,    color: '#ff5c5c' },
  payment_partial:  { label: 'Balance Owed',       icon: CreditCard,    color: '#fdab3d' },
  project_overdue:  { label: 'Project Overdue',    icon: FolderOpen,    color: '#ff5c5c' },
  project_due_soon: { label: 'Due Soon',           icon: Clock,         color: '#fdab3d' },
  stale_lead:       { label: 'Stale Lead',         icon: Users,         color: 'var(--muted)' },
  invoice_unpaid:   { label: 'Invoice Unpaid',     icon: CreditCard,    color: '#fdab3d' },
  deal_cold:        { label: 'Deal Going Cold',    icon: TrendingDown,  color: 'var(--orange)' },
};

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: '#ff5c5c', bg: '#ff5c5c18' },
  medium: { label: 'Medium', color: '#fdab3d', bg: '#fdab3d18' },
  low:    { label: 'Low',    color: 'var(--muted)', bg: '#8e8ea018' },
};

const ALL_TYPES = ['All', ...Object.keys(TYPE_CONFIG)];

function NotificationCard({ n, onDismiss }) {
  const tc  = TYPE_CONFIG[n.type]    || TYPE_CONFIG.stale_lead;
  const pc  = PRIORITY_CONFIG[n.priority] || PRIORITY_CONFIG.low;
  const Icon = tc.icon;
  const [dismissing, setDismissing] = useState(false);

  const handleDismiss = async () => {
    setDismissing(true);
    await onDismiss(n.id);
  };

  return (
    <div style={{
      background: 'var(--surface)', border: `1px solid #e5e7ef`,
      borderLeft: `3px solid ${pc.color}`,
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      opacity: dismissing ? 0.4 : 1, transition: 'opacity 0.2s',
    }}>
      {/* Icon */}
      <div style={{ width: 34, height: 34, borderRadius: 8, background: tc.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <Icon size={16} style={{ color: tc.color }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{n.title}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: pc.color, background: pc.bg, borderRadius: 6, padding: '2px 7px' }}>
            {pc.label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface)', borderRadius: 5, padding: '2px 7px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {tc.label}
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{n.message}</p>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            to={n.link}
            style={{ fontSize: 12, color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
          >
            View {n.entity_type} <ChevronRight size={12} />
          </Link>
        </div>
      </div>

      {/* Dismiss */}
      <button
        onClick={handleDismiss}
        title="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, flexShrink: 0, display: 'flex' }}
        onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
        onMouseLeave={e => e.currentTarget.style.color = '#8e8ea0'}
      >
        <X size={15} />
      </button>
    </div>
  );
}

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState('All');
  const [priorityFilter,setPriorityFilter]= useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data.notifications || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDismiss = async (id) => {
    await dismissNotification(id);
    setNotifications(ns => ns.filter(n => n.id !== id));
  };

  const handleDismissAll = async () => {
    const ids = filtered.map(n => n.id);
    await dismissAllNotifications(ids);
    setNotifications(ns => ns.filter(n => !ids.includes(n.id)));
  };

  const handleReset = async () => {
    await resetDismissed();
    load();
  };

  const filtered = notifications.filter(n => {
    if (filter !== 'All' && n.type !== filter) return false;
    if (priorityFilter !== 'all' && n.priority !== priorityFilter) return false;
    return true;
  });

  const counts = {
    high:   notifications.filter(n => n.priority === 'high').length,
    medium: notifications.filter(n => n.priority === 'medium').length,
    low:    notifications.filter(n => n.priority === 'low').length,
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="page-title">Notifications</div>
          {notifications.length > 0 && (
            <span style={{ background: '#ff5c5c', color: 'var(--text)', borderRadius: 12, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>
              {notifications.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={load}
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
          {filtered.length > 0 && (
            <button
              onClick={handleDismissAll}
              className="btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <Check size={14} /> Dismiss All
            </button>
          )}
        </div>
      </div>

      <div style={{ padding: '0 28px 28px' }}>

        {/* Priority summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { key: 'high',   label: 'High Priority',   color: '#ff5c5c', icon: AlertTriangle },
            { key: 'medium', label: 'Medium Priority',  color: '#fdab3d', icon: Clock },
            { key: 'low',    label: 'Low Priority',     color: 'var(--muted)', icon: Bell },
          ].map(({ key, label, color, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setPriorityFilter(p => p === key ? 'all' : key)}
              style={{
                background: priorityFilter === key ? color + '22' : '#ffffff',
                border: `1px solid ${priorityFilter === key ? color : '#e5e7ef'}`,
                borderRadius: 10, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <Icon size={20} style={{ color }} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>{counts[key]}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Type filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {ALL_TYPES.map(t => {
            const count = t === 'All'
              ? notifications.length
              : notifications.filter(n => n.type === t).length;
            if (count === 0 && t !== 'All') return null;
            const active = filter === t;
            const tc = TYPE_CONFIG[t];
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${active ? (tc?.color || '#4a6cf7') : '#e5e7ef'}`,
                  background: active ? (tc?.color || '#4a6cf7') + '22' : 'transparent',
                  color: active ? (tc?.color || '#4a6cf7') : '#8e8ea0',
                  fontWeight: active ? 700 : 400,
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {tc && <Filter size={11} />}
                {t === 'All' ? 'All Types' : tc?.label}
                <span style={{ background: 'var(--border-light)', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60, fontSize: 14 }}>Loading notifications...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <Bell size={40} style={{ color: '#e5e7ef', marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
              {notifications.length === 0 ? 'All clear!' : 'No notifications match this filter'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
              {notifications.length === 0 ? 'No action items at the moment. Check back later.' : 'Try clearing the filters above.'}
            </div>
            {notifications.length === 0 && (
              <button onClick={handleReset} className="btn-ghost" style={{ fontSize: 12 }}>
                <Trash2 size={13} /> Show dismissed
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(n => (
              <NotificationCard key={n.id} n={n} onDismiss={handleDismiss} />
            ))}
          </div>
        )}

        {/* Reset dismissed link */}
        {notifications.length > 0 && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button onClick={handleReset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>
              Reset dismissed notifications
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
