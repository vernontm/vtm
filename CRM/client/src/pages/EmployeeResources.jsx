import React, { useState, useEffect, useMemo } from 'react';
import { Plus, ExternalLink, Pencil, Trash2, BookOpen, Search, ChevronDown, ChevronLeft, ChevronRight, Link as LinkIcon, Copy, Folder, ListChecks } from 'lucide-react';
import { useClient } from '../context/ClientContext';
import { usePageActions } from '../context/UiContext';
import { getEmployeeResources, createEmployeeResource, updateEmployeeResource, deleteEmployeeResource } from '../api';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';
import Walkthroughs from './Walkthroughs';

const EMPTY = { title: '', description: '', url: '', category: 'General' };

export default function EmployeeResources() {
  const { isAdmin } = useClient();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // 'add' | editing row | { del: row }
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState({}); // resource id -> expanded?
  const [activeCat, setActiveCat] = useState(null); // null = category landing

  const load = async () => {
    try { setRows(await getEmployeeResources()); } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Walkthroughs (SOPs) render their own "New" button, so suppress the header one there.
  usePageActions(() => (isAdmin && activeCat !== 'SOPs') ? (
    <button className="btn-primary" onClick={() => { setForm({ ...EMPTY, category: activeCat || 'General' }); setModal('add'); }}>
      <Plus size={15} /> {activeCat === 'Links' ? 'New Link' : 'New Resource'}
    </button>
  ) : null, [isAdmin, activeCat]);

  const copyLink = async (url) => {
    try { await navigator.clipboard.writeText(url); toast('success', 'Link copied'); }
    catch { toast('error', 'Could not copy'); }
  };
  const isLinkCat = (cat) => /link/i.test(cat || '');

  const filtered = useMemo(() => rows.filter(r => !search ||
    (r.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.category || '').toLowerCase().includes(search.toLowerCase())), [rows, search]);

  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(r => { const c = r.category || 'General'; (g[c] = g[c] || []).push(r); });
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const save = async () => {
    if (!form.title.trim()) return;
    try {
      if (modal === 'add') await createEmployeeResource(form);
      else await updateEmployeeResource(modal.id, form);
      setModal(null); await load();
    } catch (e) { toast('error', e.message); }
  };
  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.title}"?`)) return;
    setRows(rs => rs.filter(r => r.id !== row.id));
    try { await deleteEmployeeResource(row.id); } catch (e) { toast('error', e.message); load(); }
  };
  const openEdit = (row) => { setForm({ title: row.title || '', description: row.description || '', url: row.url || '', category: row.category || 'General' }); setModal(row); };

  const hrefOf = (u) => (u && u.startsWith('http')) ? u : `https://${u}`;

  // A full card (title + "what we do" summary + collapsible detail).
  const renderCard = (r) => {
    const parts = (r.description || '').split(/\n\s*\n/);
    const summary = parts[0] || '';
    const detail = parts.slice(1).join('\n\n').trim();
    const isOpen = !!open[r.id];
    const isPricing = /pric/i.test(r.category || '');
    return (
      <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={15} style={{ color: 'var(--orange)' }} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1, lineHeight: 1.3 }}>{r.title}</div>
          {isAdmin && (
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              <button className="btn-ghost" style={{ padding: '4px 6px' }} onClick={() => openEdit(r)} title="Edit"><Pencil size={13} /></button>
              <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => remove(r)} title="Delete"><Trash2 size={13} /></button>
            </div>
          )}
        </div>
        {summary && <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{summary}</div>}
        {detail && (
          <>
            <button onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 700, color: 'var(--link)', fontFamily: 'var(--font-display)' }}>
              {isOpen ? (isPricing ? 'Hide pricing' : 'Show less') : (isPricing ? 'View pricing' : 'Show more')}
              <ChevronDown size={13} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {isOpen && (
              <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>{detail}</div>
            )}
          </>
        )}
        {r.url && (
          <a href={hrefOf(r.url)} target="_blank" rel="noreferrer"
            style={{ marginTop: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--link)', textDecoration: 'none' }}>
            Open <ExternalLink size={12} />
          </a>
        )}
      </div>
    );
  };

  // A compact link row (title + URL + Copy + Open) for the Links view.
  const renderLink = (r) => (
    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <LinkIcon size={14} style={{ color: 'var(--orange)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</div>
        {r.url
          ? <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.url}</div>
          : r.description && <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</div>}
      </div>
      {r.url && (
        <>
          <button className="btn-ghost" style={{ padding: '5px 9px' }} onClick={() => copyLink(r.url)} title="Copy link"><Copy size={13} /> Copy</button>
          <a className="btn-ghost" href={hrefOf(r.url)} target="_blank" rel="noreferrer" style={{ padding: '5px 9px', textDecoration: 'none' }} title="Open"><ExternalLink size={13} /></a>
        </>
      )}
      {isAdmin && (
        <>
          <button className="btn-ghost" style={{ padding: '5px 7px' }} onClick={() => openEdit(r)} title="Edit"><Pencil size={13} /></button>
          <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => remove(r)} title="Delete"><Trash2 size={13} /></button>
        </>
      )}
    </div>
  );

  // "Links" is a virtual, always-present category that aggregates every
  // resource with a URL, from any category, into one copyable list.
  const allLinks = rows.filter(r => r.url && r.url.trim());
  const realCats = grouped.filter(([c]) => !isLinkCat(c));
  const activeItems = isLinkCat(activeCat)
    ? allLinks
    : (activeCat ? (grouped.find(([c]) => c === activeCat)?.[1] || []) : []);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search resources…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {loading ? (
          <div style={{ color: 'var(--muted)' }}>Loading…</div>
        ) : activeCat === 'SOPs' ? (
          <Walkthroughs isAdmin={isAdmin} onExit={() => setActiveCat(null)} />
        ) : search ? (
          /* Search overrides the drill-down: flat results across categories */
          grouped.map(([category, items]) => (
            <div key={category} style={{ marginBottom: 26 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, fontFamily: 'var(--font-display)' }}>{category}</div>
              {isLinkCat(category)
                ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{items.map(renderLink)}</div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>{items.map(renderCard)}</div>}
            </div>
          ))
        ) : activeCat ? (
          /* Category detail */
          <div>
            <button className="btn-ghost" onClick={() => setActiveCat(null)} style={{ marginBottom: 14 }}>
              <ChevronLeft size={15} /> All resources
            </button>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 4, fontFamily: 'var(--font-display)' }}>{activeCat}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 16 }}>{activeItems.length} {isLinkCat(activeCat) ? 'link' : 'item'}{activeItems.length !== 1 ? 's' : ''}</div>
            {isLinkCat(activeCat) ? (
              activeItems.filter(r => r.url).length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: 28, textAlign: 'center' }}>
                  No links yet.{isAdmin ? ' Click “New Link”, give it a name, and paste the URL.' : ''}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
                  {activeItems.filter(r => r.url).map(renderLink)}
                </div>
              )
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {activeItems.map(renderCard)}
              </div>
            )}
          </div>
        ) : (
          /* Category landing — click a category to open it */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {realCats.map(([category, items]) => (
              <button key={category} onClick={() => setActiveCat(category)}
                style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: 'var(--shadow-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-display)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Folder size={18} style={{ color: 'var(--orange)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{category}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{items.length} item{items.length !== 1 ? 's' : ''}</div>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              </button>
            ))}
            {/* Always-present Links tile (aggregates every link) */}
            <button onClick={() => setActiveCat('Links')}
              style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: 'var(--shadow-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-display)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <LinkIcon size={18} style={{ color: 'var(--orange)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Links</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{allLinks.length} link{allLinks.length !== 1 ? 's' : ''} to copy</div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </button>
            {/* Always-present SOPs / walkthroughs tile */}
            <button onClick={() => setActiveCat('SOPs')}
              style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, boxShadow: 'var(--shadow-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'var(--font-display)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(37,99,235,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ListChecks size={18} style={{ color: 'var(--orange)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>SOPs</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Step-by-step walkthroughs</div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </button>
          </div>
        )}
      </div>

      {(modal === 'add' || (modal && modal.id)) && (
        <Modal title={modal === 'add' ? 'New Resource' : 'Edit Resource'} onClose={() => setModal(null)} onSubmit={save} submitLabel={modal === 'add' ? 'Add' : 'Save'}>
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Onboarding SOP" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="General" list="resource-cats" />
              <datalist id="resource-cats">
                {[...new Set(rows.map(r => r.category).filter(Boolean))].map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Link (optional)</label>
              <input className="form-input" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What this is / how to use it…" style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}
    </div>
  );
}
