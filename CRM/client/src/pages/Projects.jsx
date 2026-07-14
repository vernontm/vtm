import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2, ArrowLeft, DollarSign, Calendar, FolderOpen, ExternalLink } from 'lucide-react';
import { getProjects, createProject, updateProject, deleteProject, getProjectItems, createProjectItem, updateProjectItem, deleteProjectItem } from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';
import { usePageActions } from '../context/UiContext';
import { toast } from '../components/Toast';

const PROJECT_STATUSES = ['Active', 'In Progress', 'Working on it', 'Not Started', 'Completed', 'On Hold', 'Cancelled', 'Stuck'];
const ITEM_STATUSES  = ['Not Started', 'Working on it', 'Done', 'Stuck', 'On Hold'];

// Completed projects sink to the bottom of the single list; everything else
// keeps its natural (most-recent-first) order.
const COMPLETED_STATUSES = ['Completed', 'Cancelled'];

// How the project is billed. 'monthly' projects have no fixed end — they show
// an "Ongoing" pill instead of a progress bar. 'hybrid' covers an upfront fee
// plus a recurring maintenance charge (e.g. $5,000 build + $299/mo upkeep).
const BILLING_TYPES = [
  { key: 'one_time', label: 'One-time' },
  { key: 'monthly',  label: 'Monthly (recurring)' },
  { key: 'hybrid',   label: 'One-time + recurring' },
];

