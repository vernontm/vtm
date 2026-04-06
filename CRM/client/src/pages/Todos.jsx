import React, { useState, useEffect, useRef } from 'react';
import { Plus, ChevronDown, ChevronRight, Trash2, Check, Briefcase } from 'lucide-react';
import {
  getTodoGroups, createTodoGroup, updateTodoGroup, deleteTodoGroup,
  getTodos, createTodo, updateTodo, deleteTodo,
  getDeals,
} from '../api';

const STATUSES   = ['Not Started', 'Working on it', 'Done', 'Stuck', 'In Review'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const GROUP_COLORS = ['#ff9b26', '#5b9cf6', '#fdab3d', '#ff5c5c', '#784bd1', '#00d1d1', '#e86df5', '#f5a623'];

const STATUS_STYLE = {
  'Not Started':   { background: 'rgba(74,72,69,0.35)',   color: '#7a7870' },
  'Working on it': { background: 'rgba(253,171,61,0.15)', color: '#fdab3d' },
  'Done':          { background: 'rgba(255,155,38,0.12)', color: '#ff9b26' },
  'Stuck':         { background: 'rgba(255,92,92,0.15)',  color: '#ff5c5c' },
  'In Review':     { background: 'rgba(91,156,246,0.15)', color: '#5b9cf6' },
};

const PRIORITY_STYLE = {
  'Critical': { background: 'rgba(255,92,92,0.15)',  color: '#ff5c5c' },
  'High':     { background: 'rgba(253,171,61,0.15)', color: '#fdab3d' },
  'Medium':   { background: 'rgba(91,156,246,0.15)', color: '#5b9cf6' },
  'Low':      { background: 'rgba(74,72,69,0.35)',   color: '#7a7870' },
};

function nextVal(arr, cur) {
  return arr[(arr.indexOf(cur) + 1) % arr.length];
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Inline text cell ──────────────────────────────────────────────────────────
function EditableCell({ value, onSave, placeholder = '—', style = {} }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(value || '');
  const ref                   = useRef();

  function commit() {
    setEditing(false);
    if (val.trim() !== (value || '')) onSave(val.trim());
  }

  if (editing) {
    return (
      <input
        ref={ref}
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value || ''); setEditing(false); } }}
        style={{
          background: '#1c1c1a', border: '1px solid rgba(255,155,38,0.35)', borderRadius: 4,
          color: '#e8e6df', fontSize: 13, padding: '3px 7px', width: '100%', outline: 'none',
          fontFamily: 'Poppins, sans-serif', ...style,
        }}
      />
    );
  }

  return (
    <span
      onClick={() => { setVal(value || ''); setEditing(true); }}
      title="Click to edit"
      style={{ cursor: 'text', color: value ? '#e8e6df' : '#4a4845', fontSize: 13, display: 'block', width: '100%', ...style }}
    >
      {value || placeholder}
    </span>
  );
}

