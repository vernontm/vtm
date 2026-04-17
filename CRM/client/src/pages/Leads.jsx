import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronDown, ChevronRight, ChevronLeft, Trash2, UserPlus, Mail, Phone, Upload, X, Check, PhoneCall, ThumbsUp, ThumbsDown, ScrollText, Copy, CheckCheck, Calendar, Send, Clock } from 'lucide-react';
import { getLeads, createLead, updateLead, deleteLead, convertLead, getCommLog } from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';
import BulkImport from '../components/BulkImport';
import CopyCell from '../components/CopyCell';

const LEAD_STATUSES = ['Warm', 'Hot', 'Unqualified'];
const LEAD_SOURCES = [
  '', 'Website', 'Referral', 'Cold Outreach',
  'Email', 'TikTok', 'Instagram', 'YouTube', 'Threads', 'Facebook', 'X / Twitter', 'LinkedIn',
  'Podcast', 'Event', 'Other',
];

// Platform tag styling — colored chips for quick visual scanning
const PLATFORM_STYLES = {
  'Email':        { bg: '#4a6cf720', fg: '#4a6cf7', icon: '✉️' },   // indigo
  'TikTok':       { bg: '#FF004F20', fg: '#E60048', icon: '🎵' },   // tiktok red-pink
  'Instagram':    { bg: '#E1306C20', fg: '#E1306C', icon: '📸' },   // instagram pink
  'YouTube':      { bg: '#FF000020', fg: '#D00000', icon: '▶️' },   // youtube red
  'Threads':      { bg: '#1a1a2e20', fg: '#1a1a2e', icon: '@' },    // threads black
  'Facebook':     { bg: '#1877F220', fg: '#1877F2', icon: 'f' },    // facebook blue
  'X / Twitter':  { bg: '#71767B20', fg: '#4B5563', icon: '𝕏' },   // x slate-gray
  'LinkedIn':     { bg: '#0A66C220', fg: '#0A66C2', icon: 'in' },   // linkedin blue
  'Website':      { bg: '#10B98120', fg: '#059669', icon: '🌐' },   // emerald
  'Referral':     { bg: '#F59E0B20', fg: '#B45309', icon: '🤝' },   // amber
  'Cold Outreach':{ bg: '#8B5CF620', fg: '#6D28D9', icon: '❄️' },   // violet
  'Podcast':      { bg: '#EC489920', fg: '#BE185D', icon: '🎙️' },   // pink
  'Event':        { bg: '#06B6D420', fg: '#0E7490', icon: '🎪' },   // cyan
  'Other':        { bg: '#8e8ea020', fg: '#8e8ea0', icon: '•' },    // gray
};

function PlatformChip({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const style = PLATFORM_STYLES[value] || PLATFORM_STYLES['Other'];
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: value ? '3px 9px' : '3px 8px',
          borderRadius: 10, fontSize: 11, fontWeight: 600,
          background: value ? style.bg : '#f0f2f8',
          color: value ? style.fg : '#8e8ea0',
          border: value ? 'none' : '1px dashed #c0c0c8',
          cursor: 'pointer', lineHeight: 1.4, maxWidth: 120,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {value ? <><span style={{ fontSize: 10 }}>{style.icon}</span> {value}</> : '+ Platform'}
      </button>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 51,
              background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 160,
              display: 'grid', gap: 2, maxHeight: 320, overflowY: 'auto',
            }}
          >
            {LEAD_SOURCES.filter(s => s).map(s => {
              const st = PLATFORM_STYLES[s] || PLATFORM_STYLES['Other'];
              return (
                <button
                  key={s}
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 5, fontSize: 12, fontWeight: 500,
                    background: value === s ? st.bg : 'transparent',
                    color: value === s ? st.fg : '#1a1a2e',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (value !== s) e.currentTarget.style.background = '#f5f7fa'; }}
                  onMouseLeave={e => { if (value !== s) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 11 }}>{st.icon}</span> {s}
                </button>
              );
            })}
            {value && (
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  borderRadius: 5, fontSize: 12, color: '#ff5c5c', background: 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid #e5e7ef', marginTop: 2,
                }}
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const EMPTY = { name: '', status: 'Warm', company: '', email: '', phone: '', lead_source: '', notes: '' };

