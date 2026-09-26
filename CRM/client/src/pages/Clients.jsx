import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Plus, Search, Trash2, ArrowLeft, Building2, Calendar,
  KeyRound, CheckCircle2, Circle, Clock, ShieldCheck, ListChecks,
  Briefcase, Lock, Eye, EyeOff, Copy, Pencil, ExternalLink,
  FileSignature, Sparkles, DollarSign, Download, TrendingUp, Repeat,
  StickyNote, Phone, CheckSquare, PhoneIncoming, PhoneOutgoing, Flag, Activity, X, Mail,
  ChevronLeft, ChevronRight, ChevronDown, Loader, FolderOpen,
  Folder, FolderPlus, Upload, File as FileIcon, MoreHorizontal, CornerLeftUp,
  Send as SendIcon, Smartphone, LayoutDashboard, Video, Navigation,
} from 'lucide-react';
import { usePageActions } from '../context/UiContext';
import {
  getClients, getClient, createClient, updateClient, deleteClient, getDashboardStats,
  getClientPlatforms, createClientPlatform, updateClientPlatform, deleteClientPlatform,
  getClientTasks, createClientTask, updateClientTask, deleteClientTask,
  getClientCredentials, createClientCredential, updateClientCredential, deleteClientCredential,
  getClientActivity, createClientActivity, updateClientActivity, deleteClientActivity, generateClientSummary, uploadFile, uploadClientDocument,
  getProjects, createProject, updateProject,
  getDeals, createDeal, updateDeal, deleteDeal, createDealInvoice,
  getAgreements, getAgreementFileUrl, updatePayment, sendAgreementForSignature,
  agreementChat, analyzeDeal, generateAgreement, saveAgreementDoc, suggestProjects, generateAccessInstructions, draftClientEmail, sendClientEmail, approveAgreement, approveAgreementRow, previewAgreementToken, setAgreementPlans, setupCustomAgreement, markAgreementSent, startMaintenance,
  listClientFiles, listClientFolders, createClientFolder, renameClientFile,
  moveClientFile, deleteClientFile, uploadClientFile,
  getAssignees, textSignLink, getClientOverview,
} from '../api';
import { useClient } from '../context/ClientContext';
import Modal from '../components/Modal';
import NudgeModal from '../components/NudgeModal';
import InlineEdit from '../components/InlineEdit';
import StatusBadge from '../components/StatusBadge';
import DeliveryBoard from '../components/DeliveryBoard';

// Payment badge for a project, derived from what's actually been paid vs its value.
const projectPaymentBadge = (p) => {
  const value = Number(p?.value) || 0, paid = Number(p?.amount_paid) || 0;
  if (value > 0 && paid >= value) return 'Paid in full';
  if (paid > 0) return 'Deposit paid';
  return 'Unpaid';
};
const PROJECT_LIFECYCLE = ['Onboarding', 'Awaiting Access', 'In Progress', 'Live', 'Completed', 'Paused'];

// The project's start date IS the pay date, use start_date, else the recorded
// deposit paid_at. Returns a short formatted string, or '' if neither is set.
const projectStartDate = (p) => {
  const raw = p?.start_date || p?.paid_at;
  if (!raw) return '';
  const d = new Date(raw);
  return isNaN(d) ? String(raw) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
import { toast } from '../components/Toast';

// ── Journey stages ────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'lead',            label: 'Lead',            color: '#8a8a8a' },
  { key: 'onboarding',      label: 'Onboarding',      color: '#f5a623' },
  { key: 'awaiting_access', label: 'Awaiting Access', color: '#2563eb' },
  { key: 'scoping',         label: 'Scoping',         color: '#784bd1' },
  { key: 'plan_review',     label: 'Plan Review',     color: '#3b82f6' },
  { key: 'in_build',        label: 'In Progress',     color: '#22c55e' },
  { key: 'live',            label: 'Live',            color: '#16a34a' },
  { key: 'paused',          label: 'Paused',          color: '#ff5c5c' },
];
const stageOf = (k) => STAGES.find(s => s.key === k) || STAGES[0];

const ACCESS_STATUS = {
  needed:    { label: 'Needed',    color: '#ff5c5c', icon: Circle },
  requested: { label: 'Requested', color: '#f5a623', icon: Clock },
  granted:   { label: 'Granted',   color: '#22c55e', icon: CheckCircle2 },
  blocked:   { label: 'Blocked',   color: '#ff5c5c', icon: Circle },
};

const SOURCES = ['TikTok', 'Referral', 'In-person', 'Cold outreach', 'LinkedIn', 'Website'];
const CLIENT_TYPES = ['Websites', 'Apps & CRMs', 'Marketing', 'AI Services', 'Coaching'];
const NOTE_TAGS = { Important: '#f5a623', Call: '#3b82f6', Meeting: '#784bd1', Update: '#22c55e', Idea: '#0ea5e9' };
const CALL_OUTCOMES = ['Connected', 'No answer', 'Left voicemail', 'Booked meeting', 'Not interested', 'Follow up'];
const TASK_PRIORITY = { low: '#8a8a8a', medium: '#3b82f6', high: '#f5a623', urgent: '#ff5c5c' };

// Lead pipeline temperature + ranking (leads only). Temperature is the pipeline
// stage in the funnel; rank is how strong/priority the lead is.
// Darker colors so white pill text is easy to read.
const TEMPERATURES = [
  { key: 'contract_sent', label: 'Contract Sent', color: '#7c3aed', blurb: 'Agreement sent, waiting on their signature' },
  { key: 'hot',  label: 'Hot',  color: '#b91c1c', blurb: 'Told us they want to work with us' },
  { key: 'warm', label: 'Warm', color: '#b45309', blurb: 'Shared a need, but hasn’t asked us yet' },
  { key: 'cold', label: 'Cold', color: '#1d4ed8', blurb: 'No interest expressed yet' },
];
const tempOf = (k) => TEMPERATURES.find(t => t.key === k) || TEMPERATURES[1];
const RANKS = [
  { key: 'high',   label: 'High',   color: '#15803d' },
  { key: 'medium', label: 'Medium', color: '#b45309' },
  { key: 'low',    label: 'Low',    color: '#475569' },
];
const rankOf = (k) => RANKS.find(r => r.key === k) || RANKS[1];

// Follow-up status for leads/clients, tracks whose court the ball is in.
const FOLLOW_UPS = [
  { key: 'none',            label: 'No follow-up',    color: '#64748b' },
  { key: 'needs_follow_up', label: 'Needs follow-up', color: '#dc2626' },
  { key: 'waiting_on_them', label: 'Waiting on them', color: '#b45309' },
  { key: 'contract_sent',   label: 'Contract sent',   color: '#7c3aed' },
  { key: 'scheduled',       label: 'Scheduled',       color: '#2563eb' },
  { key: 'done',            label: 'Done',            color: '#16a34a' },
];
const followUpOf = (k) => FOLLOW_UPS.find(f => f.key === k) || FOLLOW_UPS[0];

// A client's overall status is derived from their projects (lifecycle lives on
// projects now, not the client). We surface the "furthest along" active project;
// if everything's wrapped, show Completed; if they have no projects yet, New.
const BUILD_RANK = { 'Onboarding': 1, 'Awaiting Access': 2, 'In Progress': 3, 'Live': 4, 'Active': 4, 'Completed': 5, 'Paused': 0, 'Cancelled': 0 };
function deriveClientStatus(projects) {
  if (!projects || !projects.length) return 'New';
  const active = projects.filter(p => !['Completed', 'Cancelled'].includes(p.status));
  if (active.length) {
    return active.slice().sort((a, b) => (BUILD_RANK[b.status] || 0) - (BUILD_RANK[a.status] || 0))[0].status;
  }
  return projects.some(p => p.status === 'Completed') ? 'Completed' : 'New';
}
// Channels for logging the last touch.
const CONTACT_CHANNELS = ['Call', 'Text', 'Email', 'DM', 'In person', 'Voicemail'];
function timeSince(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const EMPTY_CLIENT = { business_name: '', owner_name: '', contact_phone: '', contact_email: '', industry: '', website_url: '', source: 'TikTok', client_type: [], notes: '', stage: 'lead', lead_temperature: 'warm', lead_rank: 'medium', potential_value: '', potential_value_type: 'one_time', firstNote: '', assigned_to: null, assigned_to_name: '' };

// Team roster for "assign to" pickers. Fetched once per mount; any signed-in
// user can read it (see /api/crm/assignees), so appointment setters can assign
// leads without seeing payroll.
function useAssignees() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let alive = true;
    getAssignees().then(r => { if (alive) setList(Array.isArray(r) ? r : (r?.employees || [])); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return list;
}

function StageBadge({ stage }) {
  const s = stageOf(stage);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px',
      borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-display)',
      color: s.color, background: `${s.color}18`, border: `1px solid ${s.color}40`,
    }}>
      {s.label}
    </span>
  );
}

// A small solid-color pill that opens a dropdown to change value (temperature/rank).
// Solid dark fill + white text for legibility.
function PillSelect({ value, options, onChange, minWidth = 54 }) {
  const cur = options.find(o => o.key === value) || options[0];
  return (
    <select
      value={cur.key}
      onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); onChange(e.target.value); }}
      style={{
        appearance: 'none', WebkitAppearance: 'none', cursor: 'pointer', minWidth,
        padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
        color: '#fff', background: cur.color, border: `1px solid ${cur.color}`, textAlign: 'center',
      }}
    >
      {options.map(o => <option key={o.key} value={o.key} style={{ color: 'var(--text)', background: 'var(--surface)' }}>{o.label}</option>)}
    </select>
  );
}

const fmtUsd = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

