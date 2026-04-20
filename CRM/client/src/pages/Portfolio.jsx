import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Eye, EyeOff, Upload, X, Image, Video, GripVertical, Search, Edit3, Check, ExternalLink } from 'lucide-react';
import { getPortfolio, createPortfolioItem, updatePortfolioItem, deletePortfolioItem, uploadBlogMedia } from '../api';
import { usePageActions } from '../context/UiContext';
import Modal from '../components/Modal';

const CATEGORIES = ['Websites', 'Apps', 'Visuals', 'Graphics', 'Branding', 'Automation', 'Other'];

function CategorySlider({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {CATEGORIES.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat.toLowerCase())}
          style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'all 0.15s', border: 'none',
            background: value === cat.toLowerCase() ? 'var(--orange)' : 'var(--surface-3)',
            color: value === cat.toLowerCase() ? '#fff' : 'var(--muted)',
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

function PortfolioCard({ item, onToggle, onEdit, onDelete }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      overflow: 'hidden', transition: 'box-shadow 0.15s',
      opacity: item.visible ? 1 : 0.5,
    }}>
      {/* Media preview */}
      <div style={{ position: 'relative', height: 180, background: 'var(--surface-3)', overflow: 'hidden' }}>
        {item.media_url ? (
          item.media_type === 'video' ? (
            <video src={item.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
          ) : (
            <img src={item.media_url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
            <Image size={32} />
          </div>
        )}
        {/* Category badge */}
        <span style={{
          position: 'absolute', top: 8, left: 8,
          background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 10, fontWeight: 600,
          padding: '3px 8px', borderRadius: 6, textTransform: 'capitalize',
        }}>
          {item.category}
        </span>
        {/* Visibility badge */}
        {!item.visible && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: 'rgba(255,92,92,0.8)', color: '#fff', fontSize: 10, fontWeight: 600,
            padding: '3px 8px', borderRadius: 6,
          }}>
            Hidden
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{item.title}</div>
        {item.description && (
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 8 }}>
            {item.description.length > 80 ? item.description.slice(0, 80) + '...' : item.description}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => onToggle(item)}
            title={item.visible ? 'Hide from portfolio' : 'Show on portfolio'}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
              borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: item.visible ? 'rgba(255,155,38,0.1)' : 'rgba(255,92,92,0.1)',
              color: item.visible ? 'var(--orange)' : '#f87171',
            }}
          >
            {item.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            {item.visible ? 'Visible' : 'Hidden'}
          </button>
          <button
            onClick={() => onEdit(item)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
              borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
              background: 'none', color: 'var(--muted)', fontSize: 11,
            }}
          >
            <Edit3 size={11} /> Edit
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => onDelete(item)}
            style={{
              display: 'flex', alignItems: 'center', padding: '5px 7px',
              borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'none', color: 'var(--muted)',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
            onMouseLeave={e => e.currentTarget.style.color = '#b0b0c0'}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ item, onClose, onSave }) {
  const [form, setForm] = useState({
    title: item?.title || '',
    description: item?.description || '',
    category: item?.category || 'websites',
    media_url: item?.media_url || '',
    media_type: item?.media_type || 'image',
    thumbnail_url: item?.thumbnail_url || '',
    link_url: item?.link_url || '',
    visible: item?.visible !== false,
  });
  const [uploading, setUploading] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadBlogMedia(file);
      const isVideo = file.type.startsWith('video');
      setForm(f => ({
        ...f,
        media_url: result.url,
        media_type: isVideo ? 'video' : 'image',
      }));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleThumbUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingThumb(true);
    try {
      const result = await uploadBlogMedia(file);
      setForm(f => ({
        ...f,
        thumbnail_url: result.url,
        // Also set media_url if empty so the card shows the image
        media_url: f.media_url || result.url,
      }));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{item ? 'Edit Project' : 'Add Project'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Media Upload */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>Media</label>
            {form.media_url ? (
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                {form.media_type === 'video' ? (
                  <video src={form.media_url} style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} controls />
                ) : (
                  <img src={form.media_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                )}
                <button
                  onClick={() => setForm(f => ({ ...f, media_url: '', media_type: 'image' }))}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer', color: '#fff', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: 24, border: '2px dashed #e5e7ef', borderRadius: 10, cursor: 'pointer',
                color: 'var(--muted)', fontSize: 13, transition: 'border-color 0.15s',
              }}>
                <input type="file" accept="image/*,video/*" onChange={handleUpload} style={{ display: 'none' }} />
                {uploading ? (
                  <span>Uploading...</span>
                ) : (
                  <>
                    <Upload size={24} />
                    <span>Click to upload image or video</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>PNG, JPG, WebP, MP4</span>
                  </>
                )}
              </label>
            )}
          </div>

          {/* Title */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>Title *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Project title"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Brief description of the project..."
              rows={3}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* Category */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>Category</label>
            <CategorySlider value={form.category} onChange={cat => setForm(f => ({ ...f, category: cat }))} />
          </div>

          {/* Thumbnail Upload */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>Display Image (Thumbnail)</label>
            {form.thumbnail_url ? (
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img src={form.thumbnail_url} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover' }} />
                <button
                  onClick={() => setForm(f => ({ ...f, thumbnail_url: '' }))}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer', color: '#fff', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: 16, border: '2px dashed #e5e7ef', borderRadius: 10, cursor: 'pointer',
                color: 'var(--muted)', fontSize: 12, transition: 'border-color 0.15s',
              }}>
                <input type="file" accept="image/*" onChange={handleThumbUpload} style={{ display: 'none' }} />
                {uploadingThumb ? <span>Uploading...</span> : (
                  <>
                    <Image size={20} />
                    <span>Upload display image for portfolio grid</span>
                  </>
                )}
              </label>
            )}
          </div>

          {/* Project URL */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6, display: 'block' }}>Project URL</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                value={form.link_url}
                onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                placeholder="https://vernontm.com/portfolio/pickapaint"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
              />
              {form.link_url && (
                <a href={form.link_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)', display: 'flex' }}>
                  <ExternalLink size={16} />
                </a>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}>Link visitors can click to try out the project</span>
          </div>

          {/* Visibility Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setForm(f => ({ ...f, visible: !f.visible }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, border: 'none',
                background: form.visible ? 'rgba(255,155,38,0.08)' : '#ff5c5c10',
                color: form.visible ? 'var(--orange)' : '#ff5c5c',
              }}
            >
              {form.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              {form.visible ? 'Visible on Portfolio' : 'Hidden from Portfolio'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim()}
            style={{
              padding: '9px 20px', borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
              background: 'var(--orange)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600,
              opacity: saving || !form.title.trim() ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving...' : item ? 'Save Changes' : 'Add Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Portfolio() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [editItem, setEditItem] = useState(null); // null = closed, {} = new, obj = edit
  const [deleteItem, setDeleteItem] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPortfolio();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter(item => {
    if (search && !item.title.toLowerCase().includes(search.toLowerCase()) && !item.description?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat !== 'all' && item.category !== filterCat) return false;
    return true;
  });

  const handleSave = async (form) => {
    if (editItem?.id) {
      await updatePortfolioItem(editItem.id, form);
    } else {
      await createPortfolioItem(form);
    }
    await load();
  };

  const handleToggle = async (item) => {
    await updatePortfolioItem(item.id, { visible: !item.visible });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, visible: !i.visible } : i));
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    await deletePortfolioItem(deleteItem.id);
    setItems(prev => prev.filter(i => i.id !== deleteItem.id));
    setDeleteItem(null);
  };

  usePageActions(() => (
    <button className="btn-primary" onClick={() => setEditItem({})}><Plus size={15} /> Add Project</button>
  ), [setEditItem]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Search bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search portfolio…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
      </div>

      {/* Category filter */}
      <div style={{ padding: '10px 24px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setFilterCat('all')}
          style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', border: 'none',
            background: filterCat === 'all' ? 'var(--orange)' : '#fff',
            color: filterCat === 'all' ? '#fff' : '#8e8ea0',
          }}
        >
          All
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat.toLowerCase())}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: 'none',
              background: filterCat === cat.toLowerCase() ? 'var(--orange)' : '#fff',
              color: filterCat === cat.toLowerCase() ? '#fff' : '#8e8ea0',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ padding: '0 24px 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
            {items.length === 0 ? 'No portfolio projects yet. Click "Add Project" to create one.' : 'No projects match your filter.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {filtered.map(item => (
              <PortfolioCard
                key={item.id}
                item={item}
                onToggle={handleToggle}
                onEdit={setEditItem}
                onDelete={setDeleteItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit/Add Modal */}
      {editItem !== null && (
        <EditModal
          item={editItem?.id ? editItem : null}
          onClose={() => setEditItem(null)}
          onSave={handleSave}
        />
      )}

      {/* Delete Confirm */}
      {deleteItem && (
        <Modal title="Delete Project" onClose={() => setDeleteItem(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
          <p style={{ color: 'var(--muted)' }}>Delete <strong style={{ color: 'var(--text)' }}>{deleteItem.title}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