/* Summarize goal from multiple fields into a concise string */
function summarizeGoal(lead) {
  const parts = [lead.problem, lead.current_situation, lead.financial_goal, lead.notes].filter(Boolean);
  if (parts.length === 0) return '';
  const combined = parts.join(' ').trim();
  // Return first ~80 chars, cut at word boundary
  if (combined.length <= 80) return combined;
  return combined.slice(0, 80).replace(/\s+\S*$/, '') + '…';
}

/* Format relative time for last follow-up */
function formatFollowUp(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Survey Detail / Edit Panel ────────────────────────────────────────────────
const LONG_FIELDS = new Set([
  'problem','current_situation','financial_goal','notes',
]);

const DETAIL_SECTIONS = [
  {
    title: 'Contact Info',
    fields: [
      { key: 'name',          label: 'Name' },
      { key: 'email',         label: 'Email' },
      { key: 'phone',         label: 'Phone' },
      { key: 'company',       label: 'Business' },
    ],
  },
  {
    title: 'Project Details',
    fields: [
      { key: 'problem',           label: 'Problem' },
      { key: 'current_situation',  label: 'Current State' },
      { key: 'financial_goal',     label: 'Goal' },
      { key: 'budget',             label: 'Budget Tier' },
      { key: 'best_time',          label: 'Best Time' },
    ],
  },
  {
    title: 'Other',
    fields: [
      { key: 'notes',        label: 'Notes' },
      { key: 'lead_source',  label: 'Source' },
    ],
  },
];

const inputStyle = {
  width: '100%', padding: '6px 9px', borderRadius: 5, fontSize: 12,
  color: '#1a1a2e', background: '#ffffff', border: '1px solid #e5e7ef',
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

function LeadDetailPanel({ lead, onClose, onFieldSave, onSaveAll, statuses, onEmail, lastFollowUp }) {
  const [draft, setDraft]   = useState({ ...lead });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => { setDraft(d => ({ ...d, ...lead })); }, [lead]);

  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }));

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

  const handleStatus = (s) => { set('status', s); onFieldSave(lead.id, 'status', s); };

  const handleCallToggle = async () => {
    const next = !draft.call_completed;
    set('call_completed', next);
    await onFieldSave(lead.id, 'call_completed', next);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'relative', width: 540, background: '#ffffff',
        borderLeft: '1px solid #e5e7ef', overflowY: 'auto',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e5e7ef', position: 'sticky', top: 0, background: '#ffffff', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                Edit Lead
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusBadge status={draft.status} options={statuses} onChange={handleStatus} />
                <button
                  onClick={handleCallToggle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 11px', borderRadius: 12, cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, border: 'none',
                    background: draft.call_completed ? '#4a6cf725' : '#e5e7ef40',
                    color: draft.call_completed ? '#4a6cf7' : '#8e8ea0',
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

              {/* Quick actions row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                {lead.email && (
                  <button
                    onClick={() => onEmail(lead)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, border: 'none',
                      background: '#4a6cf7', color: '#fff',
                    }}
                  >
                    <Send size={12} /> Email
                  </button>
                )}
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px', borderRadius: 6, textDecoration: 'none',
                    fontSize: 12, fontWeight: 600,
                    background: '#f0f2f8', color: '#1a1a2e', border: '1px solid #e5e7ef',
                  }}>
                    <Phone size={12} /> Call
                  </a>
                )}
                {lastFollowUp && (
                  <span style={{ fontSize: 11, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> Last follow-up: {formatFollowUp(lastFollowUp)}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: 4, flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Editable sections */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 24, flex: 1 }}>
          {DETAIL_SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.fields.map(({ key, label }) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, color: '#8e8ea0', paddingTop: 8 }}>{label}</span>
                    <EditableField fieldKey={key} value={draft[key]} onChange={val => set(key, val)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Sticky save bar */}
        <div style={{
          position: 'sticky', bottom: 0, padding: '12px 24px',
          background: '#ffffff', borderTop: '1px solid #e5e7ef',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button
            onClick={handleSaveAll}
            disabled={saving || !isDirty}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 6, cursor: isDirty ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700, border: 'none',
              background: isDirty ? '#4a6cf7' : '#e5e7ef',
              color: isDirty ? '#fff' : '#8e8ea0',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? 'Saving…' : saved ? <><Check size={14} /> Saved!</> : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: 'none', border: '1px solid #e5e7ef', color: '#8e8ea0' }}
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
  if (!value) return <span style={{ color: '#c0c0c0' }}>—</span>;
  return (
    <span title={value} style={{ fontSize: 12, color: '#8e8ea0' }}>
      {value.length > max ? value.slice(0, max) + '…' : value}
    </span>
  );
}

