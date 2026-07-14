import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, Eye, EyeOff, Save, X, Search, Youtube,
  Code, ChevronUp, ChevronDown, ExternalLink, FileCode, ArrowLeft,
  Folder, Link2,
} from 'lucide-react';
import {
  getResourceCategories, createResourceCategory, updateResourceCategory, deleteResourceCategory,
  getResources, createResource, updateResource, deleteResource,
} from '../api';
import { usePageActions } from '../context/UiContext';
import { toast } from '../components/Toast';

// ── Constants ──────────────────────────────────────────────────────────────
const LANGUAGES = ['markdown', 'python', 'javascript', 'typescript', 'bash', 'json', 'html', 'css', 'sql', 'text'];

const emptyCategory = {
  slug: '', name: '', emoji: '📚', badge_label: 'Free Resources',
  hero_title: 'Built for', hero_highlight: '', hero_subtitle: '',
  gate_enabled: true, gate_title: 'Unlock Free Access',
  gate_description: 'Drop your name and email to get instant access.',
  sort_order: 0, published: true,
};
const emptyResource = {
  title: '', description: '', tag: 'AI Prompt', emoji: '📊',
  youtube_url: '', iframe_src: '', code_blocks: [],
  sort_order: 0, published: true,
};
const emptyBlock = { label: 'Part 1', language: 'markdown', code: '' };

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Resources() {
  const [view, setView] = useState({ mode: 'categories' }); // categories | category | resource-edit | category-edit
  const [categories, setCategories] = useState([]);
  const [resources, setResources]   = useState([]);
  const [loadingCats, setLoadingCats]     = useState(true);
  const [loadingItems, setLoadingItems]   = useState(false);
  const [error, setError] = useState('');

  const loadCategories = useCallback(async () => {
    setLoadingCats(true);
    try {
      const data = await getResourceCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) { setError(err.message); }
    finally { setLoadingCats(false); }
  }, []);

  const loadResources = useCallback(async (slug) => {
    setLoadingItems(true);
    try {
      const data = await getResources(slug);
      setResources(Array.isArray(data) ? data : []);
    } catch (err) { setError(err.message); }
    finally { setLoadingItems(false); }
  }, []);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => {
    if (view.mode === 'category' && view.category) loadResources(view.category.slug);
  }, [view, loadResources]);

  // ── CATEGORY LIST ──────────────────────────────────────────────────────
  if (view.mode === 'categories') {
    return (
      <CategoriesView
        categories={categories}
        loading={loadingCats}
        onOpen={(cat) => setView({ mode: 'category', category: cat })}
        onEdit={(cat) => setView({ mode: 'category-edit', category: cat })}
        onNew={() => setView({ mode: 'category-edit', category: { ...emptyCategory } })}
        onDelete={async (id) => {
          if (!confirm('Delete this category? Resources in it will keep their category slug but become orphaned.')) return;
          try { await deleteResourceCategory(id); await loadCategories(); }
          catch (e) { toast('error', e.message); }
        }}
        onTogglePublish={async (cat) => {
          try { await updateResourceCategory(cat.id, { published: !cat.published }); await loadCategories(); }
          catch (e) { toast('error', e.message); }
        }}
      />
    );
  }

  // ── CATEGORY EDITOR ────────────────────────────────────────────────────
  if (view.mode === 'category-edit') {
    return (
      <CategoryEditor
        initial={view.category}
        onCancel={() => setView({ mode: 'categories' })}
        onSaved={async () => { await loadCategories(); setView({ mode: 'categories' }); }}
      />
    );
  }

  // ── RESOURCE LIST (inside a category) ──────────────────────────────────
  if (view.mode === 'category') {
    return (
      <CategoryDetail
        category={view.category}
        resources={resources}
        loading={loadingItems}
        onBack={() => setView({ mode: 'categories' })}
        onEditCategory={() => setView({ mode: 'category-edit', category: view.category })}
        onNewResource={() => setView({
          mode: 'resource-edit',
          category: view.category,
          resource: { ...emptyResource, category_slug: view.category.slug, code_blocks: [{ ...emptyBlock }] },
        })}
        onEditResource={(r) => setView({
          mode: 'resource-edit',
          category: view.category,
          resource: { ...r, code_blocks: Array.isArray(r.code_blocks) ? r.code_blocks : [] },
        })}
        onDeleteResource={async (id) => {
          if (!confirm('Delete this resource?')) return;
          try { await deleteResource(id); await loadResources(view.category.slug); }
          catch (e) { toast('error', e.message); }
        }}
        onTogglePublishResource={async (r) => {
          try { await updateResource(r.id, { published: !r.published }); await loadResources(view.category.slug); }
          catch (e) { toast('error', e.message); }
        }}
      />
    );
  }

  // ── RESOURCE EDITOR ────────────────────────────────────────────────────
  if (view.mode === 'resource-edit') {
    return (
      <ResourceEditor
        initial={view.resource}
        category={view.category}
        onCancel={() => setView({ mode: 'category', category: view.category })}
        onSaved={async () => {
          await loadResources(view.category.slug);
          setView({ mode: 'category', category: view.category });
        }}
      />
    );
  }

  return null;
}

