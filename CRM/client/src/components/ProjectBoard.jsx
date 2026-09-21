import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Eye, EyeOff, MessageSquare, FileText, Loader, ChevronRight, ChevronDown, Check } from 'lucide-react';
import {
  getProjectBoard, seedProjectBoard, addProjectItem, updateProjectItem,
  deleteProjectItem, addProjectComment, buildProjectReport,
} from '../api';
import { toast } from './Toast';

// Phases and the steps inside them, for one project. Clicking a step's marker
// cycles it todo -> doing -> done; the server stamps completed_at, which is what
// the period report groups by.
//
// Two visibility ideas travel with this screen and are easy to confuse:
//   client_visible on a STEP    - whether a client ever sees that row
//   internal on a COMMENT       - whether that note stays inside the CRM
// Comments are internal by default. A note only reaches a client when it is
// deliberately marked shared.

const RANGES = [
  { key: 'this-week', label: 'This week' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
];

const STATUS_NEXT = { todo: 'doing', doing: 'done', done: 'todo' };
// Clicking a marker cycles it. The in-progress mark is a bar rather than a
// glyph: it reads as "partially done" the way an indeterminate checkbox does,
// which a slash did not.
const STATUS_MARK = {
  todo:  { ch: '',  label: 'Not started', bg: 'transparent', bd: 'var(--border)', fg: 'var(--muted)' },
  doing: { ch: '-', label: 'In progress', bg: '#fef3c7', bd: '#f59e0b', fg: '#b45309' },
  done:  { ch: '✓', label: 'Done',        bg: '#dcfce7', bd: '#16a34a', fg: '#15803d' },
};
const STATUS_ORDER = ['todo', 'doing', 'done'];

const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 };

