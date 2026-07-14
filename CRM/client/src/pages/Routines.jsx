import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, Check, Sun, CalendarDays, CalendarRange, GripVertical,
  ChevronUp, ChevronDown, X, RotateCcw,
} from 'lucide-react';
import { useClient } from '../context/ClientContext';
import { usePageActions } from '../context/UiContext';
import { toast } from '../components/Toast';
import Modal from '../components/Modal';
import { getRoutines, createRoutine, updateRoutine, deleteRoutine, checkRoutineItem } from '../api';

const CADENCES = [
  { key: 'daily',   label: 'Daily',   reset: 'today',      resets: 'day',   icon: Sun,           color: '#f59e0b' },
  { key: 'weekly',  label: 'Weekly',  reset: 'this week',  resets: 'week',  icon: CalendarRange, color: '#2563eb' },
  { key: 'monthly', label: 'Monthly', reset: 'this month', resets: 'month', icon: CalendarDays,  color: '#7c3aed' },
];
const cadenceOf = (k) => CADENCES.find(c => c.key === k) || CADENCES[0];
const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'i_' + Math.random().toString(36).slice(2) + Date.now());

// Period key the checks hang off — must match how a routine "resets".
function periodKey(cadence, d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  if (cadence === 'monthly') return `${y}-${m}`;
  if (cadence === 'weekly') {
    const dow = (d.getDay() + 6) % 7;                 // 0 = Monday
    const mon = new Date(d); mon.setDate(d.getDate() - dow);
    return `W:${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
  }
  return `${y}-${m}-${day}`;
}

/* ── Create / edit modal ─────────────────────────────────────────────────── */
function RoutineModal({ initial, onClose, onSaved }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [cadence, setCadence] = useState(initial?.cadence || 'daily');
  const [description, setDescription] = useState(initial?.description || '');
  const [items, setItems] = useState(initial?.items?.length ? initial.items : [{ id: uid(), text: '' }]);
  const [saving, setSaving] = useState(false);

  const setItem = (i, text) => setItems(a => a.map((x, idx) => idx === i ? { ...x, text } : x));
  const addItem = () => setItems(a => [...a, { id: uid(), text: '' }]);
  const delItem = (i) => setItems(a => a.filter((_, idx) => idx !== i));
  const move = (i, dir) => setItems(a => { const j = i + dir; if (j < 0 || j >= a.length) return a; const c = [...a]; [c[i], c[j]] = [c[j], c[i]]; return c; });

  const save = async () => {
    if (!title.trim()) { toast('error', 'Give the routine a name'); return; }
    const clean = items.filter(x => x.text.trim()).map(x => ({ id: x.id, text: x.text.trim() }));
    setSaving(true);
    try {
      const payload = { title: title.trim(), cadence, description, items: clean };
      if (initial?.id) await updateRoutine(initial.id, payload); else await createRoutine(payload);
      onSaved();
    } catch (e) { toast('error', e.message); setSaving(false); }
  };

  const field = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-display)' };
  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <Modal title={initial?.id ? 'Edit routine' : 'New routine'} onClose={onClose} onSubmit={save} submitLabel={saving ? 'Saving…' : 'Save'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={lbl}>Name</label><input value={title} onChange={e => setTitle(e.target.value)} style={field} placeholder="e.g. Daily open checklist" autoFocus /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <label style={lbl}>Repeats</label>
            <select value={cadence} onChange={e => setCadence(e.target.value)} style={field}>
              {CADENCES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div><label style={lbl}>Note (optional)</label><input value={description} onChange={e => setDescription(e.target.value)} style={field} placeholder="What this covers…" /></div>
        </div>
        <div>
          <label style={lbl}>Checklist items</label>
          {items.map((it, i) => (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <GripVertical size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
              <input value={it.text} onChange={e => setItem(i, e.target.value)} style={{ ...field, flex: 1 }} placeholder={`Item ${i + 1}`} />
              <button type="button" className="btn-ghost" style={{ padding: '5px 6px' }} onClick={() => move(i, -1)} disabled={i === 0}><ChevronUp size={13} /></button>
              <button type="button" className="btn-ghost" style={{ padding: '5px 6px' }} onClick={() => move(i, 1)} disabled={i === items.length - 1}><ChevronDown size={13} /></button>
              <button type="button" className="btn-ghost" style={{ padding: '5px 6px', color: '#ff5c5c' }} onClick={() => delItem(i)} disabled={items.length === 1}><X size={13} /></button>
            </div>
          ))}
          <button type="button" className="btn-ghost" style={{ marginTop: 2 }} onClick={addItem}><Plus size={13} /> Add item</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function Routines() {
  const { isAdmin } = useClient();
  const [routines, setRoutines] = useState([]);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'new' | routine

  const load = useCallback(async () => {
    try { const r = await getRoutines(); setRoutines(r.routines || []); setChecks(r.checks || []); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  usePageActions(() => isAdmin ? (
    <button className="btn-primary" onClick={() => setModal('new')}><Plus size={15} /> New Routine</button>
  ) : null, [isAdmin]);

  const doneMap = useMemo(() => {
    const m = {};
    checks.forEach(c => { m[`${c.item_id}@${c.period_key}`] = c; });
    return m;
  }, [checks]);

  const checkOf = (routine, item) => doneMap[`${item.id}@${periodKey(routine.cadence)}`];

  const toggle = async (routine, item) => {
    const pk = periodKey(routine.cadence);
    const key = `${item.id}@${pk}`;
    const currently = !!doneMap[key];
    setChecks(prev => currently
      ? prev.filter(c => !(c.item_id === item.id && c.period_key === pk))
      : [...prev, { item_id: item.id, period_key: pk, done_by_name: 'You', done_at: new Date().toISOString() }]);
    try { await checkRoutineItem({ routine_id: routine.id, item_id: item.id, period_key: pk, done: !currently }); load(); }
    catch (e) { toast('error', e.message); load(); }
  };

  const remove = async (routine) => {
    if (!window.confirm(`Delete routine "${routine.title}"?`)) return;
    setRoutines(rs => rs.filter(r => r.id !== routine.id));
    try { await deleteRoutine(routine.id); } catch (e) { toast('error', e.message); load(); }
  };

  const grouped = CADENCES.map(c => ({ ...c, list: routines.filter(r => (r.cadence || 'daily') === c.key) }));

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)', padding: '20px 24px' }}>
      {loading ? (
        <div style={{ color: 'var(--muted)' }}>Loading…</div>
      ) : routines.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60, background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <RotateCcw size={26} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div>No routines yet.{isAdmin ? ' Click “New Routine” to build a recurring checklist.' : ''}</div>
        </div>
      ) : grouped.map(group => group.list.length === 0 ? null : (
        <div key={group.key} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <group.icon size={16} style={{ color: group.color }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-display)' }}>{group.label}</span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>resets each {group.resets}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
            {group.list.map(r => {
              const total = (r.items || []).length;
              const doneCount = (r.items || []).filter(it => checkOf(r, it)).length;
              const allDone = total > 0 && doneCount === total;
              const pct = total ? Math.round((doneCount / total) * 100) : 0;
              return (
                <div key={r.id} style={{
                  background: 'var(--surface)', border: `1px solid ${allDone ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`,
                  borderRadius: 14, boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{r.title}</div>
                        {r.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{r.description}</div>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: allDone ? '#16a34a' : 'var(--muted)', flexShrink: 0 }}>{doneCount}/{total}</span>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button className="btn-ghost" style={{ padding: '3px 5px' }} onClick={() => setModal(r)} title="Edit"><Pencil size={12} /></button>
                          <button className="btn-ghost" style={{ padding: '3px 5px', color: '#ff5c5c' }} onClick={() => remove(r)} title="Delete"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                    {/* progress bar */}
                    <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: allDone ? '#16a34a' : group.color, transition: 'width 0.2s' }} />
                    </div>
                  </div>

                  <div style={{ padding: 8 }}>
                    {(r.items || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 10 }}>No items yet.</div>}
                    {(r.items || []).map(it => {
                      const chk = checkOf(r, it);
                      const done = !!chk;
                      return (
                        <div key={it.id} onClick={() => toggle(r, it)} className="todo-row"
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8, cursor: 'pointer' }}>
                          <span style={{
                            width: 19, height: 19, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: done ? '#16a34a' : 'transparent', border: `1.5px solid ${done ? '#16a34a' : 'var(--border-strong, #cbd5e1)'}`,
                          }}>{done && <Check size={12} color="#fff" />}</span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none' }}>{it.text}</span>
                          {done && chk.done_by_name && <span style={{ fontSize: 10.5, color: 'var(--muted)', flexShrink: 0 }}>{chk.done_by_name}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {modal && (
        <RoutineModal
          initial={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
