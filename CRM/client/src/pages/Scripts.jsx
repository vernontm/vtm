import React, { useState, useEffect } from 'react';
import { FileText, Plus, Edit2, Trash2, Check, X, Copy, ChevronDown, ChevronRight, Loader, Search } from 'lucide-react';
import { getScripts, createScript, updateScript, deleteScript } from '../api';
import { copyToClipboard } from '../lib/clipboard';
import { useTeam } from '../context/TeamContext';

const CATEGORIES = ['General', 'Cold Call', 'Follow Up', 'Discovery', 'Closing', 'Objection Handling', 'Other'];

const CAT_COLORS = {
  'General':             { bg: 'rgba(74,108,247,0.15)', fg: '#7ba7ff' },
  'Cold Call':           { bg: '#784bd122', fg: '#784bd1' },
  'Follow Up':           { bg: '#fdab3d22', fg: '#d97706' },
  'Discovery':           { bg: '#00d1d122', fg: '#00a8a8' },
  'Closing':             { bg: '#22c55e22', fg: '#16a34a' },
  'Objection Handling':  { bg: '#ff5c5c22', fg: '#ff5c5c' },
  'Other':               { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af' },
};

// ── Script Form (inline) ───────────────────────────────────────────────────────
function ScriptForm({ initial, onSave, onCancel }) {
  const [title,    setTitle]    = useState(initial?.title    || '');
  const [content,  setContent]  = useState(initial?.content  || '');
  const [category, setCategory] = useState(initial?.category || 'General');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function handleSave() {
    if (!title.trim()) return setError('Title is required');
    if (!content.trim()) return setError('Script content is required');
    setError('');
    setSaving(true);
    try { await onSave({ title: title.trim(), content: content.trim(), category }); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '16px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
      {error && (
        <div style={{ marginBottom: 12, background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ff5c5c' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Script Title *</label>
          <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Initial Cold Call Opener" autoFocus />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Category</label>
          <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Script *</label>
        <textarea
          style={{ ...inputStyle, resize: 'vertical', minHeight: 160, lineHeight: 1.65 }}
          maxLength={10000}
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="Write the full script here. Use [brackets] for variable parts like [Lead Name] or [Company]..."
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Check size={13} />}
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Script'}
        </button>
      </div>
    </div>
  );
}

// ── Script Row ─────────────────────────────────────────────────────────────────
function ScriptRow({ script, isOwner, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [copied,   setCopied]   = useState(false);
  const catStyle = CAT_COLORS[script.category] || CAT_COLORS.Other;

  function handleCopy() {
    copyToClipboard(script.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  // Highlight [placeholders] in the script content
  function renderScript(text) {
    const parts = text.split(/(\[[^\]]+\])/g);
    return parts.map((part, i) =>
      /^\[.+\]$/.test(part)
        ? <mark key={i} style={{ background: 'rgba(253,171,61,0.2)', color: '#fdab3d', borderRadius: 3, padding: '0 2px', fontWeight: 600 }}>{part}</mark>
        : part
    );
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Row header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.1s', background: expanded ? 'var(--surface-2)' : 'var(--surface)' }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'var(--surface)'; }}
      >
        <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>
        <FileText size={15} color={catStyle.fg} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 0 }}>
          {script.title}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 8, background: catStyle.bg, color: catStyle.fg, flexShrink: 0 }}>
          {script.category}
        </span>
        {/* Preview when collapsed */}
        {!expanded && (
          <span style={{ fontSize: 12, color: 'var(--muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1 }}>
            {script.content.slice(0, 100)}{script.content.length > 100 ? '…' : ''}
          </span>
        )}
        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            onClick={handleCopy}
            title="Copy script"
            style={{ background: copied ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)', border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, borderRadius: 6, cursor: 'pointer', padding: '4px 9px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: copied ? '#4ade80' : 'var(--muted)', fontWeight: 600, transition: 'all 0.15s' }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          {isOwner && (
            <>
              <button
                onClick={() => onEdit(script)}
                title="Edit"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center', color: 'var(--muted)' }}
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={() => onDelete(script)}
                title="Delete"
                style={{ background: 'rgba(255,92,92,0.1)', border: '1px solid rgba(255,92,92,0.2)', borderRadius: 6, cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center', color: '#ff5c5c' }}
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 20px 20px 48px', background: 'var(--surface-2)' }}>
          <pre style={{
            margin: 0, padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, fontSize: 13, color: 'var(--text)', lineHeight: 1.75,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit',
          }}>
            {renderScript(script.content)}
          </pre>
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={handleCopy}
              style={{ padding: '6px 14px', borderRadius: 7, border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, background: copied ? 'rgba(34,197,94,0.1)' : 'var(--surface-2)', color: copied ? '#4ade80' : 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied to clipboard!' : 'Copy full script'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{script.content.length} characters · {script.content.split(/\s+/).filter(Boolean).length} words</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Scripts() {
  const { isOwner } = useTeam();
  const [scripts,    setScripts]   = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [showAdd,    setShowAdd]   = useState(false);
  const [editScript, setEditScript] = useState(null);
  const [search,     setSearch]    = useState('');
  const [activeTab,  setActiveTab] = useState('All');
  const [toast,      setToast]     = useState('');

  useEffect(() => {
    getScripts()
      .then(setScripts)
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleAdd(data) {
    const created = await createScript(data);
    setScripts(prev => [...prev, created]);
    setShowAdd(false);
    showToast('Script added');
  }

  async function handleEdit(data) {
    const updated = await updateScript(editScript.id, data);
    setScripts(prev => prev.map(s => s.id === editScript.id ? { ...s, ...updated } : s));
    setEditScript(null);
    showToast('Script updated');
  }

  async function handleDelete(script) {
    if (!window.confirm(`Delete "${script.title}"?`)) return;
    await deleteScript(script.id);
    setScripts(prev => prev.filter(s => s.id !== script.id));
    showToast('Script deleted');
  }

  const presentCats = ['All', ...CATEGORIES.filter(c => scripts.some(s => s.category === c))];

  const filtered = scripts.filter(s => {
    const matchCat = activeTab === 'All' || s.category === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q || s.title.toLowerCase().includes(q) || s.content.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  return (
    <div style={{ padding: 24, minHeight: '100%', background: 'var(--bg)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={22} color="var(--orange)" />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Call Scripts</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Scripts for the team to use during calls</div>
          </div>
        </div>
        {isOwner && !showAdd && !editScript && (
          <button
            onClick={() => setShowAdd(true)}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '9px 16px' }}
          >
            <Plus size={14} /> Add Script
          </button>
        )}
      </div>

      {/* Add Script form */}
      {showAdd && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={14} color="var(--orange)" />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>New Script</span>
          </div>
          <ScriptForm onSave={handleAdd} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {/* Main card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 7, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Search scripts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {presentCats.map(cat => {
              const active = activeTab === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer', border: `1px solid ${active ? 'var(--orange)' : 'var(--border)'}`, background: active ? 'var(--orange)' : 'var(--surface-2)', color: active ? '#fff' : 'var(--muted)', transition: 'all 0.12s' }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
            {filtered.length} script{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Script rows */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 140, color: 'var(--muted)', gap: 10 }}>
            <Loader size={17} style={{ animation: 'spin 0.7s linear infinite' }} /> Loading scripts…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <FileText size={40} style={{ opacity: 0.2, marginBottom: 14 }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
              {scripts.length === 0 ? 'No scripts yet' : 'No scripts match your search'}
            </div>
            {isOwner && scripts.length === 0 && (
              <button
                onClick={() => setShowAdd(true)}
                style={{ marginTop: 12, padding: '9px 20px', borderRadius: 8, background: 'var(--orange)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                + Add First Script
              </button>
            )}
          </div>
        ) : (
          filtered.map(script =>
            editScript?.id === script.id ? (
              <div key={script.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '12px 20px', background: 'rgba(255,155,38,0.08)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Edit2 size={13} color="var(--orange)" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)' }}>Editing: {script.title}</span>
                </div>
                <ScriptForm initial={editScript} onSave={handleEdit} onCancel={() => setEditScript(null)} />
              </div>
            ) : (
              <ScriptRow
                key={script.id}
                script={script}
                isOwner={isOwner}
                onEdit={s => { setEditScript(s); setShowAdd(false); }}
                onDelete={handleDelete}
              />
            )
          )
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--orange)', color: 'var(--text)', padding: '10px 20px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={14} color="var(--orange)" /> {toast}
        </div>
      )}
    </div>
  );
}