// Kanban board for leads, one column per temperature (Hot / Warm / Cold).
// Drag a card between columns to change its temperature. Each card carries a
// potential-revenue amount; the board totals it per column and overall.
function LeadsBoard({ leads, onOpen, onTempChange, onRankChange, onDelete, onFollowUp }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [fuMenu, setFuMenu] = useState(null); // lead id whose "add tag" menu is open
  const sumBy = (rows, type) => rows.reduce((s, l) => s + ((l.potential_value_type || 'one_time') === type ? (Number(l.potential_value) || 0) : 0), 0);
  const grandOneTime = sumBy(leads, 'one_time');
  const grandMonthly = sumBy(leads, 'monthly');
  // Fixed board height so each column scrolls its own cards instead of the page.
  const boardHeight = 'calc(100vh - 200px)';
  return (
    <div style={{ overflowX: 'auto', padding: '16px 24px' }}>
    {/* Pipeline total */}
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 14px', background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.30)', borderRadius: 10 }}>
      <DollarSign size={15} style={{ color: '#16a34a' }} />
      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>
        Total potential: {fmtUsd(grandOneTime)} one-time{grandMonthly > 0 ? ` + ${fmtUsd(grandMonthly)}/mo` : ''}
      </span>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>across {leads.length} lead{leads.length !== 1 ? 's' : ''}</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TEMPERATURES.length}, minmax(260px, 1fr))`, gap: 14, alignItems: 'start' }}>
      {TEMPERATURES.map(col => {
        const colLeads = leads.filter(l => (l.lead_temperature || 'warm') === col.key);
        const colOneTime = sumBy(colLeads, 'one_time');
        const colMonthly = sumBy(colLeads, 'monthly');
        const isOver = overCol === col.key;
        return (
          <div
            key={col.key}
            onDragOver={e => { e.preventDefault(); if (overCol !== col.key) setOverCol(col.key); }}
            onDragLeave={() => setOverCol(o => o === col.key ? null : o)}
            onDrop={e => { e.preventDefault(); if (dragId) onTempChange(dragId, col.key); setDragId(null); setOverCol(null); }}
            style={{
              background: isOver ? 'var(--surface-2)' : 'var(--surface)',
              border: `1px solid ${isOver ? col.color : 'var(--border)'}`, borderRadius: 16,
              height: boardHeight, display: 'flex', flexDirection: 'column',
              transition: 'background 0.12s, border-color 0.12s',
            }}
          >
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: col.color, borderRadius: 999, padding: '0 8px', marginLeft: 'auto' }}>{colLeads.length}</span>
              </div>
              {/* Explainer under each column */}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, lineHeight: 1.35 }}>{col.blurb}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginTop: 6 }}>{fmtUsd(colOneTime)}{colMonthly > 0 ? ` + ${fmtUsd(colMonthly)}/mo` : ''}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, flex: 1, overflowY: 'auto', minHeight: 60 }}>
              {colLeads.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '16px 0' }}>Drop a lead here</div>}
              {colLeads.map(l => {
                const initial = (l.owner_name || l.business_name || '?')[0].toUpperCase();
                const tags = Array.isArray(l.lead_tags) && l.lead_tags.length ? l.lead_tags
                  : (l.follow_up_status && l.follow_up_status !== 'none' ? [l.follow_up_status] : []);
                const tagOpts = FOLLOW_UPS.filter(f => f.key !== 'none' && !tags.includes(f.key));
                return (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onClick={() => onOpen(l)}
                    className="lead-card"
                    style={{
                      background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px',
                      boxShadow: 'var(--shadow-sm)', cursor: 'pointer', opacity: dragId === l.id ? 0.5 : 1,
                      display: 'flex', flexDirection: 'column', gap: 8,
                    }}
                  >
                    {/* Title */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span className="private-value" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.business_name || '-'}</span>
                      <button className="lead-card-del" onClick={e => { e.stopPropagation(); onDelete(l); }} title="Delete lead"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', padding: 1, flexShrink: 0 }}><Trash2 size={13} /></button>
                    </div>
                    {/* Follow-up + potential revenue chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, position: 'relative' }}>
                      {(l.potential_value != null && l.potential_value !== '') && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(22,163,74,0.10)', border: '1px solid rgba(22,163,74,0.28)', borderRadius: 8, padding: '3px 8px' }}>
                          <DollarSign size={12} style={{ color: '#16a34a', flexShrink: 0 }} />
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#16a34a' }}>{fmtUsd(l.potential_value)}{l.potential_value_type === 'monthly' ? '/mo' : ''}</span>
                        </div>
                      )}
                      {tags.map(tk => {
                        const fu = followUpOf(tk);
                        return (
                          <div key={tk} className="fu-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${fu.color}18`, border: `1px solid ${fu.color}44`, borderRadius: 8, padding: '3px 6px 3px 8px' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: fu.color }} />
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: fu.color }}>{fu.label}</span>
                            <button className="fu-x" title="Remove tag" onClick={e => { e.stopPropagation(); onFollowUp && onFollowUp(l.id, tags.filter(t => t !== tk)); }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: fu.color, display: 'flex', padding: 0, marginLeft: 1 }}><X size={12} /></button>
                          </div>
                        );
                      })}
                      {tagOpts.length > 0 && (
                        <button className="add-tag-btn" title="Add a follow-up tag" onClick={e => { e.stopPropagation(); setFuMenu(fuMenu === l.id ? null : l.id); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--surface-3)', border: '1px dashed var(--border-light)', borderRadius: 8, padding: '3px 7px', cursor: 'pointer', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700 }}>
                          <Plus size={13} style={{ flexShrink: 0 }} /><span className="add-tag-lbl">Tag</span>
                        </button>
                      )}
                      {fuMenu === l.id && (
                        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 6, minWidth: 172, boxShadow: '0 12px 30px rgba(0,0,0,0.4)' }}>
                          {tagOpts.map(f => (
                            <div key={f.key} onClick={() => { onFollowUp && onFollowUp(l.id, [...tags, f.key]); setFuMenu(null); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color }} /> {f.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Last contact line */}
                    {l.last_contact_at && (
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: 'var(--muted)' }}>Last touch:</span>
                        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{l.last_contact_channel || 'contact'} · {timeSince(l.last_contact_at)}</span>
                      </div>
                    )}
                    {/* Footer: owner + date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-3)', color: 'var(--muted)', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initial}</span>
                      <span className="private-value" style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.owner_name || l.source || '-'}</span>
                      {l.assigned_to_name && (
                        <span title={`Assigned to ${l.assigned_to_name}`} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--orange)', background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 999, padding: '2px 8px', flexShrink: 0, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.assigned_to_name.split(' ')[0]}
                        </span>
                      )}
                      {l.created_at && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                          <Calendar size={11} /> {new Date(l.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

// kind='lead'   -> stage === 'lead' (still trying to convert, hasn't paid/started)
// kind='client' -> stage !== 'lead' (paid and started with VTM)
// Same crm_clients table either way, moving a lead's stage off 'lead' is what
// "converts" it; it just disappears from the Leads list and shows up in Clients.
export default function Clients({ kind = 'client' }) {
  const isLeadView = kind === 'lead';
  const noun = isLeadView ? 'Lead' : 'Client';

  const { user } = useClient();
  const assignees = useAssignees();
  // A new lead defaults to whoever is adding it (matched to the roster by
  // email), falling back to their login name if they aren't on the roster yet.
  // Always changeable in the form and on the record.
  const defaultAssignee = () => {
    const me = assignees.find(a => (a.email || '').toLowerCase() === (user?.email || '').toLowerCase());
    if (me) return { assigned_to: me.id, assigned_to_name: me.name };
    return { assigned_to: null, assigned_to_name: user?.email ? user.email.split('@')[0] : '' };
  };

  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_CLIENT);
  const [selected, setSelected] = useState(null); // client being viewed
  const [deleteTarget, setDeleteTarget] = useState(null); // client pending delete confirmation
  const [selectedIds, setSelectedIds] = useState(new Set()); // row checkboxes
  const [tempFilter, setTempFilter] = useState('all'); // leads pipeline filter
  const [view, setView] = useState('board'); // leads: 'board' (default) | 'list'
  const [searchParams, setSearchParams] = useSearchParams();

  const toggleSelectId = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());

  const load = async () => {
    setLoadError('');
    try { setClients(await getClients()); }
    catch (e) { console.error(e); setLoadError(e?.message || 'Failed to load clients'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // Reset the open detail view + selection when switching between /leads and /clients.
  useEffect(() => { setSelected(null); clearSelection(); setTempFilter('all'); setView(kind === 'lead' ? 'board' : 'list'); }, [kind]);

  // Live revenue snapshot for the Clients view (last 30 days + MRR from Stripe).
  const [revStats, setRevStats] = useState(null);
  // Money and project counts per client, so the list answers "how is this
  // relationship doing" without opening anyone.
  const [projByClient, setProjByClient] = useState({});

  // True client MRR comes from the CRM's own retainers, not Stripe's account-wide
  // subscription list (which mixes in other products and misses schedules that
  // have not started billing yet).
  const clientMrr = useMemo(() => {
    let total = 0, count = 0;
    for (const b of Object.values(projByClient || {})) {
      const r = Number(b.recurring) || 0;
      if (r > 0) { total += r; count += 1; }
    }
    return { total, count };
  }, [projByClient]);

  useEffect(() => {
    if (isLeadView) return;
    getDashboardStats().then(d => setRevStats(d?.stripeRevenue || null)).catch(() => {});
    getProjects().then(ps => {
      const by = {};
      for (const p of ps || []) {
        if (!p.client_id || p.archived) continue;
        const b = by[p.client_id] || (by[p.client_id] = { count: 0, value: 0, recurring: 0, paid: 0, names: [] });
        b.count += 1;
        b.value += Number(p.value) || 0;
        // Retainers carry their money in recurring_amount, not value. Without
        // this the Value column reads "-" for every monthly client.
        b.recurring += Number(p.recurring_amount) || 0;
        b.paid += Number(p.amount_paid) || 0;
        if (p.name) b.names.push(p.name);
      }
      setProjByClient(by);
    }).catch(() => {});
  }, [isLeadView]);

  // URL persistence: /leads?open=<id>&step=<idx>&view=<pipeline|details>
  // If we land with ?open=<id> and the row is loaded, open it. We KEEP the id
  // in the URL so navigating away and back restores the same view; the record
  // page also uses the same params to remember which step/tab was active.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) { if (selected) setSelected(null); return; }
    if (!clients.length) return;
    if (selected?.id === openId) return;
    const found = clients.find(c => c.id === openId);
    if (found) setSelected(found);
  }, [searchParams, clients, selected]);

  // Whenever the user opens/closes a record, mirror it into the URL.
  const openRecord = (c) => {
    setSelected(c);
    const next = new URLSearchParams(searchParams);
    next.set('open', c.id);
    setSearchParams(next, { replace: true });
  };
  const closeRecord = () => {
    setSelected(null);
    const next = new URLSearchParams(searchParams);
    ['open', 'step', 'view'].forEach(k => next.delete(k));
    setSearchParams(next, { replace: true });
    load();
  };

  const scoped = useMemo(() =>
    clients.filter(c => isLeadView ? c.stage === 'lead' : c.stage !== 'lead'),
    [clients, isLeadView]
  );

  const filtered = useMemo(() =>
    scoped
      .filter(c => !isLeadView || tempFilter === 'all' || (c.lead_temperature || 'warm') === tempFilter)
      .filter(c => !search ||
        (c.business_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.owner_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.industry || '').toLowerCase().includes(search.toLowerCase()))
      // Clients view: anyone with money attached (retainer or build) sorts to
      // the top, highest first. Clients with no value fall to the bottom.
      .sort((a, b) => {
        if (isLeadView) return 0;
        const val = (c) => {
          const bk = projByClient[c.id];
          return bk ? (Number(bk.recurring) || 0) * 12 + (Number(bk.value) || 0) : 0;
        };
        const d = val(b) - val(a);
        return d !== 0 ? d : (a.business_name || '').localeCompare(b.business_name || '');
      }),
    [scoped, search, isLeadView, tempFilter, projByClient]
  );

  // Persist a temperature / rank change on a lead (optimistic).
  const patchLead = async (id, patch) => {
    setClients(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c));
    try { await updateClient(id, patch); } catch (e) { toast('error', e.message); }
  };
  const bulkSetTemp = async (temp) => {
    const ids = [...selectedIds];
    setClients(cs => cs.map(c => selectedIds.has(c.id) ? { ...c, lead_temperature: temp } : c));
    clearSelection();
    try { await Promise.all(ids.map(id => updateClient(id, { lead_temperature: temp }))); }
    catch (e) { toast('error', e.message); }
  };
  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (!ids.length || !window.confirm(`Delete ${ids.length} ${noun.toLowerCase()}${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setClients(cs => cs.filter(c => !selectedIds.has(c.id)));
    clearSelection();
    try { await Promise.all(ids.map(id => deleteClient(id))); }
    catch (e) { toast('error', e.message); load(); }
  };

  const openAdd = () => { setForm({ ...EMPTY_CLIENT, ...defaultAssignee(), stage: isLeadView ? 'lead' : 'onboarding' }); setModal('add'); };
  const handleCreate = async () => {
    if (!form.business_name.trim()) return;
    try {
      const { firstNote, ...payload } = form;
      // numeric column: '' -> null, otherwise a Number
      payload.potential_value = (payload.potential_value === '' || payload.potential_value == null)
        ? null : Number(payload.potential_value);
      const c = await createClient(payload);
      if (firstNote && firstNote.trim() && c && c.id) {
        await createClientActivity({ client_id: c.id, type: 'note', tag: 'Important', body: firstNote.trim() }).catch(() => {});
      }
      setModal(null); await load(); openRecord(c);
    } catch (e) { toast('error', e.message); }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClient(deleteTarget.id);
      if (selected?.id === deleteTarget.id) closeRecord();
      setDeleteTarget(null);
      await load();
    } catch (e) { toast('error', e.message); }
  };

  usePageActions(() => selected ? null : (
    <button className="btn-primary" onClick={openAdd}><Plus size={15} /> New {noun}</button>
  ), [selected, noun]);

  const deleteModal = deleteTarget && (
    <Modal title={`Delete ${noun}`} onClose={() => setDeleteTarget(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
      <p style={{ color: 'var(--muted)' }}>Delete <strong style={{ color: 'var(--text)' }}>{deleteTarget.business_name}</strong> and all its platforms, tasks, and links? This cannot be undone.</p>
    </Modal>
  );

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    const DetailComponent = (selected.stage === 'lead') ? LeadDetail : ClientDetail;
    return (
      <>
        <DetailComponent
          client={selected}
          onBack={closeRecord}
          onDelete={() => setDeleteTarget(selected)}
          onPatch={(patch) => setSelected(s => ({ ...s, ...patch }))}
        />
        {deleteModal}
      </>
    );
  }

  // ── List view ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder={`Search ${isLeadView ? 'leads' : 'clients'}…`} value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        {/* Leads pipeline filter (cold / warm / hot), list view only; the
            board's columns already are the pipeline. */}
        {isLeadView && view === 'list' && (
          <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
            {[{ key: 'all', label: 'All', color: 'var(--text)' }, ...TEMPERATURES].map(t => {
              const count = t.key === 'all' ? scoped.length : scoped.filter(c => (c.lead_temperature || 'warm') === t.key).length;
              const on = tempFilter === t.key;
              return (
                <button key={t.key} onClick={() => setTempFilter(t.key)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)',
                  background: on ? 'var(--surface)' : 'transparent', color: on ? (t.color === 'var(--text)' ? 'var(--text)' : t.color) : 'var(--muted)',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                }}>
                  {t.label}<span style={{ fontSize: 11, color: 'var(--muted)' }}>{count}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* Leads work as a pipeline, so they keep a board. Clients are a list of
            relationships, not a pipeline, so they no longer have one. */}
        {isLeadView && (
          <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2, marginLeft: 'auto' }}>
            {[{ key: 'board', label: 'Board' }, { key: 'list', label: 'List' }].map(v => {
              const on = view === v.key;
              return (
                <button key={v.key} onClick={() => setView(v.key)} style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)',
                  background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)',
                  boxShadow: on ? 'var(--shadow-sm)' : 'none',
                }}>{v.label}</button>
              );
            })}
          </div>
        )}
      </div>

      {loadError && (
        <div style={{ margin: '12px 20px', padding: '12px 16px', background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, fontSize: 13, color: '#ff5c5c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Couldn't load clients: {loadError}</span>
          <button onClick={load} style={{ padding: '6px 14px', borderRadius: 6, background: '#ff5c5c', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* Client revenue snapshot, last 30 days + recurring, from Stripe. */}
      {!isLeadView && revStats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '14px 24px 2px' }}>
          {[
            { label: 'Revenue · last 30 days', value: money(revStats.windows?.['30d']?.revenue ?? revStats.last30Days), sub: `${revStats.windows?.['30d']?.count ?? revStats.last30Count ?? 0} payments`, color: '#2563eb', Icon: TrendingUp },
            { label: 'Client MRR', value: money(clientMrr.total), sub: `${clientMrr.count} client${clientMrr.count === 1 ? '' : 's'} on retainer`, color: '#16a34a', Icon: Repeat },
            { label: 'This month', value: money(revStats.thisMonth), sub: `${revStats.thisMonthCount || 0} payments`, color: '#7c3aed', Icon: DollarSign },
          ].map((s, i) => (
            <div key={i} style={{
              flex: '1 1 180px', minWidth: 170,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(244,248,255,0.7))',
              backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: '1px solid rgba(37,99,235,0.16)', borderRadius: 14, padding: '13px 16px',
              boxShadow: '0 6px 20px rgba(37,99,235,0.08)',
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <s.Icon size={12} color={s.color} /> {s.label}
              </div>
              <div className="private-value" style={{ fontSize: 21, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
              <div className="private-value" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {!isLeadView && view === 'board' ? (
        <div style={{ padding: '14px 24px 30px' }}>
          <DeliveryBoard onOpen={(id) => { const c = clients.find(x => x.id === id); if (c) openRecord(c); }} />
        </div>
      ) : isLeadView && view === 'board' ? (
        loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60 }}>Loading…</div>
        ) : (
          <LeadsBoard
            leads={filtered}
            onOpen={openRecord}
            onTempChange={(id, t) => patchLead(id, { lead_temperature: t })}
            onRankChange={(id, r) => patchLead(id, { lead_rank: r })}
            onFollowUp={(id, arr) => patchLead(id, { lead_tags: arr, follow_up_status: arr[0] || 'none' })}
            onDelete={setDeleteTarget}
          />
        )
      ) : (
      <>
      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'rgba(37,99,235,0.08)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{selectedIds.size} selected</span>
          {isLeadView && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Set temperature:</span>
              {TEMPERATURES.map(t => (
                <button key={t.key} onClick={() => bulkSetTemp(t.key)} style={{
                  padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  color: t.color, background: `${t.color}18`, border: `1px solid ${t.color}40`,
                }}>{t.label}</button>
              ))}
            </div>
          )}
          <button onClick={bulkDelete} className="btn-ghost" style={{ padding: '5px 12px', color: '#ff5c5c', borderColor: '#ff5c5c55' }}><Trash2 size={13} /> Delete</button>
          <button onClick={clearSelection} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      <div className="table-container desktop-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input type="checkbox"
                  checked={filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))}
                  onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(c => c.id)) : new Set())}
                  style={{ cursor: 'pointer', accentColor: 'var(--orange)' }} />
              </th>
              <th style={{ minWidth: 220 }}>Business</th>
              <th style={{ minWidth: 160 }}>Owner</th>
              {isLeadView
                ? <th style={{ minWidth: 130 }}>Status</th>
                : <th style={{ minWidth: 150 }}>Status</th>}
              {isLeadView ? (
                <>
                  <th style={{ minWidth: 130 }}>Source</th>
                  <th style={{ minWidth: 150 }}>Type</th>
                  <th style={{ minWidth: 140 }}>Assigned</th>
                  <th style={{ minWidth: 120 }}>Added</th>
                </>
              ) : (
                <>
                  <th style={{ minWidth: 150 }}>Projects</th>
                  <th style={{ minWidth: 110 }}>Value</th>
                  <th style={{ minWidth: 120 }}>Outstanding</th>
                  <th style={{ minWidth: 110 }}>Client since</th>
                </>
              )}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No {isLeadView ? 'leads' : 'clients'} yet.</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} style={{ cursor: 'pointer', background: selectedIds.has(c.id) ? 'rgba(37,99,235,0.06)' : undefined }} onClick={() => openRecord(c)}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelectId(c.id)} style={{ cursor: 'pointer', accentColor: 'var(--orange)' }} />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                      {c.logo_url ? <img src={c.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={15} style={{ color: 'var(--muted)' }} />}
                    </div>
                    <span className="pii-name" style={{ fontWeight: 700, color: 'var(--text)' }}>{c.business_name || '-'}</span>
                  </div>
                </td>
                <td><span className="pii-name" style={{ color: 'var(--muted)' }}>{c.owner_name || '-'}</span></td>
                {isLeadView ? (
                  <>
                    <td onClick={e => e.stopPropagation()}><PillSelect value={c.lead_temperature || 'warm'} options={TEMPERATURES} onChange={v => patchLead(c.id, { lead_temperature: v })} /></td>
                  </>
                ) : (
                  <td><StageBadge stage={c.stage} /></td>
                )}
                {isLeadView ? (
                  <>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.source || '-'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{(c.client_type || []).join(', ') || '-'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.assigned_to_name || '-'}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                  </>
                ) : (() => {
                  const b = projByClient[c.id];
                  const outstanding = b ? Math.max(0, b.value - b.paid) : 0;
                  return (
                    <>
                      <td style={{ fontSize: 12.5 }}>
                        {b ? (
                          <span title={b.names.join(', ')} style={{ color: 'var(--text)' }}>
                            {b.count} project{b.count === 1 ? '' : 's'}
                          </span>
                        ) : <span style={{ color: 'var(--muted)' }}>None</span>}
                      </td>
                      <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: b && (b.value || b.recurring) ? 'var(--text)' : 'var(--muted)' }}>
                        {b && (b.value || b.recurring) ? (
                          <span>
                            {b.recurring > 0 && <span style={{ fontWeight: 600 }}>{fmtUsd(b.recurring)}<span style={{ color: 'var(--muted)', fontWeight: 400 }}>/mo</span></span>}
                            {b.recurring > 0 && b.value > 0 && <span style={{ color: 'var(--muted)' }}> + </span>}
                            {b.value > 0 && <span>{fmtUsd(b.value)}</span>}
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', fontWeight: outstanding > 0 ? 700 : 400, color: outstanding > 0 ? '#b45309' : 'var(--muted)' }}>
                        {b && b.value ? (outstanding > 0 ? fmtUsd(outstanding) : 'Paid up')
                          : (b && b.recurring > 0 ? <span style={{ color: 'var(--muted)' }}>Recurring</span> : '-')}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                    </>
                  );
                })()}
                <td onClick={e => e.stopPropagation()}>
                  <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => setDeleteTarget(c)} title={`Delete ${noun.toLowerCase()}`}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mobile-cards">
        {!loading && filtered.map(c => (
          <div key={c.id} className="mobile-card" onClick={() => openRecord(c)} style={{ cursor: 'pointer', position: 'relative', border: selectedIds.has(c.id) ? '1px solid var(--orange)' : undefined }}>
            <div className="mobile-card-row primary" style={{ gap: 8 }}>
              <input type="checkbox" checked={selectedIds.has(c.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelectId(c.id)} style={{ accentColor: 'var(--orange)' }} />
              <Building2 size={14} style={{ color: 'var(--orange)' }} />
              <span className="pii-name">{c.business_name || '-'}</span>
            </div>
            {isLeadView ? (
              <div className="mobile-card-row" style={{ gap: 8 }} onClick={e => e.stopPropagation()}>
                <PillSelect value={c.lead_temperature || 'warm'} options={TEMPERATURES} onChange={v => patchLead(c.id, { lead_temperature: v })} />
              </div>
            ) : (
              <div className="mobile-card-row"><StageBadge stage={c.stage} /></div>
            )}
            {c.owner_name && <div className="mobile-card-row"><span className="pii-name">{c.owner_name}</span></div>}
            <button
              className="btn-ghost"
              style={{ position: 'absolute', top: 10, right: 10, padding: '5px 7px', color: '#ff5c5c' }}
              onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
              title={`Delete ${noun.toLowerCase()}`}
            ><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      </>
      )}

      {deleteModal}

      {modal === 'add' && (
        <Modal title="New Lead / Client" onClose={() => setModal(null)} onSubmit={handleCreate} submitLabel="Create">
          <div className="form-group">
            <label className="form-label">Business Name *</label>
            <input className="form-input" value={form.business_name} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} placeholder="e.g. Harbor & Vine" required autoFocus />
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Contact Name</label>
              <input className="form-input" value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Jane Doe" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" type="tel" value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="(000) 000-0000" />
            </div>
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="you@business.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Source</label>
              <select className="form-input" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {isLeadView && (
            <>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={form.lead_temperature} onChange={e => setForm(f => ({ ...f, lead_temperature: e.target.value }))}>
                  {TEMPERATURES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Potential revenue ($)</label>
                <input className="form-input" type="number" min="0" step="100" value={form.potential_value ?? ''}
                  onChange={e => setForm(f => ({ ...f, potential_value: e.target.value }))} placeholder="e.g. 5000" />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {[{ k: 'one_time', label: 'One-time' }, { k: 'monthly', label: 'Monthly' }].map(o => {
                    const on = (form.potential_value_type || 'one_time') === o.k;
                    return (
                      <button key={o.k} type="button" onClick={() => setForm(f => ({ ...f, potential_value_type: o.k }))} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)', border: `1.5px solid ${on ? 'var(--orange)' : 'var(--border)'}`, background: on ? 'rgba(37,99,235,0.10)' : 'var(--surface)', color: on ? 'var(--orange)' : 'var(--muted)' }}>{o.label}</button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          <div className="form-group">
            <label className="form-label">Interested in</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CLIENT_TYPES.map(t => {
                const on = (form.client_type || []).includes(t);
                return (
                  <button type="button" key={t} onClick={() => setForm(f => ({ ...f, client_type: on ? f.client_type.filter(x => x !== t) : [...(f.client_type || []), t] }))}
                    style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: on ? '1.5px solid var(--orange)' : '1.5px solid var(--border)', background: on ? 'rgba(37,99,235,0.12)' : 'var(--surface)', color: on ? 'var(--orange)' : 'var(--text)' }}>{t}</button>
                );
              })}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Assign to</label>
            <select className="form-input" value={form.assigned_to || ''} onChange={e => {
              const m = assignees.find(a => a.id === e.target.value);
              setForm(f => ({ ...f, assigned_to: m ? m.id : null, assigned_to_name: m ? m.name : '' }));
            }}>
              <option value="">Unassigned</option>
              {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Add a note (optional)</label>
            <input className="form-input" value={form.firstNote} onChange={e => setForm(f => ({ ...f, firstNote: e.target.value }))}
              placeholder="e.g. Met at the restaurant, wants online ordering, follow up Friday" />
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Saved as the first entry in this lead's activity timeline. On the lead you can add more notes anytime, press Enter to save each one.</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Client detail ──────────────────────────────────────────────────────────────
const TABS = [
  { key: 'snapshot', label: 'Overview', icon: LayoutDashboard },
  { key: 'overview', label: 'Profile',  icon: Building2 },
  { key: 'work',     label: 'Work',     icon: Briefcase },
  { key: 'money',    label: 'Money',    icon: DollarSign },
  { key: 'vault',    label: 'Vault',    icon: Lock },
];

// A small titled divider so two former tabs can share one panel without the
// content running together.
function Section({ title, icon: Icon, children, first }) {
  return (
    <div style={{ marginTop: first ? 0 : 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {Icon && <Icon size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      {children}
    </div>
  );
}

function ClientDetail({ client, onBack, onDelete, onPatch, children }) {
  const [tab, setTab] = useState('snapshot');

  const saveField = async (field, value) => {
    onPatch({ [field]: value });
    try { await updateClient(client.id, { [field]: value }); }
    catch (e) { toast('error', e.message); }
  };

  const stage = stageOf(client.stage);
  const initials = (client.business_name || client.owner_name || '?').trim().slice(0, 2).toUpperCase();
  const phone = client.contact_phone || client.phone || '';
  const email = client.contact_email || client.email || '';
  // The agreement builder already lives on the Money tab, so Draft agreement
  // just takes them there.
  const draftAgreement = () => setTab('money');

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Back bar */}
      <div style={{ padding: '14px 28px 0' }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--orange)' }}>
          <ArrowLeft size={15} /> Back to {stage.key === 'lead' ? 'leads' : 'clients'}
        </button>
      </div>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 28px 20px' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--muted)', fontSize: 18 }}>
          {client.logo_url ? <img src={client.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pii-name" style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.1, letterSpacing: '-0.01em' }}>{client.business_name || '-'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{client.owner_name || 'No owner set'}</span>
            {client.source && <span style={{ fontSize: 12, color: 'var(--muted)' }}>· via {client.source}</span>}
            {(client.client_type || []).map(t => (
              <span key={t} style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 999, padding: '2px 9px' }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button className="btn-ghost" style={{ padding: '8px 10px', color: '#ff5c5c' }} onClick={onDelete} title="Delete"><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Reach them, or start an agreement */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 28px 18px' }}>
        <QuickAction icon={MessageSquare} label="Message" to={phone ? `/inbox?phone=${encodeURIComponent(phone)}` : null} disabled={!phone} title={phone ? 'Open the conversation in the inbox' : 'No phone number on file'} />
        <QuickAction icon={Phone} label="Call" href={phone ? `tel:${phone}` : null} disabled={!phone} title={phone || 'No phone number on file'} />
        <QuickAction icon={Mail} label="Email" href={email ? `mailto:${email}` : null} disabled={!email} title={email || 'No email on file'} />
        <QuickAction icon={FileSignature} label="Draft agreement" onClick={draftAgreement} primary title="Opens the agreement builder on the Money tab" />
      </div>

      {/* Two-column: vertical sidebar + content */}
      <div style={{ padding: '0 28px 40px' }}>
        {/* Horizontal tabs: the Overview snapshot, then four grouped panels */}
        <nav style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
          {TABS.map(t => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                background: 'none', border: 'none', borderBottom: `2px solid ${on ? 'var(--orange)' : 'transparent'}`,
                marginBottom: -1, cursor: 'pointer', whiteSpace: 'nowrap',
                color: on ? 'var(--text)' : 'var(--muted)', fontSize: 13.5, fontWeight: on ? 700 : 600,
                fontFamily: 'var(--font-display)', transition: 'color 0.15s, border-color 0.15s',
              }}>
                <t.icon size={15} style={{ flexShrink: 0 }} /> {t.label}
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div style={{ minWidth: 0 }}>
          {tab === 'snapshot' && (
            <ClientOverviewTab client={client} onDraftAgreement={draftAgreement} />
          )}
          {tab === 'overview' && (<>
            <OverviewTab client={client} saveField={saveField} />
            <Section title="Activity" icon={Activity}><ActivityTab clientId={client.id} /></Section>
          </>)}
          {tab === 'work' && (<>
            <Section title="Projects" icon={Briefcase} first><ProjectsTab client={client} /></Section>
            <Section title="Onboarding tasks" icon={ListChecks}><TasksTab clientId={client.id} /></Section>
          </>)}
          {tab === 'money' && (<>
            <Section title="Agreement" icon={FileSignature} first><AgreementTab client={client} /></Section>
            <Section title="Deals" icon={DollarSign}><DealsTab client={client} /></Section>
          </>)}
          {tab === 'vault' && (<>
            <Section title="Files" icon={Lock} first><VaultTab clientId={client.id} /></Section>
            <Section title="Platforms & access" icon={KeyRound}><AccessTab clientId={client.id} /></Section>
          </>)}
        </div>
      </div>
      {children}
    </div>
  );
}

// One of the reach-them buttons at the top of the client page: an internal
// route (`to`), an external or protocol link (`href`), or a plain handler.
function QuickAction({ icon: Icon, label, to, href, onClick, disabled, primary, title }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
    padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700,
    fontFamily: 'var(--font-display)', textDecoration: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
    background: primary ? 'linear-gradient(135deg, var(--orange), var(--orange-dark))' : 'var(--surface)',
    border: primary ? 'none' : '1px solid var(--border)',
    color: primary ? '#fff' : 'var(--text)',
  };
  const inner = <>{Icon && <Icon size={14} />} {label}</>;
  if (disabled) return <span style={base} title={title}>{inner}</span>;
  if (to) return <Link to={to} style={base} title={title}>{inner}</Link>;
  if (href) return <a href={href} style={base} title={title}>{inner}</a>;
  return <button type="button" onClick={onClick} style={base} title={title}>{inner}</button>;
}

// ── Client Overview tab ───────────────────────────────────────────────────────
// The merged snapshot the iPhone app's client page opens on: what is next, the
// balance, the plan, the latest files, and one activity stream with a colored
// dot per kind. Fed by getClientOverview (GET /client-activity?view=overview),
// which is a separate call from the raw Activity list below the Profile tab.
const OV_KIND_DOT = { text: 'var(--text)', meeting: '#7c3aed', payment: '#16a34a', nudge: '#64748b' };
const ovDot = (a) => {
  // An agreement is amber (or red) while it is still unsigned, green once signed.
  if (a.kind === 'agreement') return a.severity === 'red' ? '#ef4444' : a.severity === 'amber' ? '#f59e0b' : '#16a34a';
  return OV_KIND_DOT[a.kind] || '#64748b';
};
const ovIsUnsignedAgreement = (a) => a.kind === 'agreement'
  && (a.severity === 'amber' || a.severity === 'red' || /unsigned|waiting|not signed/i.test(`${a.title || ''} ${a.sub || ''}`));
const OV_PLAN_TONE = {
  unsigned:  { label: 'Unsigned',  color: '#f59e0b' },
  draft:     { label: 'Draft',     color: '#64748b' },
  active:    { label: 'Active',    color: '#16a34a' },
  signed:    { label: 'Signed',    color: '#16a34a' },
  past_due:  { label: 'Past due',  color: '#ef4444' },
  paused:    { label: 'Paused',    color: '#64748b' },
  cancelled: { label: 'Cancelled', color: '#64748b' },
};
const ovPlanTone = (s) => OV_PLAN_TONE[s]
  || { label: String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) || 'Plan', color: '#64748b' };
// A date-only string ("2026-10-15") is a local calendar day, not UTC midnight.
const ovParse = (s) => {
  if (!s) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? `${s}T12:00:00` : s);
  return isNaN(d) ? null : d;
};
const ovDay = (s) => { const d = ovParse(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
const ovWhen = (s) => { const d = ovParse(s); return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
// An older deploy answers with the bare activity rows; fold that into the bundle
// so the tab still renders something useful.
const ovNormalize = (r) => {
  if (Array.isArray(r)) {
    return {
      activity: r.map(x => ({
        id: x.id,
        kind: x.type || 'note',
        at: x.created_at,
        title: x.title || x.tag || String(x.type || 'note').replace(/^./, c => c.toUpperCase()),
        sub: x.body ? String(x.body).slice(0, 160) : null,
      })),
    };
  }
  return r && typeof r === 'object' ? r : {};
};

const ovTile = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
};
const ovLabel = {
  fontSize: 10.5, fontWeight: 800, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
};
const ovRow = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
  borderTop: '1px solid var(--border)',
};
const ovRowTitle = { fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const ovRowSub = { fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const ovPanel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px 4px' };
const ovNote = { fontSize: 12.5, color: 'var(--muted)', padding: '8px 0 14px' };

function OvDot({ color }) {
  const halo = String(color).startsWith('#') ? `0 0 0 3px ${color}22` : 'none';
  return <span style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: color, boxShadow: halo }} />;
}

function OvSmallButton({ icon: Icon, label, onClick, href }) {
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
    fontSize: 12, fontWeight: 600, color: 'var(--orange)', textDecoration: 'none',
    background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.3)',
    borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
    fontFamily: 'var(--font-display)',
  };
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={style}>{Icon && <Icon size={12} />} {label}</a>;
  return <button type="button" onClick={onClick} style={style}>{Icon && <Icon size={12} />} {label}</button>;
}

function ClientOverviewTab({ client, onDraftAgreement }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);   // 503 needs_migration: stay quiet
  const [error, setError] = useState('');
  const [nudge, setNudge] = useState(null);        // { kind: 'agreement', id }
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true); setError(''); setPending(false);
    getClientOverview(client.id)
      .then(r => { if (live) setData(ovNormalize(r)); })
      .catch(e => {
        if (!live) return;
        setData(null);
        if (e.needs_migration || e.status === 503) setPending(true);
        else setError(e.message || 'Could not load the overview');
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client.id, reloadKey]);

  if (loading) return <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading overview...</div>;
  if (pending) return <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.6, maxWidth: 520 }}>The overview is not switched on yet. The Profile, Work, Money and Vault tabs still work.</div>;
  if (error) {
    return (
      <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 520 }}>
        Could not load the overview: {error}
      </div>
    );
  }

  const files = data?.files || [];
  const activity = data?.activity || [];
  const nextUp = data?.next_up || null;
  const bal = data?.balance || {};
  const plan = data?.plan || null;
  const total = Number(bal.total) || 0;
  const paid = Number(bal.paid) || 0;
  const due = Number(bal.due) || 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((paid / total) * 100))) : 0;
  const tone = plan ? ovPlanTone(plan.status) : null;
  const directions = nextUp?.maps_url
    || (nextUp?.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nextUp.location)}` : null);

  // The agreement row carries the agreement's own id on newer replies; fall
  // back to the row id so the nudge still has a target.
  const nudgeAgreement = (a) => {
    const id = a.agreement_id || a.target_id || a.id;
    if (!id) { toast('error', 'No unsigned agreement is on file for this client.'); return; }
    setNudge({ kind: 'agreement', id });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Next: the next meeting, with a way to get there */}
      <div style={{ ...ovTile, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={ovLabel}>Next</span>
          {nextUp ? (
            <>
              <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{nextUp.title || 'Meeting'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {[ovWhen(nextUp.start_time), nextUp.location || (nextUp.meet_link ? 'Google Meet' : null)].filter(Boolean).join(' · ')}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>Nothing scheduled</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Book the next meeting from the calendar.</div>
            </>
          )}
        </div>
        {nextUp?.meet_link
          ? <OvSmallButton icon={Video} label="Join" href={nextUp.meet_link} />
          : directions ? <OvSmallButton icon={Navigation} label="Directions" href={directions} /> : null}
      </div>

      {/* Balance + plan */}
      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
        <div style={ovTile}>
          <span style={ovLabel}>Balance</span>
          <div className="private-value" style={{ fontSize: 26, fontWeight: 800, color: due > 0 ? 'var(--text)' : '#16a34a', fontFamily: 'var(--font-display)', lineHeight: 1.1 }}>{money(due)}</div>
          <div className="private-value" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {due > 0 ? (bal.due_on ? `due ${ovDay(bal.due_on)}` : 'due') : 'nothing due'}
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#16a34a' }} />
          </div>
          <div className="private-value" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{money(paid)} of {money(total)} paid</div>
        </div>
        <div style={ovTile}>
          <span style={ovLabel}>Plan</span>
          {plan ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{plan.label || 'Plan'}</div>
              <div className="private-value" style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                {[plan.monthly ? `${money(plan.monthly)}/mo` : null, plan.starts ? `starts ${ovDay(plan.starts)}` : null].filter(Boolean).join(' · ') || 'One-time'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <OvDot color={tone.color} />
                <span style={{ fontSize: 12, fontWeight: 700, color: tone.color }}>{tone.label}</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>No plan yet</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Draft an agreement to set one.</div>
            </>
          )}
        </div>
      </div>

      {/* Files */}
      <div style={ovPanel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
          <span style={{ ...ovLabel, letterSpacing: '0.09em' }}>Files</span>
          <div style={{ flex: 1 }} />
          {files.length > 0 && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{files.length} {files.length === 1 ? 'file' : 'files'}</span>}
        </div>
        {files.length === 0 ? <div style={ovNote}>No files yet.</div> : files.slice(0, 6).map((f, i) => (
          <div key={f.id || `${f.name}-${i}`} style={ovRow}>
            <FileIcon size={15} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={ovRowTitle}>{f.name || 'File'}</div>
              <div style={ovRowSub}>{[f.by_name, ovDay(f.at)].filter(Boolean).join(' · ') || 'File'}</div>
            </div>
            {f.url && <OvSmallButton icon={ExternalLink} label="Open" href={f.url} />}
          </div>
        ))}
      </div>

      {/* Recent activity: texts, agreements, meetings, payments and nudges in one list */}
      <div style={ovPanel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
          <span style={{ ...ovLabel, letterSpacing: '0.09em' }}>Recent activity</span>
          <div style={{ flex: 1 }} />
          {activity.length > 10 && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>latest 10 of {activity.length}</span>}
        </div>
        {activity.length === 0 ? <div style={ovNote}>Nothing yet. Texts, meetings, payments, agreements and nudges land here.</div> : activity.slice(0, 10).map((a, i) => (
          <div key={a.id || `${a.kind}-${a.at}-${i}`} style={ovRow}>
            <OvDot color={ovDot(a)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="private-value" style={ovRowTitle}>{a.title || String(a.kind || 'activity').replace(/^./, c => c.toUpperCase())}</div>
              <div className="private-value" style={ovRowSub}>{[a.sub, ovWhen(a.at)].filter(Boolean).join(' · ')}</div>
            </div>
            {ovIsUnsignedAgreement(a)
              ? <OvSmallButton icon={SendIcon} label="Nudge" onClick={() => nudgeAgreement(a)} />
              : a.link ? <OvSmallButton icon={ExternalLink} label="Open" href={a.link} /> : null}
          </div>
        ))}
      </div>

      {!plan && (
        <div>
          <button type="button" className="btn-primary" onClick={onDraftAgreement}>
            <FileSignature size={14} /> Draft agreement
          </button>
        </div>
      )}

      {nudge && (
        <NudgeModal
          kind={nudge.kind}
          id={nudge.id}
          onClose={() => setNudge(null)}
          onSent={() => setReloadKey(k => k + 1)}
        />
      )}
    </div>
  );
}

// Follow-up status + last-contact quick control, shown in the profile header.
function FollowUpControl({ client, saveField }) {
  const [logging, setLogging] = useState(false);
  const fu = followUpOf(client.follow_up_status || 'none');
  const logContact = async (channel) => {
    const now = new Date().toISOString();
    saveField('last_contact_at', now);
    saveField('last_contact_channel', channel);
    try {
      await updateClient(client.id, { last_contact_at: now, last_contact_channel: channel });
    } catch (e) { toast('error', e.message); }
    setLogging(false);
  };
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
      {client.last_contact_at && (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
          Last: <b style={{ color: 'var(--text)' }}>{client.last_contact_channel || 'touch'} {timeSince(client.last_contact_at)}</b>
        </span>
      )}
      <select
        value={client.follow_up_status || 'none'}
        onChange={e => saveField('follow_up_status', e.target.value)}
        style={{ padding: '8px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999, cursor: 'pointer',
          color: fu.color, background: `${fu.color}14`, border: `1px solid ${fu.color}40`, fontFamily: 'var(--font-display)' }}>
        {FOLLOW_UPS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <button className="btn-ghost" onClick={() => setLogging(o => !o)} title="Log a contact" style={{ padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600 }}>
        <Phone size={13} /> Log
      </button>
      {logging && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 40, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', padding: 6, minWidth: 160 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 10px 4px' }}>Log last contact</div>
          {CONTACT_CHANNELS.map(ch => (
            <button key={ch} onClick={() => logContact(ch)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--text)', fontSize: 13 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {ch} · now
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Lead one-page view (business details + activity timeline) ───────────────
const ACT_CATS = [
  { key: 'Call',    color: '#2563eb', icon: Phone },
  { key: 'Meeting', color: '#7c3aed', icon: Calendar },
  { key: 'Update',  color: '#16a34a', icon: StickyNote },
  { key: 'Idea',    color: '#d97706', icon: Flag },
];
const catOf = (k) => ACT_CATS.find(c => c.key === k);
const isSummary = (a) => a.tag === 'Summary' || (a.body || '').startsWith('📝');
const actDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const LEAD_STEPS = [
  { key: 'discuss',   label: 'Discuss',            blurb: 'Tell the assistant what to work on; it reads the documents and drafts the terms.' },
  { key: 'terms',     label: 'Terms',              blurb: 'Confirm standard pricing or a payment plan.' },
  { key: 'agreement', label: 'Agreement',          blurb: 'Review the auto-generated agreement and approve it.' },
  { key: 'deals',     label: 'Deals & Projects',   blurb: 'Create the deal and projects with pricing.' },
  { key: 'payment',   label: 'Payment',            blurb: 'Choose which payment plans to offer the client in their portal.' },
  { key: 'proposal',  label: 'Proposal',           blurb: 'Draft the cover email to the client, with their portal link.' },
  { key: 'send',      label: 'Send',               blurb: 'Send the agreement to sign and the proposal email, then track it.' },
];

// In custom-payment-plan mode the client picks a plan (and signs) in their
// portal, so the admin pipeline skips the fixed Agreement + Payment steps.
function stepsFor(mode) {
  return mode === 'custom' ? LEAD_STEPS.filter(s => s.key !== 'agreement' && s.key !== 'payment') : LEAD_STEPS;
}

// Register a step's primary action into the pipeline's sticky footer button, so
// approving the step and advancing are one click. onClick is kept in a ref so the
// footer object stays stable (only re-set when label/disabled/busy change).
function useStepFooter(setFooter, { label, disabled, busy, onClick }) {
  const ref = useRef(onClick);
  ref.current = onClick;
  useEffect(() => {
    setFooter({ label, disabled: !!disabled, busy: !!busy, onClick: () => ref.current && ref.current() });
    return () => setFooter(null);
  }, [label, disabled, busy, setFooter]);
}

// Lightweight markdown → styled document HTML (headings, bold, bullets, rules).
function mdToDocHtml(md) {
  if (!md) return '';
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\b_(.+?)_\b/g, '<em>$1</em>');
  const lines = md.split('\n');
  let html = '', inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    if (/^(---|___|\*\*\*)\s*$/.test(line.trim())) { closeList(); html += '<div style="height:1px;background:#e5e7eb;margin:16px 0"></div>'; continue; }
    if (/^#{1,6}\s/.test(line)) {
      closeList();
      const level = line.match(/^#+/)[0].length;
      const txt = inline(line.replace(/^#+\s*/, ''));
      const size = level === 1 ? 20 : level === 2 ? 15 : 13.5;
      html += `<div style="font-weight:800;font-size:${size}px;margin:${level <= 2 ? '18px 0 8px' : '12px 0 4px'};color:#111827;font-family:var(--font-display)">${txt}</div>`;
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) { html += '<ul style="margin:4px 0;padding-left:20px">'; inList = true; }
      html += `<li style="margin:4px 0;line-height:1.6">${inline(line.replace(/^[-*]\s+/, ''))}</li>`;
    } else {
      closeList();
      html += `<p style="margin:7px 0;line-height:1.65">${inline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

// Step 0, Discuss: a chat assistant that reads the lead's documents + notes,
// asks Ray clarifying questions, and writes the terms summary that feeds the
// agreement. When it has scope + pricing it marks the terms ready and Ray moves on.
function DiscussStep({ client, chatLog, setChatLog, termsText, setTermsText, setFooter, onReady, onRestart }) {
  const GREETING = { role: 'assistant', content: `What would you like to work on for ${client.business_name || 'this lead'}? For example: "Create a contract for a website rebuild, 3,500 dollars with a 50 percent deposit." I will read this lead's documents and notes, then ask anything we should nail down before drafting.` };
  const [messages, setMessages] = useState(() => (Array.isArray(chatLog) && chatLog.length) ? chatLog : [GREETING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(!!(termsText && termsText.trim()));
  const scrollRef = useRef(null);

  useEffect(() => { setChatLog(messages); }, [messages]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setBusy(true);
    try {
      const apiMsgs = next.slice(next.findIndex(m => m.role === 'user')); // Claude must start on a user turn
      const res = await agreementChat(client.id, apiMsgs);
      setMessages(m => [...m, { role: 'assistant', content: res.reply || '…' }]);
      if (res.ready && res.terms && res.terms.trim()) { setTermsText(res.terms); setReady(true); }
    } catch (e) {
      toast('error', e.message);
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, something went wrong on my end. Please try that again.' }]);
    } finally { setBusy(false); }
  };

  useStepFooter(setFooter, {
    label: ready ? 'Next: Terms' : 'Answer a few questions first',
    disabled: !ready,
    onClick: onReady,
  });

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', height: 'calc(100vh - 300px)', minHeight: 320, paddingBottom: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(37,99,235,0.12)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={17} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Discuss the deal</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>The assistant reads this lead's documents and notes to help shape the terms.</div>
        </div>
      </div>

      {/* Chat transcript, grows to fill, scrolls on its own */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', padding: '4px 2px' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '82%', padding: '11px 14px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: m.role === 'user' ? 'var(--orange)' : 'var(--surface)', color: m.role === 'user' ? '#fff' : 'var(--text)', border: m.role === 'user' ? 'none' : '1px solid var(--border)',
              borderBottomRightRadius: m.role === 'user' ? 4 : 14, borderBottomLeftRadius: m.role === 'user' ? 14 : 4 }}>{m.content}</div>
          </div>
        ))}
        {busy && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '11px 14px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Spinner /> Thinking…</div>
          </div>
        )}
      </div>

      {/* Terms-ready banner */}
      {ready && termsText && (
        <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <CheckCircle2 size={16} style={{ color: '#22c55e' }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Terms ready</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Continue with Next, or keep chatting to refine.</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{termsText}</div>
        </div>
      )}

      {/* Input, pinned at the bottom, just above the step-count footer */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <textarea className="form-input" rows={2} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type what you want to work on, or answer the assistant…" style={{ flex: 1, resize: 'none' }} />
        <button className="btn-primary" onClick={send} disabled={!input.trim() || busy} style={{ alignSelf: 'stretch', padding: '0 18px' }}>Send</button>
      </div>
    </div>
  );
}

