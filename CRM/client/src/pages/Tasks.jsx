import React, { useState, useEffect, useMemo } from 'react';
import { ListChecks, Plus, Trash2, Check, Flag, Building2, Calendar } from 'lucide-react';
import { toast } from '../components/Toast';
import { getTasks, createTask, updateTask, deleteTask, getClients } from '../api';

// Client-assignable tasks / priorities. Todo-list style: each task is tied to a
// client (who it's for), with a priority and optional due date. The `source`
// field on the row lets automations create tasks here later.

const PRIORITIES = [
  { key: 'urgent', label: 'Urgent', color: '#ef4444', rank: 0 },
  { key: 'high',   label: 'High',   color: '#f59e0b', rank: 1 },
  { key: 'normal', label: 'Normal', color: '#2563eb', rank: 2 },
  { key: 'low',    label: 'Low',    color: '#94a3b8', rank: 3 },
];
const prio = (k) => PRIORITIES.find(p => p.key === k) || PRIORITIES[2];
const fmtDue = (d) => {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const isOverdue = (d) => d && new Date(d + 'T00:00:00') < new Date(new Date().toDateString());

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');       // open | done
  const [clientFilter, setClientFilter] = useState('');
  // new-task form
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [due, setDue] = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([getTasks(), getClients().catch(() => [])]);
      setTasks(t || []);
      setClients((c || []).filter(x => x.business_name).sort((a, b) => a.business_name.localeCompare(b.business_name)));
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!title.trim()) { toast('error', 'Enter a task'); return; }
    setAdding(true);
    try {
      await createTask({ title: title.trim(), client_id: clientId || null, priority, due_date: due || null });
      setTitle(''); setClientId(''); setPriority('normal'); setDue('');
      await load();
    } catch (e) { toast('error', e.message); }
    finally { setAdding(false); }
  };

  const toggle = async (t) => {
    const next = t.status === 'done' ? 'open' : 'done';
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x));
    try { await updateTask(t.id, { status: next }); } catch (e) { toast('error', e.message); load(); }
  };
  const remove = async (t) => {
    if (!confirm('Delete this task?')) return;
    setTasks(prev => prev.filter(x => x.id !== t.id));
    try { await deleteTask(t.id); } catch (e) { toast('error', e.message); load(); }
  };
  const setTaskPriority = async (t, p) => {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, priority: p } : x));
    try { await updateTask(t.id, { priority: p }); } catch (e) { toast('error', e.message); load(); }
  };

  const visible = useMemo(() => {
    let list = (tasks || []).filter(t => (tab === 'done' ? t.status === 'done' : t.status !== 'done'));
    if (clientFilter) list = list.filter(t => t.client_id === clientFilter);
    return list.sort((a, b) => {
      const pr = prio(a.priority).rank - prio(b.priority).rank;
      if (pr !== 0) return pr;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [tasks, tab, clientFilter]);

  const openCount = tasks.filter(t => t.status !== 'done').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;

  const input = {
    padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font-display)', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-display)' }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Tasks</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Priorities and to-dos, each tied to the client it's for.</div>
      </div>

      {/* Add bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={{ ...input, flex: 1, minWidth: 200 }} placeholder="Add a task…" value={title}
          onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <select style={{ ...input, minWidth: 150 }} value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">No client</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
        <select style={{ ...input, width: 110 }} value={priority} onChange={e => setPriority(e.target.value)}>
          {PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <input style={{ ...input, width: 140 }} type="date" value={due} onChange={e => setDue(e.target.value)} />
        <button className="btn-primary" onClick={add} disabled={adding} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        {[{ k: 'open', label: `Open (${openCount})` }, { k: 'done', label: `Done (${doneCount})` }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '5px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)',
            background: tab === t.k ? 'var(--btn-black, #111)' : 'var(--surface-2)', color: tab === t.k ? '#fff' : 'var(--muted)',
            border: `1px solid ${tab === t.k ? 'transparent' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
        <select style={{ ...input, marginLeft: 'auto', width: 200 }} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <ListChecks size={30} style={{ color: 'var(--muted)', marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{tab === 'done' ? 'Nothing completed yet' : 'No open tasks'}</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>Add a task above and tie it to the client it's for.</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {visible.map((t, i) => {
            const p = prio(t.priority);
            const done = t.status === 'done';
            const over = !done && isOverdue(t.due_date);
            return (
              <div key={t.id} className="task-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < visible.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <button onClick={() => toggle(t)} title={done ? 'Mark open' : 'Mark done'}
                  style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: done ? '#22c55e' : 'transparent', border: `1.5px solid ${done ? '#22c55e' : 'var(--border-strong, #cbd5e1)'}` }}>
                  {done && <Check size={13} color="#fff" />}
                </button>

                <span title={p.label} style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', fontWeight: p.rank <= 1 && !done ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3, fontSize: 12, color: 'var(--muted)' }}>
                    {t.client?.business_name ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--link, #2563eb)', background: 'rgba(37,99,235,0.08)', borderRadius: 6, padding: '1px 7px' }}>
                        <Building2 size={11} /> {t.client.business_name}
                      </span>
                    ) : <span style={{ color: 'var(--muted)' }}>No client</span>}
                    {t.due_date && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: over ? '#ef4444' : 'var(--muted)', fontWeight: over ? 700 : 500 }}>
                        <Calendar size={11} /> {fmtDue(t.due_date)}{over ? ' · overdue' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <select value={t.priority} onChange={e => setTaskPriority(t, e.target.value)} title="Priority"
                  style={{ ...input, padding: '5px 8px', fontSize: 12, width: 96, color: p.color, fontWeight: 700 }}>
                  {PRIORITIES.map(pp => <option key={pp.key} value={pp.key} style={{ color: 'var(--text)' }}>{pp.label}</option>)}
                </select>

                <button onClick={() => remove(t)} className="task-del" title="Delete"
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', flexShrink: 0, opacity: 0.5 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style>{`.task-row .task-del{transition:opacity .15s} .task-row:hover .task-del{opacity:1!important}`}</style>
    </div>
  );
}
