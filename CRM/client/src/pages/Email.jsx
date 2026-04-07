import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail, Send, FileText, Inbox, Search, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, Clock, Check, X, Edit3, Sparkles, Calendar,
  Star, MoreVertical, Reply, Forward, Archive, Paperclip,
} from 'lucide-react';
import { getEmailQueue, updateQueueItem, deleteQueueItem, sendQueueItem, createQueueItem, getGmailInbox } from '../api';

const TABS = [
  { key: 'inbox',  label: 'Inbox',  icon: Inbox },
  { key: 'sent',   label: 'Sent',   icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FileText },
];

const AVATAR_COLORS = ['#4a6cf7', '#784bd1', '#22c55e', '#f5a623', '#ff5c5c', '#00b8d4', '#e91e8c', '#ff6b35'];

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
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtFullDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  } catch { return iso; }
}

function Avatar({ name, size = 40, color }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const bg = color || AVATAR_COLORS[(name || '').charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default function EmailPage() {
  const [tab, setTab] = useState('inbox');
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeData, setComposeData] = useState({ to: '', subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [editingDraft, setEditingDraft] = useState(null);
  const [gmailThreads, setGmailThreads] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await getEmailQueue();
      setEmails(Array.isArray(queue) ? queue : []);
    } catch (err) {
      console.error('Email load error:', err);
    }
    // Load Gmail threads silently (don't block if not connected)
    try {
      const data = await getGmailInbox();
      if (data?.threads) {
        setGmailThreads(data.threads.map(t => ({
          id: t.threadId,
          _gmail: true,
          lead_name: (t.from || '').replace(/<.*>/, '').trim() || t.from,
          to_email: t.to,
          subject: t.subject,
          body: t.snippet,
          status: 'received',
          created_at: t.date ? new Date(t.date).toISOString() : '',
          messageCount: t.messageCount,
          hasReply: t.hasReply,
        })));
      }
    } catch (err) {
      // Gmail not connected — that's fine
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

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

  const autoDraftCount = emails.filter(e => e.status === 'draft' && e.auto_generated).length;

  const handleSend = async (id) => {
    try {
      await sendQueueItem(id);
      await load();
      setSelected(null);
    } catch (err) {
      alert('Send failed: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteQueueItem(id);
      await load();
      if (selected?.id === id) setSelected(null);
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

  const handleCompose = () => {
    setComposing(true);
    setSelected(null);
    setEditingDraft(null);
    setComposeData({ to: '', subject: '', body: '' });
  };

  const handleEditDraft = (email) => {
    setComposing(true);
    setEditingDraft(email);
    setComposeData({
      to: email.to_email || '',
      subject: email.subject || '',
      body: email.body || email.generated_body || '',
    });
  };

  const handleSendCompose = async () => {
    if (!composeData.to || !composeData.subject) return;
    setSending(true);
    try {
      if (editingDraft) {
        await updateQueueItem(editingDraft.id, {
          to_email: composeData.to,
          subject: composeData.subject,
          body: composeData.body,
          status: 'pending',
        });
      } else {
        await createQueueItem({
          to_email: composeData.to,
          subject: composeData.subject,
          body: composeData.body,
          status: 'pending',
        });
      }
      setComposing(false);
      setEditingDraft(null);
      setComposeData({ to: '', subject: '', body: '' });
      await load();
    } catch (err) {
      alert('Failed: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!composeData.to && !composeData.subject && !composeData.body) return;
    try {
      if (editingDraft) {
        await updateQueueItem(editingDraft.id, {
          to_email: composeData.to,
          subject: composeData.subject,
          body: composeData.body,
        });
      } else {
        await createQueueItem({
          to_email: composeData.to,
          subject: composeData.subject,
          body: composeData.body,
          status: 'draft',
        });
      }
      setComposing(false);
      setEditingDraft(null);
      setComposeData({ to: '', subject: '', body: '' });
      await load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  };

  // Navigation within selected emails
  const currentIdx = selected ? filtered.findIndex(e => e.id === selected.id) : -1;
  const canPrev = currentIdx > 0;
  const canNext = currentIdx >= 0 && currentIdx < filtered.length - 1;

  return (
    <div style={{ height: '100%', display: 'flex', background: '#f5f7fa', fontFamily: 'Inter, sans-serif' }}>

      {/* ── Left Sidebar ── */}
      <div style={{
        width: 200, background: '#ffffff', borderRight: '1px solid #e5e7ef',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Compose Button */}
        <div style={{ padding: '16px 14px 12px' }}>
          <button
            onClick={handleCompose}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 10, cursor: 'pointer',
              background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none',
              color: '#ffffff', fontSize: 13, fontWeight: 600, display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Edit3 size={14} /> Compose email
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#b0b0c0' }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search here..."
              style={{
                width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, fontSize: 12,
                background: '#f5f7fa', border: '1px solid #e5e7ef', color: '#1a1a2e', outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Tab List */}
        <div style={{ flex: 1 }}>
          {TABS.map(t => {
            const isActive = tab === t.key;
            const count = t.key === 'drafts' ? autoDraftCount : 0;
            return (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); setSelected(null); setComposing(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: isActive ? 'rgba(74,108,247,0.08)' : 'transparent',
                  color: isActive ? '#4a6cf7' : '#5a5a6e',
                  borderLeft: isActive ? '3px solid #4a6cf7' : '3px solid transparent',
                }}
              >
                <t.icon size={16} />
                {t.label}
                {count > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: '#ff5c5c', color: '#fff',
                    borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Refresh */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid #f0f2f8' }}>
          <button onClick={handleRefresh} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 0', border: '1px solid #e5e7ef', borderRadius: 8,
            background: '#ffffff', color: '#8e8ea0', fontSize: 12, cursor: 'pointer',
          }}>
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Email List (Middle) ── */}
      <div style={{
        width: 380, borderRight: '1px solid #e5e7ef', background: '#ffffff',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* List Header */}
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid #e5e7ef',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', flex: 1 }}>
            {tab === 'inbox' ? 'Inbox' : tab === 'sent' ? 'Sent' : 'Drafts'}
          </span>
          <span style={{ fontSize: 12, color: '#8e8ea0' }}>{filtered.length} email{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Auto-draft banner */}
        {tab === 'drafts' && autoDraftCount > 0 && (
          <div style={{
            padding: '8px 18px', background: 'rgba(74,108,247,0.04)', borderBottom: '1px solid #e5e7ef',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          }}>
            <Sparkles size={12} color="#4a6cf7" />
            <span style={{ color: '#4a6cf7', fontWeight: 500 }}>
              {autoDraftCount} auto-drafted — review & approve
            </span>
          </div>
        )}

        {/* Email rows */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#8e8ea0', fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Mail size={32} style={{ color: '#e5e7ef', margin: '0 auto 10px' }} />
              <div style={{ color: '#8e8ea0', fontSize: 13 }}>
                {tab === 'drafts' ? 'No drafts' : tab === 'sent' ? 'No sent emails' : 'No emails'}
              </div>
            </div>
          ) : (
            filtered.map(email => {
              const isSelected = selected?.id === email.id;
              const name = email.lead_name || email.to_email || 'Unknown';
              return (
                <div
                  key={email.id}
                  onClick={() => { setSelected(email); setComposing(false); }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 18px', cursor: 'pointer',
                    borderBottom: '1px solid #f0f2f8',
                    background: isSelected ? 'rgba(74,108,247,0.06)' : email.auto_generated && email.status === 'draft' ? 'rgba(74,108,247,0.02)' : '#fff',
                    borderLeft: isSelected ? '3px solid #4a6cf7' : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8f9fc'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = email.auto_generated && email.status === 'draft' ? 'rgba(74,108,247,0.02)' : '#fff'; }}
                >
                  <Avatar name={name} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{name}</span>
                      <span style={{ fontSize: 11, color: '#8e8ea0', flexShrink: 0, marginLeft: 8 }}>
                        {timeAgo(email.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                      {email.subject || '(no subject)'}
                    </div>
                    <div style={{ fontSize: 12, color: '#8e8ea0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(email.body || email.generated_body || '').slice(0, 80)}...
                    </div>
                    {/* Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      {email.auto_generated && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#4a6cf710', color: '#4a6cf7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Sparkles size={9} /> Auto
                        </span>
                      )}
                      {email.status === 'draft' && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f5a62310', color: '#f5a623', fontWeight: 600 }}>Draft</span>
                      )}
                      {email.status === 'pending' && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#22c55e10', color: '#22c55e', fontWeight: 600 }}>Approved</span>
                      )}
                      {email.follow_up_date && (
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#784bd110', color: '#784bd1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={9} /> Follow-up
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Panel (Detail / Compose) ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f5f7fa', minWidth: 0 }}>

        {composing ? (
          /* ── Compose Panel ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Compose Header */}
            <div style={{
              padding: '16px 24px', background: '#ffffff', borderBottom: '1px solid #e5e7ef',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>
                {editingDraft ? 'Edit Draft' : 'New Email'}
              </h2>
              <button onClick={() => { setComposing(false); setEditingDraft(null); }} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0',
              }}>
                <X size={18} />
              </button>
            </div>

            {/* Compose Form */}
            <div style={{ flex: 1, padding: '24px', overflow: 'auto' }}>
              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e5e7ef', overflow: 'hidden' }}>
                {/* To */}
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f2f8', padding: '12px 20px' }}>
                  <span style={{ fontSize: 13, color: '#8e8ea0', fontWeight: 500, width: 60 }}>To:</span>
                  <input
                    value={composeData.to}
                    onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))}
                    placeholder="email@example.com"
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#1a1a2e', background: 'transparent' }}
                  />
                </div>
                {/* Subject */}
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f2f8', padding: '12px 20px' }}>
                  <span style={{ fontSize: 13, color: '#8e8ea0', fontWeight: 500, width: 60 }}>Subject:</span>
                  <input
                    value={composeData.subject}
                    onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))}
                    placeholder="Subject line"
                    style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: '#1a1a2e', fontWeight: 600, background: 'transparent' }}
                  />
                </div>
                {/* Body */}
                <textarea
                  value={composeData.body}
                  onChange={e => setComposeData(d => ({ ...d, body: e.target.value }))}
                  placeholder="Write your email..."
                  style={{
                    width: '100%', minHeight: 360, padding: '20px', border: 'none', outline: 'none',
                    fontSize: 14, lineHeight: 1.7, color: '#1a1a2e', resize: 'vertical',
                    background: 'transparent', fontFamily: 'Inter, sans-serif',
                  }}
                />
              </div>
            </div>

            {/* Compose Footer */}
            <div style={{
              padding: '14px 24px', background: '#ffffff', borderTop: '1px solid #e5e7ef',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <button
                onClick={handleSendCompose}
                disabled={sending || !composeData.to || !composeData.subject}
                style={{
                  padding: '9px 20px', borderRadius: 8, cursor: sending ? 'wait' : 'pointer',
                  background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none',
                  color: '#ffffff', fontSize: 13, fontWeight: 600, display: 'flex',
                  alignItems: 'center', gap: 6, opacity: sending || !composeData.to || !composeData.subject ? 0.5 : 1,
                }}
              >
                <Send size={13} /> {sending ? 'Sending...' : 'Send'}
              </button>
              <button onClick={handleSaveDraft} style={{
                padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                background: '#ffffff', border: '1px solid #e5e7ef',
                color: '#8e8ea0', fontSize: 13, fontWeight: 500,
              }}>
                Save Draft
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setComposing(false); setEditingDraft(null); }} style={{
                padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                background: 'none', border: 'none', color: '#8e8ea0', fontSize: 13,
              }}>
                Discard
              </button>
            </div>
          </div>
        ) : selected ? (
          /* ── Email Detail Panel ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Detail Header */}
            <div style={{
              padding: '12px 24px', background: '#ffffff', borderBottom: '1px solid #e5e7ef',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex' }}>
                <ChevronLeft size={18} />
              </button>
              <div style={{ flex: 1 }} />

              {/* Navigation */}
              <span style={{ fontSize: 12, color: '#8e8ea0' }}>
                {currentIdx + 1} of {filtered.length}
              </span>
              <button
                onClick={() => canPrev && setSelected(filtered[currentIdx - 1])}
                disabled={!canPrev}
                style={{ background: 'none', border: 'none', cursor: canPrev ? 'pointer' : 'default', color: canPrev ? '#8e8ea0' : '#e5e7ef', display: 'flex' }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => canNext && setSelected(filtered[currentIdx + 1])}
                disabled={!canNext}
                style={{ background: 'none', border: 'none', cursor: canNext ? 'pointer' : 'default', color: canNext ? '#8e8ea0' : '#e5e7ef', display: 'flex' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Email Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              {/* Subject & Date */}
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px' }}>
                  {selected.subject || '(no subject)'}
                </h1>
                <div style={{ fontSize: 12, color: '#8e8ea0' }}>{fmtFullDate(selected.created_at)}</div>
              </div>

              {/* Sender Info */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
                padding: '14px 18px', background: '#ffffff', borderRadius: 10, border: '1px solid #e5e7ef',
              }}>
                <Avatar name={selected.lead_name || selected.to_email || '?'} size={42} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
                    {selected.lead_name || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 12, color: '#8e8ea0' }}>
                    {selected.to_email || ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(selected.status === 'draft' || selected.status === 'pending') && (
                    <button onClick={() => handleEditDraft(selected)} style={{
                      padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                      background: '#ffffff', border: '1px solid #e5e7ef',
                      color: '#8e8ea0', fontSize: 12, fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <Edit3 size={12} /> Edit
                    </button>
                  )}
                  <button onClick={() => handleDelete(selected.id)} style={{
                    background: 'none', border: 'none', cursor: 'pointer', color: '#ff5c5c', display: 'flex', padding: 6,
                  }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Auto-draft notice */}
              {selected.auto_generated && (
                <div style={{
                  padding: '10px 16px', background: 'rgba(74,108,247,0.05)', border: '1px solid rgba(74,108,247,0.12)',
                  borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Sparkles size={14} color="#4a6cf7" />
                  <span style={{ fontSize: 13, color: '#4a6cf7', fontWeight: 500 }}>
                    This message is auto-drafted from a lead submission.
                  </span>
                </div>
              )}

              {/* Email Body */}
              <div style={{
                background: '#ffffff', borderRadius: 10, border: '1px solid #e5e7ef',
                padding: '28px 28px', fontSize: 14, lineHeight: 1.8, color: '#1a1a2e',
                whiteSpace: 'pre-wrap',
              }}>
                {selected.body || selected.generated_body || '(empty)'}
              </div>

              {/* Follow-up info */}
              {selected.follow_up_date && (
                <div style={{
                  marginTop: 16, padding: '10px 16px', background: '#784bd108', border: '1px solid #784bd120',
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <Calendar size={14} color="#784bd1" />
                  <span style={{ fontSize: 13, color: '#784bd1', fontWeight: 500 }}>
                    Follow-up scheduled: {new Date(selected.follow_up_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>

            {/* Action Footer */}
            {(selected.status === 'draft' || selected.status === 'pending') && (
              <div style={{
                padding: '14px 24px', background: '#ffffff', borderTop: '1px solid #e5e7ef',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {selected.auto_generated && selected.status === 'draft' && (
                  <button onClick={() => handleApprove(selected)} style={{
                    padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                    background: '#22c55e', border: 'none', color: '#ffffff',
                    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <Check size={14} /> Approve
                  </button>
                )}
                <button onClick={() => handleSend(selected.id)} style={{
                  padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none',
                  color: '#ffffff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Send size={13} /> Send Now
                </button>
                <button onClick={() => handleEditDraft(selected)} style={{
                  padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                  background: '#ffffff', border: '1px solid #e5e7ef',
                  color: '#1a1a2e', fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Edit3 size={13} /> Edit
                </button>
                {selected.auto_generated && selected.status === 'draft' && (
                  <button onClick={() => handleDelete(selected.id)} style={{
                    padding: '9px 16px', borderRadius: 8, cursor: 'pointer',
                    background: 'none', border: '1px solid #ff5c5c40',
                    color: '#ff5c5c', fontSize: 13, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <X size={13} /> Deny
                  </button>
                )}
                <div style={{ flex: 1 }} />
              </div>
            )}
          </div>
        ) : (
          /* ── Empty State ── */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <Mail size={48} style={{ color: '#e5e7ef', marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#8e8ea0', marginBottom: 4 }}>
                Select an email to read
              </div>
              <div style={{ fontSize: 13, color: '#b0b0c0' }}>
                Or compose a new message
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
