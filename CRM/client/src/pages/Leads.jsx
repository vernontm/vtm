import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, ChevronDown, ChevronRight, ChevronLeft, Trash2, UserPlus, Mail, Phone, Upload, Eye, X, Globe, AtSign, Check, PhoneCall, ThumbsUp, ThumbsDown, ScrollText, Copy, CheckCheck, Calendar } from 'lucide-react';
import { getLeads, createLead, updateLead, deleteLead, convertLead } from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';
import BulkImport from '../components/BulkImport';

const LEAD_STATUSES = ['Cold', 'Warm', 'Hot', 'Unqualified'];
const LEAD_SOURCES = ['', 'Website', 'Referral', 'Cold Outreach', 'LinkedIn', 'Email Campaign', 'Social Media', 'Other'];
const ACTIVITY_COLORS = ['#c8f135', '#c8f135', '#fdab3d', '#784bd1', '#ff5c5c'];

function ActivityBar({ id }) {
  const blocks = useMemo(() => {
    const seed = id ? id.charCodeAt(0) + id.charCodeAt(1) : 3;
    return Array.from({ length: seed % 4 + 1 }, (_, i) => ACTIVITY_COLORS[(seed + i) % ACTIVITY_COLORS.length]);
  }, [id]);
  return <div className="activity-bar">{blocks.map((c, i) => <div key={i} className="activity-block" style={{ background: c }} />)}</div>;
}

const EMPTY = { name: '', status: 'Cold', company: '', title: '', email: '', phone: '', lead_source: '', notes: '' };
const gmailLink = (email) => `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}`;

