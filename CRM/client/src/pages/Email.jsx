import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Mail, Send, FileText, Inbox, Search, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, Clock, Check, X, Edit3, Sparkles, Calendar,
  Star, Users, Ban, Flag, Reply, AlertTriangle, ChevronDown, Minimize2,
} from 'lucide-react';
import {
  getEmailQueue, updateQueueItem, deleteQueueItem, sendQueueItem,
  createQueueItem, getGmailInbox, getContacts, getLeads,
  addEmailLabel, removeEmailLabel, getGmailContacts,
} from '../api';

const TABS = [
  { key: 'inbox',  label: 'Inbox',  icon: Inbox },
  { key: 'sent',   label: 'Sent',   icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FileText },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'spam',   label: 'Spam',   icon: Ban },
];

const AVATAR_COLORS = ['#4a6cf7', '#784bd1', '#22c55e', '#f5a623', '#ff5c5c', '#00b8d4', '#e91e8c', '#ff6b35'];

const LABEL_CONFIG = {
  favorite:  { icon: Star, color: '#f5a623', label: 'Favorite' },
  'follow-up': { icon: Flag, color: '#784bd1', label: 'Follow Up' },
  important: { icon: AlertTriangle, color: '#ff5c5c', label: 'Important' },
  spam:      { icon: Ban, color: '#8e8ea0', label: 'Spam' },
};

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
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

// ── Schedule Quick Picks ────────────────────────────────────────────────────
function getScheduleOptions() {
  const now = new Date();
  const options = [];

  // Tomorrow morning 8 AM
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);
  options.push({
    label: 'Tomorrow morning',
    detail: tomorrow.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', 8:00 AM',
    value: tomorrow.toISOString(),
  });

  // This afternoon / tomorrow afternoon
  const afternoon = new Date(now);
  if (now.getHours() < 13) {
    afternoon.setHours(13, 0, 0, 0);
    options.push({
      label: 'This afternoon',
      detail: afternoon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', 1:00 PM',
      value: afternoon.toISOString(),
    });
  } else {
    afternoon.setDate(afternoon.getDate() + 1);
    afternoon.setHours(13, 0, 0, 0);
    options.push({
      label: 'Tomorrow afternoon',
      detail: afternoon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', 1:00 PM',
      value: afternoon.toISOString(),
    });
  }

  // Next Monday morning
  const monday = new Date(now);
  const daysUntilMon = ((8 - monday.getDay()) % 7) || 7;
  monday.setDate(monday.getDate() + daysUntilMon);
  monday.setHours(8, 0, 0, 0);
  options.push({
    label: 'Monday morning',
    detail: monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', 8:00 AM',
    value: monday.toISOString(),
  });

  return options;
}