const EMPTY_PROJECT = { name: '', client: '', status: 'Active', billing_type: 'one_time', value: '', recurring_amount: '', start_date: '', end_date: '', notes: '' };
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
function ProjectDetail({ project, onBack, onPatch, onDelete }) {
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setItemsLoading(true);
    getProjectItems(project.id)
      .then(rows => { if (!cancelled) setItems(rows); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setItemsLoading(false); });
    return () => { cancelled = true; };
  }, [project.id]);

  const saveField = async (field, value) => {
    const parsed = (field === 'value' || field === 'recurring_amount') ? (parseFloat(value) || 0) : value;
    onPatch({ [field]: parsed });
    try { await updateProject(project.id, { [field]: parsed }); }
    catch (e) { toast('error', e.message); }
  };

  const addSubitem = async () => {
    try {
      const item = await createProjectItem({ project_id: project.id, ...EMPTY_ITEM });
      setItems(its => [...its, item]);
    } catch (e) { toast('error', e.message); }
  };
  const handleItemField = async (itemId, field, value) => {
    setItems(its => its.map(it => it.id === itemId ? { ...it, [field]: value } : it));
    try { await updateProjectItem(itemId, { [field]: value }); }
    catch (e) { toast('error', e.message); }
  };
  const deleteSubitem = async (itemId) => {
    setItems(its => its.filter(it => it.id !== itemId));
    try { await deleteProjectItem(itemId); }
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
          {project.client && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{project.client}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <StatusBadge status={project.status} options={PROJECT_STATUSES} onChange={s => saveField('status', s)} />
          <button className="btn-ghost" style={{ padding: '7px 9px', color: '#ff5c5c' }} onClick={onDelete} title="Delete project"><Trash2 size={15} /></button>
        </div>
      </div>

      <div style={{ padding: 28, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <Card title="Subitems">
            {itemsLoading ? (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 16 }}>Subitem</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Text</th>
                      <th>Link</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <SubitemRow key={item.id} item={item} onFieldSave={handleItemField} onDelete={deleteSubitem} />
                    ))}
                    <tr>
                      <td colSpan={7} style={{ padding: 0 }}>
                        <div className="add-row" onClick={addSubitem}><Plus size={13} /> Add subitem</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Notes">
            <textarea className="form-input" rows={6} defaultValue={project.notes || ''} onBlur={e => saveField('notes', e.target.value)} placeholder="Project notes…" style={{ resize: 'vertical', width: '100%' }} />
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Project details">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Client</span>
                <InlineEdit value={project.client} onSave={v => saveField('client', v)} placeholder="Client" />
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
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Projects() {
  const [searchParams] = useSearchParams();
  const [projects, setProjects]     = useState([]);
  const [search, setSearch]         = useState(() => searchParams.get('search') || '');
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState(EMPTY_PROJECT);
  const [selected, setSelected]     = useState(null); // project being viewed (detail page)
  const [deleteTarget, setDeleteTarget] = useState(null); // project pending delete confirmation
  const [loading, setLoading]       = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const load = async () => {
    try { setProjects((await getProjects()).filter(p => !p.archived)); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    projects.filter(p => !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.client || '').toLowerCase().includes(search.toLowerCase())),
    [projects, search]
  );

  // One flat list. Completed/cancelled projects sink to the bottom; the sort is
  // stable so everything else keeps its existing order.
  const sorted = useMemo(() => {
    const rank = (p) => (COMPLETED_STATUSES.includes(p.status) ? 1 : 0);
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [filtered]);

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

  if (selected) {
    return (
      <>
        <ProjectDetail
          project={selected}
          onBack={() => { setSelected(null); load(); }}
          onPatch={(patch) => setSelected(s => ({ ...s, ...patch }))}
          onDelete={() => setDeleteTarget(selected)}
        />
        {deleteModal}
      </>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
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
              {project.client && (
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Client</span>
                  <span className="private-value">{project.client}</span>
                </div>
              )}
              <div className="mobile-card-row">
                <span className="mobile-card-label">Status</span>
                <StatusBadge status={project.status} options={PROJECT_STATUSES} onChange={s => handleStatusChange(project, s)} />
              </div>
              {(project.start_date || project.end_date) && (
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Timeline</span>
                  <Calendar size={11} style={{ color: 'var(--muted)' }} />
                  <span>{formatDate(project.start_date)}{project.start_date && project.end_date ? ' → ' : ''}{formatDate(project.end_date)}</span>
                </div>
              )}
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
      <div className="table-container desktop-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ minWidth: 220 }}>Project</th>
              <th style={{ minWidth: 120 }}>Client</th>
              <th style={{ minWidth: 145 }}>Status</th>
              <th style={{ minWidth: 120 }}>Timeline</th>
              <th style={{ minWidth: 120 }}>Value</th>
              <th style={{ minWidth: 160 }}>Progress</th>
              <th style={{ minWidth: 150 }}>Notes</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No projects yet.</td></tr>
            ) : (
              <>
                {sorted.map(project => {
                  const pct = progressPercent(project);

                  return (
                    <tr
                      key={project.id}
                      onClick={() => setSelected(project)}
                      style={{ cursor: 'pointer', background: selectedIds.has(project.id) ? 'rgba(255,155,38,0.08)' : undefined }}
                    >
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(project.id)}
                          onChange={() => toggleSelect(project.id)}
                        />
                      </td>
                      <td>
                        <span className="private-value" style={{ fontWeight: 700, color: 'var(--text)' }}>{project.name || '—'}</span>
                      </td>
                      <td style={{ color: 'var(--muted)' }} className="private-value">{project.client || '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <StatusBadge status={project.status} options={PROJECT_STATUSES} onChange={s => handleStatusChange(project, s)} />
                      </td>
                      <td>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {project.start_date || project.end_date ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Calendar size={11} style={{ color: 'var(--muted)' }} />
                              <span>{formatDate(project.start_date)}{project.start_date && project.end_date ? ' → ' : ''}{formatDate(project.end_date)}</span>
                            </div>
                          ) : <span style={{ color: '#555880' }}>—</span>}
                        </div>
                      </td>
                      <td>
                        <div className="private-value" style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {project.billing_type !== 'monthly' && project.value > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <DollarSign size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                              <span>{Number(project.value).toLocaleString()}</span>
                            </div>
                          )}
                          {project.billing_type !== 'one_time' && project.recurring_amount > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>${Number(project.recurring_amount).toLocaleString()}/mo</div>
                          )}
                          {!project.value && !project.recurring_amount && <span style={{ color: '#555880' }}>—</span>}
                        </div>
                      </td>
                      <td>
                        {isOngoing(project) ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: '#22c55e18', border: '1px solid #22c55e40', borderRadius: 999, padding: '2px 10px' }}>Ongoing</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                              <div style={{
                                height: '100%', borderRadius: 3, width: `${pct}%`,
                                background: pct === 100 ? '#22c55e' : pct > 60 ? 'var(--orange)' : '#ef4444',
                                transition: 'width 0.3s',
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--muted)', width: 28 }}>{pct}%</span>
                          </div>
                        )}
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {project.notes ? (project.notes.length > 50 ? project.notes.slice(0, 50) + '…' : project.notes) : '—'}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => openDelete(project)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Grand total */}
                {sorted.length > 0 && (
                  <tr className="sum-row">
                    <td colSpan={4}></td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>Total</td>
                    <td>
                      <div className="private-value" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <DollarSign size={13} style={{ color: 'var(--orange)' }} />
                          <span>{formatMoney(sorted.reduce((s, p) => s + (p.value || 0), 0))}</span>
                        </div>
                        {sorted.some(p => p.recurring_amount > 0) && (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {formatMoney(sorted.reduce((s, p) => s + (p.recurring_amount || 0), 0))}/mo MRR
                          </div>
                        )}
                      </div>
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                )}

                {/* Add project */}
                <tr>
                  <td colSpan={9} style={{ padding: 0 }}>
                    <div className="add-row" onClick={openAdd}><Plus size={14} /> Add Project</div>
                  </td>
                </tr>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Client</label>
              <input className="form-input" value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))} placeholder="Client name" />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {PROJECT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Billing</label>
            <select className="form-select" value={form.billing_type} onChange={e => setForm(f => ({ ...f, billing_type: e.target.value }))}>
              {BILLING_TYPES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