// ── Phone Script Modal ────────────────────────────────────────────────────────
function PhoneScriptModal({ leads, index, onNavigate, onClose, onInterest, onSchedule, onNoAnswer }) {
  const [copied,       setCopied]       = useState(false);
  const [copiedPhone,  setCopiedPhone]  = useState(false);

  const lead    = leads[index] || {};
  const bizName = lead.name || 'there';
  const niche   = lead.company || lead.name || 'your type of business';
  const total   = leads.length;

  const script = `Hey, is this ${bizName}? Hey, my name is Ray, I'm calling from Vernon Tech. I'll be quick, I promise.

The reason I'm reaching out is, I saw that you didn't have a website. I actually went ahead and built a demo landing page for your business.

Right now a lot of people are searching for ${niche} in your area and if you don't have something clean and professional out there, those customers are going somewhere else.

Are you open to hopping on a quick 15-minute call so I can walk you through how you'll be able to get more traffic and customers?`;

  const handleCopy = () => {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyPhone = () => {
    if (!lead.phone) return;
    navigator.clipboard.writeText(lead.phone).then(() => {
      setCopiedPhone(true);
      setTimeout(() => setCopiedPhone(false), 2000);
    });
  };

  // Reset states when lead changes
  useEffect(() => { setCopied(false); setCopiedPhone(false); }, [index]);

  // Keyboard arrow navigation
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft'  && index > 0)          { e.preventDefault(); onNavigate(index - 1); }
      if (e.key === 'ArrowRight' && index < total - 1)  { e.preventDefault(); onNavigate(index + 1); }
      if (e.key === 'Escape')                           { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, total]);

  const escapeRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const highlightRE = new RegExp(`(${escapeRE(bizName)}${niche !== bizName ? '|' + escapeRE(niche) : ''})`, 'g');

  const navBtnStyle = (disabled) => ({
    background: disabled ? 'none' : 'rgba(200,241,53,0.08)',
    border: '1px solid', borderColor: disabled ? '#1c1c1a' : 'rgba(200,241,53,0.25)',
    borderRadius: 6, padding: '5px 8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? '#2a2a28' : '#c8f135',
    display: 'flex', alignItems: 'center', transition: 'all 0.15s',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <div style={{ background: '#161614', border: '1px solid #252523', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #252523', background: '#111110' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(200,241,53,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ScrollText size={15} color="#c8f135" />
              </div>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 14, fontWeight: 700, color: '#e8e6df' }}>Phone Script</div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#7a7870', marginTop: 1 }}>{lead.name}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#4a4845', marginRight: 4 }}>
                {index + 1} / {total}
              </span>
              <button onClick={() => onNavigate(index - 1)} disabled={index === 0} style={navBtnStyle(index === 0)} title="Previous (←)">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => onNavigate(index + 1)} disabled={index === total - 1} style={navBtnStyle(index === total - 1)} title="Next (→)">
                <ChevronRight size={14} />
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', padding: 4, marginLeft: 4 }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Phone number bar */}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            {lead.phone ? (
              <>
                <a
                  href={`tel:${lead.phone}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(200,241,53,0.08)', border: '1px solid rgba(200,241,53,0.2)', borderRadius: 8, padding: '7px 14px', color: '#c8f135', textDecoration: 'none', fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, flex: 1 }}
                >
                  <Phone size={13} /> {lead.phone}
                </a>
                <button
                  onClick={handleCopyPhone}
                  title="Copy number"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: copiedPhone ? 'rgba(200,241,53,0.15)' : '#1c1c1a', border: '1px solid', borderColor: copiedPhone ? 'rgba(200,241,53,0.4)' : '#252523', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', color: copiedPhone ? '#c8f135' : '#7a7870', fontFamily: 'DM Mono, monospace', fontSize: 11, transition: 'all 0.2s' }}
                >
                  {copiedPhone ? <><CheckCheck size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#4a4845' }}>
                <Phone size={12} /> No phone number on file
              </div>
            )}
          </div>
        </div>

        {/* Script body */}
        <div style={{ padding: '20px 22px' }}>
          {script.split('\n\n').map((para, i) => (
            <p key={i} style={{ fontSize: 14, lineHeight: 1.75, color: '#e8e6df', margin: 0, marginBottom: i < 3 ? 16 : 0 }}>
              {para.split(highlightRE).map((chunk, j) =>
                chunk === bizName || chunk === niche
                  ? <span key={j} style={{ color: '#c8f135', fontWeight: 700, fontFamily: 'Syne, sans-serif' }}>{chunk}</span>
                  : chunk
              )}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 7, background: copied ? 'rgba(200,241,53,0.15)' : '#c8f135', color: copied ? '#c8f135' : '#0a0a08', border: copied ? '1px solid rgba(200,241,53,0.4)' : 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'Syne, sans-serif', transition: 'all 0.2s' }}
          >
            {copied ? <><CheckCheck size={14} /> Copied!</> : <><Copy size={14} /> Copy Script</>}
          </button>

          {/* Interest buttons — each saves + advances to next lead */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
            <button
              title="Interested → next"
              onClick={() => { onInterest(lead.id, 'up'); if (index < total - 1) onNavigate(index + 1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: lead.interest === 'up' ? 'rgba(200,241,53,0.15)' : '#1c1c1a', border: '1px solid', borderColor: lead.interest === 'up' ? 'rgba(200,241,53,0.4)' : '#252523', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: lead.interest === 'up' ? '#c8f135' : '#4a4845', fontSize: 12, transition: 'all 0.15s' }}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              title="Not interested → next"
              onClick={() => { onInterest(lead.id, 'down'); if (index < total - 1) onNavigate(index + 1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: lead.interest === 'down' ? 'rgba(255,92,92,0.15)' : '#1c1c1a', border: '1px solid', borderColor: lead.interest === 'down' ? 'rgba(255,92,92,0.4)' : '#252523', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', color: lead.interest === 'down' ? '#ff5c5c' : '#4a4845', fontSize: 12, transition: 'all 0.15s' }}
            >
              <ThumbsDown size={14} />
            </button>
            <button
              title="No answer → mark Unqualified + next"
              onClick={() => { if (onNoAnswer) onNoAnswer(lead); if (index < total - 1) onNavigate(index + 1); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1c1c1a', border: '1px solid #252523', borderRadius: 8, padding: '8px 12px', cursor: index < total - 1 ? 'pointer' : 'not-allowed', color: '#7a7870', fontSize: 12, fontFamily: 'DM Mono, monospace', transition: 'all 0.15s', opacity: index < total - 1 ? 1 : 0.4 }}
              onMouseEnter={e => { if (index < total - 1) { e.currentTarget.style.borderColor = '#7a7870'; e.currentTarget.style.color = '#e8e6df'; } }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#252523'; e.currentTarget.style.color = '#7a7870'; }}
            >
              <PhoneCall size={13} /> No Answer
            </button>
          </div>

          <button
            title="Schedule demo call"
            onClick={() => onSchedule && onSchedule(lead)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#111328', border: '1px solid #5b9cf630', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', color: '#5b9cf6', fontSize: 12, fontWeight: 600, fontFamily: 'Syne, sans-serif', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#5b9cf620'; e.currentTarget.style.borderColor = '#5b9cf660'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#111328'; e.currentTarget.style.borderColor = '#5b9cf630'; }}
          >
            <Calendar size={13} /> Schedule Demo
          </button>

          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #252523', color: '#7a7870', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontSize: 13 }}
          >
            Close
          </button>
          <span style={{ marginLeft: 'auto', fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#2a2a28' }}>← → to cycle</span>
        </div>
      </div>
    </div>
  );
}

// ── Survey Detail / Edit Panel ────────────────────────────────────────────────
const LONG_FIELDS = new Set([
  'current_situation','why_now','skills_story','previous_attempts',
  'biggest_fear','biggest_wish','notes',
]);

const DETAIL_SECTIONS = [
  {
    title: 'Contact Info',
    fields: [
      { key: 'name',          label: 'Name' },
      { key: 'email',         label: 'Email' },
      { key: 'phone',         label: 'Phone' },
      { key: 'location',      label: 'Location' },
      { key: 'tiktok_handle', label: 'TikTok Handle' },
      { key: 'website',       label: 'Website' },
      { key: 'social_media',  label: 'Social Media' },
    ],
  },
  {
    title: 'Business Profile',
    fields: [
      { key: 'has_business',   label: 'Has Business?' },
      { key: 'budget',         label: 'Budget' },
      { key: 'time_available', label: 'Time Available' },
      { key: 'financial_goal', label: 'Financial Goal' },
      { key: 'lead_source',    label: 'Traffic Source' },
      { key: 'submission_date',label: 'Submission Date' },
    ],
  },
  {
    title: 'Survey Responses',
    fields: [
      { key: 'current_situation', label: 'Current Situation' },
      { key: 'why_now',           label: 'Why Now?' },
      { key: 'skills_story',      label: 'Skills & Story' },
      { key: 'previous_attempts', label: 'Previous Attempts' },
      { key: 'biggest_fear',      label: 'Biggest Fear' },
      { key: 'biggest_wish',      label: 'Biggest Wish' },
    ],
  },
  {
    title: 'Preferences',
    fields: [
      { key: 'tech_comfort',       label: 'Tech Comfort' },
      { key: 'content_preference', label: 'Content Preference' },
      { key: 'work_style',         label: 'Work Style' },
    ],
  },
  {
    title: 'Notes',
    fields: [{ key: 'notes', label: 'Additional Info' }],
  },
];

const inputStyle = {
  width: '100%', padding: '6px 9px', borderRadius: 5, fontSize: 12,
  color: '#7a7870', background: '#111328', border: '1px solid #252523',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function EditableField({ fieldKey, value, onChange }) {
  if (LONG_FIELDS.has(fieldKey)) {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
      />
    );
  }
  return (
    <input
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={inputStyle}
    />
  );
}

function LeadDetailPanel({ lead, onClose, onFieldSave, onSaveAll, statuses }) {
  const [draft, setDraft]   = useState({ ...lead });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  // Keep draft in sync when the parent lead object changes (e.g. after status badge auto-save)
  useEffect(() => { setDraft(d => ({ ...d, ...lead })); }, [lead]);

  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }));

  // Detect changes to any text-editable fields
  const editableKeys = DETAIL_SECTIONS.flatMap(s => s.fields.map(f => f.key));
  const isDirty = editableKeys.some(k => draft[k] !== lead[k]);

  async function handleSaveAll() {
    setSaving(true);
    try {
      const updates = {};
      editableKeys.forEach(k => { if (draft[k] !== lead[k]) updates[k] = draft[k]; });
      if (Object.keys(updates).length > 0) await onSaveAll(lead.id, updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  // Immediate-save: status badge
  const handleStatus = (s) => { set('status', s); onFieldSave(lead.id, 'status', s); };

  // Immediate-save: call completed toggle
  const handleCallToggle = async () => {
    const next = !draft.call_completed;
    set('call_completed', next);
    await onFieldSave(lead.id, 'call_completed', next);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 540, background: '#161614',
        borderLeft: '1px solid #252523', overflowY: 'auto',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #252523', position: 'sticky', top: 0, background: '#161614', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4a4845', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Edit Lead
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusBadge status={draft.status} options={statuses} onChange={handleStatus} />

                {/* Call Completed toggle */}
                <button
                  onClick={handleCallToggle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 11px', borderRadius: 12, cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, border: 'none',
                    background: draft.call_completed ? '#c8f13525' : '#25252340',
                    color: draft.call_completed ? '#c8f135' : '#4a4845',
                    transition: 'all 0.15s',
                  }}
                  title={draft.call_completed ? 'Click to unmark call' : 'Mark call as completed'}
                >
                  {draft.call_completed
                    ? <><Check size={11} /> Call Completed</>
                    : <><PhoneCall size={11} /> Call Pending</>
                  }
                </button>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', padding: 4, flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Editable sections ───────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>
          {DETAIL_SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#4a4845', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.fields.map(({ key, label }) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, color: '#4a4845', paddingTop: 8 }}>{label}</span>
                    <EditableField fieldKey={key} value={draft[key]} onChange={val => set(key, val)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Sticky save bar ─────────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', bottom: 0, padding: '12px 24px',
          background: '#161614', borderTop: '1px solid #252523',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button
            onClick={handleSaveAll}
            disabled={saving || !isDirty}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 6, cursor: isDirty ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700, border: 'none',
              background: isDirty ? '#c8f135' : '#252523',
              color: isDirty ? '#fff' : '#4a4845',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? 'Saving…' : saved ? <><Check size={14} /> Saved!</> : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: 'none', border: '1px solid #252523', color: '#4a4845' }}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Truncate helper ───────────────────────────────────────────────────────────
function Trunc({ value, max = 22 }) {
  if (!value) return <span style={{ color: '#252523' }}>—</span>;
  return (
    <span title={value} style={{ fontSize: 12, color: '#7a7870' }}>
      {value.length > max ? value.slice(0, max) + '…' : value}
    </span>
  );
}

export default function Leads() {
  const [searchParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [collapsed, setCollapsed] = useState({});
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [detailLead, setDetailLead] = useState(null);
  const [scheduleLead,  setScheduleLead]  = useState(null);
  const [scriptIdx,  setScriptIdx]  = useState(null);
  const [sort,        setSort]        = useState('newest');

  const load = async () => {
    try {
      const leadsData = await getLeads();
      setLeads(leadsData.filter(l => !l.archived));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    leads.filter(l => !search ||
      l.name?.toLowerCase().includes(search.toLowerCase()) ||
      (l.company || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (l.location || '').toLowerCase().includes(search.toLowerCase())),
    [leads, search]
  );

  const groups = useMemo(() => {
    const g = {};
    LEAD_STATUSES.forEach(s => { g[s] = []; });
    filtered.forEach(l => { (g[l.status] = g[l.status] || []).push(l); });
    const sortFn = sort === 'newest'  ? (a, b) => (b.created_at || '').localeCompare(a.created_at || '') :
                   sort === 'oldest'  ? (a, b) => (a.created_at || '').localeCompare(b.created_at || '') :
                   sort === 'name_az' ? (a, b) => (a.name || '').localeCompare(b.name || '') :
                   sort === 'name_za' ? (a, b) => (b.name || '').localeCompare(a.name || '') : null;
    return Object.entries(g)
      .filter(([, items]) => items.length > 0)
      .map(([status, items]) => [status, sortFn ? [...items].sort(sortFn) : items]);
  }, [filtered, sort]);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const selectedItems = leads.filter(l => selectedIds.has(l.id));

  const handleFieldSave = async (id, field, value) => {
    try {
      await updateLead(id, { [field]: value });
      setLeads(ls => ls.map(l => l.id === id ? { ...l, [field]: value } : l));
      if (detailLead?.id === id) setDetailLead(d => ({ ...d, [field]: value }));
    } catch (e) { console.error(e); }
  };

  const handleSaveAllFields = async (id, updates) => {
    try {
      await updateLead(id, updates);
      setLeads(ls => ls.map(l => l.id === id ? { ...l, ...updates } : l));
      if (detailLead?.id === id) setDetailLead(d => ({ ...d, ...updates }));
    } catch (e) { console.error(e); }
  };

  const handleStatusChange = async (lead, status) => {
    try {
      await updateLead(lead.id, { status });
      setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, status } : l));
    } catch (e) { alert(e.message); }
  };

  const openAdd    = () => { setForm(EMPTY); setModal('add'); };
  const openDelete = (l) => { setSelected(l); setModal('delete'); };
  const openConvert = (l) => { setSelected(l); setModal('convert'); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try { await createLead(form); await load(); setModal(null); } catch (e) { alert(e.message); }
  };
  const handleDelete = async () => {
    try { await deleteLead(selected.id); await load(); setModal(null); } catch (e) { alert(e.message); }
  };
  const handleConvert = async () => {
    try { await convertLead(selected.id); await load(); setModal(null); } catch (e) { alert(e.message); }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    try { await Promise.all([...selectedIds].map(id => deleteLead(id))); setLeads(ls => ls.filter(l => !selectedIds.has(l.id))); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkArchive = async () => {
    try { await Promise.all([...selectedIds].map(id => updateLead(id, { archived: true }))); setLeads(ls => ls.filter(l => !selectedIds.has(l.id))); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkDuplicate = async () => {
    try { const items = leads.filter(l => selectedIds.has(l.id)); await Promise.all(items.map(({ id, created_at, updated_at, ...rest }) => createLead({ ...rest, name: `${rest.name} (copy)` }))); await load(); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkConvert = async () => {
    try { await Promise.all([...selectedIds].map(id => convertLead(id))); await load(); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkMoveTo = async (status) => {
    try { await Promise.all([...selectedIds].map(id => updateLead(id, { status }))); setLeads(ls => ls.map(l => selectedIds.has(l.id) ? { ...l, status } : l)); clearSelection(); } catch (e) { console.error(e); }
  };

  const COL_COUNT = 16; // checkbox, Lead, Status, Interest, Call, Action, Email, Phone, Location, Budget, Has Business, Financial Goal, Time Available, TikTok, Source, Actions

  return (
    <div style={{ minHeight: '100%', background: '#0a0a08' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="page-title">Leads</div>
          <button
            onClick={() => filtered.length > 0 && setScriptIdx(0)}
            disabled={filtered.length === 0}
            title="Open phone script"
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(200,241,53,0.10)', border: '1px solid rgba(200,241,53,0.3)', color: '#c8f135', borderRadius: 7, padding: '6px 12px', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'DM Mono, monospace', fontSize: 11, transition: 'all 0.15s', opacity: filtered.length === 0 ? 0.4 : 1 }}
            onMouseEnter={e => { if (filtered.length > 0) e.currentTarget.style.background = 'rgba(200,241,53,0.20)'; }}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(200,241,53,0.10)'}
          >
            <ScrollText size={13} /> Phone Script
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#4a4845' }} />
            <input className="search-input" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{ background: '#161614', border: '1px solid #252523', color: '#7a7870', borderRadius: 6, fontSize: 12, padding: '6px 10px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name_az">Name A→Z</option>
            <option value="name_za">Name Z→A</option>
          </select>
          <button className="btn-ghost" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#7a7870', border: '1px solid #252523', padding: '6px 12px', borderRadius: 6, fontSize: 13 }}>
            <Upload size={14} /> Import
          </button>
          <button className="btn-primary" onClick={openAdd}><Plus size={16} /> New Lead</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ minWidth: 180 }}>Lead</th>
              <th style={{ minWidth: 130 }}>Status</th>
              <th style={{ minWidth: 90 }}>Interest</th>
              <th style={{ minWidth: 110 }}>Call</th>
              <th style={{ minWidth: 140 }}>Action</th>
              <th style={{ minWidth: 155 }}>Email</th>
              <th style={{ minWidth: 120 }}>Phone</th>
              <th style={{ minWidth: 120 }}>Location</th>
              <th style={{ minWidth: 110 }}>Budget</th>
              <th style={{ minWidth: 120 }}>Has Business?</th>
              <th style={{ minWidth: 150 }}>Financial Goal</th>
              <th style={{ minWidth: 140 }}>Time Available</th>
              <th style={{ minWidth: 120 }}>TikTok</th>
              <th style={{ minWidth: 120 }}>Source</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COL_COUNT} style={{ textAlign: 'center', color: '#4a4845', padding: 40 }}>Loading...</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={COL_COUNT} style={{ textAlign: 'center', color: '#4a4845', padding: 40 }}>No leads yet. Click "New Lead" to add one.</td></tr>
            ) : groups.map(([status, items]) => (
              <React.Fragment key={status}>
                <tr>
                  <td colSpan={COL_COUNT} style={{ padding: 0, background: '#161614' }}>
                    <div className="group-header" onClick={() => setCollapsed(c => ({ ...c, [status]: !c[status] }))}>
                      {collapsed[status] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <span style={{ color: '#e8e6df' }}>{status}</span>
                      <span style={{ background: '#252523', borderRadius: 12, padding: '1px 8px', fontSize: 12, color: '#7a7870' }}>{items.length}</span>
                    </div>
                  </td>
                </tr>
                {!collapsed[status] && items.map(lead => (
                  <tr key={lead.id} style={{ background: selectedIds.has(lead.id) ? '#252060' : undefined }}>
                    <td>
                      <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      <InlineEdit value={lead.name} onSave={val => handleFieldSave(lead.id, 'name', val)} placeholder="Name" />
                    </td>
                    <td>
                      <StatusBadge status={lead.status} options={LEAD_STATUSES} onChange={s => handleStatusChange(lead, s)} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          title="Interested"
                          onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'up' ? null : 'up')}
                          style={{
                            background: lead.interest === 'up' ? 'rgba(200,241,53,0.15)' : 'none',
                            border: lead.interest === 'up' ? '1px solid rgba(200,241,53,0.4)' : '1px solid transparent',
                            borderRadius: 6, cursor: 'pointer', padding: '4px 6px',
                            color: lead.interest === 'up' ? '#c8f135' : '#4a4845',
                            transition: 'all 0.15s', display: 'flex', alignItems: 'center',
                          }}
                          onMouseEnter={e => { if (lead.interest !== 'up') e.currentTarget.style.color = '#c8f135'; }}
                          onMouseLeave={e => { if (lead.interest !== 'up') e.currentTarget.style.color = '#4a4845'; }}
                        >
                          <ThumbsUp size={13} />
                        </button>
                        <button
                          title="Not interested"
                          onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'down' ? null : 'down')}
                          style={{
                            background: lead.interest === 'down' ? 'rgba(255,92,92,0.15)' : 'none',
                            border: lead.interest === 'down' ? '1px solid rgba(255,92,92,0.4)' : '1px solid transparent',
                            borderRadius: 6, cursor: 'pointer', padding: '4px 6px',
                            color: lead.interest === 'down' ? '#ff5c5c' : '#4a4845',
                            transition: 'all 0.15s', display: 'flex', alignItems: 'center',
                          }}
                          onMouseEnter={e => { if (lead.interest !== 'down') e.currentTarget.style.color = '#ff5c5c'; }}
                          onMouseLeave={e => { if (lead.interest !== 'down') e.currentTarget.style.color = '#4a4845'; }}
                        >
                          <ThumbsDown size={13} />
                        </button>
                      </div>
                    </td>
                    <td>
                      {lead.status !== 'Converted' ? (
                        <button className="btn-green" onClick={() => openConvert(lead)}>
                          <UserPlus size={12} /> Move to Contacts
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: '#4a4845' }}>Converted</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {lead.email && (
                          <a href={gmailLink(lead.email)} target="_blank" rel="noreferrer" title="Compose in Gmail">
                            <Mail size={13} style={{ color: '#c8f135' }} />
                          </a>
                        )}
                        <InlineEdit value={lead.email} type="email" onSave={val => handleFieldSave(lead.id, 'email', val)} placeholder="Add email" />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} title="Call" style={{ display: 'flex' }}>
                            <Phone size={13} style={{ color: '#c8f135' }} />
                          </a>
                        )}
                        <InlineEdit value={lead.phone} onSave={val => handleFieldSave(lead.id, 'phone', val)} placeholder="Add phone" />
                      </div>
                    </td>
                    <td><Trunc value={lead.location} /></td>
                    <td>
                      <span style={{ fontSize: 12, color: lead.budget ? '#c8f135' : '#252523', fontWeight: lead.budget ? 600 : 400 }}>
                        {lead.budget || '—'}
                      </span>
                    </td>
                    <td>
                      {lead.has_business ? (
                        <span style={{ fontSize: 11, background: lead.has_business.toLowerCase().includes('yes') ? '#c8f13520' : '#ff5c5c20', color: lead.has_business.toLowerCase().includes('yes') ? '#c8f135' : '#ff5c5c', borderRadius: 6, padding: '2px 7px', fontWeight: 600 }}>
                          {lead.has_business.length > 20 ? lead.has_business.slice(0, 20) + '…' : lead.has_business}
                        </span>
                      ) : <span style={{ color: '#252523', fontSize: 12 }}>—</span>}
                    </td>
                    <td><Trunc value={lead.financial_goal} max={18} /></td>
                    <td><Trunc value={lead.time_available} max={18} /></td>
                    <td>
                      {lead.tiktok_handle ? (
                        <span style={{ fontSize: 12, color: '#c8f135' }}>{lead.tiktok_handle}</span>
                      ) : <span style={{ color: '#252523', fontSize: 12 }}>—</span>}
                    </td>
                    <td><Trunc value={lead.lead_source} max={16} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {/* Call completed toggle */}
                        <button
                          title={lead.call_completed ? 'Call completed — click to unmark' : 'Mark call as completed'}
                          onClick={() => handleFieldSave(lead.id, 'call_completed', !lead.call_completed)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '4px 5px', borderRadius: 5, display: 'flex', alignItems: 'center',
                            color: lead.call_completed ? '#c8f135' : '#252523',
                            transition: 'color 0.15s',
                          }}
                          onMouseEnter={e => { if (!lead.call_completed) e.currentTarget.style.color = '#4a4845'; }}
                          onMouseLeave={e => { if (!lead.call_completed) e.currentTarget.style.color = '#252523'; }}
                        >
                          <PhoneCall size={13} />
                        </button>
                        <button
                          title="View phone script"
                          onClick={() => setScriptIdx(filtered.indexOf(lead))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', padding: '4px 5px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#c8f135'}
                          onMouseLeave={e => e.currentTarget.style.color = '#4a4845'}
                        >
                          <ScrollText size={13} />
                        </button>
                        <button
                          title="Schedule demo call"
                          onClick={() => setScheduleLead(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', padding: '4px 5px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#5b9cf6'}
                          onMouseLeave={e => e.currentTarget.style.color = '#4a4845'}
                        >
                          <Calendar size={14} />
                        </button>
                        <button
                          title="Edit lead"
                          onClick={() => setDetailLead(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', padding: '4px 5px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#c8f135'}
                          onMouseLeave={e => e.currentTarget.style.color = '#4a4845'}
                        >
                          <Eye size={14} />
                        </button>
                        <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => openDelete(lead)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!collapsed[status] && (
                  <tr>
                    <td colSpan={COL_COUNT} style={{ padding: 0 }}>
                      <div className="add-row" onClick={openAdd}><Plus size={14} /> Add Lead</div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <SelectionBar
        count={selectedIds.size}
        selectedItems={selectedItems}
        onClear={clearSelection}
        onDelete={handleBulkDelete}
        onArchive={handleBulkArchive}
        onDuplicate={handleBulkDuplicate}
        onConvert={handleBulkConvert}
        moveToOptions={LEAD_STATUSES.map(s => ({ label: s, value: s }))}
        onMoveTo={handleBulkMoveTo}
      />

      {/* Phone script modal */}
      {scriptIdx !== null && (
        <PhoneScriptModal
          leads={filtered}
          index={scriptIdx}
          onNavigate={setScriptIdx}
          onClose={() => setScriptIdx(null)}
          onInterest={(id, val) => handleFieldSave(id, 'interest', val)}
          onSchedule={(lead) => { setScriptIdx(null); setScheduleLead(lead); }}
          onNoAnswer={async (lead) => {
            await updateLead(lead.id, { status: 'Unqualified' }).catch(() => {});
            setLeads(ls => ls.map(l => l.id === lead.id ? { ...l, status: 'Unqualified' } : l));
          }}
        />
      )}

      {/* Lead detail panel */}
      {detailLead && (
        <LeadDetailPanel
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onFieldSave={handleFieldSave}
          onSaveAll={handleSaveAllFields}
          statuses={LEAD_STATUSES}
        />
      )}

      {showImport && (
        <BulkImport onClose={() => setShowImport(false)} onImported={() => { load(); setShowImport(false); }} />
      )}

      {modal === 'add' && (
        <Modal title="New Lead" onClose={() => setModal(null)} onSubmit={handleSave} submitLabel="Add Lead">
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Lead Source</label>
              <select className="form-select" value={form.lead_source} onChange={e => setForm(f => ({ ...f, lead_source: e.target.value }))}>
                {LEAD_SOURCES.map(s => <option key={s}>{s || '— Select —'}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Budget</label>
              <input className="form-input" value={form.budget || ''} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="e.g. $150+/month" />
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input className="form-input" value={form.location || ''} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="City, State" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete Lead" onClose={() => setModal(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
          <p style={{ color: '#7a7870' }}>Delete <strong style={{ color: '#e8e6df' }}>{selected?.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
      {modal === 'convert' && (
        <Modal title="Move to Contacts" onClose={() => setModal(null)} onSubmit={handleConvert} submitLabel="Convert to Contact">
          <p style={{ color: '#7a7870' }}>Move <strong style={{ color: '#e8e6df' }}>{selected?.name}</strong> to Contacts?</p>
        </Modal>
      )}
    </div>
  );
}