// ── Date cell ─────────────────────────────────────────────────────────────────
function DateCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <input
        type="date"
        autoFocus
        defaultValue={value || ''}
        onBlur={e => { onSave(e.target.value); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Escape') setEditing(false); }}
        style={{
          background: '#1c1c1a', border: '1px solid rgba(255,155,38,0.35)', borderRadius: 4,
          color: '#e8e6df', fontSize: 12, padding: '3px 6px', outline: 'none',
          fontFamily: 'DM Mono, monospace', colorScheme: 'dark',
        }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to set date"
      style={{ cursor: 'pointer', fontSize: 12, color: value ? '#e8e6df' : '#4a4845', fontFamily: 'DM Mono, monospace' }}
    >
      {value ? formatDate(value) : '—'}
    </span>
  );
}

// ── Color picker ──────────────────────────────────────────────────────────────
function ColorPicker({ color, onChange }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Change color"
        style={{
          width: 14, height: 14, borderRadius: 3, background: color,
          border: 'none', cursor: 'pointer', flexShrink: 0, display: 'block',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: 20, left: 0, zIndex: 100,
          background: '#1c1c1a', border: '1px solid #252523', borderRadius: 8,
          padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap', width: 120,
        }}>
          {GROUP_COLORS.map(c => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false); }}
              style={{
                width: 20, height: 20, borderRadius: 4, background: c, border: 'none', cursor: 'pointer',
                outline: c === color ? '2px solid #e8e6df' : 'none', outlineOffset: 1,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Badge dropdown ────────────────────────────────────────────────────────────
function BadgeDropdown({ value, options, styleMap, onChange }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const s = styleMap[value] || { background: '#252523', color: '#7a7870' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          ...s, border: 'none', cursor: 'pointer', borderRadius: 5,
          fontSize: 11, fontWeight: 600, padding: '3px 8px',
          fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap',
          display: 'inline-block',
        }}
      >
        {value}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
          background: '#161614', border: '1px solid #252523', borderRadius: 8,
          padding: 4, minWidth: 140,
        }}>
          {options.map(opt => {
            const os = styleMap[opt] || { background: '#252523', color: '#7a7870' };
            return (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none',
                  background: 'none', cursor: 'pointer', padding: '5px 8px', borderRadius: 5,
                  marginBottom: 2,
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#252523'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{
                  ...os, borderRadius: 4, padding: '2px 7px',
                  fontSize: 11, fontWeight: 600, fontFamily: 'DM Mono, monospace',
                }}>
                  {opt}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Column header labels ──────────────────────────────────────────────────────
const COL_LABEL = { fontSize: 11, color: '#4a4845', fontWeight: 600, fontFamily: 'DM Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em' };

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Todos() {
  const [groups,       setGroups]       = useState([]);
  const [todos,        setTodos]        = useState([]);
  const [dealMap,      setDealMap]      = useState({}); // { id: name }
  const [collapsed,    setCollapsed]    = useState({});
  const [addingGroup,  setAddingGroup]  = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [addingTask,   setAddingTask]   = useState(null); // group_id
  const [newTaskTitle, setNewTaskTitle] = useState('');

  async function load() {
    const [g, t, deals] = await Promise.all([getTodoGroups(), getTodos(), getDeals()]);
    setGroups(g);
    setTodos(t);
    const dm = {};
    deals.forEach(d => { dm[d.id] = d.name; });
    setDealMap(dm);
  }

  useEffect(() => { load(); }, []);

  // ── Group actions ────────────────────────────────────────────────────────────
  async function handleAddGroup() {
    if (!newGroupName.trim()) return;
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
    await createTodoGroup({ name: newGroupName.trim(), color });
    setNewGroupName('');
    setAddingGroup(false);
    load();
  }

  async function handleUpdateGroup(id, data) {
    await updateTodoGroup(id, data);
    setGroups(g => g.map(x => x.id === id ? { ...x, ...data } : x));
  }

  async function handleDeleteGroup(id) {
    if (!window.confirm('Delete this group and all its tasks?')) return;
    await deleteTodoGroup(id);
    setGroups(g => g.filter(x => x.id !== id));
    setTodos(t => t.filter(x => x.group_id !== id));
  }

  // ── Todo actions ─────────────────────────────────────────────────────────────
  async function handleAddTask(group_id) {
    if (!newTaskTitle.trim()) { setAddingTask(null); return; }
    const todo = await createTodo({ group_id, title: newTaskTitle.trim() });
    setTodos(t => [...t, todo]);
    setNewTaskTitle('');
    setAddingTask(null);
  }

  async function handleUpdateTodo(id, data) {
    await updateTodo(id, data);
    setTodos(t => t.map(x => x.id === id ? { ...x, ...data } : x));
  }

  async function handleDeleteTodo(id) {
    await deleteTodo(id);
    setTodos(t => t.filter(x => x.id !== id));
  }

  const ROW_GRID = '36px 1fr 150px 110px 115px 110px 36px';

  function ColHeaders() {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: ROW_GRID,
        padding: '6px 0', borderBottom: '1px solid #1c1c1a',
        marginBottom: 2,
      }}>
        <div />
        <div style={COL_LABEL}>Task</div>
        <div style={COL_LABEL}>Status</div>
        <div style={COL_LABEL}>Priority</div>
        <div style={COL_LABEL}>Due Date</div>
        <div style={COL_LABEL}>Owner</div>
        <div />
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px', minHeight: '100vh', background: '#0a0a08' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e8e6df', fontFamily: 'Poppins, sans-serif', margin: 0 }}>
          Todo Board
        </h1>
        <button
          className="btn-primary"
          onClick={() => { setAddingGroup(true); setTimeout(() => document.getElementById('new-group-input')?.focus(), 50); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
        >
          <Plus size={14} /> New Group
        </button>
      </div>

      {/* New group input */}
      {addingGroup && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
          background: '#161614', border: '1px solid rgba(255,155,38,0.25)', borderRadius: 8, padding: '10px 14px',
        }}>
          <input
            id="new-group-input"
            autoFocus
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddGroup();
              if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName(''); }
            }}
            placeholder="Group name…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: '#e8e6df', fontSize: 14, fontFamily: 'Poppins, sans-serif',
            }}
          />
          <button className="btn-primary" onClick={handleAddGroup} style={{ fontSize: 12, padding: '5px 14px' }}>Add</button>
          <button className="btn-ghost" onClick={() => { setAddingGroup(false); setNewGroupName(''); }} style={{ fontSize: 12, padding: '5px 12px' }}>Cancel</button>
        </div>
      )}

      {/* Empty state */}
      {groups.length === 0 && !addingGroup && todos.filter(t => t.deal_id).length === 0 && (
        <div style={{ textAlign: 'center', padding: '100px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e6df', fontFamily: 'Poppins, sans-serif', marginBottom: 8 }}>
            No groups yet
          </div>
          <div style={{ fontSize: 13, color: '#4a4845', marginBottom: 20 }}>
            Create a group to start organizing your tasks, or add tasks from the Deals page
          </div>
          <button className="btn-primary" onClick={() => setAddingGroup(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Group
          </button>
        </div>
      )}

      {/* ── Deal Tasks section ─────────────────────────────────────────────── */}
      {(() => {
        const dealTodos = todos.filter(t => t.deal_id);
        if (dealTodos.length === 0) return null;
        const isCollapsed = !!collapsed['__deal_tasks__'];
        const doneCount   = dealTodos.filter(t => t.completed).length;

        // Group by deal
        const byDeal = {};
        dealTodos.forEach(t => {
          if (!byDeal[t.deal_id]) byDeal[t.deal_id] = [];
          byDeal[t.deal_id].push(t);
        });

        return (
          <div style={{ marginBottom: 32 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: '2px solid #5b9cf6' }}>
              <button
                onClick={() => setCollapsed(c => ({ ...c, '__deal_tasks__': !c['__deal_tasks__'] }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5b9cf6', padding: 0, display: 'flex', alignItems: 'center' }}
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <Briefcase size={14} style={{ color: '#5b9cf6', flexShrink: 0 }} />
              <span style={{ color: '#5b9cf6', fontSize: 15, fontWeight: 700, fontFamily: 'Poppins, sans-serif' }}>Deal Tasks</span>
              <span style={{ color: '#4a4845', fontSize: 12, fontFamily: 'DM Mono, monospace' }}>
                {dealTodos.length} {dealTodos.length === 1 ? 'item' : 'items'} · {doneCount} done
              </span>
            </div>

            {!isCollapsed && (
              <div style={{ background: '#111110', borderRadius: '0 0 8px 8px', overflow: 'hidden', border: '1px solid #1c1c1a', borderTop: 'none' }}>
                <ColHeaders />
                {Object.entries(byDeal).map(([dealId, dealTodoList]) => (
                  <React.Fragment key={dealId}>
                    {/* Deal sub-header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 8px 5px 36px', background: '#0e0e0c',
                      borderBottom: '1px solid #1a1a18',
                    }}>
                      <Briefcase size={11} style={{ color: '#5b9cf6', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#5b9cf6', fontFamily: 'DM Mono, monospace' }}>
                        {dealMap[dealId] || 'Deal'}
                      </span>
                      <span style={{ fontSize: 10, color: '#4a4845', fontFamily: 'DM Mono, monospace' }}>
                        {dealTodoList.filter(t => t.completed).length}/{dealTodoList.length}
                      </span>
                    </div>
                    {dealTodoList.map((todo, idx) => (
                      <div
                        key={todo.id}
                        style={{
                          display: 'grid', gridTemplateColumns: ROW_GRID,
                          alignItems: 'center', padding: '7px 0',
                          borderBottom: '1px solid #1a1a18',
                          background: todo.completed ? 'rgba(255,155,38,0.02)' : 'transparent',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#161614'}
                        onMouseLeave={e => e.currentTarget.style.background = todo.completed ? 'rgba(255,155,38,0.02)' : 'transparent'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleUpdateTodo(todo.id, { completed: !todo.completed })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                          >
                            {todo.completed
                              ? <div style={{ width: 16, height: 16, borderRadius: 4, background: '#ff9b26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} color="#0a0a08" strokeWidth={3} /></div>
                              : <div style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid #3a3a38' }} />
                            }
                          </button>
                        </div>
                        <div style={{ paddingRight: 16 }}>
                          <EditableCell
                            value={todo.title}
                            onSave={val => handleUpdateTodo(todo.id, { title: val })}
                            style={{ textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? '#4a4845' : '#e8e6df' }}
                          />
                        </div>
                        <div>
                          <BadgeDropdown value={todo.status || 'Not Started'} options={STATUSES} styleMap={STATUS_STYLE} onChange={val => handleUpdateTodo(todo.id, { status: val })} />
                        </div>
                        <div>
                          <BadgeDropdown value={todo.priority || 'Medium'} options={PRIORITIES} styleMap={PRIORITY_STYLE} onChange={val => handleUpdateTodo(todo.id, { priority: val })} />
                        </div>
                        <div>
                          <DateCell value={todo.due_date} onSave={val => handleUpdateTodo(todo.id, { due_date: val })} />
                        </div>
                        <div style={{ paddingRight: 8 }}>
                          <EditableCell value={todo.owner} onSave={val => handleUpdateTodo(todo.id, { owner: val })} placeholder="—" style={{ fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleDeleteTodo(todo.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e2e2b', padding: 0, display: 'flex', transition: 'color 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
                            onMouseLeave={e => e.currentTarget.style.color = '#2e2e2b'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Groups */}
      {groups.map(group => {
        const groupTodos = todos.filter(t => t.group_id === group.id && !t.deal_id);
        const isCollapsed = !!collapsed[group.id];
        const doneCount  = groupTodos.filter(t => t.completed).length;

        return (
          <div key={group.id} style={{ marginBottom: 32 }}>

            {/* Group header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              paddingBottom: 8,
              borderBottom: `2px solid ${group.color}`,
            }}>
              {/* Collapse toggle */}
              <button
                onClick={() => setCollapsed(c => ({ ...c, [group.id]: !c[group.id] }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: group.color, padding: 0, display: 'flex', alignItems: 'center' }}
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>

              {/* Color picker */}
              <ColorPicker color={group.color} onChange={c => handleUpdateGroup(group.id, { color: c })} />

              {/* Group name (inline edit) */}
              <EditableCell
                value={group.name}
                onSave={val => handleUpdateGroup(group.id, { name: val })}
                style={{ fontWeight: 700, fontSize: 15, color: group.color, fontFamily: 'Poppins, sans-serif' }}
              />

              <span style={{ color: '#4a4845', fontSize: 12, fontFamily: 'DM Mono, monospace', whiteSpace: 'nowrap' }}>
                {groupTodos.length} {groupTodos.length === 1 ? 'item' : 'items'}
                {doneCount > 0 && ` · ${doneCount} done`}
              </span>

              <div style={{ flex: 1 }} />

              {/* Add task */}
              <button
                onClick={() => { setAddingTask(group.id); setNewTaskTitle(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: `1px solid ${group.color}33`, borderRadius: 6,
                  color: group.color, fontSize: 12, padding: '4px 10px', cursor: 'pointer',
                  fontFamily: 'Poppins, sans-serif', fontWeight: 600,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = `${group.color}11`}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <Plus size={12} /> Add Task
              </button>

              {/* Delete group */}
              <button
                onClick={() => handleDeleteGroup(group.id)}
                title="Delete group"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', padding: '4px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
                onMouseLeave={e => e.currentTarget.style.color = '#4a4845'}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Tasks */}
            {!isCollapsed && (
              <div style={{ background: '#111110', borderRadius: '0 0 8px 8px', overflow: 'hidden', border: '1px solid #1c1c1a', borderTop: 'none' }}>
                <ColHeaders />

                {groupTodos.length === 0 && addingTask !== group.id && (
                  <div style={{ padding: '14px 0 14px 36px', color: '#4a4845', fontSize: 13 }}>
                    No tasks — click "Add Task" to get started
                  </div>
                )}

                {groupTodos.map((todo, idx) => (
                  <div
                    key={todo.id}
                    style={{
                      display: 'grid', gridTemplateColumns: ROW_GRID,
                      alignItems: 'center', padding: '7px 0',
                      borderBottom: idx < groupTodos.length - 1 ? '1px solid #1a1a18' : 'none',
                      background: todo.completed ? 'rgba(255,155,38,0.02)' : 'transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#161614'}
                    onMouseLeave={e => e.currentTarget.style.background = todo.completed ? 'rgba(255,155,38,0.02)' : 'transparent'}
                  >
                    {/* Checkbox */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleUpdateTodo(todo.id, { completed: !todo.completed })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: todo.completed ? '#ff9b26' : '#4a4845', padding: 0, display: 'flex' }}
                      >
                        {todo.completed
                          ? <div style={{ width: 16, height: 16, borderRadius: 4, background: '#ff9b26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} color="#0a0a08" strokeWidth={3} /></div>
                          : <div style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px solid #3a3a38' }} />
                        }
                      </button>
                    </div>

                    {/* Task name */}
                    <div style={{ paddingRight: 16 }}>
                      <EditableCell
                        value={todo.title}
                        onSave={val => handleUpdateTodo(todo.id, { title: val })}
                        style={{ textDecoration: todo.completed ? 'line-through' : 'none', color: todo.completed ? '#4a4845' : '#e8e6df' }}
                      />
                    </div>

                    {/* Status */}
                    <div>
                      <BadgeDropdown
                        value={todo.status || 'Not Started'}
                        options={STATUSES}
                        styleMap={STATUS_STYLE}
                        onChange={val => handleUpdateTodo(todo.id, { status: val })}
                      />
                    </div>

                    {/* Priority */}
                    <div>
                      <BadgeDropdown
                        value={todo.priority || 'Medium'}
                        options={PRIORITIES}
                        styleMap={PRIORITY_STYLE}
                        onChange={val => handleUpdateTodo(todo.id, { priority: val })}
                      />
                    </div>

                    {/* Due Date */}
                    <div>
                      <DateCell
                        value={todo.due_date}
                        onSave={val => handleUpdateTodo(todo.id, { due_date: val })}
                      />
                    </div>

                    {/* Owner */}
                    <div style={{ paddingRight: 8 }}>
                      <EditableCell
                        value={todo.owner}
                        onSave={val => handleUpdateTodo(todo.id, { owner: val })}
                        placeholder="—"
                        style={{ fontSize: 12, color: todo.owner ? '#e8e6df' : '#4a4845' }}
                      />
                    </div>

                    {/* Delete */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <button
                        onClick={() => handleDeleteTodo(todo.id)}
                        title="Delete task"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e2e2b', padding: 0, display: 'flex', transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
                        onMouseLeave={e => e.currentTarget.style.color = '#2e2e2b'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* New task input row */}
                {addingTask === group.id ? (
                  <div style={{
                    display: 'grid', gridTemplateColumns: ROW_GRID, alignItems: 'center',
                    padding: '7px 0', borderTop: groupTodos.length > 0 ? '1px solid #1a1a18' : 'none',
                    background: '#161614',
                  }}>
                    <div />
                    <div style={{ paddingRight: 16 }}>
                      <input
                        autoFocus
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddTask(group.id);
                          if (e.key === 'Escape') setAddingTask(null);
                        }}
                        onBlur={() => handleAddTask(group.id)}
                        placeholder="Task name…"
                        style={{
                          width: '100%', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,155,38,0.35)',
                          outline: 'none', color: '#e8e6df', fontSize: 13, fontFamily: 'Poppins, sans-serif',
                          padding: '2px 0',
                        }}
                      />
                    </div>
                    <div style={{ color: '#4a4845', fontSize: 11, fontFamily: 'DM Mono, monospace' }}>↵ to add</div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingTask(group.id); setNewTaskTitle(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845',
                      fontSize: 13, padding: '9px 0 9px 36px', fontFamily: 'Poppins, sans-serif',
                      borderTop: groupTodos.length > 0 ? '1px solid #1a1a18' : 'none',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#e8e6df'}
                    onMouseLeave={e => e.currentTarget.style.color = '#4a4845'}
                  >
                    <Plus size={13} /> Add Task
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
