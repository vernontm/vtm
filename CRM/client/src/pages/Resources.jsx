import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, Eye, EyeOff, Save, X, Search, Youtube,
  Code, ChevronUp, ChevronDown, Copy, ExternalLink, FileCode,
} from 'lucide-react';
import {
  getTraderResources, createTraderResource, updateTraderResource, deleteTraderResource,
} from '../api';
import { usePageActions } from '../context/UiContext';

const emptyResource = {
  title: '',
  description: '',
  tag: 'AI Prompt',
  emoji: '📊',
  youtube_url: '',
  iframe_src: '',
  code_blocks: [],
  sort_order: 0,
  published: true,
};

const emptyBlock = { label: 'Part 1', language: 'markdown', code: '' };

const LANGUAGES = ['markdown', 'python', 'javascript', 'typescript', 'bash', 'json', 'html', 'css', 'sql', 'text'];

export default function Resources() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null);
  const [search, setSearch]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const data = await getTraderResources();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load resources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNew = () => setEditing({ ...emptyResource, code_blocks: [{ ...emptyBlock }] });
  const handleEdit = (r) => setEditing({ ...r, code_blocks: Array.isArray(r.code_blocks) ? r.code_blocks : [] });
  const handleCancel = () => setEditing(null);

  const handleSave = async () => {
    if (!editing.title.trim()) { alert('Title is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...editing,
        code_blocks: (editing.code_blocks || []).filter(b => (b.code || '').trim()),
      };
      if (editing.id) {
        const { id, created_at, updated_at, ...data } = payload;
        await updateTraderResource(id, data);
      } else {
        await createTraderResource(payload);
      }
      setEditing(null);
      await load();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this resource?')) return;
    try {
      await deleteTraderResource(id);
      await load();
    } catch (err) { alert('Delete failed: ' + err.message); }
  };

  const handleTogglePublish = async (r) => {
    try {
      await updateTraderResource(r.id, { published: !r.published });
      await load();
    } catch (err) { alert(err.message); }
  };

  // Editor helpers for code blocks
  const addBlock = () => {
    const next = [...(editing.code_blocks || [])];
    next.push({ ...emptyBlock, label: `Part ${next.length + 1}` });
    setEditing({ ...editing, code_blocks: next });
  };
  const updateBlock = (i, field, val) => {
    const next = [...(editing.code_blocks || [])];
    next[i] = { ...next[i], [field]: val };
    setEditing({ ...editing, code_blocks: next });
  };
  const removeBlock = (i) => {
    const next = [...(editing.code_blocks || [])];
    next.splice(i, 1);
    setEditing({ ...editing, code_blocks: next });
  };
  const moveBlock = (i, dir) => {
    const next = [...(editing.code_blocks || [])];
    const target = i + dir;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    setEditing({ ...editing, code_blocks: next });
  };

  usePageActions(() => !editing ? (
    <button onClick={handleNew} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <Plus size={14} /> New Resource
    </button>
  ) : null, [editing]);

  const filtered = items.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (i.title || '').toLowerCase().includes(q) || (i.tag || '').toLowerCase().includes(q);
  });

  // ── Editor View ──────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div style={{ padding: '20px 28px 40px', maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileCode size={18} style={{ color: 'var(--orange)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              {editing.id ? 'Edit Resource' : 'New Resource'}
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCancel} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <X size={14} /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save Resource'}
            </button>
          </div>
        </div>

        {/* Basic fields */}
        <Section title="Overview">
          <Row>
            <Field label="Emoji" width={80}>
              <input value={editing.emoji || ''} onChange={e => setEditing({ ...editing, emoji: e.target.value })}
                style={{ ...inputStyle, textAlign: 'center', fontSize: 22 }} maxLength={4} />
            </Field>
            <Field label="Tag" width={160}>
              <input value={editing.tag || ''} onChange={e => setEditing({ ...editing, tag: e.target.value })}
                placeholder="AI Prompt" style={inputStyle} />
            </Field>
            <Field label="Sort Order" width={110}>
              <input type="number" value={editing.sort_order ?? 0} onChange={e => setEditing({ ...editing, sort_order: parseInt(e.target.value) || 0 })}
                style={inputStyle} />
            </Field>
            <Field label="Published" width={110}>
              <button onClick={() => setEditing({ ...editing, published: !editing.published })}
                style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: editing.published ? '#4ade80' : 'var(--muted)' }}>
                {editing.published ? <><Eye size={13} /> Live</> : <><EyeOff size={13} /> Draft</>}
              </button>
            </Field>
          </Row>

          <Field label="Title">
            <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}
              placeholder="Trading Dashboard Prompt" style={inputStyle} />
          </Field>

          <Field label="Description">
            <textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })}
              placeholder="A short 1–2 sentence description shown on the card." rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </Field>
        </Section>

        {/* Media */}
        <Section title="Media (optional)">
          <Field label={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Youtube size={13} style={{ color: '#ff5c5c' }} /> YouTube URL</span>}>
            <input value={editing.youtube_url || ''} onChange={e => setEditing({ ...editing, youtube_url: e.target.value })}
              placeholder="https://www.youtube.com/watch?v=…" style={inputStyle} />
            <div style={hintStyle}>Shown as an embedded video inside the resource modal.</div>
          </Field>

          <Field label="Claude Artifact / iframe URL">
            <input value={editing.iframe_src || ''} onChange={e => setEditing({ ...editing, iframe_src: e.target.value })}
              placeholder="https://claude.site/public/artifacts/…/embed" style={inputStyle} />
            <div style={hintStyle}>Optional — embed a Claude artifact or any iframe-friendly URL.</div>
          </Field>
        </Section>

        {/* Code blocks */}
        <Section
          title="Code Blocks"
          action={
            <button onClick={addBlock} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <Plus size={13} /> Add Part
            </button>
          }
        >
          {(editing.code_blocks || []).length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
              No code blocks yet — add Part 1 to get started.
            </div>
          )}
          {(editing.code_blocks || []).map((b, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Code size={14} style={{ color: 'var(--orange)' }} />
                <input value={b.label || ''} onChange={e => updateBlock(i, 'label', e.target.value)}
                  placeholder={`Part ${i + 1}`}
                  style={{ ...inputStyle, flex: 1, fontWeight: 700 }} />
                <select value={b.language || 'markdown'} onChange={e => updateBlock(i, 'language', e.target.value)}
                  style={{ ...inputStyle, width: 140 }}>
                  {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button onClick={() => moveBlock(i, -1)} disabled={i === 0} title="Move up"
                  style={iconBtn}><ChevronUp size={14} /></button>
                <button onClick={() => moveBlock(i, 1)} disabled={i === (editing.code_blocks.length - 1)} title="Move down"
                  style={iconBtn}><ChevronDown size={14} /></button>
                <button onClick={() => removeBlock(i)} title="Remove"
                  style={{ ...iconBtn, color: '#ff5c5c' }}><Trash2 size={14} /></button>
              </div>
              <textarea value={b.code || ''} onChange={e => updateBlock(i, 'code', e.target.value)}
                placeholder="Paste code, prompt, or markdown here…"
                rows={10}
                style={{
                  ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12, lineHeight: 1.55, background: 'var(--bg)',
                }} />
            </div>
          ))}
        </Section>

        {error && <div style={{ color: '#f87171', fontSize: 13, marginTop: 10 }}>{error}</div>}
      </div>
    );
  }

  // ── List View ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search resources…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} of {items.length}</span>
      </div>

      <div style={{ padding: '20px 28px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60, fontSize: 14 }}>Loading resources…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', color: '#f87171', padding: 40 }}>{error}</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <FileCode size={36} style={{ color: 'var(--surface-3)', marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No resources yet</div>
            <div style={{ fontSize: 13, marginBottom: 18 }}>Add your first trader resource — code blocks, YouTube walkthroughs, and more.</div>
            <button onClick={handleNew} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Plus size={14} /> New Resource
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {filtered.map(r => (
              <div key={r.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{r.emoji || '📊'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', background: 'rgba(255,155,38,0.12)', borderRadius: 5, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.tag || 'Resource'}</span>
                      {!r.published && <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface-2)', borderRadius: 5, padding: '2px 6px' }}>Draft</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{r.title}</div>
                    {r.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>{r.description}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Code size={11} /> {Array.isArray(r.code_blocks) ? r.code_blocks.length : 0} {Array.isArray(r.code_blocks) && r.code_blocks.length === 1 ? 'block' : 'blocks'}
                  </span>
                  {r.youtube_url && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Youtube size={11} style={{ color: '#ff5c5c' }} /> Video</span>}
                  {r.iframe_src && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><ExternalLink size={11} /> Embed</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button onClick={() => handleEdit(r)} className="btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12 }}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button onClick={() => handleTogglePublish(r)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }} title={r.published ? 'Unpublish' : 'Publish'}>
                    {r.published ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button onClick={() => handleDelete(r.id)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#ff5c5c' }} title="Delete">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
};
const hintStyle = { fontSize: 11, color: 'var(--muted)', marginTop: 4 };
const iconBtn = {
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
  padding: '5px 7px', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center',
};

function Section({ title, action, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ children }) {
  return <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>{children}</div>;
}

function Field({ label, width, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: width ? `0 0 ${width}px` : 1, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </label>
  );
}
