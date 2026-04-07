import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Send, FileText, Inbox, Search, RefreshCw, Star, Trash2,
  ChevronLeft, Clock, Check, X, Edit3, ArrowRight, Sparkles, Calendar,
} from 'lucide-react';
import { getEmailQueue, updateQueueItem, deleteQueueItem, sendQueueItem, getLeads } from '../api';
import { supabase } from '../lib/supabase';

const TABS = [
  { key: 'inbox',  label: 'Inbox',  icon: Inbox },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'sent',   label: 'Sent',   icon: Send },
];

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString();
}

function Avatar({ name, color }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', background: color || '#4a6cf7',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

const AVATAR_COLORS = ['#4a6cf7', '#784bd1', '#22c55e', '#f5a623', '#ff5c5c', '#00b8d4'];

export default function EmailPage() {
  const [tab, setTab]             = useState('inbox');
  const [emails, setEmails]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [search, setSearch]       = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' });
  const [leads, setLeads]         = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load email queue items
      const queue = await getEmailQueue();
      setEmails(Array.isArray(queue) ? queue : []);
    } catch (err) {
      console.error('Email load error:', err);
    } finally {
      setLoading(false);
    }
    // Load leads for auto-draft context
    getLeads().then(l => setLeads(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Filter emails by tab
  const filtered = emails.filter(e => {
    if (tab === 'inbox') return e.status === 'received' || e.status === 'reply';
    if (tab === 'drafts') return e.status === 'draft' || e.status === 'pending';
    if (tab === 'sent') return e.status === 'sent';
    return true;
  }).filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.to_email || '').toLowerCase().includes(q) ||
           (e.subject || '').toLowerCase().includes(q) ||
           (e.lead_name || '').toLowerCase().includes(q);
  });

  // Auto-drafted emails (from lead submissions)
  const autoDrafts = emails.filter(e => e.status === 'draft' && e.auto_generated);

  const handleSend = async (id) => {
    try {
      await sendQueueItem(id);
      await load();
      setSelectedEmail(null);
    } catch (err) {
      alert('Send failed: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteQueueItem(id);
      await load();
      setSelectedEmail(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleApprove = async (email) => {
    try {
      await updateQueueItem(email.id, { status: 'pending' });
      await load();
    } catch (err) {
      alert('Approve failed: ' + err.message);
    }
  };

  const handleDeny = async (id) => {
    try {
      await deleteQueueItem(id);
      await load();
      setSelectedEmail(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // ── Email Detail View ─────────────────────────────────────────────────────
  if (selectedEmail) {
    const e = selectedEmail;
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f7fa' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7ef', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setSelectedEmail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex' }}>
            <ChevronLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{e.subject || '(no subject)'}</h2>
            <div style={{ fontSize: 12, color: '#8e8ea0', marginTop: 2 }}>
              To: {e.to_email || e.lead_name || 'Unknown'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(e.status === 'draft' || e.status === 'pending') && (
              <button onClick={() => handleSend(e.id)} className="btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
                <Send size={13} /> Send
              </button>
            )}
            {e.auto_generated && e.status === 'draft' && (
              <>
                <button onClick={() => handleApprove(e)} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={13} /> Approve
                </button>
                <button onClick={() => handleDeny(e.id)} style={{ background: 'none', color: '#ff5c5c', border: '1px solid #ff5c5c', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <X size={13} /> Deny
                </button>
              </>
            )}
            <button onClick={() => handleDelete(e.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff5c5c' }}>
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Auto-draft badge */}
        {e.auto_generated && (
          <div style={{ padding: '8px 24px', background: 'rgba(74,108,247,0.06)', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={14} color="#4a6cf7" />
            <span style={{ fontSize: 13, color: '#4a6cf7', fontWeight: 500 }}>
              Auto-drafted from lead submission. Review, edit, and approve to send.
            </span>
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, padding: '24px 32px', overflow: 'auto' }}>
          <div style={{
            background: '#fff', borderRadius: 12, border: '1px solid #e5e7ef', padding: '24px 28px',
            fontSize: 14, lineHeight: 1.7, color: '#1a1a2e', whiteSpace: 'pre-wrap',
          }}>
            {e.body || e.generated_body || '(empty)'}
          </div>

          {/* Follow-up info */}
          {e.follow_up_date && (
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8e8ea0' }}>
              <Calendar size={14} />
              Follow-up scheduled: {new Date(e.follow_up_date).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main List View ────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f7fa' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7ef', background: '#fff' }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>Email</h1>
            <p style={{ fontSize: 12, color: '#8e8ea0', marginTop: 2 }}>
              Manage your emails, drafts, and auto-generated outreach
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} className="btn-ghost" style={{ fontSize: 12 }}>
              <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
            </button>
            <button onClick={() => setComposing(true)} className="btn-primary" style={{ fontSize: 12 }}>
              <Edit3 size={13} /> Compose
            </button>
          </div>
        </div>

        {/* Tabs + Search */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelectedEmail(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: tab === t.key ? 'rgba(74,108,247,0.08)' : 'transparent',
                  color: tab === t.key ? '#4a6cf7' : '#8e8ea0',
                  border: tab === t.key ? '1px solid rgba(74,108,247,0.2)' : '1px solid transparent',
                }}
              >
                <t.icon size={14} />
                {t.label}
                {t.key === 'drafts' && autoDrafts.length > 0 && (
                  <span style={{ background: '#ff5c5c', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                    {autoDrafts.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', maxWidth: 260 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#b0b0c0' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search emails..."
              style={{
                width: '100%', padding: '7px 12px 7px 32px', borderRadius: 8, fontSize: 13,
                background: '#f5f7fa', border: '1px solid #e5e7ef', color: '#1a1a2e', outline: 'none',
              }}
            />
          </div>
        </div>
      </div>

      {/* Auto-draft banner */}
      {tab === 'drafts' && autoDrafts.length > 0 && (
        <div style={{
          padding: '10px 24px', background: 'rgba(74,108,247,0.04)', borderBottom: '1px solid #e5e7ef',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
        }}>
          <Sparkles size={14} color="#4a6cf7" />
          <span style={{ color: '#4a6cf7', fontWeight: 500 }}>
            {autoDrafts.length} auto-drafted email{autoDrafts.length > 1 ? 's' : ''} from new leads — review and approve
          </span>
        </div>
      )}

      {/* Email List */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#8e8ea0' }}>Loading emails...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Mail size={40} style={{ color: '#e5e7ef', margin: '0 auto 12px' }} />
            <p style={{ color: '#8e8ea0', fontSize: 14 }}>
              {tab === 'drafts' ? 'No drafts' : tab === 'sent' ? 'No sent emails' : 'No emails'}
            </p>
          </div>
        ) : (
          filtered.map((email, i) => (
            <div
              key={email.id}
              onClick={() => setSelectedEmail(email)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 24px', cursor: 'pointer',
                borderBottom: '1px solid #f0f2f8',
                background: email.auto_generated && email.status === 'draft' ? 'rgba(74,108,247,0.03)' : '#fff',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
              onMouseLeave={e => e.currentTarget.style.background = email.auto_generated && email.status === 'draft' ? 'rgba(74,108,247,0.03)' : '#fff'}
            >
              <Avatar
                name={email.lead_name || email.to_email || '?'}
                color={AVATAR_COLORS[(email.lead_name || '').charCodeAt(0) % AVATAR_COLORS.length]}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
                    {email.lead_name || email.to_email || 'Unknown'}
                  </span>
                  {email.auto_generated && (
                    <Sparkles size={12} color="#4a6cf7" />
                  )}
                  {email.status === 'draft' && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(74,108,247,0.08)', color: '#4a6cf7', fontWeight: 600 }}>
                      Draft
                    </span>
                  )}
                  {email.status === 'pending' && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,166,35,0.1)', color: '#f5a623', fontWeight: 600 }}>
                      Pending
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a2e', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {email.subject || '(no subject)'}
                </div>
                <div style={{ fontSize: 12, color: '#b0b0c0', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(email.body || email.generated_body || '').slice(0, 100)}
                </div>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: '#8e8ea0' }}>{timeAgo(email.created_at)}</div>
                {email.follow_up_date && (
                  <div style={{ fontSize: 10, color: '#4a6cf7', marginTop: 4, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                    <Clock size={10} /> Follow-up
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Compose Modal */}
      {composing && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setComposing(false); }}>
          <div className="modal-content" style={{ maxWidth: 600 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>New Email</h2>
              <button onClick={() => setComposing(false)} className="btn-ghost" style={{ padding: 4 }}><X size={18} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">To</label>
              <input className="form-input" value={composeData.to} onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Subject</label>
              <input className="form-input" value={composeData.subject} onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))} placeholder="Subject line" />
            </div>
            <div className="form-group">
              <label className="form-label">Body</label>
              <textarea className="form-input" rows={8} value={composeData.body} onChange={e => setComposeData(d => ({ ...d, body: e.target.value }))} placeholder="Write your email..." style={{ resize: 'vertical' }} />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setComposing(false)} className="btn-ghost">Cancel</button>
              <button className="btn-primary"><Send size={13} /> Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