const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
// A bare YYYY-MM-DD parses as UTC midnight, which shows as the day before in a
// western timezone. Pin it to local midnight, same as the report PDF does.
const niceDate = (d) => {
  if (!d) return '';
  try { return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
};
// A phase is finishable once it has steps and every one of them is done.
const phaseComplete = (ph) => (ph.steps || []).length > 0 && ph.steps.every(st => st.status === 'done');

export default function ProjectBoard({ project }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});            // phaseId -> expanded
  const [newStep, setNewStep] = useState({});      // phaseId -> text
  const [newPhase, setNewPhase] = useState('');
  const [commentFor, setCommentFor] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [commentShared, setCommentShared] = useState(false);
  const [editingId, setEditingId] = useState(null);   // item being renamed
  const [editText, setEditText] = useState('');
  const [range, setRange] = useState('this-month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [clientFacing, setClientFacing] = useState(true);
  const [reporting, setReporting] = useState(false);
  // Preview of what a client would see. Same two rules the client-safe report
  // applies: a step hidden from the client disappears, and an internal comment
  // disappears. Editing controls go too, because a client cannot change
  // anything. This filters data the admin already has; it does not expose
  // anything, and the client portal itself is a separate change.
  const [clientView, setClientView] = useState(false);

  // silent refreshes leave the board on screen. Only the very first load is
  // allowed to show a spinner, because blanking the board on every checkbox
  // click reads as the whole page reloading.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const r = await getProjectBoard(project.id);
      setData(r);
      setOpen(o => Object.keys(o).length ? o : Object.fromEntries((r.phases || []).map(p => [p.id, true])));
    } catch (e) { toast('error', e.message); }
    finally { if (!silent) setLoading(false); }
  }, [project.id]);
  useEffect(() => { load(); }, [load]);

  // Structural changes (add, delete, seed) still refetch, but silently.
  const guard = async (fn) => { setBusy(true); try { await fn(); await load({ silent: true }); } catch (e) { toast('error', e.message); } finally { setBusy(false); } };

  // Field changes on a single step apply locally first and never refetch, so
  // ticking a checkbox is instant and the board never flickers.
  const patchLocal = (id, patch) => setData(d => !d ? d : ({
    ...d,
    phases: d.phases.map(ph => ph.id === id
      ? { ...ph, ...patch }
      : { ...ph, steps: (ph.steps || []).map(st => st.id === id ? { ...st, ...patch } : st) }),
  }));

  const recount = (d) => {
    const steps = (d.phases || []).flatMap(ph => ph.steps || []);
    const done = steps.filter(s => s.status === 'done').length;
    return { ...d, progress: { total: steps.length, done, pct: steps.length ? Math.round((done / steps.length) * 100) : 0 } };
  };

  const patchItem = async (id, patch) => {
    const before = data;
    patchLocal(id, patch);
    setData(d => d ? recount(d) : d);
    try { await updateProjectItem(id, patch); }
    catch (e) { toast('error', e.message); setData(before); }   // put it back
  };

  const seed = () => guard(async () => { const r = await seedProjectBoard(project.id); toast('success', r.already ? 'Board already set up' : `Seeded the ${r.template} template`); });
  const cycle = (step) => patchItem(step.id, { status: STATUS_NEXT[step.status] || 'doing' });
  const toggleVisible = (step) => patchItem(step.id, { client_visible: !step.client_visible });

  // Rename a phase or a step in place.
  const startEdit = (item) => { setEditingId(item.id); setEditText(item.name || ''); };
  const cancelEdit = () => { setEditingId(null); setEditText(''); };
  const saveEdit = async (item) => {
    // Enter closes the input, which fires onBlur, which calls this again. Bail
    // if this item is no longer the one being edited so the save happens once.
    if (editingId !== item.id) return;
    const name = editText.trim();
    setEditingId(null);
    if (!name || name === item.name) return;
    await patchItem(item.id, { name });
  };
  const setPhaseDate = (ph, value) => patchItem(ph.id, { due_date: value || null });
  const markPhaseDone = (ph) => patchItem(ph.id, { status: 'done' });
  const reopenPhase = (ph) => patchItem(ph.id, { status: 'todo' });

  const removeItem = (item, isPhase) => {
    if (!window.confirm(isPhase ? `Delete "${item.name}" and every step inside it?` : `Delete "${item.name}"?`)) return;
    guard(() => deleteProjectItem(item.id));
  };
  const addStep = (phaseId) => {
    const name = (newStep[phaseId] || '').trim();
    if (!name) return;
    guard(async () => { await addProjectItem(project.id, { name, parent_id: phaseId }); setNewStep(s => ({ ...s, [phaseId]: '' })); });
  };
  const addPhase = () => {
    const name = newPhase.trim();
    if (!name) return;
    guard(async () => { await addProjectItem(project.id, { name }); setNewPhase(''); });
  };
  const saveComment = () => {
    const body = commentText.trim();
    if (!body) return;
    guard(async () => {
      await addProjectComment(project.id, { item_id: commentFor, body, internal: !commentShared });
      setCommentText(''); setCommentFor(null); setCommentShared(false);
    });
  };

  const runReport = async () => {
    if (range === 'custom' && (!from || !to)) { toast('error', 'Pick both dates for a custom range.'); return; }
    setReporting(true);
    try {
      const r = await buildProjectReport(project.id, { range, from, to, client_facing: clientFacing });
      toast('success', `Report ready for ${r.range?.label || 'the period'}`);
      if (r.url) window.open(r.url, '_blank', 'noopener');
      await load({ silent: true });
    } catch (e) { toast('error', e.message); }
    finally { setReporting(false); }
  };

  const commentsFor = (itemId) => (data?.comments || [])
    .filter(c => c.item_id === itemId)
    .filter(c => !clientView || c.internal !== true);

  if (loading) return <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Loading board…</div>;

  const allPhases = data?.phases || [];
  const phases = clientView
    ? allPhases
        .map(ph => ({ ...ph, steps: (ph.steps || []).filter(st => st.client_visible !== false) }))
        .filter(ph => ph.steps.length)
    : allPhases;
  // In client view the counts have to reflect only what the client can see,
  // otherwise the total gives away that something is being withheld.
  const visibleSteps = phases.flatMap(ph => ph.steps || []);
  const visibleDone = visibleSteps.filter(st => st.status === 'done').length;
  const progress = clientView
    ? { total: visibleSteps.length, done: visibleDone, pct: visibleSteps.length ? Math.round((visibleDone / visibleSteps.length) * 100) : 0 }
    : (data?.progress || { total: 0, done: 0, pct: 0 });
  const hiddenCount = clientView
    ? allPhases.flatMap(ph => ph.steps || []).filter(st => st.client_visible === false).length
    : 0;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Delivery board</div>
        <button className="btn-ghost" onClick={() => { setClientView(v => !v); cancelEdit(); setCommentFor(null); }}
          title="Preview exactly what this client would see"
          style={{ padding: '5px 11px', fontSize: 12, borderColor: clientView ? '#2563eb' : 'var(--border)', color: clientView ? '#2563eb' : 'var(--muted)' }}>
          {clientView ? <Eye size={13} /> : <EyeOff size={13} />} {clientView ? 'Client view' : 'Your view'}
        </button>
        {progress.total > 0 && (
          <>
            <div style={{ flex: 1, minWidth: 120, height: 7, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden', maxWidth: 260 }}>
              <div style={{ width: `${progress.pct}%`, height: '100%', background: '#16a34a' }} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{progress.done} of {progress.total} done ({progress.pct}%)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              {STATUS_ORDER.map(k => {
                const m = STATUS_MARK[k];
                return (
                  <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--muted)' }}>
                    <span style={{ width: 15, height: 15, borderRadius: 5, border: `1.5px solid ${m.bd}`, background: m.bg, color: m.fg, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{m.ch}</span>
                    {m.label}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {clientView && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: '#1e40af', lineHeight: 1.5 }}>
          <strong>Client view.</strong> This is what {project.client?.business_name || 'the client'} would see: read only, with hidden steps and internal notes removed
          {hiddenCount > 0 ? `, ${hiddenCount} step${hiddenCount === 1 ? '' : 's'} hidden` : ''}.
          {' '}Clients cannot open this yet, so nothing here is live to them.
        </div>
      )}

      {!phases.length ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>No phases yet</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
            Start from the standard {project.project_kind === 'retainer' ? 'retainer' : 'build'} phases, then edit them for this client.
          </div>
          <button className="btn-primary" onClick={seed} disabled={busy} style={{ padding: '9px 18px' }}>
            <Plus size={14} /> Set up the board
          </button>
        </div>
      ) : (
        <>
          {phases.map(ph => {
            const steps = ph.steps || [];
            const doneN = steps.filter(s => s.status === 'done').length;
            const expanded = open[ph.id] !== false;
            const isDone = ph.status === 'done';
            const ready = phaseComplete(ph) && !isDone;
            const overdue = !isDone && ph.due_date && ph.due_date < todayStr();
            return (
              <div key={ph.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', cursor: 'pointer' }}
                     onClick={() => setOpen(o => ({ ...o, [ph.id]: !expanded }))}>
                  {expanded ? <ChevronDown size={15} style={{ color: 'var(--muted)' }} /> : <ChevronRight size={15} style={{ color: 'var(--muted)' }} />}
                  {editingId === ph.id ? (
                    <input className="form-input" value={editText} autoFocus
                      onClick={e => e.stopPropagation()}
                      onChange={e => setEditText(e.target.value)}
                      onBlur={() => saveEdit(ph)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(ph); if (e.key === 'Escape') cancelEdit(); }}
                      style={{ flex: 1, fontWeight: 700, fontSize: 13.5, padding: '4px 8px' }} />
                  ) : (
                    <div onClick={e => { e.stopPropagation(); if (!clientView) startEdit(ph); }} title={clientView ? undefined : 'Click to rename'}
                      style={{ fontWeight: 800, fontSize: 13.5, flex: 1, cursor: 'text' }}>{ph.name}</div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{doneN}/{steps.length}</div>

                  {/* Target completion date. Clients see it, they cannot set it. */}
                  {clientView ? (
                    ph.due_date ? (
                      <span style={{ fontSize: 11.5, color: isDone ? '#15803d' : 'var(--muted)' }}>
                        {isDone ? 'Completed' : 'Target'} {niceDate(ph.due_date)}
                      </span>
                    ) : null
                  ) : (
                    <input type="date" value={ph.due_date || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); setPhaseDate(ph, e.target.value); }}
                      title={ph.due_date ? 'Target completion date' : 'Set a target completion date'}
                      style={{ background: 'transparent', border: `1px solid ${overdue ? '#ef4444' : 'var(--border)'}`, borderRadius: 7, color: overdue ? '#ef4444' : 'var(--muted)', fontSize: 11.5, padding: '3px 6px', colorScheme: 'dark' }} />
                  )}

                  {isDone && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d', background: '#dcfce7', border: '1px solid #16a34a', borderRadius: 99, padding: '2px 9px' }}>
                      Completed
                    </span>
                  )}
                  {overdue && !ready && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c' }}>Overdue</span>
                  )}
                  {!clientView && <button className="btn-ghost" title="Delete phase" onClick={e => { e.stopPropagation(); removeItem(ph, true); }} style={{ padding: '4px 6px', color: '#ff5c5c' }}><Trash2 size={13} /></button>}
                </div>

                {expanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '6px 14px 12px' }}>
                    {steps.map(st => {
                      const mk = STATUS_MARK[st.status] || STATUS_MARK.todo;
                      const notes = commentsFor(st.id);
                      return (
                        <div key={st.id} style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <button onClick={() => { if (!clientView) cycle(st); }}
                              title={clientView
                                ? (STATUS_MARK[st.status] || STATUS_MARK.todo).label
                                : `${(STATUS_MARK[st.status] || STATUS_MARK.todo).label}. Click to mark ${(STATUS_MARK[STATUS_NEXT[st.status] || 'doing']).label.toLowerCase()}.`}
                              style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${mk.bd}`, background: mk.bg, color: mk.fg, fontSize: 12, fontWeight: 800, cursor: clientView ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {mk.ch}
                            </button>
                            {editingId === st.id ? (
                              <input className="form-input" value={editText} autoFocus
                                onChange={e => setEditText(e.target.value)}
                                onBlur={() => saveEdit(st)}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(st); if (e.key === 'Escape') cancelEdit(); }}
                                style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' }} />
                            ) : (
                              <div onClick={() => { if (!clientView) startEdit(st); }} title={clientView ? undefined : 'Click to rename'}
                                style={{ flex: 1, minWidth: 0, fontSize: 13, cursor: 'text', textDecoration: st.status === 'done' ? 'line-through' : 'none', color: st.status === 'done' ? 'var(--muted)' : 'var(--text)' }}>
                                {st.name}
                              </div>
                            )}
                            {st.due_date && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>due {st.due_date}</span>}
                            {!clientView && (
                              <button className="btn-ghost" title={st.client_visible ? 'Client can see this' : 'Hidden from the client'} onClick={() => toggleVisible(st)}
                                style={{ padding: '4px 6px', color: st.client_visible ? 'var(--muted)' : '#b45309' }}>
                                {st.client_visible ? <Eye size={13} /> : <EyeOff size={13} />}
                              </button>
                            )}
                            {!clientView && <button className="btn-ghost" title="Comments" onClick={() => { setCommentFor(commentFor === st.id ? null : st.id); setCommentText(''); setCommentShared(false); }}
                              style={{ padding: '4px 6px', color: notes.length ? 'var(--accent)' : 'var(--muted)' }}>
                              <MessageSquare size={13} />{notes.length ? <span style={{ fontSize: 10, marginLeft: 3 }}>{notes.length}</span> : null}
                            </button>}
                            {!clientView && <button className="btn-ghost" title="Delete step" onClick={() => removeItem(st, false)} style={{ padding: '4px 6px', color: '#ff5c5c' }}><Trash2 size={12} /></button>}
                          </div>

                          {(commentFor === st.id || notes.length > 0) && (
                            <div style={{ marginLeft: 30, marginTop: 6 }}>
                              {notes.map(c => (
                                <div key={c.id} style={{ fontSize: 12, marginBottom: 5, paddingLeft: 8, borderLeft: `2px solid ${c.internal ? '#ef4444' : '#16a34a'}` }}>
                                  <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{c.author}</span>
                                  <span style={{ color: c.internal ? '#b91c1c' : '#15803d', fontSize: 10, fontWeight: 800, marginLeft: 6 }}>{c.internal ? 'INTERNAL' : 'SHARED'}</span>
                                  <div style={{ color: 'var(--text)' }}>{c.body}</div>
                                </div>
                              ))}
                              {commentFor === st.id && !clientView && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                  <input className="form-input" value={commentText} onChange={e => setCommentText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveComment(); }}
                                    placeholder="Add a note" style={{ flex: 1, minWidth: 180 }} autoFocus />
                                  <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <input type="checkbox" checked={commentShared} onChange={e => setCommentShared(e.target.checked)} /> share with client
                                  </label>
                                  <button className="btn-primary" onClick={saveComment} disabled={busy} style={{ padding: '6px 12px' }}>Save</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Everything is ticked, so offer to close the phase out. */}
                    {ready && !clientView && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10 }}>
                        <span style={{ fontSize: 12.5, color: '#15803d' }}>
                          All {steps.length} step{steps.length === 1 ? '' : 's'} in this phase are done.
                        </span>
                        <button className="btn-primary" onClick={() => markPhaseDone(ph)} disabled={busy}
                          style={{ padding: '6px 12px', marginLeft: 'auto' }}>
                          <Check size={13} /> Mark this phase as completed
                        </button>
                      </div>
                    )}
                    {isDone && !clientView && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                        This phase is marked completed.
                        <button className="btn-ghost" onClick={() => reopenPhase(ph)} style={{ padding: '4px 10px' }}>Reopen</button>
                      </div>
                    )}

                    {!clientView && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <input className="form-input" value={newStep[ph.id] || ''} onChange={e => setNewStep(s => ({ ...s, [ph.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addStep(ph.id); }}
                        placeholder="Add a step" style={{ flex: 1 }} />
                      <button className="btn-ghost" onClick={() => addStep(ph.id)} disabled={busy} style={{ padding: '7px 12px' }}><Plus size={13} /></button>
                    </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!clientView && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <input className="form-input" value={newPhase} onChange={e => setNewPhase(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addPhase(); }} placeholder="Add a phase" style={{ flex: 1, maxWidth: 320 }} />
            <button className="btn-ghost" onClick={addPhase} disabled={busy} style={{ padding: '8px 14px' }}><Plus size={13} /> Phase</button>
          </div>
          )}
        </>
      )}

      {/* Period report. Hidden in client view: it is your tool, not theirs. */}
      {!clientView && (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <FileText size={15} style={{ color: 'var(--accent)' }} />
          <div style={{ fontSize: 13, fontWeight: 800 }}>Progress report</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={lbl}>Period</div>
            <select className="form-input" value={range} onChange={e => setRange(e.target.value)} style={{ width: 150 }}>
              {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          {range === 'custom' && (
            <>
              <div><div style={lbl}>From</div><input className="form-input" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: 150 }} /></div>
              <div><div style={lbl}>To</div><input className="form-input" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: 150 }} /></div>
            </>
          )}
          <label style={{ fontSize: 12.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 9 }}>
            <input type="checkbox" checked={clientFacing} onChange={e => setClientFacing(e.target.checked)} />
            Client-safe version
          </label>
          <button className="btn-primary" onClick={runReport} disabled={reporting} style={{ padding: '9px 16px' }}>
            {reporting ? <><Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Building…</> : <><FileText size={14} /> Generate PDF</>}
          </button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
          {clientFacing
            ? 'Leaves out internal notes and any step hidden from the client. Safe to send.'
            : 'Includes internal notes and hidden steps. For your eyes only.'}
          {' '}The PDF is also filed on the client’s Documents.
        </div>
      </div>
      )}
    </div>
  );
}