export default function Leads() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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
  const [sort, setSort] = useState('newest');
  const [hoveredId, setHoveredId] = useState(null);
  const [lastFollowUps, setLastFollowUps] = useState({});

  const load = async () => {
    try {
      const leadsData = await getLeads();
      setLeads(leadsData.filter(l => !l.archived));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Load last follow-up dates from communication log
  useEffect(() => {
    getCommLog().then(logs => {
      const map = {};
      logs.forEach(log => {
        if (log.lead_id && !map[log.lead_id]) {
          map[log.lead_id] = log.created_at;
        }
      });
      setLastFollowUps(map);
    }).catch(() => {});
  }, [leads]);

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

  const handleEmail = (lead) => {
    if (lead.email) {
      navigate(`/email?compose=${encodeURIComponent(lead.email)}&name=${encodeURIComponent(lead.name || '')}`);
    }
  };

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

  const COL_COUNT = 9;

  return (
    <div style={{ minHeight: '100%', background: '#f5f7fa' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="page-title">Leads</div>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
            <input className="search-input" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{ background: '#ffffff', border: '1px solid #e5e7ef', color: '#8e8ea0', borderRadius: 6, fontSize: 12, padding: '6px 10px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name_az">Name A→Z</option>
            <option value="name_za">Name Z→A</option>
          </select>
          <button className="btn-ghost" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8e8ea0', border: '1px solid #e5e7ef', padding: '6px 12px', borderRadius: 6, fontSize: 13 }}>
            <Upload size={14} /> Import
          </button>
          <button className="btn-primary" onClick={openAdd}><Plus size={16} /> New Lead</button>
        </div>
      </div>

      {/* ── Mobile card view ── */}
      <div className="mobile-cards">
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>Loading...</div>
        ) : groups.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>No leads yet.</div>
        ) : groups.map(([status, items]) => (
          <React.Fragment key={status}>
            <div className="group-header" onClick={() => setCollapsed(c => ({ ...c, [status]: !c[status] }))} style={{ margin: '4px 0' }}>
              {collapsed[status] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <span style={{ color: '#1a1a2e' }}>{status}</span>
              <span style={{ background: '#e5e7ef', borderRadius: 12, padding: '1px 8px', fontSize: 12, color: '#8e8ea0' }}>{items.length}</span>
            </div>
            {!collapsed[status] && items.map(lead => (
              <div key={lead.id} className="mobile-card" onClick={() => setDetailLead(lead)}>
                <div className="mobile-card-row primary">
                  <span className="private-value">{lead.name || '—'}</span>
                </div>
                {lead.email && (
                  <div className="mobile-card-row">
                    <Mail size={12} style={{ color: '#4a6cf7', flexShrink: 0 }} />
                    <span className="private-value">{lead.email}</span>
                  </div>
                )}
                {lead.phone && (
                  <div className="mobile-card-row">
                    <Phone size={12} style={{ color: '#8e8ea0', flexShrink: 0 }} />
                    <span className="private-value">{lead.phone}</span>
                  </div>
                )}
                {summarizeGoal(lead) && (
                  <div className="mobile-card-row">
                    <span className="mobile-card-label">Goal</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{summarizeGoal(lead)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  {lead.budget && (
                    <div className="mobile-card-row" style={{ padding: 0 }}>
                      <span className="mobile-card-label">Budget</span>
                      <span className="private-value" style={{ color: '#4a6cf7', fontWeight: 600 }}>{lead.budget}</span>
                    </div>
                  )}
                  {(lead.best_time || lead.time_available) && (
                    <div className="mobile-card-row" style={{ padding: 0 }}>
                      <span className="mobile-card-label">Time</span>
                      <span>{lead.best_time || lead.time_available}</span>
                    </div>
                  )}
                  {lead.lead_source && (() => {
                    const st = PLATFORM_STYLES[lead.lead_source] || PLATFORM_STYLES['Other'];
                    return (
                      <div className="mobile-card-row" style={{ padding: 0 }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                          background: st.bg, color: st.fg,
                        }}>
                          <span style={{ fontSize: 9 }}>{st.icon}</span> {lead.lead_source}
                        </span>
                      </div>
                    );
                  })()}
                </div>
                {lastFollowUps[lead.id] && (
                  <div className="mobile-card-row" style={{ fontSize: 11, color: '#b0b0c0', marginTop: 2 }}>
                    <Clock size={10} /> Last follow-up: {formatFollowUp(lastFollowUps[lead.id])}
                  </div>
                )}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      {/* ── Desktop table view ── */}
      <div className="table-container desktop-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ minWidth: 130 }}>Platform</th>
              <th style={{ minWidth: 160 }}>Name</th>
              <th style={{ minWidth: 160 }}>Email</th>
              <th style={{ minWidth: 120 }}>Phone</th>
              <th style={{ minWidth: 200 }}>Goal</th>
              <th style={{ minWidth: 100 }}>Budget</th>
              <th style={{ minWidth: 110 }}>Best Time</th>
              <th style={{ minWidth: 90 }}>Last Email</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={COL_COUNT} style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>Loading...</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={COL_COUNT} style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>No leads yet. Click "New Lead" to add one.</td></tr>
            ) : groups.map(([status, items]) => (
              <React.Fragment key={status}>
                <tr>
                  <td colSpan={COL_COUNT} style={{ padding: 0, background: '#ffffff' }}>
                    <div className="group-header" onClick={() => setCollapsed(c => ({ ...c, [status]: !c[status] }))}>
                      {collapsed[status] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <span style={{ color: '#1a1a2e' }}>{status}</span>
                      <span style={{ background: '#e5e7ef', borderRadius: 12, padding: '1px 8px', fontSize: 12, color: '#8e8ea0' }}>{items.length}</span>
                    </div>
                  </td>
                </tr>
                {!collapsed[status] && items.map(lead => (
                  <tr
                    key={lead.id}
                    style={{
                      background: selectedIds.has(lead.id) ? 'rgba(74,108,247,0.08)' : undefined,
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    onMouseEnter={() => setHoveredId(lead.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => {
                      // Don't open detail if clicking checkbox, inline edit, or action bar buttons
                      if (e.target.closest('input[type="checkbox"]') || e.target.closest('.lead-action-bar') || e.target.closest('.inline-edit')) return;
                      setDetailLead(lead);
                    }}
                  >
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <PlatformChip
                        value={lead.lead_source || ''}
                        onChange={(val) => handleFieldSave(lead.id, 'lead_source', val)}
                      />
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      <CopyCell value={lead.name}>
                        <span className="private-value" style={{ fontSize: 13, color: '#1a1a2e' }}>{lead.name || '—'}</span>
                      </CopyCell>
                    </td>
                    <td>
                      <CopyCell value={lead.email}>
                        <span className="private-value" style={{ fontSize: 12, color: '#8e8ea0' }}>{lead.email || '—'}</span>
                      </CopyCell>
                    </td>
                    <td>
                      <CopyCell value={lead.phone}>
                        <span className="private-value" style={{ fontSize: 12, color: '#8e8ea0' }}>{lead.phone || '—'}</span>
                      </CopyCell>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: '#8e8ea0', lineHeight: 1.4 }}>
                        {summarizeGoal(lead) || <span style={{ color: '#c0c0c0' }}>—</span>}
                      </span>
                    </td>
                    <td>
                      <span className="private-value" style={{ fontSize: 12, color: lead.budget ? '#4a6cf7' : '#c0c0c0', fontWeight: lead.budget ? 600 : 400 }}>
                        {lead.budget || '—'}
                      </span>
                    </td>
                    <td>
                      <Trunc value={lead.best_time || lead.time_available} max={18} />
                    </td>
                    <td>
                      {lastFollowUps[lead.id] ? (
                        <span style={{ fontSize: 11, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Clock size={10} /> {formatFollowUp(lastFollowUps[lead.id])}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#c0c0c0' }}>—</span>
                      )}
                    </td>

                    {/* Floating action bar on hover */}
                    {hoveredId === lead.id && (
                      <td style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', padding: 0, border: 'none', width: 'auto', background: 'transparent' }}>
                        <div
                          className="lead-action-bar"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 2,
                            background: '#ffffff', border: '1px solid #e5e7ef',
                            borderRadius: 8, padding: '3px 4px',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          {lead.email && (
                            <button
                              title="Send email"
                              onClick={() => handleEmail(lead)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6cf7', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#4a6cf710'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                            >
                              <Mail size={14} />
                            </button>
                          )}
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              title="Call"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6cf7', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#4a6cf710'}
                              onMouseLeave={e => e.currentTarget.style.background = 'none'}
                              onClick={e => e.stopPropagation()}
                            >
                              <Phone size={14} />
                            </a>
                          )}
                          <button
                            title="Interested"
                            onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'up' ? null : 'up')}
                            style={{
                              background: lead.interest === 'up' ? 'rgba(74,108,247,0.12)' : 'none',
                              border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px 7px',
                              color: lead.interest === 'up' ? '#4a6cf7' : '#8e8ea0',
                              display: 'flex', alignItems: 'center',
                            }}
                            onMouseEnter={e => { if (lead.interest !== 'up') e.currentTarget.style.color = '#4a6cf7'; }}
                            onMouseLeave={e => { if (lead.interest !== 'up') e.currentTarget.style.color = '#8e8ea0'; }}
                          >
                            <ThumbsUp size={13} />
                          </button>
                          <button
                            title="Not interested"
                            onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'down' ? null : 'down')}
                            style={{
                              background: lead.interest === 'down' ? 'rgba(255,92,92,0.12)' : 'none',
                              border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px 7px',
                              color: lead.interest === 'down' ? '#ff5c5c' : '#8e8ea0',
                              display: 'flex', alignItems: 'center',
                            }}
                            onMouseEnter={e => { if (lead.interest !== 'down') e.currentTarget.style.color = '#ff5c5c'; }}
                            onMouseLeave={e => { if (lead.interest !== 'down') e.currentTarget.style.color = '#8e8ea0'; }}
                          >
                            <ThumbsDown size={13} />
                          </button>
                          {lead.status !== 'Converted' && (
                            <button
                              title="Move to Contacts"
                              onClick={() => openConvert(lead)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#4a6cf7'; e.currentTarget.style.background = '#4a6cf710'; }}
                              onMouseLeave={e => { e.currentTarget.style.color = '#8e8ea0'; e.currentTarget.style.background = 'none'; }}
                            >
                              <UserPlus size={14} />
                            </button>
                          )}
                          <button
                            title="Delete"
                            onClick={() => openDelete(lead)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#ff5c5c'; e.currentTarget.style.background = '#ff5c5c10'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#8e8ea0'; e.currentTarget.style.background = 'none'; }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
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

      {/* Lead detail panel */}
      {detailLead && (
        <LeadDetailPanel
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onFieldSave={handleFieldSave}
          onSaveAll={handleSaveAllFields}
          statuses={LEAD_STATUSES}
          onEmail={handleEmail}
          lastFollowUp={lastFollowUps[detailLead.id]}
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
          <p style={{ color: '#8e8ea0' }}>Delete <strong style={{ color: '#1a1a2e' }}>{selected?.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
      {modal === 'convert' && (
        <Modal title="Move to Contacts" onClose={() => setModal(null)} onSubmit={handleConvert} submitLabel="Convert to Contact">
          <p style={{ color: '#8e8ea0' }}>Move <strong style={{ color: '#1a1a2e' }}>{selected?.name}</strong> to Contacts?</p>
        </Modal>
      )}
    </div>
  );
}
