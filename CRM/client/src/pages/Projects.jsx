import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2, ArrowLeft, DollarSign, Calendar, FolderOpen, ExternalLink, Receipt, Loader, Check, Clock } from 'lucide-react';
import { getProjects, createProject, updateProject, deleteProject, getClients } from '../api';
import Modal from '../components/Modal';
import ProjectBoard from '../components/ProjectBoard';
import StatusBadge from '../components/StatusBadge';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';
import { usePageActions } from '../context/UiContext';
import { toast } from '../components/Toast';
import ProgressReport from '../components/ProgressReport';
import WorkLog from '../components/WorkLog';
import WorkspacePicker from '../components/WorkspacePicker';
import { MoneyCell, PersonCell, DateCell, ProgressCell, TextCell, EmptyStub, RowActions } from '../components/cells';
import EmptyState from '../components/EmptyState';
import SkeletonRow from '../components/SkeletonRow';

// Project lifecycle: a project runs Onboarding -> Awaiting Access -> In Progress
// -> Live -> Completed (Paused for on-hold work). This is per-PROJECT, not per
// client, so one client can have several projects at different stages.
// Builds are one-time deliverables with a start and an end. Retainers are
// ongoing monthly services (maintenance, hosting, marketing) that never
// "complete" — they just run until paused/cancelled.
const BUILD_STATUSES = ['Onboarding', 'Awaiting Access', 'In Progress', 'Live', 'Completed', 'Paused'];
const RETAINER_STATUSES = ['Active', 'Paused', 'Cancelled'];
const PROJECT_STATUSES = BUILD_STATUSES; // legacy alias
const projectKind = (p) => p?.project_kind || (p?.billing_type === 'monthly' ? 'retainer' : 'build');
const statusesFor = (p) => projectKind(p) === 'retainer' ? RETAINER_STATUSES : BUILD_STATUSES;
const ITEM_STATUSES  = ['Not Started', 'Working on it', 'Done', 'Stuck', 'On Hold'];

