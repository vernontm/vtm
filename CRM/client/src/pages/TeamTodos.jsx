import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Check, AlertTriangle, Lock, Building2, Briefcase, Tag, X, Users2,
} from 'lucide-react';
import { useClient } from '../context/ClientContext';
import { toast } from '../components/Toast';
import {
  getTodos, getTodoMembers, setTodoSharing, createTodo, updateTodo, deleteTodo, getClients, getProjects,
} from '../api';

// Stable per-author color so each person's items are easy to spot.
const PALETTE = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0d9488'];
const colorFor = (id) => {
  const s = String(id || '');
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};
const initials = (name) => (name || '?').trim().slice(0, 1).toUpperCase();

const LINK_ICON = { client: Building2, project: Briefcase, other: Tag };

export default function TeamTodos() {
  const { user, isAdmin } = useClient();
  const navigate = useNavigate();
  const meId = user?.id;

  const [todos, setTodos] = useState([]);
  const [members, setMembers] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open'); // open | mine | all | done
  const [shareOpen, setShareOpen] = useState(false);

  // new-todo form
  const [title, setTitle] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [assignTo, setAssignTo] = useState('');       // '' = anyone
  const [linkType, setLinkType] = useState('');       // '' | client | project | other
  const [linkId, setLinkId] = useState('');
  const [otherLabel, setOtherLabel] = useState('');

  const load = useCallback(async () => {
    try { setTodos(await getTodos()); } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  }, []);
  const loadMembers = useCallback(() => { getTodoMembers().then(m => setMembers(m || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadMembers();
    getClients().then(c => setClients((c || []).filter(x => x.business_name))).catch(() => {});
    getProjects().then(p => setProjects(p || [])).catch(() => {});
  }, [loadMembers]);

  const toggleShare = async (m) => {
    setMembers(prev => prev.map(x => x.id === m.id ? { ...x, shared: !x.shared } : x));
    try { await setTodoSharing(m.id, !m.shared); load(); loadMembers(); }
    catch (e) { toast('error', e.message); loadMembers(); }
  };

  const resetForm = () => { setTitle(''); setUrgent(false); setAssignTo(''); setLinkType(''); setLinkId(''); setOtherLabel(''); };

  const add = async (e) => {
    e?.preventDefault?.();
    if (!title.trim()) return;
    const payload = { title: title.trim(), urgent };
    if (assignTo) { payload.assigned_to = assignTo; payload.assigned_to_name = members.find(m => m.id === assignTo)?.name || null; }
    if (linkType === 'client' && linkId) { const c = clients.find(x => x.id === linkId); payload.link_type = 'client'; payload.link_id = linkId; payload.link_label = c?.business_name || 'Client'; }
    if (linkType === 'project' && linkId) { const p = projects.find(x => x.id === linkId); payload.link_type = 'project'; payload.link_id = linkId; payload.link_label = p?.name || 'Project'; }
    if (linkType === 'other' && otherLabel.trim()) { payload.link_type = 'other'; payload.link_label = otherLabel.trim(); }
    try { await createTodo(payload); resetForm(); load(); }
    catch (e2) { toast('error', e2.message); }
  };

  const canComplete = (t) => !t.assigned_to || t.assigned_to === meId || isAdmin;
  const canDelete = (t) => t.created_by === meId || isAdmin;

  const toggle = async (t) => {
    if (!canComplete(t)) { toast('error', `Locked to ${t.assigned_to_name || 'another user'}`); return; }
    setTodos(prev => prev.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
    try { await updateTodo(t.id, { done: !t.done }); load(); }
    catch (e) { toast('error', e.message); load(); }
  };
  const remove = async (t) => {
    setTodos(prev => prev.filter(x => x.id !== t.id));
    try { await deleteTodo(t.id); } catch (e) { toast('error', e.message); load(); }
  };

  const openLink = (t) => {
    if (t.link_type === 'client' && t.link_id) navigate(`/clients?open=${t.link_id}`);
    else if (t.link_type === 'project' && t.link_id) navigate(`/projects?open=${t.link_id}`);
  };

  const shown = useMemo(() => todos.filter(t => {
    if (filter === 'open') return !t.done;
    if (filter === 'done') return t.done;
    if (filter === 'mine') return !t.done && (t.assigned_to === meId || t.created_by === meId);
    return true;
  }), [todos, filter, meId]);

  const openCount = todos.filter(t => !t.done).length;

  const field = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-display)' };

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', padding: '20px 24px' }}>
      {/* Add form */}
      <form onSubmit={add} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 18, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a to-do for the team…" style={{ ...field, flex: '1 1 260px', minWidth: 0 }} />
          <button type="button" onClick={() => setUrgent(u => !u)} title="Urgent"
            style={{ ...field, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, color: urgent ? '#dc2626' : 'var(--muted)', borderColor: urgent ? 'rgba(220,38,38,0.5)' : 'var(--border)', background: urgent ? 'rgba(220,38,38,0.08)' : 'var(--surface-2)' }}>
            <AlertTriangle size={14} /> Urgent
          </button>
          <button type="submit" className="btn-primary"><Plus size={15} /> Add</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {/* Assign */}
          <select value={assignTo} onChange={e => setAssignTo(e.target.value)} style={{ ...field }} title="Who can complete it">
            <option value="">Anyone can complete</option>
            {members.map(m => <option key={m.id} value={m.id}>Only {m.name}</option>)}
          </select>
          {/* Related to */}
          <select value={linkType} onChange={e => { setLinkType(e.target.value); setLinkId(''); setOtherLabel(''); }} style={{ ...field }} title="Related to">
            <option value="">Not related to anything</option>
            <option value="client">Client</option>
            <option value="project">Project</option>
            <option value="other">Other</option>
          </select>
          {linkType === 'client' && (
            <select value={linkId} onChange={e => setLinkId(e.target.value)} style={{ ...field, flex: '1 1 200px' }}>
              <option value="">Pick a client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
          )}
          {linkType === 'project' && (
            <select value={linkId} onChange={e => setLinkId(e.target.value)} style={{ ...field, flex: '1 1 200px' }}>
              <option value="">Pick a project…</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          {linkType === 'other' && (
            <input value={otherLabel} onChange={e => setOtherLabel(e.target.value)} placeholder="What is it about?" style={{ ...field, flex: '1 1 200px' }} />
          )}
        </div>
      </form>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ k: 'open', label: `Open (${openCount})` }, { k: 'mine', label: 'Mine' }, { k: 'all', label: 'All' }, { k: 'done', label: 'Completed' }].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)',
            background: filter === f.k ? 'var(--btn-black)' : 'var(--surface)', color: filter === f.k ? '#fff' : 'var(--muted)',
            border: `1px solid ${filter === f.k ? 'transparent' : 'var(--border)'}`,
          }}>{f.label}</button>
        ))}
        {isAdmin && (
          <button className="btn-ghost" onClick={() => setShareOpen(true)} style={{ marginLeft: 'auto' }}>
            <Users2 size={14} /> Sharing
          </button>
        )}
      </div>

      {/* Sharing settings (admin) */}
      {shareOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShareOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 460, maxWidth: '92vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users2 size={16} style={{ color: 'var(--orange)' }} />
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>To-Do sharing</span>
              </div>
              <button onClick={() => setShareOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '14px 20px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, borderBottom: '1px solid var(--border)' }}>
              People who <b style={{ color: 'var(--text)' }}>share</b> see one team list together. People turned <b style={{ color: 'var(--text)' }}>off</b> only see their own to-dos and anything assigned to them. (Admins always see everything.)
            </div>
            <div style={{ overflowY: 'auto', padding: 12 }}>
              {members.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, padding: 12 }}>No team members found.</div>
              ) : members.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: colorFor(m.id), color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(m.name)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                  <button onClick={() => toggleShare(m)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                      background: m.shared ? 'rgba(22,163,74,0.12)' : 'var(--surface-2)',
                      border: `1px solid ${m.shared ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`,
                      color: m.shared ? '#16a34a' : 'var(--muted)',
                    }}>
                    {m.shared ? 'Shares with team' : 'Private'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 12, padding: 30, textAlign: 'center' }}>Nothing here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 900 }}>
          {shown.map(t => {
            const color = colorFor(t.created_by);
            const LinkI = LINK_ICON[t.link_type];
            const completable = canComplete(t);
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)',
                border: '1px solid var(--border)', borderLeft: `4px solid ${color}`, borderRadius: 10, padding: '11px 14px',
              }}>
                <button onClick={() => toggle(t)} title={completable ? (t.done ? 'Mark not done' : 'Mark done') : `Locked to ${t.assigned_to_name || 'another user'}`}
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: completable ? 'pointer' : 'not-allowed', opacity: completable ? 1 : 0.5,
                    background: t.done ? '#16a34a' : 'transparent', border: `1.5px solid ${t.done ? '#16a34a' : 'var(--border-strong, #cbd5e1)'}`,
                  }}>
                  {t.done && <Check size={13} color="#fff" />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {t.urgent && !t.done && <AlertTriangle size={13} style={{ color: '#dc2626', flexShrink: 0 }} />}
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: t.done ? 'var(--muted)' : 'var(--text)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</span>
                    {t.link_type && (
                      <span onClick={() => openLink(t)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--orange)', background: 'rgba(37,99,235,0.10)', border: '1px solid rgba(37,99,235,0.28)', borderRadius: 999, padding: '1px 8px', cursor: (t.link_type === 'other') ? 'default' : 'pointer' }}>
                        {LinkI && <LinkI size={11} />} {t.link_label}
                      </span>
                    )}
                    {t.assigned_to && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px' }}>
                        <Lock size={10} /> {t.assigned_to_name || 'Assigned'}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: color, color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials(t.created_by_name)}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.created_by_name}{t.done && t.done_by_name ? ` · done by ${t.done_by_name}` : ''}</span>
                  </div>
                </div>

                {canDelete(t) && (
                  <button onClick={() => remove(t)} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><Trash2 size={14} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