// Step 1, Terms: pick the pricing structure. Scope + pricing come from Discuss.
function TermsStep({ client, savedDraft, termsText, setTermsText, onApprove, setFooter, paymentMode, setPaymentMode }) {
  // Scope + pricing come from the Discuss chat (termsText). This step only picks
  // the pricing structure. For Standard, clicking Next drafts the agreement; for
  // Payment Plan, Ray sets the value + which plans to offer and the client picks
  // (and signs) in their portal.
  const stepKey = (n) => `vtm-terms-${client.id}-${n}`;
  const cached = (n, def) => { try { const r = localStorage.getItem(stepKey(n)); return r == null ? def : JSON.parse(r); } catch { return def; } };
  const stash = (n, v) => { try { if (v == null || v === '') localStorage.removeItem(stepKey(n)); else localStorage.setItem(stepKey(n), JSON.stringify(v)); } catch {} };

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const allow = paymentMode === 'custom';
  const [total, setTotalInternal] = useState(() => cached('total', ''));
  const setTotal = (v) => { setTotalInternal(v); stash('total', v); };
  const [maint, setMaintInternal] = useState(() => cached('maint', ''));
  const setMaint = (v) => { setMaintInternal(v); stash('maint', v); };
  const [offered, setOffered] = useState(null); // { planKey: bool }

  useEffect(() => {
    (async () => {
      try {
        const d = await getAgreements(client.id);
        const ag = (d.agreements || [])[0];
        if (ag && ag.payment_mode === 'custom') {
          setPaymentMode('custom');
          if (ag.total_amount) setTotal(String(ag.total_amount));
          if (ag.terms?.maintenance) setMaint(String(ag.terms.maintenance));
          if (Array.isArray(ag.plan_options) && ag.plan_options.length) {
            setOffered(Object.fromEntries(computePlans(ag.total_amount).map(p => [p.key, ag.plan_options.some(o => o.key === p.key)])));
          }
        }
      } catch (e) { /* no agreement yet, fine */ }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  // Default all plans "on" once a value is present in custom mode.
  useEffect(() => {
    if (allow && Number(total) > 0 && !offered) {
      setOffered(Object.fromEntries(computePlans(Number(total)).map(p => [p.key, true])));
    }
  }, [allow, total]);

  // Payment-plan mode: pull a build value / maintenance estimate from the notes.
  const runEstimate = async () => {
    setBusy('estimate');
    try {
      const a = await analyzeDeal(client.id);
      if (a.suggested_total) setTotal(String(a.suggested_total));
      if (Array.isArray(a.suggested_monthly) && a.suggested_monthly[0]) setMaint(String(a.suggested_monthly[0].amount || ''));
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  // Standard mode: Next drafts the agreement from the Discuss terms, then the
  // Agreement step reviews it.
  const generateFixed = async () => {
    if (!termsText || !termsText.trim()) { toast('error', 'Draft the terms in the Discuss step first.'); return; }
    setBusy('generate');
    try {
      const d = await generateAgreement(client.id, termsText);
      onApprove(d);
      toast('success', 'Agreement drafted. Review it on the Agreement step.');
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const approveCustom = async () => {
    setBusy('approve');
    try {
      const plans = computePlans(Number(total)).filter(p => offered?.[p.key]);
      // Generate the base agreement + NDA (with a {{PAYMENT_SCHEDULE}} placeholder);
      // the client's plan choice fills in the concrete schedule at signing.
      const doc = await generateAgreement(client.id, `Build value $${Number(total)}${Number(maint) ? `, plus $${Number(maint)}/mo maintenance` : ''}. The client selects a custom payment plan in their portal.`, null, 'custom');
      if (!doc?.agreement_markdown) { toast('error', 'Could not draft the agreement, please click Approve again.'); setBusy(''); return; }
      await setupCustomAgreement(client.id, { total: Number(total), maintenance: Number(maint) || 0, plan_options: plans, agreement_markdown: doc.agreement_markdown, nda_markdown: doc.nda_markdown || null, recap: doc.recap || null, features: Array.isArray(doc.features) ? doc.features : null });
      onApprove({ total: Number(total), custom: true });
      toast('success', 'Payment-plan options saved, the client picks one in their portal.');
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const offeredCount = offered ? Object.values(offered).filter(Boolean).length : 0;
  const canContinue = allow ? (Number(total) > 0 && offeredCount > 0) : !!(termsText && termsText.trim());
  useStepFooter(setFooter, {
    label: allow ? (busy === 'approve' ? 'Approving…' : 'Approve plan') : (busy === 'generate' ? 'Generating agreement…' : 'Next: generate agreement'),
    disabled: !canContinue || busy === 'approve' || busy === 'generate',
    busy: busy === 'approve' || busy === 'generate',
    onClick: allow ? approveCustom : generateFixed,
  });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading terms…</div>;

  const plans = allow && Number(total) > 0 ? computePlans(Number(total)) : [];

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Pricing structure</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Choose how the client pays. The scope and pricing were captured in the Discuss step.</div>
      </div>

      {/* Standard vs Payment Plan, two big button cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        {[
          { key: 'fixed',  title: 'Standard Pricing', blurb: 'One fixed agreement with the terms from Discuss. Clicking Next drafts it.', icon: FileSignature },
          { key: 'custom', title: 'Payment Plan',     blurb: 'Let the client pick from the plans you offer, then sign in their portal.', icon: DollarSign },
        ].map(opt => {
          const on = (opt.key === 'custom') === allow;
          const Icon = opt.icon;
          return (
            <button key={opt.key} type="button" onClick={() => setPaymentMode(opt.key)}
              style={{ textAlign: 'left', cursor: 'pointer', background: on ? 'rgba(255,155,38,0.08)' : 'var(--surface)', border: `2px solid ${on ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12, transition: 'all 0.15s' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: on ? 'var(--orange)' : 'var(--surface-2)', color: on ? '#111' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{opt.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5 }}>{opt.blurb}</div>
              </div>
              {on && <CheckCircle2 size={18} style={{ color: 'var(--orange)', flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>

      {allow ? (
        /* ── Custom payment-plan mode ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '200px 200px minmax(0,1fr)', gap: 16, alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Build value ($)</label>
              <input className="form-input" type="number" min="0" step="100" value={total} onChange={e => { setTotal(e.target.value); setOffered(null); }} placeholder="e.g. 5000" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Maintenance ($/mo)</label>
              <input className="form-input" type="number" min="0" step="10" value={maint} onChange={e => setMaint(e.target.value)} placeholder="e.g. 199" />
            </div>
            <button className="btn-ghost" style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 7 }} disabled={busy === 'estimate'} onClick={runEstimate}>
              {busy === 'estimate' ? <><Spinner /> Estimating…</> : <><Sparkles size={14} /> Estimate from notes</>}
            </button>
          </div>
          {Number(maint) > 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -6 }}>{money(Number(maint))}/mo maintenance applies to every plan, starting the month after the last plan payment.</div>}

          {plans.length > 0 ? (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Plans to offer the client</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {plans.map(p => {
                  const on = !!offered?.[p.key];
                  return (
                    <div key={p.key} onClick={() => setOffered(o => ({ ...o, [p.key]: !o?.[p.key] }))}
                      style={{ cursor: 'pointer', background: 'var(--surface)', border: `1px solid ${on ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {on ? <CheckCircle2 size={18} style={{ color: 'var(--orange)' }} /> : <Circle size={18} style={{ color: 'var(--muted)' }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{p.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{p.summary}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>{money(p.deposit)} <span style={{ fontWeight: 500, color: 'var(--muted)', fontSize: 12 }}>today</span></div>
                          {p.installments.length > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>then {p.installments.length === 1 ? money(p.installments[0].amount) : `${p.installments.length} × ${money(p.installments[0].amount)}`}</div>}
                        </div>
                      </div>
                      {p.finance_charge ? <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, paddingLeft: 28 }}>Includes {money(p.finance_charge)} financing · total {money(p.grand_total)}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>Set the build value above (or estimate it) to see the plans you can offer.</div>
          )}
        </div>
      ) : (
        /* ── Standard mode, the editable terms captured in Discuss ── */
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Terms from your discussion</div>
          <textarea
            className="form-input"
            value={termsText || ''}
            onChange={e => setTermsText && setTermsText(e.target.value)}
            placeholder="No terms yet. Go back to the Discuss step and tell the assistant what to build, or type the terms here."
            style={{ width: '100%', minHeight: 200, resize: 'vertical', lineHeight: 1.6, fontSize: 13.5 }}
          />
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--muted)' }}>
            <FileSignature size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
            <span>Edit anything above, then click <b style={{ color: 'var(--text)' }}>Next: generate agreement</b> below and the full agreement drafts from these terms on the next step.</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Step 2, Deals & Projects: turn the approved terms into a billable deal +
// project line items (one-time and monthly), so invoicing/Stripe can bill them.
function DealsStep({ client, termsDraft, savedDealId, onCreated, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState(null); // an existing deal for this client, if any
  const [name, setName] = useState(`${client.business_name || 'Client'} · Service Agreement`);
  const [items, setItems] = useState([]);
  const [seeding, setSeeding] = useState(false); // AI building the line items
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const deals = await getDeals(client.id);
        if (deals && deals.length) setDeal(deals[0]);
      } catch (e) { /* none yet */ }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  // The crude fallback: one build line (sum of installments) + a maintenance line.
  const fallbackSeed = () => {
    const seed = [];
    const buildTotal = Array.isArray(termsDraft?.installments)
      ? termsDraft.installments.reduce((s, i) => s + Number(i.amount || 0), 0)
      : (termsDraft?.total || 0);
    if (buildTotal > 0) seed.push({ name: 'Custom CRM Build', scope: '', value: buildTotal, recurring: 0 });
    const maint = Array.isArray(termsDraft?.monthly) ? termsDraft.monthly[0] : null;
    if (maint?.amount) seed.push({ name: maint.item || 'Maintenance & Support', scope: '', value: 0, recurring: Number(maint.amount) });
    return seed.length ? seed : [{ name: '', scope: '', value: 0, recurring: 0 }];
  };

  // Auto-fill the line items from the agreement (AI) once the builder is showing
  // (no deal, or an existing deal that has no projects yet). Ray just reviews.
  useEffect(() => {
    if (loading || items.length || seeded) return;
    if (deal && (deal.projects || []).length > 0) return;
    if (deal?.name) setName(deal.name);
    setSeeded(true);
    setSeeding(true);
    (async () => {
      try {
        const r = await suggestProjects(client.id);
        const ps = (r.projects || []).filter(p => p.name).map(p => ({
          name: p.name, scope: p.scope || '', value: Number(p.value) || 0, recurring: Number(p.recurring) || 0,
        }));
        setItems(ps.length ? ps : fallbackSeed());
      } catch (e) {
        setItems(fallbackSeed());
      } finally { setSeeding(false); }
    })();
  }, [loading, deal]);

  const setItem = (idx, patch) => setItems(xs => xs.map((x, i) => i === idx ? { ...x, ...patch } : x));
  const addItem = () => setItems(xs => [...xs, { name: '', scope: '', value: 0, recurring: 0 }]);
  const removeItem = (idx) => setItems(xs => xs.filter((_, i) => i !== idx));

  const oneTimeTotal = items.reduce((s, i) => s + Number(i.value || 0), 0);
  const monthlyTotal = items.reduce((s, i) => s + Number(i.recurring || 0), 0);

  const billingType = (it) => (Number(it.value) > 0 && Number(it.recurring) > 0) ? 'both' : (Number(it.recurring) > 0 ? 'monthly' : 'one_time');

  const create = async () => {
    const valid = items.filter(i => i.name.trim() && (Number(i.value) > 0 || Number(i.recurring) > 0));
    if (!valid.length) { toast('error', 'Add at least one project line with a name and an amount.'); return; }
    setBusy(true);
    try {
      // Reuse an existing (empty) deal if there is one; otherwise create it.
      const dealId = deal?.id || (await createDeal({ client_id: client.id, name: name.trim() })).id;
      const created = [];
      for (const it of valid) {
        const p = await createProject({
          client_id: client.id, deal_id: dealId, name: it.name.trim(), scope: (it.scope || '').trim() || null,
          value: Number(it.value) || 0, recurring_amount: Number(it.recurring) || 0,
          billing_type: billingType(it), plan_status: 'none', status: 'active',
        });
        created.push(Array.isArray(p) ? p[0] : p);
      }
      // Attach the new projects to the deal (and sync the name if it changed).
      const ids = created.map(p => p?.id).filter(Boolean);
      if (ids.length) await updateDeal(dealId, { project_ids: ids, ...(deal && name.trim() && name.trim() !== deal.name ? { name: name.trim() } : {}) }).catch(() => {});
      toast('success', deal ? 'Projects added to the deal.' : 'Deal & projects created.');
      onCreated(dealId);
    } catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const hasProjects = deal && (deal.projects || []).length > 0;
  useStepFooter(setFooter, hasProjects
    ? { label: 'Continue', onClick: () => onCreated(deal.id) }
    : { label: deal ? 'Add projects to deal' : 'Create deal & projects', disabled: loading || busy || seeding, busy, onClick: create });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;

  // Already has projects, show it read-only and let Ray continue.
  if (hasProjects) {
    const ps = deal.projects || [];
    return (
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Deal &amp; projects</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>A deal already exists for this client. Review it below, then continue.</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Briefcase size={16} style={{ color: 'var(--orange)' }} />
            <span style={{ fontWeight: 800, color: 'var(--text)', flex: 1 }}>{deal.name}</span>
          </div>
          {ps.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)' }}>No projects on this deal yet.</div>}
          {ps.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ flex: 1, color: 'var(--text)', fontSize: 13.5 }}>{p.name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>{p.billing_type !== 'monthly' && p.value ? money(p.value) : ''}{p.recurring_amount ? ` · ${money(p.recurring_amount)}/mo` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>{deal ? 'Add projects to the deal' : 'Create the deal & projects'}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        {deal ? 'These line items were built from the agreement and attach to the existing deal. Review and adjust, then save.' : 'These line items were built from the agreement. Review and adjust, then create the deal.'}
      </div>

      <div className="form-group">
        <label className="form-label">Deal name</label>
        <input className="form-input" value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0 8px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project line items</span>
        {seeding && <span style={{ fontSize: 11.5, color: 'var(--orange)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Spinner /> Building from the agreement…</span>}
      </div>

      {seeding ? (
        <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Spinner /> Reading the agreement and drafting the line items…</div>
      ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((it, idx) => (
          <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px 120px 32px', gap: 8, alignItems: 'center' }}>
              <input className="form-input" placeholder="Project name" value={it.name} onChange={e => setItem(idx, { name: e.target.value })} />
              <input className="form-input" type="number" min="0" step="100" placeholder="One-time $" value={it.value || ''} onChange={e => setItem(idx, { value: e.target.value })} />
              <input className="form-input" type="number" min="0" step="10" placeholder="$/mo" value={it.recurring || ''} onChange={e => setItem(idx, { recurring: e.target.value })} />
              <button className="btn-ghost" style={{ padding: '7px 8px', color: '#ff5c5c' }} onClick={() => removeItem(idx)} title="Remove"><X size={14} /></button>
            </div>
            <textarea className="form-input" rows={2} placeholder="Scope / what's included" value={it.scope || ''} onChange={e => setItem(idx, { scope: e.target.value })} style={{ marginTop: 8, resize: 'vertical', fontSize: 12.5 }} />
          </div>
        ))}
      </div>
      )}
      <button className="btn-ghost" style={{ marginTop: 8 }} onClick={addItem}><Plus size={14} /> Add line item</button>

      <div style={{ display: 'flex', gap: 20, margin: '18px 0', fontSize: 13, color: 'var(--text)' }}>
        <div><span style={{ color: 'var(--muted)' }}>One-time total: </span><strong>{money(oneTimeTotal)}</strong></div>
        {monthlyTotal > 0 && <div><span style={{ color: 'var(--muted)' }}>Recurring: </span><strong>{money(monthlyTotal)}/mo</strong></div>}
      </div>
    </div>
  );
}

// Step 3, Agreement: persist the approved terms into a real agreement doc,
// preview it exactly as the client will see it (gate), then approve to lock.
function AgreementStep({ client, termsDraft, onApproved, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [ag, setAg] = useState(null);       // persisted agreement row (or {id})
  const [previewed, setPreviewed] = useState(false);
  const [docTab, setDocTab] = useState('agreement');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [draftMd, setDraftMd] = useState({ agreement_markdown: '', nda_markdown: '' });

  useEffect(() => {
    (async () => {
      try {
        const d = await getAgreements(client.id);
        // Work on the latest UNSIGNED agreement. A signed one is a closed deal
        // (e.g. VNA's completed build): a new deal must draft a NEW agreement,
        // never resurface or overwrite the signed document.
        const row = (d.agreements || []).find(x => x.status !== 'signed') || null;
        if (row) setAg(row);
      } catch (e) { /* none yet */ }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  // The document we render: the saved agreement's terms if it actually has a
  // document, otherwise the fresh terms draft (a stale/custom placeholder row
  // has empty terms and should not blank out the preview).
  const agHasDoc = !!ag?.terms?.agreement_markdown;
  const doc = agHasDoc ? ag.terms : (termsDraft || ag?.terms || {});

  const ensureAgreement = async () => {
    if (ag?.id && agHasDoc) return ag;
    if (!termsDraft?.agreement_markdown) { toast('error', 'Approve the terms first (Terms step).'); return null; }
    const r = await approveAgreement(client.id, termsDraft);
    const d = await getAgreements(client.id);
    const row = (d.agreements || []).find(x => x.id === r.agreement_id) || (d.agreements || [])[0];
    setAg(row);
    return row;
  };

  const onPreview = async () => {
    // Open the tab synchronously (in the click gesture) so the browser doesn't
    // block the popup after our awaits and hijack the current CRM tab.
    const w = window.open('', '_blank');
    setBusy('preview');
    try {
      const row = await ensureAgreement();
      if (!row) { if (w) w.close(); return; }
      const { token } = await previewAgreementToken(row.id);
      const url = `/sign?token=${token}&preview=1`;
      if (w) w.location.href = url; else window.open(url, '_blank');
      setPreviewed(true);
    } catch (e) { if (w) w.close(); toast('error', e.message); }
    finally { setBusy(''); }
  };

  const onApprove = async () => {
    setBusy('approve');
    try {
      const row = await ensureAgreement();
      if (!row) return;
      toast('success', 'Agreement approved.');
      onApproved(row.id);
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const beginEdit = () => {
    setDraftMd({ agreement_markdown: doc.agreement_markdown || '', nda_markdown: doc.nda_markdown || '' });
    setEditing(true);
  };

  const saveEdits = async () => {
    setBusy('save');
    try {
      const row = await ensureAgreement();   // creates the row if it doesn't exist yet
      if (!row) return;
      const r = await saveAgreementDoc(client.id, {
        agreement_id: row.id,
        agreement_markdown: draftMd.agreement_markdown,
        nda_markdown: draftMd.nda_markdown,
      });
      setAg(prev => ({ ...(prev || row), terms: { ...((prev || row).terms || {}), ...(r.terms || {}) } }));
      setEditing(false);
      setPreviewed(false);   // re-preview the edited doc before approving
      toast('success', 'Edits saved to the agreement.');
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const alreadyApproved = ag && (ag.status === 'approved' || ag.status === 'sent' || ag.status === 'signed');
  const canApprove = previewed || alreadyApproved;
  useStepFooter(setFooter, {
    label: busy === 'approve' ? 'Approving…' : 'Approve',
    disabled: loading || (!termsDraft && !ag) || !canApprove || busy === 'approve' || editing,
    busy: busy === 'approve',
    onClick: onApprove,
  });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;

  if (!termsDraft && !ag) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', color: 'var(--muted)' }}>
        <FileSignature size={28} style={{ opacity: 0.4 }} />
        <div style={{ marginTop: 12, fontSize: 14 }}>Approve the terms first. Head back to the <strong>Terms</strong> step.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Review the agreement</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>This is the document {client.business_name || 'the client'} will sign. Preview it in the signing view, then approve.</div>
        </div>
        {alreadyApproved && (
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#16a34a', background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', padding: '4px 12px', borderRadius: 999, textTransform: 'capitalize' }}>{ag.status}</span>
        )}
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', flex: 1 }}>
            Service Agreement · total {money(doc.total || ag?.total_amount)}{editing && <span style={{ color: 'var(--orange)', fontWeight: 700 }}> · editing {docTab === 'nda' ? 'NDA' : 'agreement'}</span>}
          </div>
          {doc.nda_markdown && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-ghost" style={{ padding: '5px 12px', fontWeight: docTab === 'agreement' ? 800 : 500 }} onClick={() => setDocTab('agreement')}>Agreement</button>
              <button className="btn-ghost" style={{ padding: '5px 12px', fontWeight: docTab === 'nda' ? 800 : 500 }} onClick={() => setDocTab('nda')}>NDA</button>
            </div>
          )}
        </div>
        {editing ? (
          <textarea
            value={docTab === 'nda' ? draftMd.nda_markdown : draftMd.agreement_markdown}
            onChange={e => setDraftMd(d => ({ ...d, [docTab === 'nda' ? 'nda_markdown' : 'agreement_markdown']: e.target.value }))}
            spellCheck={true}
            style={{ display: 'block', width: '100%', border: 'none', borderTop: '1px solid var(--border)', padding: '14px 24px 24px', color: '#1f2937', fontSize: 13, lineHeight: 1.7, minHeight: 480, maxHeight: 600, resize: 'vertical', outline: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', background: '#fff' }}
          />
        ) : (
          <div style={{ padding: '14px 24px 24px', color: '#1f2937', fontSize: 13, maxHeight: 540, overflow: 'auto' }}
            dangerouslySetInnerHTML={{ __html: mdToDocHtml(docTab === 'nda' ? doc.nda_markdown : doc.agreement_markdown) }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        {editing ? (
          <>
            <button className="btn-primary" disabled={busy === 'save'} onClick={saveEdits}>
              {busy === 'save' ? 'Saving…' : 'Save edits'}
            </button>
            <button className="btn-ghost" disabled={busy === 'save'} onClick={() => setEditing(false)}>Cancel</button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Editing the raw text. Save, then Preview to see it, then Approve.</span>
          </>
        ) : (
          <>
            <button className="btn-ghost" disabled={busy === 'preview'} onClick={onPreview}>
              <Eye size={15} /> {busy === 'preview' ? 'Opening…' : previewed ? 'Preview again' : 'Preview in signing view'}
            </button>
            <button className="btn-ghost" onClick={beginEdit}>
              <Pencil size={15} /> Edit text
            </button>
            {!canApprove && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Preview the signing view to unlock Approve (bottom-right).</span>}
          </>
        )}
      </div>
    </div>
  );
}

// Compute the standard VTM payment-plan menu from a build total. The client
// picks one in their portal; the chosen plan's deposit + installments drive the
// agreement schedule and Stripe. (Maintenance is separate and unaffected.)
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function computePlans(total, financePct = 10) {
  total = Number(total) || 0;
  if (!total) return [];
  const dep20 = round2(total * 0.2);
  const fin = round2(total - dep20);               // 80% financed portion
  const m3 = round2(fin / 3);
  const inst3 = [m3, m3, round2(fin - m3 * 2)].map((a, i) => ({ label: `Month ${i + 1}`, amount: a, trigger: `Month ${i + 1}` }));
  const fin6 = round2(fin * (1 + financePct / 100));
  const m6 = round2(fin6 / 6);
  const inst6 = Array.from({ length: 6 }, (_, i) => (i < 5 ? m6 : round2(fin6 - m6 * 5))).map((a, i) => ({ label: `Month ${i + 1}`, amount: a, trigger: `Month ${i + 1}` }));
  const half = round2(total * 0.5);
  return [
    { key: 'full', label: 'Pay in full', summary: '100% today', deposit: total, installments: [], grand_total: total },
    { key: '50_50', label: '50% now, 50% on completion', summary: 'Half today, half on delivery', deposit: half, installments: [{ label: '50% on completion', amount: round2(total - half), trigger: 'On completion' }], grand_total: total },
    { key: '20_3', label: '20% down + 3 months', summary: '20% today, remainder over 3 monthly payments', deposit: dep20, installments: inst3, grand_total: total },
    { key: '20_6', label: '20% down + 6 months', summary: `20% today, remainder + ${financePct}% financing over 6 monthly payments`, deposit: dep20, installments: inst6, grand_total: round2(dep20 + fin6), finance_charge: round2(fin6 - fin) },
  ];
}

// Step 5, Payment: choose which of the standard plans to offer this client.
// Step (fixed mode only), Payment: confirm the fixed billing schedule that
// auto-sets-up on signing. (Custom-plan clients skip this: they pick in portal.)
function PaymentStep({ client, onDone, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [ag, setAg] = useState(null);

  useEffect(() => {
    (async () => {
      try { const d = await getAgreements(client.id); setAg((d.agreements || [])[0] || null); }
      catch (e) { toast('error', e.message); }
      finally { setLoading(false); }
    })();
  }, [client.id]);

  useStepFooter(setFooter, { label: 'Confirm plan', disabled: loading || !ag, onClick: onDone });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;
  if (!ag) return (
    <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', color: 'var(--muted)' }}>
      <DollarSign size={28} style={{ opacity: 0.4 }} />
      <div style={{ marginTop: 12, fontSize: 14 }}>Approve the agreement first. Go to the <strong>Agreement</strong> step.</div>
    </div>
  );

  const terms = ag.terms || {};
  const installments = Array.isArray(terms.installments) ? terms.installments : [];
  const monthly = Array.isArray(terms.monthly) ? terms.monthly : [];
  const deposit = installments[0];
  const buildRest = installments.slice(1);
  const maint = monthly[0];

  const Line = ({ label, value, sub }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Billing plan</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>This is what Stripe sets up automatically the moment {client.business_name || 'the client'} signs. Nothing is charged until then.</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '4px 18px 14px' }}>
        {deposit && <Line label="Deposit, charged at signing" sub="Stripe Checkout on the card the client enters" value={money(deposit.amount)} />}
        {buildRest.length > 0 && (
          <Line label={`Build installments · ${buildRest.length} × ${money(buildRest[0].amount)}`} sub="Auto-charged monthly on the same card, starting the month after the deposit" value={money(buildRest.reduce((s, i) => s + Number(i.amount || 0), 0))} />
        )}
        {maint?.amount && <Line label={maint.item || 'Maintenance & Support'} sub="Recurring subscription, begins right after the build" value={`${money(maint.amount)}/mo`} />}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 0 2px', borderTop: '2px solid var(--border)', marginTop: 4 }}>
          <div style={{ flex: 1, color: 'var(--text)', fontSize: 13.5, fontWeight: 800 }}>Build total</div>
          <div style={{ color: 'var(--text)', fontSize: 15, fontWeight: 800 }}>{money(ag.total_amount)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '12px 14px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 10 }}>
        <ShieldCheck size={16} style={{ color: 'var(--orange)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55 }}>
          On signing, VTM charges the deposit via Stripe Checkout and sets the recurring plan up on that same card automatically. No separate invoice needed: it's wired into the signature.
        </div>
      </div>
    </div>
  );
}

// Step 5, Platforms & Access: a checklist of tools the client must grant VTM
// access to, each with copy-ready instructions. Persisted as client tasks.
const ACCESS_SEED = [
  { title: 'Website & hosting login', description: 'Add ray@vernontm.com as an Administrator on your website host. WordPress: Users → Add New → role Administrator. Squarespace/Shopify/Wix: Settings → Permissions → invite as admin. This lets us build and connect the CRM to your site.' },
  { title: 'Domain / DNS (registrar)', description: 'Grant delegate access at your domain registrar (GoDaddy, Namecheap, Google Domains) or share DNS management. GoDaddy: Account Settings → Delegate Access → invite ray@vernontm.com. We need this to point records for email and the CRM.' },
  { title: 'Google Workspace / email admin', description: 'Add ray@vernontm.com as a delegated admin, or provide a temporary admin login, so we can configure email routing and the AI email assistant.' },
  { title: 'Stripe', description: 'In Stripe: Settings → Team → invite ray@vernontm.com as Admin. This wires up checkout, subscriptions, and invoicing for your bookings.' },
  { title: 'Existing CRM export (Keap / Monday.com)', description: 'Export your contacts, pipelines, and bookings as CSV (or add ray@vernontm.com as a user) so we can migrate your data into the new CRM with no loss.' },
  { title: 'Booking & calendar', description: 'Share your booking tool and calendar (Calendly, Acuity, Google Calendar) so we can integrate scheduling and prevent double-booking.' },
  { title: 'Social & ad accounts', description: 'Add VTM as a partner/admin on Meta Business Suite and any ad accounts, so we can set up retargeting and lower your lead cost.' },
];

function AccessStep({ client, onDone, setFooter }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);   // { id, title, description } currently being edited
  const [editBusy, setEditBusy] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', description: '' });
  const [addBusy, setAddBusy] = useState('');

  const load = async () => {
    try {
      let rows = (await getClientTasks(client.id)).filter(t => t.category === 'access');
      if (rows.length === 0) {
        await Promise.all(ACCESS_SEED.map(s => createClientTask({ client_id: client.id, category: 'access', title: s.title, description: s.description, status: 'todo', assigned_to: 'Client' })));
        rows = (await getClientTasks(client.id)).filter(t => t.category === 'access');
      }
      setItems(rows);
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  const toggle = async (t) => {
    const status = t.status === 'done' ? 'todo' : 'done';
    setItems(xs => xs.map(x => x.id === t.id ? { ...x, status } : x));
    try { await updateClientTask(t.id, { status }); } catch (e) { toast('error', e.message); }
  };
  const remove = async (t) => { setItems(xs => xs.filter(x => x.id !== t.id)); if (edit?.id === t.id) setEdit(null); try { await deleteClientTask(t.id); } catch (e) { toast('error', e.message); } };

  // Regenerate the instructions for the item being edited, the AI picks up
  // whatever Ray has typed in the box and rewrites from it.
  const regen = async () => {
    if (!edit) return;
    setEditBusy('regen');
    try {
      const r = await generateAccessInstructions(edit.title, edit.description);
      setEdit(e => ({ ...e, description: r.description || e.description }));
    } catch (e) { toast('error', e.message); }
    finally { setEditBusy(''); }
  };
  const saveEdit = async () => {
    if (!edit) return;
    setEditBusy('save');
    try {
      await updateClientTask(edit.id, { title: edit.title.trim() || 'Access item', description: edit.description });
      setItems(xs => xs.map(x => x.id === edit.id ? { ...x, title: edit.title.trim() || x.title, description: edit.description } : x));
      setEdit(null);
    } catch (e) { toast('error', e.message); }
    finally { setEditBusy(''); }
  };

  const genForDraft = async () => {
    if (!draft.title.trim()) { toast('error', 'Enter what you need access to first.'); return; }
    setAddBusy('gen');
    try { const r = await generateAccessInstructions(draft.title, draft.description); setDraft(d => ({ ...d, description: r.description || d.description })); }
    catch (e) { toast('error', e.message); }
    finally { setAddBusy(''); }
  };
  const addItem = async () => {
    if (!draft.title.trim()) { toast('error', 'Enter what you need access to.'); return; }
    try {
      const t = await createClientTask({ client_id: client.id, category: 'access', title: draft.title.trim(), description: draft.description || null, status: 'todo', assigned_to: 'Client' });
      setItems(xs => [...xs, t]);
      setAdding(false); setDraft({ title: '', description: '' });
    } catch (e) { toast('error', e.message); }
  };

  const copyRequest = () => {
    const pending = items.filter(i => i.status !== 'done');
    const list = (pending.length ? pending : items).map(i => `• ${i.title}${i.description ? `\n   ${i.description}` : ''}`).join('\n\n');
    const msg = `Hi ${client.owner_name || 'there'},\n\nTo get your build started, we'll need access to a few things. Here's what we need and how to grant it:\n\n${list}\n\nSend ray@vernontm.com over as the invite email wherever it's needed. Let me know if anything's unclear!\n\nRay, Vernon Tech & Media`;
    navigator.clipboard?.writeText(msg).then(() => toast('success', 'Access request copied. Paste it into an email or text.'), () => toast('error', 'Could not copy'));
  };

  useStepFooter(setFooter, { label: 'Continue', disabled: loading, onClick: onDone });

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;

  const doneCount = items.filter(i => i.status === 'done').length;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Platforms &amp; access</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>What you'll need access to before the build. Check items off as they come in; each has copy-ready instructions to send the client.</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', whiteSpace: 'nowrap', marginTop: 4 }}>{doneCount}/{items.length} granted</span>
      </div>

      <button className="btn-ghost" style={{ marginBottom: 12 }} onClick={copyRequest}><Copy size={14} /> Copy access request for client</button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(t => {
          const editing = edit?.id === t.id;
          return (
          <div key={t.id} style={{ background: 'var(--surface)', border: `1px solid ${editing ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
              <button onClick={() => toggle(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: t.status === 'done' ? '#16a34a' : 'var(--muted)' }}>
                {t.status === 'done' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
              </button>
              <button onClick={() => editing ? setEdit(null) : setEdit({ id: t.id, title: t.title, description: t.description || '' })}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.6 : 1 }} title="Click to edit">
                {t.title}
              </button>
              <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => editing ? setEdit(null) : setEdit({ id: t.id, title: t.title, description: t.description || '' })}>
                <Pencil size={13} /> {editing ? 'Close' : 'Edit'}
              </button>
              <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => remove(t)} title="Remove"><X size={14} /></button>
            </div>

            {editing ? (
              <div style={{ padding: '0 14px 14px 42px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input className="form-input" value={edit.title} onChange={e => setEdit(x => ({ ...x, title: e.target.value }))} placeholder="What access is needed" />
                <textarea className="form-input" rows={4} value={edit.description} onChange={e => setEdit(x => ({ ...x, description: e.target.value }))} placeholder="Instructions for the client (edit, then Regenerate to have AI polish it)" style={{ resize: 'vertical', fontSize: 12.5, lineHeight: 1.6 }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} disabled={editBusy === 'regen'} onClick={regen}>{editBusy === 'regen' ? <><Spinner /> Regenerating…</> : <><Sparkles size={14} /> Regenerate</>}</button>
                  <button className="btn-primary" disabled={editBusy === 'save'} onClick={saveEdit}>{editBusy === 'save' ? 'Saving…' : 'Save'}</button>
                  <button className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button>
                  {edit.description && <button className="btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => navigator.clipboard?.writeText(edit.description).then(() => toast('success', 'Copied'))}><Copy size={13} /> Copy</button>}
                </div>
              </div>
            ) : t.description ? (
              <div style={{ padding: '0 14px 12px 42px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>{t.description}</div>
            ) : null}
          </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn-ghost" onClick={() => { setDraft({ title: '', description: '' }); setAdding(true); }}><Plus size={14} /> Add access item</button>
      </div>

      {adding && (
        <Modal title="Add access item" onClose={() => setAdding(false)} onSubmit={addItem} submitLabel="Add item" disabled={!draft.title.trim()}>
          <div className="form-group">
            <label className="form-label">What do you need access to?</label>
            <input className="form-input" autoFocus value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} placeholder='e.g. "Instagram login"' />
          </div>
          <div className="form-group">
            <label className="form-label">Instructions for the client (optional)</label>
            <textarea className="form-input" rows={4} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Write it yourself, or let AI draft it from the name above." style={{ resize: 'vertical', fontSize: 12.5, lineHeight: 1.6 }} />
          </div>
          <button type="button" className="btn-ghost" disabled={addBusy === 'gen'} onClick={genForDraft}><Sparkles size={14} /> {addBusy === 'gen' ? 'Drafting…' : 'Generate instructions with AI'}</button>
        </Modal>
      )}
    </div>
  );
}

// Step 7, Proposal: draft the cover email to the client (what was sent + their
// portal link), in a chosen style. Held in the pipeline for the Send step to fire.
function ProposalStep({ client, emailDraft, setEmailDraft, tone, setTone, onDone, setFooter }) {
  const [ag, setAg] = useState(null);
  const [busy, setBusy] = useState('');
  useStepFooter(setFooter, { label: 'Continue to send', disabled: !emailDraft, onClick: onDone });

  useEffect(() => {
    (async () => {
      try {
        const d = await getAgreements(client.id);
        const a = (d.agreements || [])[0] || null;
        // Mint (or reuse) the client's personal sign token now, so the drafted
        // email can carry their real signing link.
        if (a) { try { const { token } = await previewAgreementToken(a.id); a.sign_token = token; } catch (e) { /* ok */ } }
        setAg(a);
      } catch (e) { /* ok */ }
    })();
  }, [client.id]);

  const signUrl = ag?.sign_token ? `${window.location.origin}/sign?token=${ag.sign_token}` : null;

  const gen = async (nextTone) => {
    const useTone = nextTone || tone;
    if (!signUrl) { toast('error', 'Approve the agreement first so the sign link exists.'); return; }
    setBusy('gen');
    try { const r = await draftClientEmail(client.id, useTone, null, signUrl); setEmailDraft({ subject: r.subject || '', body: r.body || '' }); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };
  const saveGmailDraft = async () => {
    if (!client.contact_email) { toast('error', 'No email on file (add it in Business Details).'); return; }
    if (!emailDraft?.body?.trim()) { toast('error', 'Draft the email first.'); return; }
    setBusy('draft');
    try { await sendClientEmail({ to: client.contact_email, subject: emailDraft.subject, body: emailDraft.body, mode: 'draft' }); toast('success', 'Saved as a Gmail draft.'); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  // Auto-draft (gain-focused by default) as soon as we land here, no click needed.
  const autoTried = useRef(false);
  useEffect(() => {
    if (ag?.sign_token && !emailDraft && !autoTried.current) { autoTried.current = true; gen(tone); }
  }, [ag, emailDraft]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>Proposal email</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        A cover note letting {client.owner_name || 'them'} know what you're sending, with their personal link to review &amp; sign, auto-drafted from your notes, terms, and the plan. Switch the style anytime.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {[{ k: 'gain', label: 'Gain-focused' }, { k: 'professional', label: 'Professional' }, { k: 'friendly', label: 'Friendly' }].map(o => (
          <button key={o.k} onClick={() => { setTone(o.k); gen(o.k); }} disabled={busy === 'gen'}
            style={{ padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)', border: `1px solid ${tone === o.k ? 'var(--orange)' : 'var(--border)'}`, background: tone === o.k ? 'rgba(37,99,235,0.10)' : 'var(--surface)', color: tone === o.k ? 'var(--orange)' : 'var(--muted)' }}>
            {o.label}
          </button>
        ))}
        {busy === 'gen' && <span style={{ fontSize: 12, color: 'var(--orange)', alignSelf: 'center', display: 'inline-flex', gap: 6, alignItems: 'center' }}><Spinner /> Drafting…</span>}
      </div>

      {!emailDraft && busy === 'gen' && (
        <div style={{ padding: '28px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Spinner /> Writing the proposal…</div>
      )}
      {!emailDraft && busy !== 'gen' && (
        <button className="btn-primary" onClick={() => gen()}><Sparkles size={15} /> Draft the email</button>
      )}

      {emailDraft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label className="form-label">Subject</label>
            <input className="form-input" value={emailDraft.subject} onChange={e => setEmailDraft(m => ({ ...m, subject: e.target.value }))} />
          </div>
          <div>
            <label className="form-label">Message</label>
            <textarea className="form-input" rows={13} value={emailDraft.body} onChange={e => setEmailDraft(m => ({ ...m, body: e.target.value }))} style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.6 }} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>To: {client.contact_email || <span style={{ color: '#ff5c5c' }}>no email on file, add one in Business Details</span>}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-ghost" disabled={busy === 'draft' || !client.contact_email} onClick={saveGmailDraft}>{busy === 'draft' ? 'Saving…' : 'Save as Gmail draft'}</button>
            <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(`${emailDraft.subject}\n\n${emailDraft.body}`).then(() => toast('success', 'Copied'))}><Copy size={13} /> Copy</button>
            <button className="btn-ghost" disabled={busy === 'gen'} onClick={() => gen()}><Sparkles size={13} /> Regenerate</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Step 8, Send: final gate. Sends the agreement to sign + the proposal email,
// then shows live status (sent → opened → signed).
function SendStep({ client, emailDraft, onSent, onPatch, paymentMode }) {
  const custom = paymentMode === 'custom';
  const [loading, setLoading] = useState(true);
  const [ag, setAg] = useState(null);
  const [deals, setDeals] = useState([]);
  const [busy, setBusy] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [nudge, setNudge] = useState(null);   // { kind: 'agreement', id }

  const load = async () => {
    try {
      const d = await getAgreements(client.id);
      setAg((d.agreements || [])[0] || null);
      setDeals(await getDeals(client.id).catch(() => []));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  // After the email has gone out, also drop the sign link in their texts
  // (queued iMessage from the business number).
  const textLink = async () => {
    if (!ag) return;
    setBusy('text');
    try {
      const r = await textSignLink(ag.id);
      toast('success', `Sign link texted to ${r?.phone || 'the client'}`);
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const send = async () => {
    if (!ag) return;
    setBusy('send');
    try {
      await sendAgreementForSignature(ag.id);
      toast('success', ag.sent_at ? 'Re-sent to client.' : 'Sent to client to sign.');
      if (ag.status !== 'signed') onPatch && onPatch({ lead_temperature: 'contract_sent', follow_up_status: 'contract_sent' });
      onSent && onSent();
      setLoading(true); load();
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const sendProposal = async () => {
    if (!client.contact_email) { toast('error', 'No email on file (add it in Business Details).'); return; }
    if (!emailDraft?.body?.trim()) { toast('error', 'Draft the proposal on the previous step first.'); return; }
    setBusy('email');
    try {
      // Make the agreement signable (status=sent) so the link in the email works,
      // without firing the plain system email, the proposal email IS the delivery.
      if (ag && ag.status !== 'signed') { try { await markAgreementSent(ag.id); } catch (e) { /* non-fatal */ } }
      await sendClientEmail({ to: client.contact_email, subject: emailDraft.subject, body: emailDraft.body, mode: 'send' });
      setEmailSent(true);
      toast('success', `Sent to ${client.contact_email}. They can review & sign from the link.`);
      if (ag.status !== 'signed') onPatch && onPatch({ lead_temperature: 'contract_sent', follow_up_status: 'contract_sent' });
      onSent && onSent();
      setLoading(true); load();
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  if (loading) return <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>;
  if (!ag) return (
    <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', color: 'var(--muted)' }}>
      <FileSignature size={28} style={{ opacity: 0.4 }} />
      <div style={{ marginTop: 12, fontSize: 14 }}>Nothing to send yet. Complete the <strong>Terms</strong> step first.</div>
    </div>
  );

  const plansOffered = Array.isArray(ag.plan_options) && ag.plan_options.length > 0;
  const approved = ag.status === 'approved' || ag.status === 'sent' || ag.status === 'signed';
  const signLink = ag.sign_token ? `${window.location.origin}/sign?token=${ag.sign_token}` : null;
  const Check = ({ ok, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: ok ? 'var(--text)' : 'var(--muted)' }}>
      {ok ? <CheckCircle2 size={16} style={{ color: '#16a34a' }} /> : <Circle size={16} />} {label}
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>{custom ? 'Send to the client' : 'Send for signature'}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18 }}>
        {custom
          ? 'The client opens their portal, picks a payment plan, then signs and pays there. The agreement and Stripe checkout are built from their choice.'
          : 'Nothing goes out until you send. On signing, the deposit is charged and the plan is set up automatically.'}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ready to send</div>
        {custom
          ? <Check ok={plansOffered} label={`Payment plans offered${plansOffered ? ` · ${ag.plan_options.length}` : ''}`} />
          : <Check ok={approved} label="Agreement approved" />}
        <Check ok={deals.length > 0} label="Deal & projects created" />
        <Check ok={!!ag.total_amount} label={`Build value set · ${money(ag.total_amount)}`} />
        <Check ok={!!emailDraft?.body} label="Proposal email drafted" />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {emailDraft?.body ? (
          <button className="btn-primary" disabled={busy === 'email' || !client.contact_email} onClick={sendProposal}>
            <Mail size={15} /> {busy === 'email' ? 'Sending…' : emailSent ? 'Resend to client' : 'Send to client'}
          </button>
        ) : !custom && ag.status !== 'signed' ? (
          <button className="btn-primary" disabled={!approved || busy === 'send'} onClick={send}>
            <FileSignature size={15} /> {busy === 'send' ? 'Sending…' : ag.sent_at ? 'Resend plain link' : 'Send agreement to sign'}
          </button>
        ) : null}
        {ag.status !== 'signed' && (ag.sent_at || emailSent) && (
          <button className="btn-ghost" disabled={busy === 'text'} onClick={textLink} title="Queue an iMessage with the sign link to the client's phone">
            <Smartphone size={14} /> {busy === 'text' ? 'Texting…' : 'Also text the sign link'}
          </button>
        )}
      </div>
      {!emailDraft?.body && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Draft the proposal on the previous step to send a personalized email with their sign link (or use the plain send above).</div>}

      {ag.sent_at && (
        <div style={{ marginTop: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', flex: 1 }}>Signature status</div>
            {ag.status === 'sent' && (
              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setNudge({ kind: 'agreement', id: ag.id })} title="Remind them to sign, by text or email">
                <SendIcon size={12} /> Nudge
              </button>
            )}
            <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} disabled={busy === 'refresh'} onClick={() => { setBusy('refresh'); load().finally(() => setBusy('')); }}>Refresh</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Check ok={!!ag.sent_at} label={`Sent ${ag.sent_at ? new Date(ag.sent_at).toLocaleString() : ''}`} />
            <Check ok={!!ag.opened_at} label={ag.opened_at ? `Client opened the signature page ${new Date(ag.opened_at).toLocaleString()}` : 'Not opened yet'} />
            <Check ok={!!ag.signed_at} label={ag.signed_at ? `Signed ${new Date(ag.signed_at).toLocaleString()} by ${ag.signer_name || 'client'}` : 'Not signed yet'} />
          </div>
          {signLink && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signLink}</span>
              <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(signLink).then(() => toast('success', 'Sign link copied'))}><Copy size={13} /> Copy link</button>
            </div>
          )}
        </div>
      )}
      {nudge && <NudgeModal kind={nudge.kind} id={nudge.id} onClose={() => setNudge(null)} onSent={() => { setLoading(true); load(); }} />}
    </div>
  );
}

function LeadDetail({ client, onBack, onDelete, onPatch }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setViewInternal] = useState(() => searchParams.get('view') === 'pipeline' ? 'pipeline' : 'overview');
  const setView = (v) => {
    setViewInternal(v);
    const params = new URLSearchParams(searchParams);
    if (v === 'overview') params.delete('view'); else params.set('view', v);
    setSearchParams(params, { replace: true });
  };

  // ── Server-synced pipeline state ──────────────────────────────────────────
  // Every pipeline artifact (current step, the Discuss chat, terms, drafts, and
  // choices) lives in crm_clients.pipeline_state, so anyone with access to this
  // lead (on any device or login) sees the same progress. Local edits save
  // (debounced) and we poll for changes others make while the page is open.
  const initState = (client.pipeline_state && typeof client.pipeline_state === 'object') ? client.pipeline_state : {};
  const [pstate, setPstate] = useState(initState);
  const pstateRef = useRef(pstate);
  pstateRef.current = pstate;
  const skipSaveRef = useRef(true); // don't echo the initial load / remote-applied state back to the server

  useEffect(() => {
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    const t = setTimeout(() => { updateClient(client.id, { pipeline_state: pstateRef.current }).catch(() => {}); }, 700);
    return () => clearTimeout(t);
  }, [pstate, client.id]);

  // Hydrate immediately on open, then poll for changes made elsewhere.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const c = await getClient(client.id);
        const remote = c && c.pipeline_state;
        if (alive && remote && (remote._rev || 0) > (pstateRef.current._rev || 0)) {
          skipSaveRef.current = true;
          setPstate(remote);
        }
      } catch {}
    };
    pull();
    const iv = setInterval(pull, 7000);
    return () => { alive = false; clearInterval(iv); };
  }, [client.id]);

  const syncedField = (name, initial) => {
    const value = pstate[name] === undefined ? initial : pstate[name];
    const setValue = (updater) => setPstate(prev => {
      const cur = prev[name] === undefined ? initial : prev[name];
      const nextVal = typeof updater === 'function' ? updater(cur) : updater;
      return { ...prev, [name]: nextVal, _rev: (prev._rev || 0) + 1 };
    });
    return [value, setValue];
  };

  const [step, setStep] = syncedField('step', 0);
  const [termsText, setTermsText] = syncedField('termsText', '');       // scope+pricing summary from the Discuss chat
  const [chatLog, setChatLog] = syncedField('chatLog', null);          // persisted Discuss conversation
  const [termsDraft, setTermsDraft] = syncedField('termsDraft', null);
  const [dealId, setDealId] = syncedField('dealId', null);
  const [agreementId, setAgreementId] = syncedField('agreementId', null);
  const [emailDraft, setEmailDraft] = syncedField('emailDraft', null);
  const [emailTone, setEmailTone] = syncedField('emailTone', 'gain');
  const [paymentMode, setPaymentMode] = syncedField('paymentMode', 'fixed'); // 'fixed' | 'custom'
  const [footer, setFooter] = useState(null); // { label, onClick, disabled, busy } set by the active step
  const saveField = async (field, value) => {
    onPatch({ [field]: value });
    try { await updateClient(client.id, { [field]: value }); } catch (e) { toast('error', e.message); }
  };
  const assignees = useAssignees();
  // Set both the assignee id and the denormalized name in one write so the
  // record shows a name everywhere without a join.
  const setAssignee = (id) => {
    const m = assignees.find(a => a.id === id);
    const patch = { assigned_to: m ? m.id : null, assigned_to_name: m ? m.name : '' };
    onPatch(patch);
    updateClient(client.id, patch).catch(e => toast('error', e.message));
  };
  const stage = stageOf(client.stage);
  const steps = useMemo(() => stepsFor(paymentMode), [paymentMode]);

  // Wipe every cached artifact for this lead so the next run starts clean.
  // Called from the Overview step's "Restart pipeline" button.
  const restartPipeline = () => {
    if (!window.confirm('Restart the pipeline for this lead? Cached AI analysis, drafts, and pending selections will be cleared for everyone. Nothing already saved to the database is affected.')) return;
    // Wipe every synced field (keeps the rev moving forward so other devices pick it up).
    setPstate(prev => ({ _rev: (prev._rev || 0) + 1 }));
    // Also wipe TermsStep's local caches (analysis / total / maint).
    try { Object.keys(localStorage).forEach(k => { if (k.startsWith(`vtm-terms-${client.id}-`)) localStorage.removeItem(k); }); } catch {}
    toast('success', 'Pipeline reset. Start from the Discuss step.');
  };
  const stepIdx = Math.min(step, steps.length - 1);
  const cur = steps[stepIdx];
  const advance = () => setStep(() => Math.min(steps.length - 1, stepIdx + 1));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '7px 9px', flexShrink: 0 }}><ArrowLeft size={16} /></button>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {client.logo_url ? <img src={client.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Building2 size={20} style={{ color: 'var(--muted)' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{client.business_name}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{client.owner_name || 'No owner set'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <FollowUpControl client={client} saveField={saveField} />
          <select className="form-input" style={{ width: 'auto', padding: '7px 12px', fontSize: 12, fontWeight: 700, color: stage.color, background: `${stage.color}14`, border: `1px solid ${stage.color}40`, borderRadius: 999 }}
            value={client.stage || 'lead'} onChange={e => saveField('stage', e.target.value)}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button className="btn-ghost" style={{ padding: '7px 9px', color: '#ff5c5c' }} onClick={onDelete} title="Delete lead"><Trash2 size={15} /></button>
        </div>
      </div>

      {/* Sidebar nav + section content */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Vertical section nav, sticky so it stays put while content scrolls */}
        <aside style={{ width: 208, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', padding: '14px 10px' }}>
          <div style={{ position: 'sticky', top: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[{ k: 'overview', label: 'Overview', icon: Building2 }, { k: 'documents', label: 'Documents', icon: FolderOpen }, { k: 'pipeline', label: 'Projects', icon: ListChecks }].map(n => {
            const on = view === n.k;
            return (
              <button key={n.k} onClick={() => setView(n.k)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', borderRadius: 9, cursor: 'pointer', border: 'none', textAlign: 'left', fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-display)', background: on ? 'var(--btn-black)' : 'transparent', color: on ? '#fff' : 'var(--muted)', transition: 'background 0.12s' }}>
                <n.icon size={16} /> {n.label}
              </button>
            );
          })}
          </div>
        </aside>

        {/* Section content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {view === 'documents' ? (
        <div style={{ flex: 1, padding: 24 }}>
          <div style={{ maxWidth: 760 }}>
            <LeadDocuments client={client} />
          </div>
        </div>
      ) : view === 'overview' ? (
        <div style={{ flex: 1, padding: 24 }}>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 20, alignItems: 'start' }}>
            {/* LEFT, business details + lead status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
              <Card title="Business details">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 18 }}>
                  <Field label="Business Name" value={client.business_name} onSave={v => saveField('business_name', v)} placeholder="Business" />
                  <Field label="Contact" value={client.owner_name} onSave={v => saveField('owner_name', v)} placeholder="Contact name" />
                  <Field label="Phone" value={client.contact_phone} onSave={v => saveField('contact_phone', v)} placeholder="(000) 000-0000" />
                  <Field label="Email" value={client.contact_email} onSave={v => saveField('contact_email', v)} placeholder="you@business.com" />
                  <Field label="Website" value={client.website_url} onSave={v => saveField('website_url', v)} placeholder="https://…" />
                  <Field label="Source" value={client.source} onSave={v => saveField('source', v)} placeholder="Where they came from" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assigned to</span>
                    <select className="form-input" value={client.assigned_to || ''} onChange={e => setAssignee(e.target.value)} style={{ padding: '7px 10px', fontSize: 13 }}>
                      <option value="">{client.assigned_to_name && !client.assigned_to ? client.assigned_to_name : 'Unassigned'}</option>
                      {assignees.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
                    <PillSelect value={client.lead_temperature || 'warm'} options={TEMPERATURES} onChange={v => saveField('lead_temperature', v)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Potential revenue</span>
                    <RevenueField value={client.potential_value} type={client.potential_value_type}
                      onSave={({ value, type }) => { saveField('potential_value', value); saveField('potential_value_type', type); }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Automated emails</span>
                    <Switch on={client.auto_followups_enabled !== false} onChange={v => saveField('auto_followups_enabled', v)}
                      labelOn="Follow-ups on" labelOff="Follow-ups off" />
                  </div>
                </div>
              </Card>
            </div>
            {/* RIGHT, activity timeline */}
            <LeadActivity client={client} />
          </div>
        </div>
      ) : (
      <>
      {/* Pipeline stepper */}
      <div style={{ display: 'flex', gap: 6, padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', overflowX: 'auto' }}>
        {steps.map((s, i) => {
          const done = i < stepIdx, on = i === stepIdx;
          return (
            <button key={s.key} onClick={() => setStep(i)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)', border: `1px solid ${on ? 'var(--orange)' : 'var(--border)'}`, background: on ? 'rgba(37,99,235,0.10)' : (done ? 'rgba(22,163,74,0.08)' : 'var(--surface)'), color: on ? 'var(--orange)' : (done ? '#16a34a' : 'var(--muted)') }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, background: on ? 'var(--orange)' : (done ? '#16a34a' : 'var(--surface-2)'), color: (on || done) ? '#fff' : 'var(--muted)' }}>{done ? '✓' : i + 1}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div style={{ flex: 1, padding: 24 }}>
        {cur.key === 'discuss' ? (
          <DiscussStep client={client} chatLog={chatLog} setChatLog={setChatLog} termsText={termsText} setTermsText={setTermsText} setFooter={setFooter} onReady={advance} onRestart={restartPipeline} />
        ) : cur.key === 'terms' ? (
          <TermsStep client={client} savedDraft={termsDraft} termsText={termsText} setTermsText={setTermsText} setFooter={setFooter} paymentMode={paymentMode} setPaymentMode={setPaymentMode}
            onApprove={(d) => { setTermsDraft(d); advance(); }} />
        ) : cur.key === 'deals' ? (
          <DealsStep client={client} termsDraft={termsDraft} savedDealId={dealId} setFooter={setFooter} onCreated={(id) => { setDealId(id); advance(); }} />
        ) : cur.key === 'agreement' ? (
          <AgreementStep client={client} termsDraft={termsDraft} setFooter={setFooter} onApproved={(id) => { setAgreementId(id); advance(); }} />
        ) : cur.key === 'payment' ? (
          <PaymentStep client={client} setFooter={setFooter} onDone={advance} />
        ) : cur.key === 'proposal' ? (
          <ProposalStep client={client} emailDraft={emailDraft} setEmailDraft={setEmailDraft} tone={emailTone} setTone={setEmailTone} setFooter={setFooter} onDone={advance} />
        ) : cur.key === 'send' ? (
          <SendStep client={client} emailDraft={emailDraft} onPatch={onPatch} paymentMode={paymentMode} />
        ) : null}
      </div>

      {/* Sticky bottom nav, the active step's approve/commit action lives here */}
      <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 -4px 16px rgba(0,0,0,0.06)', zIndex: 20 }}>
        <button className="btn-ghost" disabled={stepIdx === 0} onClick={() => setStep(s => Math.max(0, s - 1))}><ChevronLeft size={15} /> Previous</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text)' }}>Step {stepIdx + 1} of {steps.length}</span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}> · {cur.label}</span>
        </div>
        {stepIdx === steps.length - 1 ? (
          // Last step (Send): swap the dead Next button for a Done button that
          // returns the user to the Leads list.
          <button className="btn-primary" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <CheckCircle2 size={15} /> Done
          </button>
        ) : footer ? (
          <button className="btn-primary" disabled={footer.disabled || footer.busy} onClick={footer.onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {footer.busy && <Spinner />}{footer.label} {!footer.busy && <ChevronRight size={15} />}
          </button>
        ) : (
          <button className="btn-primary" onClick={advance}>Next <ChevronRight size={15} /></button>
        )}
      </div>
      </>
      )}
        </div>
      </div>
    </div>
  );
}

function LeadActivity({ client, onRestart }) {
  const clientId = client.id;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState('Call');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(todayStr());
  const [file, setFile] = useState(null);        // { url, name } after upload
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summaryPrompt, setSummaryPrompt] = useState(null); // { text, title }
  const [summarizing, setSummarizing] = useState(false);
  const [expanded, setExpanded] = useState({}); // activity id -> forced open/closed
  const [quick, setQuick] = useState('');        // inline "add a note" bar
  const [hoverId, setHoverId] = useState(null);  // row hover -> reveal delete

  const load = async () => {
    try { const rows = await getClientActivity(clientId); setItems((rows || []).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const resetForm = () => { setCat('Call'); setBody(''); setDate(todayStr()); setFile(null); };
  const openAdd = () => { resetForm(); setAdding(true); };

  const onPickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setUploading(true);
    try { const { url } = await uploadFile(f); setFile({ url, name: f.name }); }
    catch (err) { toast('error', err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!body.trim() && !file) return;
    setSaving(true);
    try {
      const created_at = new Date(`${date}T12:00:00`).toISOString();
      await createClientActivity({ client_id: clientId, type: 'note', tag: cat, body: body.trim(), attachment_url: file?.url || null, attachment_name: file?.name || null, created_at });
      const src = body.trim();
      setAdding(false); resetForm(); await load();
      if (src.split(/\s+/).filter(Boolean).length >= 15) setSummaryPrompt({ text: src, title: cat });
    } catch (e) { toast('error', e.message); }
    finally { setSaving(false); }
  };

  // Inline "add a note to the timeline", type + Enter (or Add), no form to open.
  const addQuick = async () => {
    const text = quick.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await createClientActivity({ client_id: clientId, type: 'note', tag: 'Note', body: text, created_at: new Date().toISOString() });
      setQuick(''); await load();
      if (text.split(/\s+/).filter(Boolean).length >= 15) setSummaryPrompt({ text, title: 'Note' });
    } catch (e) { toast('error', e.message); }
    finally { setSaving(false); }
  };

  const runSummary = async () => {
    setSummarizing(true);
    try { await generateClientSummary({ client_id: clientId, text: summaryPrompt.text, title: summaryPrompt.title }); toast('success', 'Summary saved to the file'); setSummaryPrompt(null); await load(); }
    catch (e) { toast('error', e.message); }
    finally { setSummarizing(false); }
  };

  const remove = async (a) => { setItems(x => x.filter(i => i.id !== a.id)); try { await deleteClientActivity(a.id); } catch (e) { toast('error', e.message); } };
  const toggleTask = async (a) => { const status = a.status === 'done' ? 'todo' : 'done'; setItems(x => x.map(i => i.id === a.id ? { ...i, status } : i)); try { await updateClientActivity(a.id, { status }); } catch (e) { toast('error', e.message); } };

  // Inline note editing, keeps saved terms/notes current so the agreement AI
  // never drafts from stale numbers.
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const startEditNote = (a) => { setEditingId(a.id); setEditBody(a.body || ''); };
  const saveEditNote = async () => {
    const id = editingId, body = editBody;
    setSavingEdit(true);
    try {
      await updateClientActivity(id, { body });
      setItems(x => x.map(i => i.id === id ? { ...i, body } : i));
      setEditingId(null);
      toast('success', 'Note updated.');
    } catch (e) { toast('error', e.message); }
    finally { setSavingEdit(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 'calc(100vh - 168px)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Activity</span>
        {onRestart && (
          <button className="btn-ghost" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12 }} onClick={onRestart} title="Clear cached AI outputs and start the pipeline over">
            <ChevronLeft size={13} /> Restart pipeline
          </button>
        )}
        {!adding && <button className="btn-ghost" style={{ marginLeft: onRestart ? 0 : 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', fontSize: 12 }} onClick={openAdd} title="Log a call, meeting, or note with a date and document"><Plus size={13} /> Detailed</button>}
      </div>

      {/* Inline add-a-note bar, just type and hit Add/Enter */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="Add a note to the timeline…" value={quick}
          onChange={e => setQuick(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addQuick(); }} style={{ flex: 1 }} />
        <button className="btn-primary" onClick={addQuick} disabled={!quick.trim() || saving}>Add</button>
      </div>

      {adding && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Category */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ACT_CATS.map(c => {
              const on = cat === c.key;
              return (
                <button key={c.key} type="button" onClick={() => setCat(c.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${on ? c.color : 'var(--border)'}`, background: on ? c.color + '18' : 'var(--surface)', color: on ? c.color : 'var(--muted)' }}>
                  <c.icon size={13} /> {c.key}
                </button>
              );
            })}
          </div>
          {/* Note */}
          <textarea className="form-input" rows={3} autoFocus placeholder="What happened? Add details…" value={body} onChange={e => setBody(e.target.value)} style={{ resize: 'vertical' }} />
          {/* Date + document */}
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Date</span>
              <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Document</span>
              {file ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <Download size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{file.name}</span>
                  <button className="btn-ghost" style={{ padding: '2px 5px' }} onClick={() => setFile(null)}><X size={12} /></button>
                </div>
              ) : (
                <label className="btn-ghost" style={{ cursor: uploading ? 'default' : 'pointer', width: '100%', justifyContent: 'center' }}>
                  {uploading ? 'Uploading…' : <><Plus size={13} /> Upload document</>}
                  <input type="file" hidden disabled={uploading} onChange={onPickFile} />
                </label>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Scrollable region, timeline + files + uploader scroll on their own so the page doesn't */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 4 }}>
      {/* Timeline, connected dots with a vertical rail */}
      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: '10px 0' }}>No activity yet. Type above to add your first note.</div>
        : <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map((a, idx) => {
          const isLast = idx === items.length - 1;
          const hovered = hoverId === a.id;
          const summary = isSummary(a);
          const c = catOf(a.tag);
          const done = a.type === 'task' && a.status === 'done';
          const dotColor = summary ? '#2563eb'
            : a.type === 'task' ? (done ? '#22c55e' : 'var(--muted)')
            : (a.type === 'call' || a.type === 'meeting' || a.type === 'email') ? '#2563eb'
            : (c?.color || NOTE_TAGS[a.tag] || 'var(--muted)');
          const titleText = a.type === 'call'
            ? `${a.direction === 'inbound' ? 'Inbound' : 'Outbound'} call${a.outcome ? ' · ' + a.outcome : ''}`
            : (a.title || '');
          const bodyText = a.body || '';
          const primaryIsBody = !titleText;
          return (
            <div key={a.id} onMouseEnter={() => setHoverId(a.id)} onMouseLeave={() => setHoverId(null)} style={{ display: 'flex', gap: 13, position: 'relative' }}>
              {/* rail: connecting line + dot */}
              <div style={{ position: 'relative', width: 12, flexShrink: 0, alignSelf: 'stretch' }}>
                {idx !== 0 && <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0, height: 12, width: 2, background: 'var(--border)' }} />}
                {!isLast && <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 12, bottom: 0, width: 2, background: 'var(--border)' }} />}
                {a.type === 'task'
                  ? <button onClick={() => toggleTask(a)} title="Toggle task" style={{ position: 'relative', zIndex: 1, display: 'block', margin: '7px auto 0', width: 11, height: 11, borderRadius: '50%', border: `2px solid ${done ? '#22c55e' : 'var(--muted)'}`, background: done ? '#22c55e' : 'var(--bg)', cursor: 'pointer', padding: 0 }} />
                  : <span style={{ position: 'relative', zIndex: 1, display: 'block', margin: '7px auto 0', width: 9, height: 9, borderRadius: '50%', background: dotColor }} />}
              </div>
              {/* content */}
              <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 2 : 18, display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {titleText && <div style={{ fontSize: 14, fontWeight: 600, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.4, wordBreak: 'break-word' }}>{titleText}</div>}
                  {editingId === a.id ? (
                    <div style={{ marginTop: titleText ? 6 : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={Math.min(14, Math.max(4, editBody.split('\n').length))}
                        autoFocus style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', border: '1px solid var(--orange)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)', resize: 'vertical', outline: 'none' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn-primary" style={{ padding: '6px 14px', fontSize: 12.5 }} disabled={savingEdit} onClick={saveEditNote}>{savingEdit ? 'Saving…' : 'Save'}</button>
                        <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12.5 }} disabled={savingEdit} onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    bodyText && <div style={{ fontSize: 14, fontWeight: primaryIsBody ? 500 : 400, color: primaryIsBody ? 'var(--text)' : 'var(--muted)', lineHeight: 1.5, marginTop: titleText ? 3 : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{bodyText}</div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{actDate(a.created_at)}</div>
                  {a.attachment_url && (
                    <a href={a.attachment_url} target="_blank" rel="noreferrer" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--link)', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      <Download size={12} /> {a.attachment_name || 'Document'}
                    </a>
                  )}
                </div>
                {a.type === 'note' && editingId !== a.id && (
                  <button onClick={() => startEditNote(a)} title="Edit note" style={{ flexShrink: 0, alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', color: 'var(--muted)', opacity: hovered ? 1 : 0, transition: 'opacity 0.12s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--orange)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                    <Pencil size={14} />
                  </button>
                )}
                <button onClick={() => remove(a)} title="Delete" style={{ flexShrink: 0, alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', color: 'var(--muted)', opacity: hovered ? 1 : 0, transition: 'opacity 0.12s' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        </div>}

      </div>

      {summaryPrompt && (
        <Modal title="Generate summary?" onClose={() => setSummaryPrompt(null)} onSubmit={runSummary} submitLabel={summarizing ? 'Generating…' : 'Yes, generate'}>
          <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.5 }}>Have AI summarize this into a clean recap (key points + action items) and save it to <strong style={{ color: 'var(--text)' }}>{client.business_name}</strong>'s file?</p>
        </Modal>
      )}
    </div>
  );
}

// Documents tab, a real file manager per client: folders, drag-and-drop
// upload (files AND whole folders), drag-to-move, rename, delete. Files live in
// the `client-documents` bucket; folder structure is logical (parent_path), so
// moving or renaming never rewrites storage.
function LeadDocuments({ client }) {
  const clientId = client.id;
  const [path, setPath] = useState('');
  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overFolder, setOverFolder] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const fileRef = useRef(null);
  const dirRef = useRef(null);

  const load = async (p = path) => {
    setLoading(true);
    try {
      const [res, tree] = await Promise.all([listClientFiles(clientId, p), listClientFolders(clientId)]);
      setItems(res.items || []);
      setFolders(tree.folders || []);
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(path); /* eslint-disable-next-line */ }, [clientId, path]);

  const crumbs = path ? path.split('/') : [];
  const goTo = (i) => setPath(i < 0 ? '' : crumbs.slice(0, i + 1).join('/'));

  // Walk a dropped folder so nested files keep their structure.
  const readEntry = (entry, prefix, out) => new Promise((resolve) => {
    if (!entry) return resolve();
    if (entry.isFile) {
      entry.file(f => { out.push({ file: f, rel: prefix }); resolve(); }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const next = prefix ? `${prefix}/${entry.name}` : entry.name;
      const readBatch = () => reader.readEntries(async (ents) => {
        if (!ents.length) return resolve();
        for (const e of ents) await readEntry(e, next, out);
        readBatch();
      }, () => resolve());
      readBatch();
    } else resolve();
  });

  const runUpload = async (list) => {
    if (!list.length) return;
    setUploads(list.map(x => ({ name: x.file.name, status: 'uploading' })));
    for (let i = 0; i < list.length; i++) {
      const { file, rel } = list[i];
      const dest = [path, rel].filter(Boolean).join('/');
      try {
        await uploadClientFile(clientId, file, dest);
        setUploads(p => p.map((u, idx) => idx === i ? { ...u, status: 'done' } : u));
      } catch (err) {
        setUploads(p => p.map((u, idx) => idx === i ? { ...u, status: 'error' } : u));
        toast('error', `${file.name}: ${err.message}`);
      }
    }
    await load();
    setTimeout(() => setUploads([]), 2000);
  };

  const onDrop = async (e) => {
    e.preventDefault(); setDragOver(false);
    if (dragId) return;
    const out = [];
    const its = Array.from(e.dataTransfer.items || []);
    const entries = its.map(it => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
    if (entries.length) { for (const en of entries) await readEntry(en, '', out); }
    else Array.from(e.dataTransfer.files || []).forEach(f => out.push({ file: f, rel: '' }));
    runUpload(out);
  };

  const pickFiles = (fl) => runUpload(Array.from(fl || []).map(f => ({
    file: f, rel: (f.webkitRelativePath || '').split('/').slice(0, -1).join('/'),
  })));

  const dropOnFolder = async (e, folder) => {
    e.preventDefault(); e.stopPropagation(); setOverFolder(null);
    if (!dragId || dragId === folder.id) return;
    const dest = folder.parent_path ? `${folder.parent_path}/${folder.name}` : folder.name;
    try { await moveClientFile(dragId, dest); toast('success', 'Moved'); await load(); }
    catch (err) { toast('error', err.message); }
    setDragId(null);
  };

  const doRename = async (it) => {
    const name = prompt('Rename to:', it.name);
    if (!name || name === it.name) return;
    try { await renameClientFile(it.id, name); await load(); } catch (e) { toast('error', e.message); }
  };
  const doDelete = async (it) => {
    if (!confirm(it.is_folder ? `Delete folder "${it.name}" and everything inside it?` : `Delete "${it.name}"?`)) return;
    try { await deleteClientFile(it.id); toast('success', 'Deleted'); await load(); } catch (e) { toast('error', e.message); }
  };
  const doMkdir = async () => {
    const name = prompt('Folder name:');
    if (!name) return;
    try { await createClientFolder(clientId, path, name); await load(); } catch (e) { toast('error', e.message); }
  };
  const moveTo = async (it, dest) => {
    setMenuFor(null);
    try { await moveClientFile(it.id, dest); toast('success', 'Moved'); await load(); }
    catch (e) { toast('error', e.message); }
  };

  const fmtSize = (n) => !n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const btn = { padding: '7px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 168px)' }}>
      {/* Toolbar + breadcrumbs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Documents</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--muted)', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <button onClick={() => goTo(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: path ? 'var(--orange)' : 'var(--muted)', fontWeight: 700, fontSize: 12.5, padding: 0 }}>All files</button>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ChevronRight size={12} />
              <button onClick={() => goTo(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i === crumbs.length - 1 ? 'var(--text)' : 'var(--orange)', fontWeight: 700, fontSize: 12.5, padding: 0 }}>{c}</button>
            </span>
          ))}
        </div>
        <button style={btn} onClick={doMkdir}><FolderPlus size={14} /> New folder</button>
        <button style={btn} onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload files</button>
        <button style={btn} onClick={() => dirRef.current?.click()}><FolderOpen size={14} /> Upload folder</button>
        <input ref={fileRef} type="file" multiple hidden onChange={e => { pickFiles(e.target.files); e.target.value = ''; }} />
        <input ref={dirRef} type="file" webkitdirectory="" directory="" multiple hidden onChange={e => { pickFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); if (!dragId) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: '18px 20px', borderRadius: 14,
          background: dragOver ? 'rgba(37,99,235,0.06)' : 'var(--surface)',
          border: `2px dashed ${dragOver ? 'var(--orange)' : 'var(--border)'}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(255,155,38,0.10)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Upload size={19} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
            Drop files or folders {path ? <>into <span style={{ color: 'var(--orange)' }}>{crumbs[crumbs.length - 1]}</span></> : 'here'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Nested folders keep their structure. Drag a row onto a folder to move it. Up to 500MB per file.</div>
        </div>
      </div>

      {uploads.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 12, flexShrink: 0, maxHeight: 130, overflowY: 'auto' }}>
          {uploads.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: u.status === 'error' ? '#ef4444' : u.status === 'done' ? '#22c55e' : 'var(--muted)' }}>
              {u.status === 'uploading' && <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />}
              {u.status === 'done' && <CheckCircle2 size={11} />}
              {u.status === 'error' && <X size={11} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{u.name}</span>
              <span>{u.status === 'uploading' ? 'Uploading…' : u.status === 'done' ? 'Done' : 'Failed'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Listing */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
        {loading ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
          : items.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>{path ? 'This folder is empty.' : 'No documents yet. Drop files or folders above.'}</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {path && (
              <div
                onDragOver={e => { e.preventDefault(); setOverFolder('..'); }}
                onDragLeave={() => setOverFolder(null)}
                onDrop={e => { e.preventDefault(); if (dragId) { moveClientFile(dragId, crumbs.slice(0, -1).join('/')).then(() => load()).catch(err => toast('error', err.message)); setDragId(null); } setOverFolder(null); }}
                onClick={() => goTo(crumbs.length - 2)}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 13px', borderRadius: 10, cursor: 'pointer', background: overFolder === '..' ? 'rgba(255,155,38,0.10)' : 'transparent', border: `1px solid ${overFolder === '..' ? 'var(--orange)' : 'transparent'}` }}>
                <CornerLeftUp size={16} style={{ color: 'var(--muted)' }} />
                <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>Up a level</span>
              </div>
            )}
            {items.map(it => {
              const isOver = overFolder === it.id;
              return (
                <div key={it.id}
                  draggable
                  onDragStart={() => setDragId(it.id)}
                  onDragEnd={() => { setDragId(null); setOverFolder(null); }}
                  onDragOver={it.is_folder ? (e => { e.preventDefault(); if (dragId && dragId !== it.id) setOverFolder(it.id); }) : undefined}
                  onDragLeave={it.is_folder ? (() => setOverFolder(null)) : undefined}
                  onDrop={it.is_folder ? (e => dropOnFolder(e, it)) : undefined}
                  onClick={() => { if (it.is_folder) setPath(path ? `${path}/${it.name}` : it.name); else if (it.url) window.open(it.url, '_blank'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px', borderRadius: 10,
                    background: isOver ? 'rgba(255,155,38,0.10)' : 'var(--surface)',
                    border: `1px solid ${isOver ? 'var(--orange)' : 'var(--border)'}`,
                    cursor: 'pointer', opacity: dragId === it.id ? 0.45 : 1, position: 'relative',
                  }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {it.is_folder ? <Folder size={16} style={{ color: 'var(--orange)' }} /> : <FileIcon size={15} style={{ color: 'var(--muted)' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                      {it.is_folder ? 'Folder' : [fmtSize(it.size), actDate(it.created_at)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {!it.is_folder && it.url && (
                    <a href={it.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Download"
                       style={{ color: 'var(--muted)', display: 'flex', flexShrink: 0 }}><Download size={15} /></a>
                  )}
                  <button title="More" onClick={e => { e.stopPropagation(); setMenuFor(menuFor === it.id ? null : it.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, flexShrink: 0 }}>
                    <MoreHorizontal size={16} />
                  </button>
                  {menuFor === it.id && (
                    <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: 8, top: 44, zIndex: 40, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-md, 0 8px 24px rgba(0,0,0,0.3))', padding: 6, minWidth: 190, maxHeight: 260, overflowY: 'auto' }}>
                      <button onClick={() => { setMenuFor(null); doRename(it); }} style={{ ...btn, width: '100%', justifyContent: 'flex-start', background: 'none', border: 'none' }}><Pencil size={13} /> Rename</button>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 10px 4px' }}>Move to</div>
                      {path !== '' && <button onClick={() => moveTo(it, '')} style={{ ...btn, width: '100%', justifyContent: 'flex-start', background: 'none', border: 'none' }}>All files</button>}
                      {folders.filter(f => f.id !== it.id && f.path !== path && !(it.is_folder && (f.path === (path ? `${path}/${it.name}` : it.name) || f.path.startsWith((path ? `${path}/${it.name}` : it.name) + '/')))).map(f => (
                        <button key={f.id} onClick={() => moveTo(it, f.path)} style={{ ...btn, width: '100%', justifyContent: 'flex-start', background: 'none', border: 'none' }}>
                          <Folder size={13} style={{ color: 'var(--orange)' }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
                        </button>
                      ))}
                      <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                      <button onClick={() => { setMenuFor(null); doDelete(it); }} style={{ ...btn, width: '100%', justifyContent: 'flex-start', background: 'none', border: 'none', color: '#ef4444' }}><Trash2 size={13} /> Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
      </div>
    </div>
  );
}

function Card({ title, children, style }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-sm)', ...style }}>
      {title && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>
          {title}
        </div>
      )}
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onSave, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ fontSize: 14, color: 'var(--text)' }}>
        <InlineEdit value={value} onSave={onSave} placeholder={placeholder} />
      </div>
    </div>
  );
}

// Small on/off switch with an inline label.
function Switch({ on, onChange, labelOn = 'On', labelOff = 'Off' }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '5px 10px 5px 6px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`, background: on ? 'rgba(34,197,94,0.10)' : 'var(--surface-2)' }}>
      <span style={{ width: 34, height: 20, borderRadius: 999, background: on ? '#22c55e' : 'var(--surface-3)', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? '#16a34a' : 'var(--muted)' }}>{on ? labelOn : labelOff}</span>
    </button>
  );
}

// Compact revenue display that expands into a small popover for editing the
// amount + billing cadence. Collapsed it reads like "$1,500 · one-time".
function RevenueField({ value, type, onSave }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(value ?? '');
  const [cadence, setCadence] = useState(type || 'one_time');
  const ref = useRef(null);
  useEffect(() => { setAmt(value ?? ''); setCadence(type || 'one_time'); }, [value, type, open]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const commit = () => {
    const n = amt === '' || amt == null ? null : Number(amt);
    onSave({ value: Number.isNaN(n) ? null : n, type: cadence });
    setOpen(false);
  };
  const hasVal = value != null && value !== '';
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '9px 11px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${open ? 'var(--orange)' : 'var(--border)'}`, background: 'var(--surface-2)', textAlign: 'left', transition: 'border-color 0.12s' }}>
        {hasVal ? (
          <>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{fmtUsd(value)}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: type === 'monthly' ? 'var(--orange)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{type === 'monthly' ? '/ mo' : 'one-time'}</span>
          </>
        ) : <span style={{ fontSize: 13, color: 'var(--muted)' }}>Set potential revenue</span>}
        <Pencil size={12} style={{ marginLeft: 'auto', color: 'var(--muted)', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.45)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Amount ($)</span>
            <input className="form-input" type="number" min="0" step="100" autoFocus value={amt}
              onChange={e => setAmt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setOpen(false); }}
              placeholder="e.g. 5000" />
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Billing</span>
            <div style={{ display: 'flex', gap: 6, background: 'var(--surface-2)', borderRadius: 9, padding: 3 }}>
              {[{ k: 'one_time', label: 'One-time' }, { k: 'monthly', label: 'Monthly' }].map(o => {
                const on = cadence === o.k;
                return (
                  <button key={o.k} type="button" onClick={() => setCadence(o.k)}
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--font-display)', border: 'none', background: on ? 'var(--orange)' : 'transparent', color: on ? '#fff' : 'var(--muted)', transition: 'background 0.12s' }}>{o.label}</button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={commit}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact roll-up of a client's projects on the Overview, each with its
// lifecycle status + payment badge, so the client page reads as a summary of
// their work without opening the Projects tab.
function ClientProjectsRollup({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const all = await getProjects();
        setRows(all.filter(p => p.client_id === client.id || (!p.client_id && p.client === client.business_name)));
      } catch {}
      finally { setLoading(false); }
    })();
  }, [client.id]);

  return (
    <Card title="Projects">
      {loading ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        : rows.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>No projects yet. Add one from the Projects tab.</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map(p => {
            const start = projectStartDate(p);
            return (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5, flex: 1, minWidth: 100 }}>{p.name}</span>
              {start && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Started {start}</span>}
              {p.value ? <span style={{ fontSize: 12.5, fontWeight: 800, color: '#22c55e' }}>{fmtUsd(p.value)}{p.billing_type === 'monthly' ? '/mo' : ''}</span> : null}
              <StatusBadge status={projectPaymentBadge(p)} />
              <StatusBadge status={p.status || 'Onboarding'} />
            </div>
            );
          })}
        </div>}
    </Card>
  );
}

function OverviewTab({ client, saveField }) {
  return (
    <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        <Card title="Business details">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18 }}>
            <Field label="Business Name" value={client.business_name} onSave={v => saveField('business_name', v)} placeholder="Business" />
            <Field label="Contact" value={client.owner_name} onSave={v => saveField('owner_name', v)} placeholder="Contact name" />
            <Field label="Phone" value={client.contact_phone} onSave={v => saveField('contact_phone', v)} placeholder="(000) 000-0000" />
            <Field label="Email" value={client.contact_email} onSave={v => saveField('contact_email', v)} placeholder="you@business.com" />
            <Field label="Website" value={client.website_url} onSave={v => saveField('website_url', v)} placeholder="https://…" />
            <Field label="Instagram" value={client.instagram} onSave={v => saveField('instagram', v)} placeholder="@handle" />
            {client.stage === 'lead' && (
              <Field
                label="Potential Revenue ($)"
                value={client.potential_value != null ? String(client.potential_value) : ''}
                onSave={v => { const n = (v === '' || v == null) ? null : Number(v); saveField('potential_value', Number.isNaN(n) ? null : n); }}
                placeholder="e.g. 5000"
              />
            )}
          </div>
        </Card>

        <ClientProjectsRollup client={client} />

        <Card title="What we're doing / notes">
          <textarea className="form-input" rows={7} defaultValue={client.notes || ''} onBlur={e => saveField('notes', e.target.value)} placeholder="Scope, goals, what VTM is delivering for this client…" style={{ resize: 'vertical', width: '100%' }} />
        </Card>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card title="Quick info">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Source" value={client.source} onSave={v => saveField('source', v)} placeholder="Walk-in / Referral…" />
            <Field label="Industry" value={client.industry} onSave={v => saveField('industry', v)} placeholder="Industry" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Automated emails</span>
              <Switch on={client.auto_followups_enabled !== false} onChange={v => saveField('auto_followups_enabled', v)}
                labelOn="Reminders on" labelOff="Reminders off" />
            </div>
            {client.created_at && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client since</span>
                <span style={{ fontSize: 14, color: 'var(--text)' }}>{new Date(client.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Platforms & Access tab ─────────────────────────────────────────────────────
function AccessTab({ clientId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ platform_name: '', access_type: 'admin_invite', invite_email: '' });

  const load = async () => {
    try { setRows(await getClientPlatforms(clientId)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const add = async () => {
    if (!draft.platform_name.trim()) return;
    try {
      await createClientPlatform({ client_id: clientId, ...draft });
      setDraft({ platform_name: '', access_type: 'admin_invite', invite_email: '' });
      setAdding(false); load();
    } catch (e) { toast('error', e.message); }
  };
  const setStatus = async (row, status) => {
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, access_status: status } : r));
    try { await updateClientPlatform(row.id, { access_status: status }); } catch (e) { toast('error', e.message); }
  };
  const remove = async (row) => {
    setRows(rs => rs.filter(r => r.id !== row.id));
    try { await deleteClientPlatform(row.id); } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.length === 0 && !adding && (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No platforms tracked yet. Add the tools this client uses and the access you need.</div>
      )}

      {rows.map(row => {
        const st = ACCESS_STATUS[row.access_status] || ACCESS_STATUS.needed;
        return (
          <div key={row.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShieldCheck size={16} style={{ color: st.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>{row.platform_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {(row.access_type || 'access').replace(/_/g, ' ')}{row.invite_email ? ` · ${row.invite_email}` : ''}
                </div>
              </div>
              <select className="form-input" style={{ width: 'auto', padding: '5px 8px', fontSize: 12 }} value={row.access_status || 'needed'} onChange={e => setStatus(row, e.target.value)}>
                {Object.entries(ACCESS_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => remove(row)}><Trash2 size={14} /></button>
            </div>
            {row.access_process && (
              <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                {row.access_process}
              </div>
            )}
          </div>
        );
      })}

      {adding ? (
        <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="form-input" placeholder="Platform (e.g. Notion, Shopify)" value={draft.platform_name} onChange={e => setDraft(d => ({ ...d, platform_name: e.target.value }))} autoFocus />
            <select className="form-input" value={draft.access_type} onChange={e => setDraft(d => ({ ...d, access_type: e.target.value }))}>
              <option value="admin_invite">Admin invite</option>
              <option value="api_key">API key</option>
              <option value="login_share">Login share</option>
              <option value="oauth">OAuth connect</option>
              <option value="other">Other</option>
            </select>
          </div>
          <input className="form-input" placeholder="Invite email (optional)" value={draft.invite_email} onChange={e => setDraft(d => ({ ...d, invite_email: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={add}>Add Platform</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}><Plus size={14} /> Add Platform</button>
      )}
    </div>
  );
}

// ── Onboarding Tasks tab ───────────────────────────────────────────────────────
function TasksTab({ clientId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');

  const load = async () => {
    try { setRows(await getClientTasks(clientId)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const add = async () => {
    if (!newTitle.trim()) return;
    try { await createClientTask({ client_id: clientId, title: newTitle.trim() }); setNewTitle(''); load(); }
    catch (e) { toast('error', e.message); }
  };
  const toggle = async (row) => {
    const status = row.status === 'done' ? 'todo' : 'done';
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, status } : r));
    try { await updateClientTask(row.id, { status }); } catch (e) { toast('error', e.message); }
  };
  const remove = async (row) => {
    setRows(rs => rs.filter(r => r.id !== row.id));
    try { await deleteClientTask(row.id); } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  const done = rows.filter(r => r.status === 'done').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{done}/{rows.length} complete</div>
      )}
      {rows.map(row => (
        <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
          <button onClick={() => toggle(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            {row.status === 'done'
              ? <CheckCircle2 size={18} style={{ color: '#22c55e' }} />
              : <Circle size={18} style={{ color: 'var(--muted)' }} />}
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: row.status === 'done' ? 'var(--muted)' : 'var(--text)', textDecoration: row.status === 'done' ? 'line-through' : 'none', fontSize: 14 }}>{row.title}</div>
            {row.description && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{row.description}</div>}
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{row.assigned_to}</span>
          <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => remove(row)}><Trash2 size={13} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="form-input" placeholder="Add an onboarding / access task…" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="btn-primary" onClick={add}><Plus size={14} /></button>
      </div>
    </div>
  );
}

// ── Projects tab ───────────────────────────────────────────────────────────────
const PLAN_STATUS = {
  none:         { label: 'No plan',       color: '#8a8a8a' },
  draft:        { label: 'Draft',         color: '#f5a623' },
  needs_review: { label: 'Needs review',  color: '#3b82f6' },
  approved:     { label: 'Approved',      color: '#22c55e' },
};

// ── Vault tab (per-client credentials, secrets encrypted at rest) ───────────────
const CRED_CATS = [
  { key: 'login',    label: 'Login' },
  { key: 'api_key',  label: 'API key' },
  { key: 'database', label: 'Database' },
  { key: 'card',     label: 'Card / billing' },
  { key: 'note',     label: 'Secure note' },
  { key: 'other',    label: 'Other' },
];
const EMPTY_CRED = { label: '', category: 'login', username: '', url: '', secret: '', notes: '' };

function copyToClipboard(value, what) {
  if (!value) return;
  try { navigator.clipboard.writeText(value); toast('success', `${what} copied`); }
  catch { toast('error', 'Copy failed'); }
}

function VaultTab({ clientId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(EMPTY_CRED);
  const [reveal, setReveal] = useState({}); // id -> bool

  const load = async () => {
    try { setRows(await getClientCredentials(clientId)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [clientId]);

  const filtered = useMemo(() => rows.filter(r => !q ||
    [r.label, r.username, r.url, r.category, r.notes].some(v => (v || '').toLowerCase().includes(q.toLowerCase()))
  ), [rows, q]);

  const startNew = () => { setForm(EMPTY_CRED); setEditing('new'); };
  const startEdit = (r) => {
    // secret intentionally left blank → blank means "leave unchanged" on save
    setForm({ label: r.label, category: r.category || 'login', username: r.username || '', url: r.url || '', secret: '', notes: r.notes || '' });
    setEditing(r.id);
  };
  const cancel = () => { setEditing(null); setForm(EMPTY_CRED); };

  const save = async () => {
    if (!form.label.trim()) return;
    try {
      if (editing === 'new') {
        await createClientCredential({ client_id: clientId, ...form });
      } else {
        const patch = { client_id: clientId, label: form.label, category: form.category, username: form.username, url: form.url, notes: form.notes };
        // Only send secret if the user typed a new one (blank = keep existing)
        if (form.secret !== '') patch.secret = form.secret;
        await updateClientCredential(editing, patch);
      }
      cancel(); setLoading(true); load();
    } catch (e) { toast('error', e.message); }
  };
  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.label}"? This cannot be undone.`)) return;
    setRows(rs => rs.filter(x => x.id !== r.id));
    try { await deleteClientCredential(r.id); } catch (e) { toast('error', e.message); }
  };

  const CredForm = (
    <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <input className="form-input" placeholder="Label (e.g. Shopify admin)" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} autoFocus />
        <select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
          {CRED_CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <input className="form-input" placeholder="Username / email" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        <input className="form-input" placeholder="URL (optional)" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
      </div>
      <input className="form-input" type="text" autoComplete="off"
        placeholder={editing !== 'new' ? 'Password / secret (leave blank to keep current)' : 'Password / secret'}
        value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} />
      <textarea className="form-input" rows={2} placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" onClick={save}>{editing === 'new' ? 'Save Credential' : 'Update'}</button>
        <button className="btn-ghost" onClick={cancel}>Cancel</button>
      </div>
    </div>
  );

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search vault…" value={q} onChange={e => setQ(e.target.value)} style={{ paddingLeft: 30, width: '100%' }} />
        </div>
        {editing !== 'new' && <button className="btn-primary" onClick={startNew}><Plus size={14} /> Add</button>}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Lock size={12} /> Secrets are encrypted at rest and only decrypted for you.
      </div>

      {editing === 'new' && CredForm}

      {filtered.length === 0 && editing !== 'new' && (
        <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No credentials saved yet.</div>
      )}

      {filtered.map(r => (
        editing === r.id ? <div key={r.id}>{CredForm}</div> : (
          <div key={r.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <KeyRound size={15} style={{ color: 'var(--orange)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>{r.label}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>{(r.category || 'login').replace('_', ' ')}</div>
              </div>
              {r.url && (
                <a href={r.url.startsWith('http') ? r.url : `https://${r.url}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '5px 7px' }} title="Open site"><ExternalLink size={14} /></a>
              )}
              <button className="btn-ghost" style={{ padding: '5px 7px' }} onClick={() => startEdit(r)} title="Edit"><Pencil size={14} /></button>
              <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => remove(r)} title="Delete"><Trash2 size={14} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 12 }}>
              {r.username && (
                <VaultField label="Username" value={r.username} onCopy={() => copyToClipboard(r.username, 'Username')} />
              )}
              {r.secret != null && r.secret !== '' && (
                <VaultField
                  label="Secret"
                  value={reveal[r.id] ? r.secret : '••••••••••••'}
                  mono
                  onCopy={() => copyToClipboard(r.secret, 'Secret')}
                  onToggle={() => setReveal(s => ({ ...s, [r.id]: !s[r.id] }))}
                  revealed={!!reveal[r.id]}
                />
              )}
            </div>
            {r.notes && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{r.notes}</div>}
          </div>
        )
      ))}
    </div>
  );
}

function VaultField({ label, value, onCopy, onToggle, revealed, mono }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', borderRadius: 8, padding: '6px 8px' }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: 'var(--text)', fontFamily: mono ? 'ui-monospace, monospace' : undefined }}>{value}</span>
        {onToggle && (
          <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={onToggle} title={revealed ? 'Hide' : 'Reveal'}>
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
        <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={onCopy} title="Copy"><Copy size={13} /></button>
      </div>
    </div>
  );
}

// ── Agreement tab (AI builder: analyze -> answer -> draft -> review -> approve) ──
const money = (n) => `$${Number(n || 0).toLocaleString()}`;
const Spinner = () => <span className="spinner" aria-label="loading" />;
const PAY_BADGE = { paid: { label: 'Paid', color: '#22c55e' }, pending: { label: 'Pending', color: '#f5a623' } };

function PaymentRows({ payments, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {payments.map(p => {
        const b = PAY_BADGE[p.status] || PAY_BADGE.pending;
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 9 }}>
            <DollarSign size={14} style={{ color: 'var(--orange)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{money(p.amount)} · {p.label}</div>
              {p.due_condition && <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.due_condition}</div>}
            </div>
            {p.stripe_invoice_url && <a href={p.stripe_invoice_url} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '4px 6px' }} title="Stripe invoice"><ExternalLink size={13} /></a>}
            <button onClick={() => onToggle && onToggle(p)} style={{ fontSize: 11, fontWeight: 700, color: b.color, background: `${b.color}18`, border: `1px solid ${b.color}40`, borderRadius: 999, padding: '2px 10px', cursor: onToggle ? 'pointer' : 'default' }}>{b.label}</button>
          </div>
        );
      })}
    </div>
  );
}

function AgreementTab({ client }) {
  const [loading, setLoading] = useState(true);
  const [agreements, setAgreements] = useState([]);
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [terms, setTerms] = useState('');
  const [draft, setDraft] = useState(null);
  const [showText, setShowText] = useState('agreement');
  const [nudge, setNudge] = useState(null);   // { kind: 'agreement', id }

  const load = async () => {
    try { const d = await getAgreements(client.id); setAgreements(d.agreements || []); setPayments(d.payments || []); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  // "Also text the sign link": the email send goes first (when it has not gone
  // out yet), then the sign link is queued as an iMessage to their phone.
  const textLink = async (ag) => {
    setBusy('text');
    try {
      if (!ag.sent_at) await sendAgreementForSignature(ag.id);
      const r = await textSignLink(ag.id);
      toast('success', `Sign link texted to ${r?.phone || 'the client'}`);
      load();
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const togglePay = async (p) => {
    const status = p.status === 'paid' ? 'pending' : 'paid';
    setPayments(ps => ps.map(x => x.id === p.id ? { ...x, status } : x));
    try { await updatePayment(p.id, status); } catch (e) { toast('error', e.message); }
  };

  const runAnalyze = async () => {
    setBusy('analyze');
    try {
      const a = await analyzeDeal(client.id);
      setAnalysis(a);
      const seed = (a.suggested_installments || []).map(i => `- ${money(i.amount)} ${i.trigger ? '(' + i.trigger + ')' : ''}`).join('\n');
      const monthly = (a.suggested_monthly || []).map(m => `- ${money(m.amount)}/mo ${m.item}`).join('\n');
      setTerms(`${a.suggested_structure || ''}\n\nInstallments:\n${seed}${monthly ? '\n\nMonthly:\n' + monthly : ''}`.trim());
    } catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const runGenerate = async () => {
    setBusy('generate');
    try { setDraft(await generateAgreement(client.id, terms)); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const runApprove = async () => {
    setBusy('approve');
    try { await approveAgreement(client.id, draft); setDraft(null); setAnalysis(null); setTerms(''); setLoading(true); load(); toast('success', 'Agreement saved'); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(''); }
  };

  const viewPdf = async (ag) => {
    try { const { url } = await getAgreementFileUrl(ag.id); window.open(url, '_blank'); }
    catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  // ── Existing agreement view ──
  if (agreements.length > 0) {
    const ag = agreements[0];
    const md = ag.terms || {};
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <FileSignature size={18} style={{ color: 'var(--orange)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{ag.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {money(ag.total_amount)} · <span style={{ textTransform: 'capitalize' }}>{ag.status}</span>
              {ag.signed_at ? ` · signed ${new Date(ag.signed_at).toLocaleDateString()} by ${ag.signer_name || 'client'}` : (ag.sent_at ? ` · sent ${new Date(ag.sent_at).toLocaleDateString()}` : '')}
            </div>
          </div>
          {ag.status === 'draft' && (
            <button className="btn-primary" disabled={busy === 'approve'} onClick={async () => {
              setBusy('approve');
              try { const r = await approveAgreementRow(ag.id); toast('success', 'Approved. Deal & payment schedule created. Review the document, then Send.'); load(); }
              catch (e) { toast('error', e.message); } finally { setBusy(''); }
            }}>
              <CheckCircle2 size={14} /> {busy === 'approve' ? 'Approving…' : 'Approve'}
            </button>
          )}
          {ag.terms?.agreement_markdown && (
            <button className="btn-ghost" disabled={busy === 'preview'} onClick={async () => {
              setBusy('preview');
              try { const { token } = await previewAgreementToken(ag.id); window.open(`/sign?token=${token}&preview=1`, '_blank'); }
              catch (e) { toast('error', e.message); } finally { setBusy(''); }
            }}>
              <Eye size={14} /> {busy === 'preview' ? 'Opening…' : 'Preview'}
            </button>
          )}
          {(ag.status === 'approved' || ag.status === 'sent') && (ag.terms?.agreement_markdown) && (
            <button className="btn-primary" disabled={busy === 'send'} onClick={async () => {
              setBusy('send');
              try { await sendAgreementForSignature(ag.id); toast('success', ag.sent_at ? 'Re-sent to client' : 'Sent to client to sign'); load(); }
              catch (e) { toast('error', e.message); } finally { setBusy(''); }
            }}>
              <FileSignature size={14} /> {busy === 'send' ? 'Sending…' : ag.sent_at ? 'Resend' : 'Send to sign'}
            </button>
          )}
          {(ag.status === 'approved' || ag.status === 'sent') && (
            <button className="btn-ghost" disabled={busy === 'text'} onClick={() => textLink(ag)} title="Queue an iMessage with the sign link to the client's phone (emails first if it has not been sent)">
              <Smartphone size={14} /> {busy === 'text' ? 'Texting…' : 'Also text the sign link'}
            </button>
          )}
          {ag.status === 'sent' && (
            <button className="btn-ghost" onClick={() => setNudge({ kind: 'agreement', id: ag.id })} title="Remind them to sign, by text or email">
              <SendIcon size={14} /> Nudge
            </button>
          )}
          {ag.file_url && <button className="btn-ghost" onClick={() => viewPdf(ag)}><Download size={14} /> PDF</button>}
        </div>
        {nudge && <NudgeModal kind={nudge.kind} id={nudge.id} onClose={() => setNudge(null)} onSent={() => load()} />}
        {ag.status === 'signed' && ag.signer_ip && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: -8 }}>
            Signed electronically · {ag.signature_method === 'draw' ? 'drawn signature' : 'typed signature'} · IP {ag.signer_ip} · {ag.signed_at ? new Date(ag.signed_at).toLocaleString() : ''}
          </div>
        )}

        {payments.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Payment schedule</div>
            <PaymentRows payments={payments} onToggle={togglePay} />
          </div>
        )}

        {/* Manual maintenance start, for pay-in-full / 50-50 plans that have no build schedule to trail. */}
        {ag.status === 'signed' && Number(md.maintenance) > 0 && (md.plan_key === 'full' || md.plan_key === '50_50') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <DollarSign size={18} style={{ color: ag.maintenance_started_at ? '#16a34a' : 'var(--orange)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5 }}>Maintenance &amp; Support · {money(md.maintenance)}/mo</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {ag.maintenance_started_at ? `Active since ${new Date(ag.maintenance_started_at).toLocaleDateString()}` : 'Start this when the project is delivered. It bills monthly on the card on file.'}
              </div>
            </div>
            {!ag.maintenance_started_at && (
              <button className="btn-primary" disabled={busy === 'maint'} onClick={async () => {
                if (!window.confirm(`Start ${money(md.maintenance)}/mo maintenance now? The first charge posts today to the client's saved card.`)) return;
                setBusy('maint');
                try { await startMaintenance(ag.id); toast('success', 'Maintenance started.'); load(); }
                catch (e) { toast('error', e.message); } finally { setBusy(''); }
              }}>{busy === 'maint' ? 'Starting…' : 'Start maintenance'}</button>
            )}
          </div>
        )}

        {(md.agreement_markdown || md.nda_markdown) && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {md.agreement_markdown && <button className="btn-ghost" style={{ fontWeight: showText === 'agreement' ? 700 : 400 }} onClick={() => setShowText('agreement')}>Agreement</button>}
              {md.nda_markdown && <button className="btn-ghost" style={{ fontWeight: showText === 'nda' ? 700 : 400 }} onClick={() => setShowText('nda')}>NDA</button>}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', maxHeight: 460, overflow: 'auto' }}>
              {showText === 'nda' ? md.nda_markdown : md.agreement_markdown}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Builder ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: 'var(--muted)', fontSize: 13 }}>Build a service agreement from this client's projects and discovery notes. AI proposes the billing, flags what you might be leaving out, then drafts it for your review.</div>

      {!analysis && (
        <button className="btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy === 'analyze'} onClick={runAnalyze}>
          <Sparkles size={15} /> {busy === 'analyze' ? 'Analyzing…' : 'Analyze deal with AI'}
        </button>
      )}

      {analysis && (
        <>
          {(analysis.flags || []).length > 0 && (
            <div style={{ padding: '14px 16px', background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f5a623', marginBottom: 8 }}>Worth a look before you price it</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 13, lineHeight: 1.7 }}>
                {analysis.flags.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}
          {(analysis.questions || []).length > 0 && (
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--text)' }}>AI wants to know:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{analysis.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Your billing terms (edit freely)</label>
            <textarea className="form-input" rows={7} value={terms} onChange={e => setTerms(e.target.value)} placeholder="e.g. $2,500 upfront to start, then $1,000 on completion of each of the other two projects. $29/mo hosting after launch." style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={busy === 'generate'} onClick={runGenerate}><FileSignature size={15} /> {busy === 'generate' ? 'Drafting…' : draft ? 'Regenerate draft' : 'Generate agreement'}</button>
            <button className="btn-ghost" onClick={() => { setAnalysis(null); setDraft(null); setTerms(''); }}>Reset</button>
          </div>
        </>
      )}

      {draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
          <div style={{ height: 1, background: 'var(--border)' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Draft for review · total {money(draft.total)}</div>
          {Array.isArray(draft.installments) && draft.installments.length > 0 && (
            <PaymentRows payments={draft.installments.map((i, idx) => ({ id: 'd' + idx, ...i, due_condition: i.trigger }))} />
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" style={{ fontWeight: showText === 'agreement' ? 700 : 400 }} onClick={() => setShowText('agreement')}>Agreement</button>
            <button className="btn-ghost" style={{ fontWeight: showText === 'nda' ? 700 : 400 }} onClick={() => setShowText('nda')}>NDA</button>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', maxHeight: 460, overflow: 'auto' }}>
            {showText === 'nda' ? draft.nda_markdown : draft.agreement_markdown}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" disabled={busy === 'approve'} onClick={runApprove}><CheckCircle2 size={15} /> {busy === 'approve' ? 'Saving…' : 'Approve & save'}</button>
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Saves the agreement + payment schedule. (Send-to-sign comes next.)</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Activity tab (Notes / Calls / Tasks) ───────────────────────────────────────
const ACT_SUBS = [
  { key: 'note', label: 'Notes', icon: StickyNote },
  { key: 'call', label: 'Calls', icon: Phone },
  { key: 'task', label: 'Tasks', icon: CheckSquare },
];
function actTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function ActivityTab({ clientId }) {
  const [sub, setSub] = useState('note');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({});

  const load = async () => {
    try { setItems(await getClientActivity(clientId, sub)); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { setLoading(true); setAdding(false); load(); }, [clientId, sub]);

  const openAdd = () => {
    setDraft(sub === 'note' ? { tag: 'Important', body: '' }
      : sub === 'call' ? { direction: 'outbound', outcome: 'Connected', body: '' }
      : { title: '', priority: 'medium', assigned_to: 'Ray', due_date: '' });
    setAdding(true);
  };
  const save = async () => {
    if (sub === 'task' ? !draft.title?.trim() : !draft.body?.trim()) return;
    try {
      await createClientActivity({ client_id: clientId, type: sub, ...draft, due_date: draft.due_date || null });
      setAdding(false); setLoading(true); load();
    } catch (e) { toast('error', e.message); }
  };
  const remove = async (a) => { setItems(x => x.filter(i => i.id !== a.id)); try { await deleteClientActivity(a.id); } catch (e) { toast('error', e.message); } };
  const toggleTask = async (a) => {
    const status = a.status === 'done' ? 'todo' : 'done';
    setItems(x => x.map(i => i.id === a.id ? { ...i, status } : i));
    try { await updateClientActivity(a.id, { status }); } catch (e) { toast('error', e.message); }
  };

  const label = ACT_SUBS.find(s => s.key === sub).label.replace(/s$/, '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'inline-flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3, gap: 2 }}>
          {ACT_SUBS.map(s => {
            const on = sub === s.key;
            return (
              <button key={s.key} onClick={() => setSub(s.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', background: on ? 'var(--surface)' : 'transparent', color: on ? 'var(--text)' : 'var(--muted)', boxShadow: on ? 'var(--shadow-sm)' : 'none' }}>
                <s.icon size={14} /> {s.label}
              </button>
            );
          })}
        </div>
        {!adding && <button className="btn-primary" style={{ marginLeft: 'auto' }} onClick={openAdd}><Plus size={14} /> New {label}</button>}
      </div>

      {adding && (
        <div style={{ padding: '16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sub === 'note' && (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Object.keys(NOTE_TAGS).map(t => (
                  <button key={t} type="button" onClick={() => setDraft(d => ({ ...d, tag: t }))} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${draft.tag === t ? NOTE_TAGS[t] : 'var(--border)'}`, background: draft.tag === t ? NOTE_TAGS[t] + '18' : 'var(--surface)', color: draft.tag === t ? NOTE_TAGS[t] : 'var(--muted)' }}>{t}</button>
                ))}
              </div>
              <textarea className="form-input" rows={3} autoFocus placeholder="Write a note…" value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} style={{ resize: 'vertical' }} />
            </>
          )}
          {sub === 'call' && (
            <>
              <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <select className="form-input" value={draft.direction} onChange={e => setDraft(d => ({ ...d, direction: e.target.value }))}>
                  <option value="outbound">Outbound</option><option value="inbound">Inbound</option>
                </select>
                <select className="form-input" value={draft.outcome} onChange={e => setDraft(d => ({ ...d, outcome: e.target.value }))}>
                  {CALL_OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <textarea className="form-input" rows={2} autoFocus placeholder="Call notes…" value={draft.body} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} style={{ resize: 'vertical' }} />
            </>
          )}
          {sub === 'task' && (
            <>
              <input className="form-input" autoFocus placeholder="Task title…" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
              <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <select className="form-input" value={draft.priority} onChange={e => setDraft(d => ({ ...d, priority: e.target.value }))}>
                  {Object.keys(TASK_PRIORITY).map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select>
                <input className="form-input" placeholder="Assignee" value={draft.assigned_to} onChange={e => setDraft(d => ({ ...d, assigned_to: e.target.value }))} />
                <input className="form-input" type="date" value={draft.due_date} onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={save}>Save {label}</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div>
        : items.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13, padding: '8px 0' }}>No {sub === 'task' ? 'tasks' : sub + 's'} yet.</div>
        : items.map(a => (
          sub === 'note' ? (
            <div key={a.id} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                {a.tag && <span style={{ fontSize: 10.5, fontWeight: 700, color: NOTE_TAGS[a.tag] || 'var(--muted)', background: (NOTE_TAGS[a.tag] || '#888') + '18', border: `1px solid ${(NOTE_TAGS[a.tag] || '#888')}40`, borderRadius: 999, padding: '2px 9px' }}>{a.tag}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{a.author || 'Ray'} · {actTimeAgo(a.created_at)}</span>
                <button className="btn-ghost" style={{ padding: '3px 5px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.body}</div>
            </div>
          ) : sub === 'call' ? (
            <div key={a.id} style={{ display: 'flex', gap: 12, padding: '13px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {a.direction === 'inbound' ? <PhoneIncoming size={14} style={{ color: '#22c55e' }} /> : <PhoneOutgoing size={14} style={{ color: 'var(--orange)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', textTransform: 'capitalize' }}>{a.direction} call</span>
                  {a.outcome && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', background: 'rgba(59,130,246,0.1)', borderRadius: 999, padding: '1px 9px' }}>{a.outcome}</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{actTimeAgo(a.created_at)}</span>
                  <button className="btn-ghost" style={{ padding: '3px 5px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
                </div>
                {a.body && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{a.body}</div>}
              </div>
            </div>
          ) : (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, boxShadow: 'var(--shadow-sm)' }}>
              <button onClick={() => toggleTask(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                {a.status === 'done' ? <CheckCircle2 size={19} style={{ color: '#22c55e' }} /> : <Circle size={19} style={{ color: 'var(--muted)' }} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: a.status === 'done' ? 'var(--muted)' : 'var(--text)', textDecoration: a.status === 'done' ? 'line-through' : 'none', fontWeight: 600 }}>{a.title}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 2, fontSize: 11.5, color: 'var(--muted)' }}>
                  {a.assigned_to && <span>{a.assigned_to}</span>}
                  {a.due_date && <span>due {new Date(a.due_date).toLocaleDateString()}</span>}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: TASK_PRIORITY[a.priority] || '#888', textTransform: 'capitalize' }}><Flag size={11} /> {a.priority}</span>
              <button className="btn-ghost" style={{ padding: '4px 6px', color: 'var(--red)' }} onClick={() => remove(a)}><Trash2 size={13} /></button>
            </div>
          )
        ))}
    </div>
  );
}

// ── Deals tab ───────────────────────────────────────────────────────────────
// A Deal groups this client's projects into one agreement + one combined
// invoice. One client can have several deals; each bills as a single invoice
// with a line item per project, so multiple projects never split into
// separate bills.
const fmtMoney = (v) => `$${Number(v || 0).toLocaleString()}`;
const dealTotals = (deal) => {
  const ps = deal.projects || [];
  const oneTime = ps.filter(p => p.billing_type !== 'monthly').reduce((s, p) => s + Number(p.value || 0), 0);
  const monthly = ps.filter(p => p.billing_type !== 'one_time').reduce((s, p) => s + Number(p.recurring_amount || 0), 0);
  return { oneTime, monthly };
};

function DealCard({ deal, clientProjects, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(new Set((deal.projects || []).map(p => p.id)));
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const { oneTime, monthly } = dealTotals(deal);

  const saveMembership = async () => {
    setBusy(true);
    try { await updateDeal(deal.id, { project_ids: [...picked] }); setEditing(false); onChanged(); }
    catch (e) { toast('error', e.message); } finally { setBusy(false); }
  };
  const sendInvoice = async () => {
    if (!window.confirm(`Create & send ONE combined Stripe invoice for "${deal.name}" (${(deal.projects || []).length} project${(deal.projects || []).length === 1 ? '' : 's'})?`)) return;
    setBusy(true);
    try { await createDealInvoice(deal.id, { email: email.trim(), name: deal.name }); toast('success', 'Combined invoice sent via Stripe.'); onChanged(); }
    catch (e) { toast('error', e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete the deal "${deal.name}"? Its projects stay, just ungrouped.`)) return;
    try { await deleteDeal(deal.id); onChanged(); } catch (e) { toast('error', e.message); }
  };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <DollarSign size={16} style={{ color: 'var(--orange)' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{deal.name || 'Untitled deal'}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {fmtMoney(oneTime)}{monthly > 0 ? ` + ${fmtMoney(monthly)}/mo` : ''} · {(deal.projects || []).length} project{(deal.projects || []).length === 1 ? '' : 's'}
          </div>
        </div>
        {deal.invoice_status === 'sent' && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#16a34a18', border: '1px solid #16a34a40', borderRadius: 999, padding: '2px 10px' }}>Invoiced</span>
        )}
        <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={remove} title="Delete deal"><Trash2 size={13} /></button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Line items (projects) */}
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Projects in this deal</div>
            {clientProjects.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>This client has no projects yet. Create them on the Projects page.</div>}
            {clientProjects.map(p => {
              const on = picked.has(p.id);
              const inOther = p.deal_id && p.deal_id !== deal.id;
              return (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => setPicked(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} style={{ accentColor: 'var(--orange)' }} />
                  <span style={{ flex: 1 }}>{p.name}{inOther ? ' (in another deal)' : ''}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{p.billing_type !== 'monthly' && p.value ? fmtMoney(p.value) : ''}{p.recurring_amount ? ` ${fmtMoney(p.recurring_amount)}/mo` : ''}</span>
                </label>
              );
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn-primary" onClick={saveMembership} disabled={busy} style={{ padding: '7px 14px' }}>{busy ? 'Saving…' : 'Save projects'}</button>
              <button className="btn-ghost" onClick={() => { setPicked(new Set((deal.projects || []).map(p => p.id))); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(deal.projects || []).length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No projects in this deal yet.</div>
            ) : (deal.projects || []).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{p.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {p.billing_type !== 'monthly' && p.value ? fmtMoney(p.value) : ''}{p.recurring_amount ? ` ${fmtMoney(p.recurring_amount)}/mo` : ''}
                </span>
              </div>
            ))}
            <button className="btn-ghost" onClick={() => setEditing(true)} style={{ alignSelf: 'flex-start', marginTop: 4, padding: '5px 10px' }}><Pencil size={12} /> Edit projects</button>
          </div>
        )}

        {/* Combined invoice */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {deal.invoice_status === 'sent' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#16a34a', fontWeight: 700 }}>
              <CheckCircle2 size={15} /> Combined invoice sent
              {deal.stripe_invoice_url && <a href={deal.stripe_invoice_url} target="_blank" rel="noreferrer" style={{ color: 'var(--orange)', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>View <ExternalLink size={12} /></a>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Billing email (defaults to the client's)" />
              <button className="btn-primary" onClick={sendInvoice} disabled={busy || (deal.projects || []).length === 0} style={{ justifyContent: 'center' }}>
                {busy ? 'Sending…' : <><DollarSign size={14} /> Create & send combined invoice</>}
              </button>
              <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>One Stripe invoice with a line item per project. Monthly projects roll into one subscription.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DealsTab({ client }) {
  const [deals, setDeals] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPicked, setNewPicked] = useState(new Set());

  const load = async () => {
    try {
      const [d, all] = await Promise.all([getDeals(client.id), getProjects()]);
      setDeals(d || []);
      setProjects((all || []).filter(p => p.client_id === client.id || (!p.client_id && p.client === client.business_name)));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  const createNew = async () => {
    if (!newName.trim()) return;
    try {
      await createDeal({ client_id: client.id, name: newName.trim(), project_ids: [...newPicked] });
      setNewName(''); setNewPicked(new Set()); setCreating(false); load();
    } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', flex: 1, lineHeight: 1.5 }}>
          A deal bundles this client's projects into one agreement + one combined invoice.
        </div>
        {!creating && <button className="btn-primary" onClick={() => setCreating(true)} style={{ padding: '8px 14px' }}><Plus size={14} /> New Deal</button>}
      </div>

      {creating && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Deal name</label>
            <input className="form-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Veteran Nexus · CRM + 2 sites" autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Include projects</div>
            {projects.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>This client has no projects yet. Create them on the Projects page, then group them here.</div>
            ) : projects.map(p => (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer', padding: '3px 0' }}>
                <input type="checkbox" checked={newPicked.has(p.id)} onChange={() => setNewPicked(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} style={{ accentColor: 'var(--orange)' }} />
                <span style={{ flex: 1 }}>{p.name}{p.deal_id ? ' (in another deal)' : ''}</span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>{p.billing_type !== 'monthly' && p.value ? fmtMoney(p.value) : ''}{p.recurring_amount ? ` ${fmtMoney(p.recurring_amount)}/mo` : ''}</span>
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={createNew} disabled={!newName.trim()} style={{ padding: '8px 14px' }}>Create deal</button>
            <button className="btn-ghost" onClick={() => { setCreating(false); setNewName(''); setNewPicked(new Set()); }}>Cancel</button>
          </div>
        </div>
      )}

      {deals.length === 0 && !creating && <div style={{ color: 'var(--muted)', fontSize: 13 }}>No deals yet. Create one to bundle this client's projects into a single agreement + invoice.</div>}
      {deals.map(d => <DealCard key={d.id} deal={d} clientProjects={projects} onChanged={load} />)}
    </div>
  );
}

function ProjectsTab({ client }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  // The delivery board lives on the project detail screen, so this tab hands
  // off to it rather than being a dead end that tells you to go and find it.
  const openBoard = (p) => navigate(`/projects?open=${p.id}`);

  // Projects are created here now, already attached to this client, rather than
  // on a separate page that has to be told which client it belongs to.
  const createForClient = async () => {
    const name = window.prompt(`Name this project for ${client.business_name}`);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const p = await createProject({
        name: trimmed, client_id: client.id, client: client.business_name,
        project_kind: 'build', status: 'Onboarding', billing_type: 'one_time',
        value: 0, recurring_amount: 0,
      });
      openBoard(p);
    } catch (e) { toast('error', e.message); setCreating(false); }
  };

  const load = async () => {
    try {
      const all = await getProjects();
      setRows(all.filter(p => p.client_id === client.id || (!p.client_id && p.client === client.business_name)));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [client.id]);

  const setStatus = async (p, status) => {
    setRows(rs => rs.map(r => r.id === p.id ? { ...r, status } : r));
    try { await updateProject(p.id, { status }); } catch (e) { toast('error', e.message); }
  };

  if (loading) return <div style={{ color: 'var(--muted)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          No projects for {client.business_name} yet.
        </div>
      )}
      <button className="btn-primary" onClick={createForClient} disabled={creating}
              style={{ alignSelf: 'flex-start', padding: '8px 14px' }}>
        <Plus size={14} /> {creating ? 'Creating...' : 'New project'}
      </button>
      {rows.map(p => {
        return (
          <div key={p.id} onClick={() => openBoard(p)} title="Open the delivery board"
               style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Briefcase size={15} style={{ color: 'var(--orange)' }} />
              <span style={{ fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 120 }}>{p.name}</span>
              {projectStartDate(p) && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Started {projectStartDate(p)}</span>}
              {p.value ? <span style={{ fontSize: 12.5, fontWeight: 800, color: '#22c55e' }}>{fmtUsd(p.value)}{p.billing_type === 'monthly' ? '/mo' : ''}</span> : null}
              {/* The card navigates, so the controls inside it must not. */}
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <StatusBadge status={projectPaymentBadge(p)} />
                <StatusBadge status={p.status || 'Onboarding'} options={PROJECT_LIFECYCLE} onChange={s => setStatus(p, s)} />
              </div>
            </div>
            {p.scope && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>{p.scope}</div>}
          </div>
        );
      })}
    </div>
  );
}