// "Days until due" for the timeline column — clearer at a glance than a date
// range. Retainers are Ongoing; finished builds read Done; overdue is flagged.
function dueInfo(project) {
  if (projectKind(project) === 'retainer') return { label: 'Ongoing', color: 'var(--muted)' };
  if (['Completed', 'Cancelled', 'Live'].includes(project.status)) return { label: 'Done', color: '#22c55e' };
  const end = project.end_date || project.start_date;
  if (!end) return { label: 'No due date', color: 'var(--muted)' };
  const d = new Date(`${end}T00:00:00`);
  if (isNaN(d.getTime())) return { label: 'No due date', color: 'var(--muted)' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  if (days > 1)  return { label: `${days} days left`, color: days <= 7 ? '#f59e0b' : 'var(--text)' };
  if (days === 1) return { label: 'Due tomorrow', color: '#f59e0b' };
  if (days === 0) return { label: 'Due today', color: '#f59e0b' };
  return { label: `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`, color: '#ef4444' };
}

// Completed projects sink to the bottom of the single list; everything else
// keeps its natural (most-recent-first) order.
const COMPLETED_STATUSES = ['Completed'];

// Payment badge derived from what's actually been paid vs the project value.
export function paymentBadge(project) {
  const value = Number(project?.value) || 0;
  const paid = Number(project?.amount_paid) || 0;
  if (value > 0 && paid >= value) return 'Paid in full';
  if (paid > 0) return 'Deposit paid';
  return 'Unpaid';
}

// How the project is billed. 'monthly' projects have no fixed end — they show
// an "Ongoing" pill instead of a progress bar. 'hybrid' covers an upfront fee
// plus a recurring maintenance charge (e.g. $5,000 build + $299/mo upkeep).
const BILLING_TYPES = [
  { key: 'one_time', label: 'One-time' },
  { key: 'monthly',  label: 'Monthly (recurring)' },
  { key: 'hybrid',   label: 'One-time + recurring' },
];


// The project's `client` text column is denormalized and drifts. Resolve the
// real client from client_id whenever we have the list loaded.

// Projects read top-to-bottom by where they are in the lifecycle, not by how
// they bill. Anything unrecognised sorts just before Completed.
const STATUS_ORDER = ['Onboarding', 'Awaiting Access', 'In Progress', 'Live', 'Paused', 'Completed', 'Cancelled'];

// The board groups by where a project sits in its life, not by how it bills.
// A retainer and a build that are both underway belong in the same bucket.
const PHASES = ['Onboarding', 'In Progress', 'Completed'];
const phaseOf = (p) => {
  const st = String(p?.status || '').toLowerCase();
  if (st === 'onboarding' || st === 'awaiting access') return 'Onboarding';
  if (st === 'completed' || st === 'cancelled') return 'Completed';
  return 'In Progress';
};
const phaseRank = (p) => {
  const i = PHASES.indexOf(phaseOf(p));
  return i === -1 ? PHASES.indexOf('In Progress') : i;
};
const statusRank = (st) => {
  const i = STATUS_ORDER.findIndex(x => x.toLowerCase() === String(st || '').toLowerCase());
  return i === -1 ? STATUS_ORDER.indexOf('Paused') : i;
};

const clientNameOf = (project, clients = []) => {
  if (project?.client_id) {
    const hit = clients.find(c => c.id === project.client_id);
    if (hit?.business_name) return hit.business_name;
  }
  return project?.client || '';
};

const EMPTY_PROJECT = { name: '', client: '', client_id: null, project_kind: 'build', status: 'Onboarding', billing_type: 'one_time', value: '', recurring_amount: '', start_date: '', end_date: '', notes: '' };
const EMPTY_ITEM    = { name: '', owner: '', status: 'Not Started', date: '', text: '', link: '' };

// ── Subitem row (used inside the project detail page) ─────────────────────────
function SubitemRow({ item, onFieldSave, onDelete }) {
  return (
    <tr>
      <td style={{ paddingLeft: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 3, height: 20, background: 'var(--surface-3)', borderRadius: 2, flexShrink: 0 }} />
          <InlineEdit value={item.name} onSave={v => onFieldSave(item.id, 'name', v)} placeholder="Subitem name" />
        </div>
      </td>
      <td>
        <InlineEdit value={item.owner} onSave={v => onFieldSave(item.id, 'owner', v)} placeholder="Owner" />
      </td>
      <td>
        <StatusBadge status={item.status} options={ITEM_STATUSES} onChange={s => onFieldSave(item.id, 'status', s)} />
      </td>
      <td style={{ minWidth: 120 }}>
        <InlineEdit value={item.date} type="date" onSave={v => onFieldSave(item.id, 'date', v)} placeholder="Date" />
      </td>
      <td style={{ minWidth: 200 }}>
        <InlineEdit value={item.text} onSave={v => onFieldSave(item.id, 'text', v)} placeholder="Notes / text" />
      </td>
      <td style={{ minWidth: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {item.link && (
            <a href={item.link.startsWith('http') ? item.link : `https://${item.link}`}
               target="_blank" rel="noreferrer" title="Open link"
               style={{ display: 'flex', flexShrink: 0 }}>
              <ExternalLink size={12} style={{ color: 'var(--orange)' }} />
            </a>
          )}
          <InlineEdit value={item.link} onSave={v => onFieldSave(item.id, 'link', v)} placeholder="https://..." />
        </div>
      </td>
      <td>
        <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => onDelete(item.id)} title="Delete">
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
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

// ── Project detail page ────────────────────────────────────────────────────────
function ProjectDetail({ project, clients = [], onBack, onPatch, onDelete }) {
  const [items, setItems] = useState([]);

  const saveField = async (field, value) => {
    const parsed = (field === 'value' || field === 'recurring_amount') ? (parseFloat(value) || 0) : value;
    onPatch({ [field]: parsed });
    try { await updateProject(project.id, { [field]: parsed }); }
    catch (e) { toast('error', e.message); }
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '7px 9px', flexShrink: 0 }}><ArrowLeft size={16} /></button>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FolderOpen size={20} style={{ color: 'var(--muted)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>
            <InlineEdit value={project.name} onSave={v => saveField('name', v)} placeholder="Project name" />
          </div>
          {clientNameOf(project, clients) && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{clientNameOf(project, clients)}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <StatusBadge status={paymentBadge(project)} />
          <StatusBadge status={project.status} options={statusesFor(project)} onChange={s => saveField('status', s)} />
          <button className="btn-ghost" style={{ padding: '7px 9px', color: '#ff5c5c' }} onClick={onDelete} title="Delete project"><Trash2 size={15} /></button>
        </div>
      </div>

      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <ProjectBoard project={project} />

          <Card title="Notes">
            <textarea className="form-input" rows={6} defaultValue={project.notes || ''} onBlur={e => saveField('notes', e.target.value)} placeholder="Project notes…" style={{ resize: 'vertical', width: '100%' }} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Project details">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client</span>
                <select
                  className="form-input"
                  value={project.client_id || ''}
                  onChange={e => {
                    const c = clients.find(x => x.id === e.target.value);
                    onPatch({ client_id: e.target.value || null, client: c ? c.business_name : '' });
                    updateProject(project.id, { client_id: e.target.value || null, client: c ? c.business_name : (project.client || '') }).catch(err => toast('error', err.message));
                  }}
                >
                  <option value="">— No client linked —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Billing</span>
                <select className="form-input" value={project.billing_type || 'one_time'} onChange={e => saveField('billing_type', e.target.value)}>
                  {BILLING_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select>
              </div>
              {project.billing_type !== 'monthly' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {project.billing_type === 'hybrid' ? 'Upfront Value' : 'Value'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <DollarSign size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                    <InlineEdit value={String(project.value || '')} type="number" onSave={v => saveField('value', v)} placeholder="0" />
                  </div>
                </div>
              )}
              {project.billing_type !== 'one_time' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recurring Amount</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <DollarSign size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                    <InlineEdit value={String(project.recurring_amount || '')} type="number" onSave={v => saveField('recurring_amount', v)} placeholder="0" />
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>/mo</span>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Start Date</span>
                <InlineEdit value={project.start_date} type="date" onSave={v => saveField('start_date', v)} placeholder="—" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>End Date</span>
                <InlineEdit value={project.end_date} type="date" onSave={v => saveField('end_date', v)} placeholder="—" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Claude Workspace</span>
                <WorkspacePicker
                  value={project.claude_workspace}
                  onChange={v => saveField('claude_workspace', v)}
                />
              </div>
            </div>
          </Card>

          {/* Period report. A project's own paperwork, next to its facts. */}
          <Card title="Progress report">
            <ProgressReport project={project} />
          </Card>

          <Card title="Work log">
            <WorkLog project={project} />
          </Card>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Projects() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects]     = useState([]);
  const [search, setSearch]         = useState(() => searchParams.get('search') || '');
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState(EMPTY_PROJECT);
  const [selected, setSelected]     = useState(null); // project being viewed (detail page)
  const [deleteTarget, setDeleteTarget] = useState(null); // project pending delete confirmation
  const [loading, setLoading]       = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [clients, setClients]       = useState([]); // for linking a project to a real client

  // Deep link: /projects?open=<id> opens that project's detail and board, so
  // the Projects tab on a client can hand off straight to it.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || !projects.length) return;
    if (selected?.id === openId) return;
    const found = projects.find(p => p.id === openId);
    if (found) setSelected(found);
  }, [searchParams, projects, selected]);

  const load = async () => {
    try { setProjects((await getProjects()).filter(p => !p.archived)); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { getClients().then(setClients).catch(() => {}); }, []);

  const filtered = useMemo(() =>
    projects.filter(p => !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      clientNameOf(p, clients).toLowerCase().includes(search.toLowerCase()))
      .slice()
      .sort((a, b) => {
        const ph = phaseRank(a) - phaseRank(b);
        if (ph !== 0) return ph;
        const d = statusRank(a.status) - statusRank(b.status);
        if (d !== 0) return d;
        // Within a stage, biggest commitment first.
        const worth = (p) => (Number(p.recurring_amount) || 0) * 12 + (Number(p.value) || 0);
        const w = worth(b) - worth(a);
        return w !== 0 ? w : (clientNameOf(a, clients) || a.name || '').localeCompare(clientNameOf(b, clients) || b.name || '');
      }),
    [projects, search, clients]
  );

  // One flat list. Completed/cancelled projects sink to the bottom; the sort is
  // stable so everything else keeps its existing order.
  // `filtered` already orders by lifecycle phase, then status, then worth.
  // Re-sorting here would undo that, so this just passes the order through.
  const sorted = filtered;

  // Selection helpers
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const selectedItems = projects.filter(p => selectedIds.has(p.id));

  // ── Inline project field save ──
  const handleProjectField = async (id, field, value) => {
    try {
      const parsed = (field === 'value' || field === 'recurring_amount') ? (parseFloat(value) || 0) : value;
      await updateProject(id, { [field]: parsed });
      setProjects(ps => ps.map(p => p.id === id ? { ...p, [field]: parsed } : p));
    } catch (e) { console.error(e); }
  };

  const handleStatusChange = async (project, status) => {
    try {
      await updateProject(project.id, { status });
      setProjects(ps => ps.map(p => p.id === project.id ? { ...p, status } : p));
      // When a build with a recurring upkeep fee goes Live/Completed, spin up the
      // paired ongoing Retainer automatically (so MRR is tracked from day one).
      const rec = Number(project.recurring_amount) || 0;
      if (projectKind(project) === 'build' && rec > 0 && (status === 'Live' || status === 'Completed')) {
        const exists = projects.some(p => projectKind(p) === 'retainer'
          && (p.client_id ? p.client_id === project.client_id : p.client === project.client)
          && (p.name || '').startsWith(project.name));
        if (!exists) {
          await createProject({
            name: `${project.name} — Maintenance`,
            client: project.client || '', client_id: project.client_id || null,
            project_kind: 'retainer', billing_type: 'monthly',
            status: 'Active', value: 0, recurring_amount: rec,
            notes: `Auto-created from the "${project.name}" build.`,
          });
          toast('success', `Started a $${rec.toLocaleString()}/mo retainer for ${project.client || project.name}.`);
          await load();
        }
      }
    } catch (e) { toast('error', e.message); }
  };

  // ── Project CRUD modals ──
  const openAdd    = () => { setForm(EMPTY_PROJECT); setModal('add'); };
  const openDelete = (p) => setDeleteTarget(p);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      await createProject({ ...form, value: parseFloat(form.value) || 0, recurring_amount: parseFloat(form.recurring_amount) || 0 });
      await load(); setModal(null);
    } catch (e) { toast('error', e.message); }
  };
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProject(deleteTarget.id);
      if (selected?.id === deleteTarget.id) setSelected(null);
      setDeleteTarget(null);
      await load();
    } catch (e) { toast('error', e.message); }
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} project(s)? This cannot be undone.`)) return;
    try {
      await Promise.all([...selectedIds].map(id => deleteProject(id)));
      setProjects(ps => ps.filter(p => !selectedIds.has(p.id)));
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const handleBulkArchive = async () => {
    try {
      await Promise.all([...selectedIds].map(id => updateProject(id, { archived: true })));
      setProjects(ps => ps.filter(p => !selectedIds.has(p.id)));
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const handleBulkDuplicate = async () => {
    try {
      const items = projects.filter(p => selectedIds.has(p.id));
      await Promise.all(items.map(({ id, created_at, updated_at, ...rest }) =>
        createProject({ ...rest, name: `${rest.name} (copy)`, value: rest.value || 0 })
      ));
      await load();
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const handleBulkMoveTo = async (status) => {
    try {
      await Promise.all([...selectedIds].map(id => updateProject(id, { status })));
      setProjects(ps => ps.map(p => selectedIds.has(p.id) ? { ...p, status } : p));
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const formatDate  = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const formatMoney = (v) => `$${Number(v || 0).toLocaleString()}`;
  const isOngoing   = (p) => p.billing_type === 'monthly';

  // ── Payment tracking ─────────────────────────────────────────────────────
  // Which project's "mark paid" popover is currently open (keyed by project id).
  const [payingId, setPayingId] = useState(null);
  const [payDraft, setPayDraft] = useState({ amount: '', note: '' });
  const openMarkPaid = (project) => {
    // Pre-fill the popover with the outstanding balance so "Mark paid in full"
    // is one click. For monthly projects we suggest the recurring amount.
    const total = Number(project.value || 0) + (project.billing_type !== 'one_time' ? Number(project.recurring_amount || 0) : 0);
    const outstanding = Math.max(0, total - Number(project.amount_paid || 0));
    const suggest = outstanding > 0 ? outstanding : (Number(project.recurring_amount) || Number(project.value) || 0);
    setPayDraft({ amount: suggest ? String(suggest) : '', note: project.payment_note || '' });
    setPayingId(project.id);
  };
  const markPaid = async (project, { addTotal = false } = {}) => {
    const parsed = Math.max(0, parseFloat(payDraft.amount) || 0);
    if (!addTotal && !parsed) { toast('error', 'Enter an amount'); return; }
    const nextPaid = Number(project.amount_paid || 0) + parsed;
    const patch = {
      amount_paid: nextPaid,
      paid_at: new Date().toISOString(),
      payment_note: payDraft.note || null,
    };
    try {
      await updateProject(project.id, patch);
      setProjects(ps => ps.map(p => p.id === project.id ? { ...p, ...patch } : p));
      setPayingId(null);
      toast('success', `Recorded $${parsed.toLocaleString()} paid on ${project.name}`);
    } catch (e) { toast('error', e.message); }
  };
  const clearPaid = async (project) => {
    if (!window.confirm(`Reset paid balance on "${project.name}" to $0?`)) return;
    const patch = { amount_paid: 0, paid_at: null, payment_note: null };
    try {
      await updateProject(project.id, patch);
      setProjects(ps => ps.map(p => p.id === project.id ? { ...p, ...patch } : p));
      setPayingId(null);
    } catch (e) { toast('error', e.message); }
  };

  const progressPercent = (p) => {
    if (p.status === 'Completed') return 100;
    if (['Cancelled', 'On Hold'].includes(p.status)) return 0;
    if (!p.start_date || !p.end_date) return 30;
    const start = new Date(p.start_date), end = new Date(p.end_date), now = new Date();
    if (now >= end) return 95;
    if (now <= start) return 5;
    return Math.round(((now - start) / (end - start)) * 100);
  };

  usePageActions(() => selected ? null : (
    <button className="btn-primary" onClick={openAdd}><Plus size={15} /> New Project</button>
  ), [openAdd, selected]);

  const deleteModal = deleteTarget && (
    <Modal title="Delete Project" onClose={() => setDeleteTarget(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
      <p style={{ color: 'var(--muted)' }}>Delete <strong style={{ color: 'var(--text)' }}>{deleteTarget.name}</strong> and all its subitems? This cannot be undone.</p>
    </Modal>
  );

  // Every hook has to run on every render, so this roll-up lives ABOVE the
  // `if (selected)` early return below. Moving it back under that return makes
  // React render fewer hooks when a project is open, which throws error #300
  // and blanks the page.
  // ── Page-level roll-ups for the hero summary strip ─────────────────────
  const totals = useMemo(() => {
    const oneTime = projects.reduce((s, p) => s + (Number(p.value) || 0), 0);
    const mrr     = projects.reduce((s, p) => s + (Number(p.recurring_amount) || 0), 0);
    const paid    = projects.reduce((s, p) => s + (Number(p.amount_paid) || 0), 0);
    const total   = oneTime + mrr;
    const outstanding = Math.max(0, total - paid);
    const active  = projects.filter(p => !p.archived && !['Cancelled', 'Completed'].includes(p.status)).length;
    return { oneTime, mrr, paid, outstanding, active, total };
  }, [projects]);

  if (selected) {
    return (
      <>
        <ProjectDetail
          project={selected}
          clients={clients}
          onBack={() => {
            setSelected(null);
            // Drop ?open=<id> too. Leaving it in the URL makes the deep-link
            // effect re-select the same project the moment we clear it, which
            // reads as the back button doing nothing.
            if (searchParams.get('open')) {
              const next = new URLSearchParams(searchParams);
              next.delete('open');
              setSearchParams(next, { replace: true });
            }
            load();
          }}
          onPatch={(patch) => setSelected(s => ({ ...s, ...patch }))}
          onDelete={() => setDeleteTarget(selected)}
        />
        {deleteModal}
      </>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* ─── Hero: greeting + stats + toolbar ───────────────────────── */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {/* Row 1 — title + primary CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px 28px 12px' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(37,99,235,0.14), rgba(37,99,235,0.02))',
            border: '1px solid rgba(37,99,235,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--orange)',
          }}>
            <FolderOpen size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>Pipeline</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
              {totals.active} active · {projects.length} total
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={openAdd}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', fontWeight: 700, letterSpacing: '-0.01em' }}>
            <Plus size={14} /> New project
          </button>
        </div>


        {/* Row 3 — search + filter chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 28px 14px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
            <Search size={13} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
            <input className="search-input" placeholder="Search projects, clients, notes…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }} />
          </div>
        </div>
      </div>

      {/* ── Mobile card view ── */}
      <div className="mobile-cards">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No projects yet.</div>
        ) : sorted.map(project => {
          const pct = progressPercent(project);
          return (
            <div key={project.id} className="mobile-card" onClick={() => setSelected(project)}>
              <div className="mobile-card-row primary">
                <span className="private-value">{project.name || '—'}</span>
              </div>
              {clientNameOf(project, clients) && (
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Client</span>
                  <span className="private-value">{clientNameOf(project, clients)}</span>
                </div>
              )}
              <div className="mobile-card-row">
                <span className="mobile-card-label">Status</span>
                <StatusBadge status={project.status} options={statusesFor(project)} onChange={s => handleStatusChange(project, s)} />
              </div>
              <div className="mobile-card-row">
                <span className="mobile-card-label">Due</span>
                <Clock size={11} style={{ color: 'var(--muted)' }} />
                {(() => { const di = dueInfo(project); return <span style={{ color: di.color, fontWeight: 600 }}>{di.label}</span>; })()}
              </div>
              {(project.value > 0 || project.recurring_amount > 0) && (
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Value</span>
                  <DollarSign size={12} style={{ color: 'var(--orange)' }} />
                  <span className="private-value" style={{ fontWeight: 600 }}>
                    {project.value > 0 ? Number(project.value).toLocaleString() : null}
                    {project.recurring_amount > 0 ? `${project.value > 0 ? ' + ' : ''}$${Number(project.recurring_amount).toLocaleString()}/mo` : ''}
                  </span>
                </div>
              )}
              {isOngoing(project) ? (
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Progress</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: '#22c55e18', border: '1px solid #22c55e40', borderRadius: 999, padding: '2px 10px' }}>Ongoing</span>
                </div>
              ) : pct > 0 && (
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Progress</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--orange)', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{pct}%</span>
                </div>
              )}
              {project.notes && (
                <div className="mobile-card-row" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {project.notes.length > 60 ? project.notes.slice(0, 60) + '…' : project.notes}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Desktop table view ── */}
      <div className="table-container desktop-table projects-premium">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ minWidth: 220 }}>Project</th>
              <th style={{ minWidth: 120 }}>Client</th>
              <th style={{ minWidth: 145 }}>Status</th>
              <th style={{ minWidth: 120 }}>Due</th>
              <th style={{ minWidth: 120 }}>Value</th>
              <th style={{ minWidth: 160 }}>Progress</th>
              <th style={{ minWidth: 150 }}>Notes</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={9} />)
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 0 }}>
                  <EmptyState
                    icon={FolderOpen}
                    title="No projects yet"
                    description="Projects show up here once you invoice a signed deal or create one by hand. Track scope, timeline, revenue, and payment status in one place."
                    cta={<button className="btn-primary" onClick={openAdd}><Plus size={13} /> New project</button>}
                  />
                </td>
              </tr>
            ) : (
              <>
                {(() => { let lastPhase = null; return sorted.map(project => {
                  const pct = progressPercent(project);
                  const phase = phaseOf(project);
                  const showHeader = phase !== lastPhase; lastPhase = phase;
                  const grp = sorted.filter(p => phaseOf(p) === phase);
                  // A phase mixes builds and retainers, so show whichever
                  // money each group actually holds.
                  const grpOnce = grp.reduce((s, p) => s + (Number(p.value) || 0), 0);
                  const grpMo   = grp.reduce((s, p) => s + (Number(p.recurring_amount) || 0), 0);
                  const grpAmt = [
                    grpOnce > 0 ? `$${grpOnce.toLocaleString()} one-time` : null,
                    grpMo   > 0 ? `$${grpMo.toLocaleString()}/mo` : null,
                  ].filter(Boolean).join(' \u00b7 ') || '$0';

                  return (
                    <React.Fragment key={project.id}>
                    {showHeader && (
                      <tr>
                        <td colSpan={9} style={{ padding: '16px 12px 6px' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{phase}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 10 }}>{grp.length} · {grpAmt}</span>
                        </td>
                      </tr>
                    )}
                    <tr
                      className="hover-reveal"
                      onClick={() => setSelected(project)}
                      style={{ cursor: 'pointer', background: selectedIds.has(project.id) ? 'rgba(37,99,235,0.08)' : undefined }}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(project.id)}
                          onChange={() => toggleSelect(project.id)}
                        />
                      </td>
                      <td>
                        <TextCell value={project.name} weight={700} size={13.5} />
                      </td>
                      <td><PersonCell name={clientNameOf(project, clients)} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <StatusBadge status={project.status} options={statusesFor(project)} onChange={s => handleStatusChange(project, s)} />
                      </td>
                      <td>{(() => { const di = dueInfo(project); return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: di.color }}>
                          <Clock size={12} style={{ opacity: 0.7, flexShrink: 0 }} /> {di.label}
                        </span>
                      ); })()}</td>
                      <td onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                        <MoneyCell
                          value={project.billing_type !== 'monthly' ? project.value : 0}
                          recurring={project.billing_type !== 'one_time' ? project.recurring_amount : 0}
                          paid={project.amount_paid}
                          onMarkPaid={() => openMarkPaid(project)}
                        />

                        {/* Mark-paid popover */}
                        {payingId === project.id && (
                          <div style={{ position: 'absolute', top: '100%', left: 8, zIndex: 20, marginTop: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, minWidth: 240, boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Amount received</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                              <DollarSign size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                              <input autoFocus type="number" min="0" step="0.01" value={payDraft.amount}
                                onChange={e => setPayDraft(d => ({ ...d, amount: e.target.value }))}
                                style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 13, minWidth: 0 }} />
                            </div>
                            <input placeholder="Note (optional)" value={payDraft.note}
                              onChange={e => setPayDraft(d => ({ ...d, note: e.target.value }))}
                              style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', color: 'var(--text)', fontSize: 12, marginBottom: 10 }} />
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', alignItems: 'center' }}>
                              {Number(project.amount_paid || 0) > 0 ? (
                                <button onClick={() => clearPaid(project)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, cursor: 'pointer', padding: 0, fontWeight: 600 }}>Reset</button>
                              ) : <span />}
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => setPayingId(null)} className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>Cancel</button>
                                <button onClick={() => markPaid(project)} className="btn-primary" style={{ padding: '4px 12px', fontSize: 11, background: '#16a34a', borderColor: '#16a34a' }}>Record</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                      <td>
                        <ProgressCell value={pct} total={100} ongoing={isOngoing(project)} />
                      </td>
                      <td>
                        {project.notes ? (
                          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{project.notes.length > 50 ? project.notes.slice(0, 50) + '…' : project.notes}</span>
                        ) : <EmptyStub />}
                      </td>
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                        <RowActions>
                          <button
                            onClick={() => openDelete(project)}
                            title="Delete"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: '#2563eb', padding: 6, display: 'inline-flex' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                            <Trash2 size={13} />
                          </button>
                        </RowActions>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                }); })()}

              </>
            )}
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
        moveToOptions={PROJECT_STATUSES.map(s => ({ label: s, value: s }))}
        onMoveTo={handleBulkMoveTo}
      />

      {/* New Project Modal */}
      {modal === 'add' && (
        <Modal title="New Project" onClose={() => setModal(null)} onSubmit={handleSave} submitLabel="Add Project">
          <div className="form-group">
            <label className="form-label">Project Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Project name" required />
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Client</label>
              <select className="form-select" value={form.client_id || ''}
                onChange={e => { const c = clients.find(x => x.id === e.target.value); setForm(f => ({ ...f, client_id: e.target.value || null, client: c ? c.business_name : '' })); }}>
                <option value="">— No client —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {(form.project_kind === 'retainer' ? RETAINER_STATUSES : BUILD_STATUSES).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.project_kind} onChange={e => {
                const k = e.target.value;
                setForm(f => k === 'retainer'
                  ? { ...f, project_kind: 'retainer', billing_type: 'monthly', status: RETAINER_STATUSES.includes(f.status) ? f.status : 'Active' }
                  : { ...f, project_kind: 'build', billing_type: f.billing_type === 'monthly' ? 'one_time' : f.billing_type, status: BUILD_STATUSES.includes(f.status) ? f.status : 'Onboarding' });
              }}>
                <option value="build">Build (one-time)</option>
                <option value="retainer">Retainer (ongoing / monthly)</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Billing</label>
              <select className="form-select" value={form.billing_type} onChange={e => setForm(f => ({ ...f, billing_type: e.target.value }))}>
                {BILLING_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: form.billing_type === 'one_time' ? '1fr' : '1fr 1fr', gap: 12 }}>
            {form.billing_type !== 'monthly' && (
              <div className="form-group">
                <label className="form-label">{form.billing_type === 'hybrid' ? 'Upfront Value ($)' : 'Project Value ($)'}</label>
                <input className="form-input" type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
              </div>
            )}
            {form.billing_type !== 'one_time' && (
              <div className="form-group">
                <label className="form-label">Recurring Amount ($/mo)</label>
                <input className="form-input" type="number" min="0" value={form.recurring_amount} onChange={e => setForm(f => ({ ...f, recurring_amount: e.target.value }))} placeholder="0" />
              </div>
            )}
          </div>
          <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input className="form-input" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">End Date</label>
              <input className="form-input" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Project notes..." style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}

      {deleteModal}
    </div>
  );
}