function SchedulePopup({ onSelect, onPickCustom, onClose }) {
  const ref = useRef(null);
  const options = getScheduleOptions();

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
      background: '#fff', border: '1px solid #e5e7ef', borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)', width: 300, zIndex: 200,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #f0f2f8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Schedule send</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex' }}><X size={16} /></button>
      </div>
      <div style={{ fontSize: 11, color: '#8e8ea0', padding: '6px 18px 4px' }}>
        {Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ')}
      </div>
      {options.map((opt, i) => (
        <div key={i} onClick={() => { onSelect(opt.value); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '11px 18px', cursor: 'pointer', borderTop: '1px solid #f0f2f8',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
        >
          <span style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 500 }}>{opt.label}</span>
          <span style={{ fontSize: 12, color: '#8e8ea0' }}>{opt.detail}</span>
        </div>
      ))}
      <div onClick={() => { onPickCustom(); onClose(); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px',
          cursor: 'pointer', borderTop: '1px solid #f0f2f8',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
        onMouseLeave={e => e.currentTarget.style.background = '#fff'}
      >
        <Calendar size={14} color="#8e8ea0" />
        <span style={{ fontSize: 13, color: '#1a1a2e', fontWeight: 500 }}>Pick date & time</span>
      </div>
    </div>
  );
}

// ── Contact Search (CRM + Gmail contacts) ───────────────────────────────────
function ContactSearch({ value, onChange, contacts, gmailContacts }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Merge CRM + Gmail contacts, deduped by email
  const allContacts = [...contacts];
  const seen = new Set(contacts.map(c => c.email.toLowerCase()));
  (gmailContacts || []).forEach(gc => {
    if (gc.email && !seen.has(gc.email.toLowerCase())) {
      seen.add(gc.email.toLowerCase());
      allContacts.push({ name: gc.name || '', email: gc.email, _source: 'gmail', photo: gc.photo });
    }
  });

  const filtered = query.length > 0
    ? allContacts.filter(c =>
        (c.name || '').toLowerCase().includes(query.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : allContacts.slice(0, 10);

  return (
    <div ref={ref} style={{ flex: 1, position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search contacts or type email..."
        style={{ width: '100%', border: 'none', outline: 'none', fontSize: 14, color: '#1a1a2e', background: 'transparent' }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '100%', left: -20, right: -20, marginBottom: 8,
          background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: 280, overflow: 'auto',
        }}>
          {filtered.map((c, i) => (
            <div key={c.email + i} onClick={() => { onChange(c.email); setOpen(false); setQuery(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                cursor: 'pointer', borderBottom: i < filtered.length - 1 ? '1px solid #f0f2f8' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8f9fc'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              {c.photo ? (
                <img src={c.photo} style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} alt="" />
              ) : (
                <Avatar name={c.name || c.email} size={30} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.email}</div>
                <div style={{ fontSize: 11, color: '#8e8ea0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
              </div>
              <span style={{
                fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                background: c._source === 'lead' ? '#f5a62310' : c._source === 'gmail' ? '#22c55e10' : '#4a6cf710',
                color: c._source === 'lead' ? '#f5a623' : c._source === 'gmail' ? '#22c55e' : '#4a6cf7',
              }}>{c._source === 'lead' ? 'Lead' : c._source === 'gmail' ? 'Gmail' : 'Contact'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Label Button ─────────────────────────────────────────────────────────────
function LabelButton({ labelKey, active, onClick, size = 14 }) {
  const cfg = LABEL_CONFIG[labelKey];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <button
      onClick={onClick}
      title={active ? `Remove ${cfg.label}` : `Mark as ${cfg.label}`}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex',
        color: active ? cfg.color : '#d0d0d8',
        transition: 'color 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = cfg.color; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#d0d0d8'; }}
    >
      <Icon size={size} fill={active ? cfg.color : 'none'} />
    </button>
  );
}

// ── Inline Compose ──────────────────────────────────────────────────────────
function InlineCompose({ replyTo, contacts, gmailContacts, onSend, onSchedule, onSaveDraft, onDiscard, sending }) {
  const [to, setTo] = useState(replyTo?.from?.email || replyTo?.to_email || '');
  const [subject, setSubject] = useState(replyTo ? `Re: ${(replyTo.subject || '').replace(/^Re:\s*/i, '')}` : '');
  const [body, setBody] = useState('');
  const [showSchedulePopup, setShowSchedulePopup] = useState(false);
  const [customSchedule, setCustomSchedule] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.focus();
  }, []);

  const handleSend = () => {
    if (!to || !subject) return;
    onSend({ to, subject, body });
  };

  const handleScheduleSelect = (isoDate) => {
    if (!to || !subject) return;
    onSchedule({ to, subject, body, scheduleDate: isoDate });
  };

  const handleCustomSchedule = () => {
    if (!to || !subject || !customSchedule) return;
    onSchedule({ to, subject, body, scheduleDate: new Date(customSchedule).toISOString() });
  };

  return (
    <div style={{
      borderTop: '1px solid #e5e7ef', background: '#fff', borderRadius: '0 0 0 0',
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #f0f2f8', background: '#f8f9fc' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e', flex: 1 }}>
          {replyTo ? 'Reply' : 'New Message'}
        </span>
        <button onClick={onDiscard} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex', padding: 4 }}>
          <X size={14} />
        </button>
      </div>

      {/* To field */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f2f8', padding: '8px 16px' }}>
        <span style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 500, width: 50 }}>To</span>
        <ContactSearch value={to} onChange={setTo} contacts={contacts} gmailContacts={gmailContacts} />
      </div>

      {/* Subject field (hidden for replies) */}
      {!replyTo && (
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f2f8', padding: '8px 16px' }}>
          <span style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 500, width: 50 }}>Subject</span>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#1a1a2e', background: 'transparent' }} />
        </div>
      )}

      {/* Custom schedule picker */}
      {showCustomPicker && (
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #f0f2f8', padding: '8px 16px', background: '#f8f9fc', gap: 8 }}>
          <Clock size={13} color="#784bd1" />
          <input type="datetime-local" value={customSchedule} onChange={e => setCustomSchedule(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, color: '#1a1a2e', background: 'transparent' }} />
          <button onClick={handleCustomSchedule} disabled={!customSchedule || !to || !subject}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#784bd1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: !customSchedule || !to || !subject ? 0.5 : 1 }}>
            Schedule
          </button>
          <button onClick={() => { setShowCustomPicker(false); setCustomSchedule(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex', padding: 2 }}><X size={13} /></button>
        </div>
      )}

      {/* Body */}
      <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)}
        placeholder={replyTo ? 'Write your reply...' : 'Write your email...'}
        style={{
          width: '100%', minHeight: 140, maxHeight: 300, padding: '12px 16px', border: 'none',
          outline: 'none', fontSize: 13, lineHeight: 1.7, color: '#1a1a2e', resize: 'vertical',
          background: 'transparent', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
        }}
      />

      {/* Actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderTop: '1px solid #f0f2f8', position: 'relative' }}>
        {/* Send + Schedule split button */}
        <div style={{ display: 'flex', alignItems: 'stretch', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={handleSend} disabled={sending || !to || !subject}
            style={{
              padding: '7px 16px', cursor: sending ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none',
              color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
              opacity: sending || !to || !subject ? 0.5 : 1, borderRight: '1px solid rgba(255,255,255,0.2)',
            }}>
            <Send size={12} /> {sending ? 'Sending...' : 'Send'}
          </button>
          <button onClick={() => setShowSchedulePopup(!showSchedulePopup)}
            style={{
              padding: '7px 8px', cursor: 'pointer',
              background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none',
              color: '#fff', display: 'flex', alignItems: 'center',
            }}>
            <ChevronDown size={13} />
          </button>
        </div>

        {showSchedulePopup && (
          <SchedulePopup
            onSelect={handleScheduleSelect}
            onPickCustom={() => setShowCustomPicker(true)}
            onClose={() => setShowSchedulePopup(false)}
          />
        )}

        <button onClick={() => onSaveDraft({ to, subject, body })}
          style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', background: '#fff', border: '1px solid #e5e7ef', color: '#8e8ea0', fontSize: 12, fontWeight: 500 }}>
          Save Draft
        </button>

        <div style={{ flex: 1 }} />
        <button onClick={onDiscard} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex', padding: 4 }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default function EmailPage() {
  const [tab, setTab] = useState('inbox');
  const [queueEmails, setQueueEmails] = useState([]);
  const [inboxMessages, setInboxMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [allContacts, setAllContacts] = useState([]);
  const [gmailContactsList, setGmailContactsList] = useState([]);
  const [labelMenu, setLabelMenu] = useState(null);

  // Compose state
  const [composing, setComposing] = useState(false); // 'new' | 'reply' | false
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const queue = await getEmailQueue();
      setQueueEmails(Array.isArray(queue) ? queue : []);
    } catch (err) { console.error('Email queue error:', err); }

    try {
      const data = await getGmailInbox({ maxResults: '50' });
      if (data?.messages) setInboxMessages(data.messages);
    } catch (err) { /* Gmail not connected */ }

    setLoading(false);
  }, []);

  // Load CRM contacts + Gmail contacts
  useEffect(() => {
    async function loadContacts() {
      const results = [];
      try {
        const contacts = await getContacts();
        (contacts || []).forEach(c => { if (c.email) results.push({ name: c.name || '', email: c.email, _source: 'contact' }); });
      } catch {}
      try {
        const leads = await getLeads();
        (leads || []).forEach(l => { if (l.email) results.push({ name: l.name || '', email: l.email, _source: 'lead' }); });
      } catch {}
      const seen = new Set();
      setAllContacts(results.filter(c => { if (seen.has(c.email)) return false; seen.add(c.email); return true; }));

      // Load Gmail contacts
      try {
        const gc = await getGmailContacts({ pageSize: '100' });
        setGmailContactsList(gc?.contacts || []);
      } catch {}
    }
    loadContacts();
  }, []);

  useEffect(() => { load(); }, [load]);
  const handleRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  // ── Label actions ──────────────────────────────────────────────────────────
  const toggleLabel = async (msg, labelKey) => {
    const hasLabel = (msg.crmLabels || []).includes(labelKey);
    try {
      if (hasLabel) {
        await removeEmailLabel(msg.id, labelKey);
      } else {
        await addEmailLabel({
          gmail_message_id: msg.id,
          gmail_thread_id: msg.threadId || '',
          label: labelKey,
          from_email: msg.from?.email || msg.from || '',
          to_email: msg.to || '',
          subject: msg.subject || '',
          snippet: msg.snippet || '',
          date: msg.date ? new Date(msg.date).toISOString() : new Date().toISOString(),
        });
      }
      setInboxMessages(prev => prev.map(m => {
        if (m.id !== msg.id) return m;
        const labels = hasLabel
          ? (m.crmLabels || []).filter(l => l !== labelKey)
          : [...(m.crmLabels || []), labelKey];
        return { ...m, crmLabels: labels };
      }));
      if (selected?.id === msg.id) {
        setSelected(s => ({
          ...s,
          crmLabels: hasLabel
            ? (s.crmLabels || []).filter(l => l !== labelKey)
            : [...(s.crmLabels || []), labelKey],
        }));
      }
    } catch (err) { console.error('Label error:', err); }
    setLabelMenu(null);
  };

  // ── Build filtered list ────────────────────────────────────────────────────
  const contactMap = {};
  allContacts.forEach(c => { contactMap[c.email] = c; });

  let filtered = [];
  if (tab === 'inbox') {
    filtered = inboxMessages.filter(m => !(m.crmLabels || []).includes('spam')).map(m => ({ ...m, _type: 'gmail' }));
  } else if (tab === 'sent') {
    filtered = queueEmails.filter(e => e.status === 'sent').map(e => ({ ...e, _type: 'queue' }));
  } else if (tab === 'drafts') {
    filtered = queueEmails.filter(e => e.status === 'draft' || e.status === 'pending').map(e => ({ ...e, _type: 'queue' }));
  } else if (tab === 'starred') {
    filtered = inboxMessages.filter(m => (m.crmLabels || []).some(l => l === 'favorite' || l === 'follow-up' || l === 'important')).map(m => ({ ...m, _type: 'gmail' }));
  } else if (tab === 'spam') {
    filtered = inboxMessages.filter(m => (m.crmLabels || []).includes('spam')).map(m => ({ ...m, _type: 'gmail' }));
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e => {
      const name = e._type === 'gmail' ? (e.from?.name || e.from?.email || '') : (e.lead_name || e.to_email || '');
      return name.toLowerCase().includes(q) || (e.subject || '').toLowerCase().includes(q) || (e.to_email || e.to || '').toLowerCase().includes(q);
    });
  }

  const autoDraftCount = queueEmails.filter(e => e.status === 'draft' && e.auto_generated).length;
  const inboxCount = inboxMessages.filter(m => !(m.crmLabels || []).includes('spam')).length;

  // ── Queue email handlers ───────────────────────────────────────────────────
  const handleSend = async (id) => { try { await sendQueueItem(id); await load(); setSelected(null); } catch (err) { alert('Send failed: ' + err.message); } };
  const handleDelete = async (id) => { try { await deleteQueueItem(id); await load(); if (selected?.id === id) setSelected(null); } catch (err) { alert('Delete failed: ' + err.message); } };
  const handleApprove = async (email) => { try { await updateQueueItem(email.id, { status: 'pending' }); await load(); } catch (err) { alert('Approve failed: ' + err.message); } };

  const handleCompose = () => { setComposing('new'); setSelected(null); };
  const handleReply = () => { setComposing('reply'); };

  const handleEditDraft = (email) => {
    setComposing('new'); setSelected(null);
    // We'll handle this differently — set selected to the draft so InlineCompose uses it
  };

  // Inline compose handlers
  const handleInlineSend = async ({ to, subject, body }) => {
    if (!to || !subject) return;
    setSending(true);
    try {
      const created = await createQueueItem({ to_email: to, subject, body, status: 'draft' });
      await sendQueueItem(created.id);
      setComposing(false);
      await load();
    } catch (err) { alert('Send failed: ' + err.message); } finally { setSending(false); }
  };

  const handleInlineSchedule = async ({ to, subject, body, scheduleDate }) => {
    if (!to || !subject || !scheduleDate) return;
    setSending(true);
    try {
      await createQueueItem({ to_email: to, subject, body, status: 'draft', follow_up_date: scheduleDate });
      setComposing(false);
      await load();
    } catch (err) { alert('Schedule failed: ' + err.message); } finally { setSending(false); }
  };

  const handleInlineSaveDraft = async ({ to, subject, body }) => {
    if (!to && !subject && !body) return;
    try {
      await createQueueItem({ to_email: to, subject, body, status: 'draft' });
      setComposing(false);
      await load();
    } catch (err) { alert('Save failed: ' + err.message); }
  };

  // ── Helpers for display ────────────────────────────────────────────────────
  function getEmailName(email) {
    if (email._type === 'gmail') {
      const contact = contactMap[email.from?.email];
      return contact?.name || email.from?.name || email.from?.email || 'Unknown';
    }
    return email.lead_name || email.to_email || 'Unknown';
  }

  function getEmailDate(email) {
    if (email._type === 'gmail') return email.date || '';
    return email.created_at || '';
  }

  function getEmailPreview(email) {
    if (email._type === 'gmail') return email.snippet || '';
    return (email.body || email.generated_body || '').slice(0, 100);
  }

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
        <div style={{ padding: '16px 14px 12px' }}>
          <button onClick={handleCompose} style={{
            width: '100%', padding: '10px 0', borderRadius: 10, cursor: 'pointer',
            background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none',
            color: '#ffffff', fontSize: 13, fontWeight: 600, display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Edit3 size={14} /> Compose
          </button>
        </div>

        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#b0b0c0' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, fontSize: 12, background: '#f5f7fa', border: '1px solid #e5e7ef', color: '#1a1a2e', outline: 'none' }} />
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {TABS.map(t => {
            const isActive = tab === t.key;
            let count = 0;
            if (t.key === 'drafts') count = autoDraftCount;
            if (t.key === 'inbox') count = inboxCount;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setSelected(null); setComposing(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                  background: isActive ? 'rgba(74,108,247,0.08)' : 'transparent',
                  color: isActive ? '#4a6cf7' : '#5a5a6e',
                  borderLeft: isActive ? '3px solid #4a6cf7' : '3px solid transparent',
                }}>
                <t.icon size={16} />
                {t.label}
                {count > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: t.key === 'drafts' ? '#ff5c5c' : '#4a6cf7', color: '#fff',
                    borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
                  }}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

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
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', flex: 1 }}>
            {TABS.find(t => t.key === tab)?.label || 'Email'}
          </span>
          <span style={{ fontSize: 12, color: '#8e8ea0' }}>{filtered.length}</span>
        </div>

        {tab === 'drafts' && autoDraftCount > 0 && (
          <div style={{ padding: '8px 18px', background: 'rgba(74,108,247,0.04)', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <Sparkles size={12} color="#4a6cf7" />
            <span style={{ color: '#4a6cf7', fontWeight: 500 }}>{autoDraftCount} auto-drafted — review & approve</span>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#8e8ea0', fontSize: 13 }}>Loading...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Mail size={32} style={{ color: '#e5e7ef', margin: '0 auto 10px' }} />
              <div style={{ color: '#8e8ea0', fontSize: 13 }}>
                {tab === 'spam' ? 'No spam' : tab === 'starred' ? 'No labeled emails' : 'No emails'}
              </div>
            </div>
          ) : (
            filtered.map(email => {
              const isSelected = selected?.id === email.id;
              const name = getEmailName(email);
              const isGmail = email._type === 'gmail';
              const crmLabels = email.crmLabels || [];
              const isFav = crmLabels.includes('favorite');
              const isSpam = crmLabels.includes('spam');
              const crmContact = isGmail ? contactMap[email.from?.email] : null;

              return (
                <div key={email.id} onClick={() => { setSelected(email); setComposing(false); setLabelMenu(null); }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 18px', cursor: 'pointer',
                    borderBottom: '1px solid #f0f2f8',
                    background: isSelected ? 'rgba(74,108,247,0.06)' : '#fff',
                    borderLeft: isSelected ? '3px solid #4a6cf7' : '3px solid transparent',
                    transition: 'background 0.1s',
                    opacity: isSpam && tab !== 'spam' ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8f9fc'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'rgba(74,108,247,0.06)' : '#fff'; }}
                >
                  <Avatar name={name} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                        {crmContact && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#4a6cf710', color: '#4a6cf7', fontWeight: 600, flexShrink: 0 }}>
                            {crmContact._source === 'lead' ? 'Lead' : 'CRM'}
                          </span>
                        )}
                        {email.isReply && <Reply size={11} color="#4a6cf7" style={{ flexShrink: 0 }} />}
                      </div>
                      <span style={{ fontSize: 10, color: '#8e8ea0', flexShrink: 0, marginLeft: 6 }}>
                        {timeAgo(getEmailDate(email))}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                      {email.subject || '(no subject)'}
                    </div>
                    <div style={{ fontSize: 11, color: '#8e8ea0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getEmailPreview(email)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      {isGmail && (
                        <LabelButton labelKey="favorite" active={isFav} onClick={e => { e.stopPropagation(); toggleLabel(email, 'favorite'); }} size={12} />
                      )}
                      {crmLabels.filter(l => l !== 'spam' && l !== 'favorite').map(l => {
                        const cfg = LABEL_CONFIG[l];
                        return cfg ? (
                          <span key={l} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: cfg.color + '15', color: cfg.color, fontWeight: 600 }}>
                            {cfg.label}
                          </span>
                        ) : null;
                      })}
                      {email.auto_generated && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#4a6cf710', color: '#4a6cf7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Sparkles size={8} /> Auto
                        </span>
                      )}
                      {email.follow_up_date && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#784bd110', color: '#784bd1', fontWeight: 600 }}>
                          {new Date(email.follow_up_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
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

      {/* ── Right Panel ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f5f7fa', minWidth: 0 }}>

        {/* New compose (no email selected) */}
        {composing === 'new' && !selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', background: '#ffffff', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>New Email</h2>
              <button onClick={() => setComposing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}><X size={18} /></button>
            </div>
            <div style={{ flex: 1 }} />
            <InlineCompose
              contacts={allContacts}
              gmailContacts={gmailContactsList}
              onSend={handleInlineSend}
              onSchedule={handleInlineSchedule}
              onSaveDraft={handleInlineSaveDraft}
              onDiscard={() => setComposing(false)}
              sending={sending}
            />
          </div>
        ) : selected ? (
          /* ── Email Detail with inline reply ── */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '12px 24px', background: '#ffffff', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex' }}><ChevronLeft size={18} /></button>
              <div style={{ flex: 1 }} />

              {selected._type === 'gmail' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8 }}>
                  {['favorite', 'follow-up', 'important'].map(lbl => (
                    <LabelButton key={lbl} labelKey={lbl} active={(selected.crmLabels || []).includes(lbl)} onClick={() => toggleLabel(selected, lbl)} size={16} />
                  ))}
                  <button onClick={() => toggleLabel(selected, 'spam')}
                    title={(selected.crmLabels || []).includes('spam') ? 'Remove from spam' : 'Mark as spam'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: (selected.crmLabels || []).includes('spam') ? '#ff5c5c' : '#d0d0d8', display: 'flex' }}>
                    <Ban size={16} />
                  </button>
                </div>
              )}

              <span style={{ fontSize: 12, color: '#8e8ea0' }}>{currentIdx + 1} of {filtered.length}</span>
              <button onClick={() => canPrev && setSelected(filtered[currentIdx - 1])} disabled={!canPrev}
                style={{ background: 'none', border: 'none', cursor: canPrev ? 'pointer' : 'default', color: canPrev ? '#8e8ea0' : '#e5e7ef', display: 'flex' }}><ChevronLeft size={16} /></button>
              <button onClick={() => canNext && setSelected(filtered[currentIdx + 1])} disabled={!canNext}
                style={{ background: 'none', border: 'none', cursor: canNext ? 'pointer' : 'default', color: canNext ? '#8e8ea0' : '#e5e7ef', display: 'flex' }}><ChevronRight size={16} /></button>
            </div>

            {/* Scrollable content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
              <div style={{ marginBottom: 20 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', margin: '0 0 6px' }}>{selected.subject || '(no subject)'}</h1>
                <div style={{ fontSize: 12, color: '#8e8ea0' }}>{fmtFullDate(getEmailDate(selected))}</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '14px 18px', background: '#ffffff', borderRadius: 10, border: '1px solid #e5e7ef' }}>
                <Avatar name={getEmailName(selected)} size={42} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{getEmailName(selected)}</div>
                  <div style={{ fontSize: 12, color: '#8e8ea0' }}>
                    {selected._type === 'gmail' ? (selected.from?.email || '') : (selected.to_email || '')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(selected.crmLabels || []).filter(l => l !== 'spam').map(l => {
                    const cfg = LABEL_CONFIG[l];
                    return cfg ? (
                      <span key={l} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, background: cfg.color + '15', color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                    ) : null;
                  })}
                </div>
                {(selected.status === 'draft' || selected.status === 'pending') && (
                  <button onClick={() => handleEditDraft(selected)} style={{ padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: '#fff', border: '1px solid #e5e7ef', color: '#8e8ea0', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Edit3 size={12} /> Edit
                  </button>
                )}
                {selected._type === 'queue' && (
                  <button onClick={() => handleDelete(selected.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff5c5c', display: 'flex', padding: 6 }}><Trash2 size={15} /></button>
                )}
              </div>

              {selected.isReply && (
                <div style={{ padding: '8px 14px', background: '#4a6cf708', border: '1px solid #4a6cf715', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Reply size={13} color="#4a6cf7" />
                  <span style={{ fontSize: 12, color: '#4a6cf7', fontWeight: 500 }}>This is a reply to one of your emails</span>
                </div>
              )}

              {selected.auto_generated && (
                <div style={{ padding: '10px 16px', background: 'rgba(74,108,247,0.05)', border: '1px solid rgba(74,108,247,0.12)', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={14} color="#4a6cf7" />
                  <span style={{ fontSize: 13, color: '#4a6cf7', fontWeight: 500 }}>Auto-drafted from a lead submission.</span>
                </div>
              )}

              <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #e5e7ef', padding: '28px', fontSize: 14, lineHeight: 1.8, color: '#1a1a2e', whiteSpace: 'pre-wrap' }}>
                {selected.body || selected.generated_body || selected.snippet || '(empty)'}
              </div>

              {selected.follow_up_date && (
                <div style={{ marginTop: 16, padding: '10px 16px', background: '#784bd108', border: '1px solid #784bd120', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={14} color="#784bd1" />
                  <span style={{ fontSize: 13, color: '#784bd1', fontWeight: 500 }}>
                    Scheduled: {new Date(selected.follow_up_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>

            {/* Footer: draft actions OR reply inline */}
            {(selected.status === 'draft' || selected.status === 'pending') ? (
              <div style={{ padding: '14px 24px', background: '#ffffff', borderTop: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 10 }}>
                {selected.auto_generated && selected.status === 'draft' && (
                  <button onClick={() => handleApprove(selected)} style={{ padding: '9px 18px', borderRadius: 8, cursor: 'pointer', background: '#22c55e', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={14} /> Approve
                  </button>
                )}
                <button onClick={() => handleSend(selected.id)} style={{ padding: '9px 18px', borderRadius: 8, cursor: 'pointer', background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Send size={13} /> Send Now
                </button>
                <button onClick={() => handleEditDraft(selected)} style={{ padding: '9px 16px', borderRadius: 8, cursor: 'pointer', background: '#fff', border: '1px solid #e5e7ef', color: '#1a1a2e', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Edit3 size={13} /> Edit
                </button>
                {selected.auto_generated && selected.status === 'draft' && (
                  <button onClick={() => handleDelete(selected.id)} style={{ padding: '9px 16px', borderRadius: 8, cursor: 'pointer', background: 'none', border: '1px solid #ff5c5c40', color: '#ff5c5c', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <X size={13} /> Deny
                  </button>
                )}
              </div>
            ) : composing === 'reply' ? (
              <InlineCompose
                replyTo={selected}
                contacts={allContacts}
                gmailContacts={gmailContactsList}
                onSend={handleInlineSend}
                onSchedule={handleInlineSchedule}
                onSaveDraft={handleInlineSaveDraft}
                onDiscard={() => setComposing(false)}
                sending={sending}
              />
            ) : (
              /* Reply button bar */
              <div style={{ padding: '12px 24px', background: '#ffffff', borderTop: '1px solid #e5e7ef' }}>
                <button onClick={handleReply} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                  background: '#f8f9fc', border: '1px solid #e5e7ef', color: '#8e8ea0',
                  fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a6cf7'; e.currentTarget.style.color = '#4a6cf7'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7ef'; e.currentTarget.style.color = '#8e8ea0'; }}
                >
                  <Reply size={14} /> Click here to reply...
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ── Empty ── */
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <Mail size={48} style={{ color: '#e5e7ef', marginBottom: 16 }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: '#8e8ea0', marginBottom: 4 }}>Select an email to read</div>
              <div style={{ fontSize: 13, color: '#b0b0c0' }}>Or compose a new message</div>
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