// ── CategoriesView ─────────────────────────────────────────────────────────
function CategoriesView({ categories, loading, onOpen, onEdit, onNew, onDelete, onTogglePublish }) {
  const [search, setSearch] = useState('');
  const filtered = categories.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.slug?.toLowerCase().includes(search.toLowerCase())
  );

  usePageActions(() => (
    <button onClick={onNew} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <Plus size={14} /> New Category
    </button>
  ), [onNew]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search categories…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} of {categories.length}</span>
      </div>

      <div style={{ padding: '20px 28px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60 }}>Loading categories…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <Folder size={36} style={{ color: 'var(--surface-3)', marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No categories yet</div>
            <div style={{ fontSize: 13, marginBottom: 18 }}>Create a category like "Traders", "CRM", or "Photography" to get started.</div>
            <button onClick={onNew} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Plus size={14} /> New Category
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {filtered.map(cat => (
              <div key={cat.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                padding: 18, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onClick={() => onOpen(cat)}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(37,99,235,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 36 }}>{cat.emoji || '📚'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{cat.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
                      /resources/{cat.slug}
                    </div>
                    {!cat.published && <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, color: 'var(--muted)', background: 'var(--surface-2)', borderRadius: 5, padding: '2px 6px' }}>Draft</span>}
                  </div>
                </div>
                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button onClick={() => onOpen(cat)} className="btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12 }}>
                    <FileCode size={12} /> Open
                  </button>
                  <button onClick={() => onEdit(cat)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }} title="Edit category">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => onTogglePublish(cat)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }} title={cat.published ? 'Unpublish' : 'Publish'}>
                    {cat.published ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <a href={`/resources/${cat.slug}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, textDecoration: 'none' }} title="View live">
                    <ExternalLink size={12} />
                  </a>
                  <button onClick={() => onDelete(cat.id)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#ff5c5c' }} title="Delete">
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

// ── CategoryEditor ─────────────────────────────────────────────────────────
function CategoryEditor({ initial, onCancel, onSaved }) {
  const [cat, setCat] = useState(initial);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!cat.name?.trim()) { toast('error', 'Name is required'); return; }
    const payload = { ...cat, slug: cat.slug || slugify(cat.name) };
    setSaving(true);
    try {
      if (cat.id) {
        const { id, created_at, updated_at, ...data } = payload;
        await updateResourceCategory(id, data);
      } else {
        await createResourceCategory(payload);
      }
      onSaved();
    } catch (err) { toast('error', 'Save failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Folder size={18} style={{ color: 'var(--orange)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            {cat.id ? 'Edit Category' : 'New Category'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <Section title="Overview">
        <Row>
          <Field label="Emoji" width={80}>
            <input value={cat.emoji || ''} onChange={e => setCat({ ...cat, emoji: e.target.value })} style={{ ...inputStyle, textAlign: 'center', fontSize: 22 }} maxLength={4} />
          </Field>
          <Field label="Name">
            <input value={cat.name || ''} onChange={e => setCat({ ...cat, name: e.target.value, slug: cat.slug || slugify(e.target.value) })} placeholder="Traders" style={inputStyle} />
          </Field>
          <Field label="Slug (URL)">
            <input value={cat.slug || ''} onChange={e => setCat({ ...cat, slug: slugify(e.target.value) })} placeholder="traders" style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace' }} />
          </Field>
        </Row>
        <div style={hintStyle}>Public URL: <code>/resources/{cat.slug || 'your-slug'}</code></div>

        <Row>
          <Field label="Sort Order" width={110}>
            <input type="number" value={cat.sort_order ?? 0} onChange={e => setCat({ ...cat, sort_order: parseInt(e.target.value) || 0 })} style={inputStyle} />
          </Field>
          <Field label="Published" width={140}>
            <button onClick={() => setCat({ ...cat, published: !cat.published })}
              style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: cat.published ? '#4ade80' : 'var(--muted)' }}>
              {cat.published ? <><Eye size={13} /> Live</> : <><EyeOff size={13} /> Draft</>}
            </button>
          </Field>
        </Row>
      </Section>

      <Section title="Hero / Header">
        <Field label="Badge Label">
          <input value={cat.badge_label || ''} onChange={e => setCat({ ...cat, badge_label: e.target.value })} placeholder="Free Resources" style={inputStyle} />
        </Field>
        <Row>
          <Field label="Hero Title (before highlight)">
            <input value={cat.hero_title || ''} onChange={e => setCat({ ...cat, hero_title: e.target.value })} placeholder="Built for" style={inputStyle} />
          </Field>
          <Field label="Highlighted Word">
            <input value={cat.hero_highlight || ''} onChange={e => setCat({ ...cat, hero_highlight: e.target.value })} placeholder="traders" style={{ ...inputStyle, color: 'var(--orange)', fontWeight: 700 }} />
          </Field>
        </Row>
        <Field label="Hero Subtitle">
          <textarea value={cat.hero_subtitle || ''} onChange={e => setCat({ ...cat, hero_subtitle: e.target.value })} rows={2} placeholder="One short sentence under the headline." style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
      </Section>

      <Section title="Access Gate">
        <Field label="Gate Enabled">
          <button onClick={() => setCat({ ...cat, gate_enabled: !cat.gate_enabled })}
            style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: cat.gate_enabled ? 'var(--orange)' : 'var(--muted)' }}>
            {cat.gate_enabled ? 'Email required to unlock' : 'Open access (no gate)'}
          </button>
          <div style={hintStyle}>When on, visitors must submit name + email before they can see resources.</div>
        </Field>
        {cat.gate_enabled && (
          <>
            <Field label="Gate Title">
              <input value={cat.gate_title || ''} onChange={e => setCat({ ...cat, gate_title: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Gate Description">
              <textarea value={cat.gate_description || ''} onChange={e => setCat({ ...cat, gate_description: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </Field>
          </>
        )}
      </Section>
    </div>
  );
}

// ── CategoryDetail (list of resources in this category) ────────────────────
function CategoryDetail({ category, resources, loading, onBack, onEditCategory, onNewResource, onEditResource, onDeleteResource, onTogglePublishResource }) {
  const [search, setSearch] = useState('');
  const filtered = resources.filter(r =>
    !search || r.title?.toLowerCase().includes(search.toLowerCase()) || r.tag?.toLowerCase().includes(search.toLowerCase())
  );

  usePageActions(() => (
    <button onClick={onNewResource} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
      <Plus size={14} /> New Resource
    </button>
  ), [onNewResource]);

  return (
    <div>
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <button onClick={onBack} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginBottom: 10 }}>
          <ArrowLeft size={13} /> All Categories
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 36 }}>{category.emoji || '📚'}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{category.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>/resources/{category.slug}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href={`/resources/${category.slug}`} target="_blank" rel="noreferrer" className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, textDecoration: 'none' }}>
              <ExternalLink size={13} /> View Live
            </a>
            <button onClick={onEditCategory} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <Edit2 size={13} /> Edit Category
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search resources…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length} of {resources.length}</span>
      </div>

      <div style={{ padding: '20px 28px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 60 }}>Loading resources…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <FileCode size={36} style={{ color: 'var(--surface-3)', marginBottom: 12 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>No resources in this category yet</div>
            <div style={{ fontSize: 13, marginBottom: 18 }}>Add prompts, code blocks, YouTube videos, or Claude artifacts.</div>
            <button onClick={onNewResource} className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <Plus size={14} /> New Resource
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {filtered.map(r => (
              <div key={r.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{r.emoji || '📊'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--orange)', background: 'rgba(37,99,235,0.12)', borderRadius: 5, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.tag || 'Resource'}</span>
                      {!r.published && <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface-2)', borderRadius: 5, padding: '2px 6px' }}>Draft</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>{r.title}</div>
                    {r.description && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>{r.description}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Code size={11} /> {Array.isArray(r.code_blocks) ? r.code_blocks.length : 0} blocks</span>
                  {r.youtube_url && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Youtube size={11} style={{ color: '#ff5c5c' }} /> Video</span>}
                  {r.iframe_src && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Link2 size={11} /> Embed</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button onClick={() => onEditResource(r)} className="btn-ghost" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12 }}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button onClick={() => onTogglePublishResource(r)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }} title={r.published ? 'Unpublish' : 'Publish'}>
                    {r.published ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                  <button onClick={() => onDeleteResource(r.id)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#ff5c5c' }} title="Delete">
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

// ── ResourceEditor ─────────────────────────────────────────────────────────
function ResourceEditor({ initial, category, onCancel, onSaved }) {
  const [r, setR] = useState(initial);
  const [saving, setSaving] = useState(false);

  const addBlock = () => {
    const next = [...(r.code_blocks || [])];
    next.push({ ...emptyBlock, label: `Part ${next.length + 1}` });
    setR({ ...r, code_blocks: next });
  };
  const updateBlock = (i, field, val) => {
    const next = [...(r.code_blocks || [])];
    next[i] = { ...next[i], [field]: val };
    setR({ ...r, code_blocks: next });
  };
  const removeBlock = (i) => {
    const next = [...(r.code_blocks || [])];
    next.splice(i, 1);
    setR({ ...r, code_blocks: next });
  };
  const moveBlock = (i, dir) => {
    const next = [...(r.code_blocks || [])];
    const target = i + dir;
    if (target < 0 || target >= next.length) return;
    [next[i], next[target]] = [next[target], next[i]];
    setR({ ...r, code_blocks: next });
  };

  const handleSave = async () => {
    if (!r.title?.trim()) { toast('error', 'Title is required'); return; }
    const payload = {
      ...r,
      category_slug: category.slug,
      code_blocks: (r.code_blocks || []).filter(b => (b.code || '').trim()),
    };
    setSaving(true);
    try {
      if (r.id) {
        const { id, created_at, updated_at, ...data } = payload;
        await updateResource(id, data);
      } else {
        await createResource(payload);
      }
      onSaved();
    } catch (err) { toast('error', 'Save failed: ' + err.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <button onClick={onCancel} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginBottom: 8 }}>
            <ArrowLeft size={13} /> {category.name}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileCode size={18} style={{ color: 'var(--orange)' }} />
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              {r.id ? 'Edit Resource' : 'New Resource'}
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <X size={14} /> Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save Resource'}
          </button>
        </div>
      </div>

      <Section title="Overview">
        <Row>
          <Field label="Emoji" width={80}>
            <input value={r.emoji || ''} onChange={e => setR({ ...r, emoji: e.target.value })} style={{ ...inputStyle, textAlign: 'center', fontSize: 22 }} maxLength={4} />
          </Field>
          <Field label="Tag" width={160}>
            <input value={r.tag || ''} onChange={e => setR({ ...r, tag: e.target.value })} placeholder="AI Prompt" style={inputStyle} />
          </Field>
          <Field label="Sort Order" width={110}>
            <input type="number" value={r.sort_order ?? 0} onChange={e => setR({ ...r, sort_order: parseInt(e.target.value) || 0 })} style={inputStyle} />
          </Field>
          <Field label="Published" width={110}>
            <button onClick={() => setR({ ...r, published: !r.published })}
              style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: r.published ? '#4ade80' : 'var(--muted)' }}>
              {r.published ? <><Eye size={13} /> Live</> : <><EyeOff size={13} /> Draft</>}
            </button>
          </Field>
        </Row>

        <Field label="Title">
          <input value={r.title} onChange={e => setR({ ...r, title: e.target.value })} placeholder="Trading Dashboard Prompt" style={inputStyle} />
        </Field>
        <Field label="Description">
          <textarea value={r.description || ''} onChange={e => setR({ ...r, description: e.target.value })} placeholder="A short 1–2 sentence description shown on the card." rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
      </Section>

      <Section title="Media (optional)">
        <Field label={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Youtube size={13} style={{ color: '#ff5c5c' }} /> YouTube URL</span>}>
          <input value={r.youtube_url || ''} onChange={e => setR({ ...r, youtube_url: e.target.value })} placeholder="https://youtube.com/watch?v=… or /playlist?list=…" style={inputStyle} />
          <div style={hintStyle}>Single video URL, playlist URL, or watch URL with a <code>list=</code> parameter — all three embed correctly.</div>
        </Field>
        <Field label="Claude Artifact / iframe URL">
          <input value={r.iframe_src || ''} onChange={e => setR({ ...r, iframe_src: e.target.value })} placeholder="https://claude.site/public/artifacts/…/embed" style={inputStyle} />
          <div style={hintStyle}>Optional — embed a Claude artifact or any iframe-friendly URL.</div>
        </Field>
      </Section>

      <Section
        title="Code Blocks"
        action={
          <button onClick={addBlock} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <Plus size={13} /> Add Part
          </button>
        }
      >
        {(r.code_blocks || []).length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 8 }}>
            No code blocks yet — add Part 1 to get started.
          </div>
        )}
        {(r.code_blocks || []).map((b, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 10, background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Code size={14} style={{ color: 'var(--orange)' }} />
              <input value={b.label || ''} onChange={e => updateBlock(i, 'label', e.target.value)} placeholder={`Part ${i + 1}`} style={{ ...inputStyle, flex: 1, fontWeight: 700 }} />
              <select value={b.language || 'markdown'} onChange={e => updateBlock(i, 'language', e.target.value)} style={{ ...inputStyle, width: 140 }}>
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <button onClick={() => moveBlock(i, -1)} disabled={i === 0} title="Move up" style={iconBtn}><ChevronUp size={14} /></button>
              <button onClick={() => moveBlock(i, 1)} disabled={i === (r.code_blocks.length - 1)} title="Move down" style={iconBtn}><ChevronDown size={14} /></button>
              <button onClick={() => removeBlock(i)} title="Remove" style={{ ...iconBtn, color: '#ff5c5c' }}><Trash2 size={14} /></button>
            </div>
            <textarea value={b.code || ''} onChange={e => updateBlock(i, 'code', e.target.value)} placeholder="Paste code, prompt, or markdown here…" rows={10}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.55, background: 'var(--bg)' }} />
          </div>
        ))}
      </Section>
    </div>
  );
}

// ── Shared UI bits ─────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none',
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
function Row({ children }) { return <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>{children}</div>; }
function Field({ label, width, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: width ? `0 0 ${width}px` : 1, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </label>
  );
}
