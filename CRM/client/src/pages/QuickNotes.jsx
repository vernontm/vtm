import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pin, Plus, Trash2, Edit2, Check, X, Copy, ExternalLink, Search, StickyNote } from 'lucide-react';
import { getQuickNotes, createQuickNote, updateQuickNote, deleteQuickNote } from '../api';
import { copyToClipboard } from '../lib/clipboard';

// ── Accent color palette ───────────────────────────────────────────────────────
const COLORS = ['var(--orange)', '#5b9cf6', '#fdab3d', '#ff5c5c', '#784bd1', '#00d1d1', '#ff7575', '#8e8ea0'];

// ── Detect URLs and render them as links ──────────────────────────────────────
function RichContent({ text }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <span>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--orange)', textDecoration: 'underline', wordBreak: 'break-all' }}
          >
            {part}
          </a>
        ) : (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Single note card ──────────────────────────────────────────────────────────
function NoteCard({ note, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [title,   setTitle]   = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [color,   setColor]   = useState(note.color);
  const [copied,  setCopied]  = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus();
      textRef.current.style.height = 'auto';
      textRef.current.style.height = textRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const handleSave = async () => {
    await onUpdate(note.id, { title, content, color });
    setEditing(false);
  };

  const handleCancel = () => {
    setTitle(note.title);
    setContent(note.content);
    setColor(note.color);
    setEditing(false);
  };

  const handleCopy = async () => {
    await copyToClipboard(note.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handlePin = () => onUpdate(note.id, { pinned: !note.pinned });

  // Extract first URL for quick-open button
  const urlMatch = note.content.match(/(https?:\/\/[^\s]+)/);

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${editing ? color : '#e5e7ef'}`,
      borderLeft: `3px solid ${note.color}`,
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      transition: 'border-color 0.15s',
      position: 'relative',
    }}>
      {/* Pin badge */}
      {note.pinned && !editing && (
        <div style={{ position: 'absolute', top: 10, right: 10, color: note.color, opacity: 0.8 }}>
          <Pin size={13} fill={note.color} />
        </div>
      )}

      {editing ? (
        <>
          {/* Title input */}
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title (optional)"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--muted)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          {/* Content textarea */}
          <textarea
            ref={textRef}
            value={content}
            onChange={e => {
              setContent(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            placeholder="Note, link, or anything you want to save..."
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--muted)', fontSize: 13, outline: 'none', width: '100%', resize: 'none', minHeight: 80, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
          {/* Color picker */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Color:</span>
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }}
              />
            ))}
          </div>
          {/* Save/Cancel */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} style={{ flex: 1, background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 7, padding: '7px', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Check size={13} /> Save
            </button>
            <button onClick={handleCancel} className="btn-ghost" style={{ flex: 1, fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          {note.title && (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{note.title}</div>
          )}
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, wordBreak: 'break-word' }}>
            <RichContent text={note.content} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              {new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {urlMatch && (
                <a
                  href={urlMatch[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open link"
                  style={{ display: 'flex', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', color: 'var(--orange)', cursor: 'pointer', textDecoration: 'none' }}
                >
                  <ExternalLink size={12} />
                </a>
              )}
              <button onClick={handleCopy} title="Copy content" style={{ display: 'flex', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', color: copied ? 'var(--orange)' : '#8e8ea0', cursor: 'pointer' }}>
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
              <button onClick={handlePin} title={note.pinned ? 'Unpin' : 'Pin'} style={{ display: 'flex', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', color: note.pinned ? note.color : '#8e8ea0', cursor: 'pointer' }}>
                <Pin size={12} />
              </button>
              <button onClick={() => setEditing(true)} title="Edit" style={{ display: 'flex', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', color: 'var(--muted)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = '#8e8ea0'}
                onMouseLeave={e => e.currentTarget.style.color = '#8e8ea0'}
              >
                <Edit2 size={12} />
              </button>
              <button onClick={() => onDelete(note.id)} title="Delete" style={{ display: 'flex', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', color: 'var(--muted)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
                onMouseLeave={e => e.currentTarget.style.color = '#8e8ea0'}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function QuickNotes() {
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');

  // New note form
  const [newTitle,   setNewTitle]   = useState('');
  const [newContent, setNewContent] = useState('');
  const [newColor,   setNewColor]   = useState('var(--orange)');
  const [adding,     setAdding]     = useState(false);
  const [saving,     setSaving]     = useState(false);
  const newTextRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getQuickNotes();
      setNotes(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      const note = await createQuickNote({ title: newTitle, content: newContent, color: newColor });
      setNotes(prev => [note, ...prev]);
      setNewTitle('');
      setNewContent('');
      setNewColor('var(--orange)');
      setAdding(false);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleUpdate = async (id, updates) => {
    const updated = await updateQuickNote(id, updates);
    setNotes(prev => {
      const next = prev.map(n => n.id === id ? { ...n, ...updated } : n);
      // Re-sort: pinned first, then by updated_at desc
      return [...next].sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return new Date(b.updated_at) - new Date(a.updated_at);
      });
    });
  };

  const handleDelete = async (id) => {
    await deleteQuickNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const q = search.toLowerCase();
  const filtered = notes.filter(n =>
    !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
  );

  const pinned   = filtered.filter(n => n.pinned);
  const unpinned = filtered.filter(n => !n.pinned);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="page-title">Quick Notes</div>
          {notes.length > 0 && (
            <span style={{ background: 'var(--surface-3)', color: 'var(--muted)', borderRadius: 12, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>
              {notes.length}
            </span>
          )}
        </div>
        <button
          onClick={() => { setAdding(true); setTimeout(() => newTextRef.current?.focus(), 50); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
        >
          <Plus size={15} /> New Note
        </button>
      </div>

      <div style={{ padding: '0 28px 28px' }}>

        {/* Add note form */}
        {adding && (
          <div style={{ background: 'var(--surface)', border: `1px solid ${newColor}`, borderLeft: `3px solid ${newColor}`, borderRadius: 10, padding: '16px', marginBottom: 24 }}>
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Title (optional)"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--muted)', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
            />
            <textarea
              ref={newTextRef}
              value={newContent}
              onChange={e => {
                setNewContent(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd(); }}
              placeholder="Paste a link, write a note, save anything you'll need later..."
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', color: 'var(--muted)', fontSize: 13, outline: 'none', width: '100%', resize: 'none', minHeight: 80, boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: newColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                  />
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setAdding(false); setNewTitle(''); setNewContent(''); }} className="btn-ghost" style={{ fontSize: 13 }}>
                <X size={13} /> Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newContent.trim() || saving}
                style={{ background: newContent.trim() ? 'var(--orange)' : 'var(--surface-3)', color: 'var(--text)', border: 'none', borderRadius: 8, padding: '7px 18px', cursor: newContent.trim() ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 13 }}
              >
                {saving ? 'Saving...' : 'Save Note'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Tip: ⌘↵ to save quickly</div>
          </div>
        )}

        {/* Search */}
        {notes.length > 0 && (
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notes..."
              style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px 8px 32px', color: 'var(--muted)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60, fontSize: 14 }}>Loading notes...</div>
        ) : notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <StickyNote size={40} style={{ color: 'var(--border-light)', marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>No notes yet</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>Save links, credentials, snippets — anything you want to reuse.</div>
            <button
              onClick={() => { setAdding(true); setTimeout(() => newTextRef.current?.focus(), 50); }}
              style={{ background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
            >
              <Plus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Add your first note
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)', fontSize: 14 }}>No notes match "{search}"</div>
        ) : (
          <>
            {/* Pinned */}
            {pinned.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Pin size={11} /> Pinned
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
                  {pinned.map(n => (
                    <NoteCard key={n.id} note={n} onUpdate={handleUpdate} onDelete={handleDelete} />
                  ))}
                </div>
              </>
            )}

            {/* All / unpinned */}
            {unpinned.length > 0 && (
              <>
                {pinned.length > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                    Notes
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {unpinned.map(n => (
                    <NoteCard key={n.id} note={n} onUpdate={handleUpdate} onDelete={handleDelete} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
