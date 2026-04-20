import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2, ChevronDown, ChevronRight, DollarSign, Calendar, FolderOpen, ExternalLink } from 'lucide-react';
import { getProjects, createProject, updateProject, deleteProject, getProjectItems, createProjectItem, updateProjectItem, deleteProjectItem } from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';

const PROJECT_STATUSES = ['Active', 'In Progress', 'Working on it', 'Not Started', 'Completed', 'On Hold', 'Cancelled', 'Stuck'];
const ITEM_STATUSES  = ['Not Started', 'Working on it', 'Done', 'Stuck', 'On Hold'];
const STATUS_GROUPS  = [
  { label: 'Active Projects', statuses: ['Active', 'In Progress', 'Working on it', 'Not Started', 'Stuck'] },
  { label: 'Completed',       statuses: ['Completed'] },
  { label: 'On Hold / Cancelled', statuses: ['On Hold', 'Cancelled'] },
];

const EMPTY_PROJECT = { name: '', client: '', status: 'Active', value: '', start_date: '', end_date: '', notes: '' };
const EMPTY_ITEM    = { name: '', owner: '', status: 'Not Started', date: '', text: '', link: '' };

// ── Subitem row ─────────────────────────────────────────────────────────────
function SubitemRow({ item, onFieldSave, onDelete }) {
  return (
    <tr style={{ background: '#161830' }}>
      <td style={{ width: 70 }}></td>
      <td style={{ paddingLeft: 36 }}>
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
      <td></td>
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

// ── Main page ────────────────────────────────────────────────────────────────
export default function Projects() {
  const [searchParams] = useSearchParams();
  const [projects, setProjects]     = useState([]);
  const [allItems, setAllItems]     = useState({}); // { project_id: [items] }
  const [expanded, setExpanded]     = useState({}); // which projects are expanded
  const [collapsed, setCollapsed]   = useState({}); // which groups are collapsed
  const [search, setSearch]         = useState(() => searchParams.get('search') || '');
  const [modal, setModal]           = useState(null);
  const [form, setForm]             = useState(EMPTY_PROJECT);
  const [selected, setSelected]     = useState(null);
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

  const groups = useMemo(() => STATUS_GROUPS.map(g => ({
    ...g, items: filtered.filter(p => g.statuses.includes(p.status)),
  })), [filtered]);

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
      const parsed = field === 'value' ? (parseFloat(value) || 0) : value;
      await updateProject(id, { [field]: parsed });
      setProjects(ps => ps.map(p => p.id === id ? { ...p, [field]: parsed } : p));
    } catch (e) { console.error(e); }
  };

  const handleStatusChange = async (project, status) => {
    try {
      await updateProject(project.id, { status });
      setProjects(ps => ps.map(p => p.id === project.id ? { ...p, status } : p));
    } catch (e) { alert(e.message); }
  };

  // ── Expand / load subitems ──
  const toggleExpand = useCallback(async (projectId) => {
    setExpanded(e => ({ ...e, [projectId]: !e[projectId] }));
    if (!allItems[projectId]) {
      try {
        const items = await getProjectItems(projectId);
        setAllItems(a => ({ ...a, [projectId]: items }));
      } catch (err) { console.error(err); }
    }
  }, [allItems]);

  // ── Subitem field save ──
  const handleItemField = async (projectId, itemId, field, value) => {
    try {
      await updateProjectItem(itemId, { [field]: value });
      setAllItems(a => ({
        ...a,
        [projectId]: (a[projectId] || []).map(it => it.id === itemId ? { ...it, [field]: value } : it),
      }));
    } catch (e) { console.error(e); }
  };

  // ── Add subitem ──
  const addSubitem = async (projectId) => {
    try {
      const item = await createProjectItem({ project_id: projectId, ...EMPTY_ITEM });
      setAllItems(a => ({ ...a, [projectId]: [...(a[projectId] || []), item] }));
      setExpanded(e => ({ ...e, [projectId]: true }));
    } catch (e) { console.error(e); }
  };

  // ── Delete subitem ──
  const deleteSubitem = async (projectId, itemId) => {
    try {
      await deleteProjectItem(itemId);
      setAllItems(a => ({ ...a, [projectId]: (a[projectId] || []).filter(it => it.id !== itemId) }));
    } catch (e) { console.error(e); }
  };

  // ── Project CRUD modals ──
  const openAdd    = () => { setForm(EMPTY_PROJECT); setModal('add'); };
  const openDelete = (p) => { setSelected(p); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      await createProject({ ...form, value: parseFloat(form.value) || 0 });
      await load(); setModal(null);
    } catch (e) { alert(e.message); }
  };
  const handleDelete = async () => {
    try { await deleteProject(selected.id); await load(); setModal(null); } catch (e) { alert(e.message); }
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

  const progressPercent = (p) => {
    if (p.status === 'Completed') return 100;
    if (['Cancelled', 'On Hold'].includes(p.status)) return 0;
    if (!p.start_date || !p.end_date) return 30;
    const start = new Date(p.start_date), end = new Date(p.end_date), now = new Date();
    if (now >= end) return 95;
    if (now <= start) return 5;
    return Math.round(((now - start) / (end - start)) * 100);
  };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <FolderOpen size={22} style={{ color: '#fdab3d' }} />
          <div className="page-title">Client Projects</div>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="search-input" placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={openAdd}><Plus size={16} /> New Project</button>
        </div>
      </div>

      {/* ── Mobile card view ── */}
      <div className="mobile-cards">
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</div>
        ) : groups.map(({ label, items }) => (
          <React.Fragment key={label}>
            {items.length > 0 && (
              <div className="group-header" onClick={() => setCollapsed(c => ({ ...c, [label]: !c[label] }))} style={{ margin: '4px 0' }}>
                {collapsed[label] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span style={{ color: label === 'Completed' ? '#22c55e' : 'var(--orange)' }}>{label}</span>
                <span style={{ background: 'var(--border-light)', borderRadius: 12, padding: '1px 8px', fontSize: 12, color: 'var(--muted)' }}>{items.length}</span>
              </div>
            )}
            {!collapsed[label] && items.map(project => {
              const pct = progressPercent(project);
              return (
                <div key={project.id} className="mobile-card" onClick={() => toggleExpand(project.id)}>
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
                  {project.value > 0 && (
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Value</span>
                      <DollarSign size={12} style={{ color: 'var(--orange)' }} />
                      <span className="private-value" style={{ fontWeight: 600 }}>{Number(project.value).toLocaleString()}</span>
                    </div>
                  )}
                  {pct > 0 && (
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
          </React.Fragment>
        ))}
      </div>

      {/* ── Desktop table view ── */}
      <div className="table-container desktop-table">
        <table>
          <thead>
            <tr>
              {/* Combined: checkbox + expand */}
              <th style={{ width: 70 }}></th>
              <th style={{ minWidth: 220 }}>Project</th>
              <th style={{ minWidth: 120 }}>Owner / Client</th>
              <th style={{ minWidth: 145 }}>Status</th>
              <th style={{ minWidth: 120 }}>Timeline</th>
              <th style={{ minWidth: 120 }}>Value</th>
              <th style={{ minWidth: 160 }}>Progress</th>
              <th style={{ minWidth: 150 }}>Text / Notes</th>
              <th style={{ minWidth: 140 }}>Link</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</td></tr>
            ) : groups.map(({ label, items }) => (
              <React.Fragment key={label}>
                {/* Group header */}
                <tr>
                  <td colSpan={10} style={{ padding: 0, background: 'var(--surface)' }}>
                    <div className="group-header" onClick={() => setCollapsed(c => ({ ...c, [label]: !c[label] }))}>
                      {collapsed[label] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <span style={{ color: label === 'Completed' ? '#22c55e' : 'var(--orange)' }}>{label}</span>
                      <span style={{ background: 'var(--border-light)', borderRadius: 12, padding: '1px 8px', fontSize: 12, color: 'var(--muted)' }}>{items.length}</span>
                    </div>
                  </td>
                </tr>

                {!collapsed[label] && items.map(project => {
                  const pct   = progressPercent(project);
                  const isExp = expanded[project.id];
                  const items_ = allItems[project.id] || [];

                  return (
                    <React.Fragment key={project.id}>
                      {/* Project row */}
                      <tr style={{ background: selectedIds.has(project.id) ? 'rgba(255,155,38,0.08)' : undefined }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 4 }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(project.id)}
                              onChange={() => toggleSelect(project.id)}
                            />
                            <button
                              onClick={() => toggleExpand(project.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px 2px', display: 'flex', alignItems: 'center' }}
                              title={isExp ? 'Collapse' : 'Expand subitems'}
                            >
                              {isExp ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                            </button>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <InlineEdit value={project.name} onSave={v => handleProjectField(project.id, 'name', v)} placeholder="Project name" privacy="name" />
                            {isExp && items_.length > 0 && (
                              <span style={{ background: 'var(--border-light)', borderRadius: 10, padding: '0px 6px', fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                                {items_.length}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <InlineEdit value={project.client} onSave={v => handleProjectField(project.id, 'client', v)} placeholder="Client" privacy="name" />
                        </td>
                        <td>
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
                          <div className="private-value" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <DollarSign size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                            <InlineEdit value={String(project.value || '')} type="number" onSave={v => handleProjectField(project.id, 'value', v)} placeholder="0" />
                          </div>
                        </td>
                        <td>
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
                        </td>
                        <td>
                          <InlineEdit value={project.notes} onSave={v => handleProjectField(project.id, 'notes', v)} placeholder="Notes" />
                        </td>
                        <td></td>
                        <td>
                          <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => openDelete(project)} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>

                      {/* Subitems */}
                      {isExp && (
                        <>
                          {/* Subitem header row */}
                          <tr style={{ background: '#13152b' }}>
                            <td></td>
                            <td style={{ paddingLeft: 36, fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 6, paddingBottom: 6 }}>Subitem</td>
                            <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner</td>
                            <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</td>
                            <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Date</td>
                            <td></td>
                            <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Text</td>
                            <td style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Link</td>
                            <td></td>
                          </tr>

                          {items_.map(item => (
                            <SubitemRow
                              key={item.id}
                              item={item}
                              onFieldSave={(itemId, field, val) => handleItemField(project.id, itemId, field, val)}
                              onDelete={(itemId) => deleteSubitem(project.id, itemId)}
                            />
                          ))}

                          {/* Add subitem row */}
                          <tr style={{ background: '#161830' }}>
                            <td colSpan={10} style={{ padding: 0, paddingLeft: 36 }}>
                              <div className="add-row" style={{ paddingLeft: 20 }} onClick={() => addSubitem(project.id)}>
                                <Plus size={13} /> Add subitem
                              </div>
                            </td>
                          </tr>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Group totals */}
                {!collapsed[label] && items.length > 0 && (
                  <tr className="sum-row">
                    <td colSpan={4}></td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>Total</td>
                    <td>
                      <div className="private-value flex items-center gap-1">
                        <DollarSign size={13} style={{ color: 'var(--orange)' }} />
                        <span>{formatMoney(items.reduce((s, p) => s + (p.value || 0), 0))}</span>
                      </div>
                    </td>
                    <td colSpan={4}></td>
                  </tr>
                )}

                {!collapsed[label] && (
                  <tr>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <div className="add-row" onClick={openAdd}><Plus size={14} /> Add Project</div>
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
            <label className="form-label">Project Value ($)</label>
            <input className="form-input" type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
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

      {modal === 'delete' && (
        <Modal title="Delete Project" onClose={() => setModal(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
          <p style={{ color: 'var(--muted)' }}>Delete <strong style={{ color: 'var(--text)' }}>{selected?.name}</strong> and all its subitems? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
