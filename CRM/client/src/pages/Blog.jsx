import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Edit2, Eye, EyeOff, Save, X, Upload, Image, Video, Link2,
  FileText, Code, Search, ExternalLink, GripVertical,
} from 'lucide-react';
import { getBlogPosts, createBlogPost, updateBlogPost, deleteBlogPost, uploadBlogMedia } from '../api';

const CATEGORIES = ['Web Design', 'Marketing', 'Social Media', 'Branding', 'Technology', 'Business', 'Case Study', 'Tutorial'];

const emptyPost = {
  title: '', description: '', category: '', thumbnail_emoji: '📝', content: '',
  published: false, media_url: '', media_type: '', link_url: '', link_text: '',
  gated: false, code_block: '', code_label: '',
};

export default function Blog() {
  const [posts, setPosts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null); // null = list view, object = editor
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState('all'); // all, published, draft
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getBlogPosts();
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load posts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleNew = () => setEditing({ ...emptyPost });

  const handleEdit = (post) => setEditing({ ...post });

  const handleCancel = () => setEditing(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing.id) {
        const { id, created_at, ...data } = editing;
        await updateBlogPost(id, data);
      } else {
        await createBlogPost(editing);
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
    if (!confirm('Delete this post?')) return;
    try {
      await deleteBlogPost(id);
      await load();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleTogglePublish = async (post) => {
    try {
      await updateBlogPost(post.id, { published: !post.published });
      await load();
    } catch (err) {
      alert('Update failed: ' + err.message);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadBlogMedia(file);
      const type = file.type.startsWith('video') ? 'video' : 'image';
      setEditing(prev => ({ ...prev, media_url: url, media_type: type }));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const set = (key, val) => setEditing(prev => ({ ...prev, [key]: val }));

  // Filter + search
  const filtered = posts.filter(p => {
    if (filter === 'published' && !p.published) return false;
    if (filter === 'draft' && p.published) return false;
    if (search) {
      const q = search.toLowerCase();
      return (p.title || '').toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
    }
    return true;
  });

  // ── Editor View ──────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div style={{ padding: '24px 32px', maxWidth: 900, color: '#1a1a2e' }}>
        {/* Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Inter, sans-serif' }}>
            {editing.id ? 'Edit Post' : 'New Post'}
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={handleCancel} style={btnStyle('#e5e7ef', '#8e8ea0')}>
              <X size={14} /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={btnStyle('rgba(74,108,247,0.15)', '#4a6cf7')}>
              <Save size={14} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title</label>
            <input
              value={editing.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Post title…"
              style={inputStyle}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={editing.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Short description…"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Category + Emoji row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={editing.category} onChange={e => set('category', e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Emoji</label>
              <input value={editing.thumbnail_emoji} onChange={e => set('thumbnail_emoji', e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Content */}
          <div>
            <label style={labelStyle}>Content (HTML)</label>
            <textarea
              value={editing.content}
              onChange={e => set('content', e.target.value)}
              placeholder="Write your post content (HTML supported)…"
              rows={12}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'Inter, sans-serif', fontSize: 12 }}
            />
          </div>

          {/* Media Upload */}
          <div>
            <label style={labelStyle}>Media</label>
            <div className="flex items-center gap-3">
              <label style={{ ...btnStyle('#e5e7ef', '#8e8ea0'), cursor: 'pointer', display: 'inline-flex' }}>
                <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload Image/Video'}
                <input type="file" accept="image/*,video/*" onChange={handleUpload} style={{ display: 'none' }} />
              </label>
              {editing.media_url && (
                <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#8e8ea0' }}>
                  {editing.media_type === 'video' ? <Video size={14} /> : <Image size={14} />}
                  <span style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {editing.media_url.split('/').pop()}
                  </span>
                  <button onClick={() => set('media_url', '')} style={{ color: '#ff5c5c', background: 'none', border: 'none', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            {editing.media_url && editing.media_type === 'image' && (
              <img src={editing.media_url} alt="" style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8, marginTop: 8, border: '1px solid #e5e7ef' }} />
            )}
          </div>

          {/* Link */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}><Link2 size={12} style={{ display: 'inline', marginRight: 4 }} />Link URL</label>
              <input value={editing.link_url} onChange={e => set('link_url', e.target.value)} placeholder="https://…" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Link Text</label>
              <input value={editing.link_text} onChange={e => set('link_text', e.target.value)} placeholder="Read more" style={inputStyle} />
            </div>
          </div>

          {/* Code Block */}
          <div>
            <label style={labelStyle}><Code size={12} style={{ display: 'inline', marginRight: 4 }} />Code Block</label>
            <input value={editing.code_label} onChange={e => set('code_label', e.target.value)} placeholder="Code label (e.g. HTML snippet)" style={{ ...inputStyle, marginBottom: 8 }} />
            <textarea
              value={editing.code_block}
              onChange={e => set('code_block', e.target.value)}
              placeholder="Paste code here…"
              rows={6}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'Inter, sans-serif', fontSize: 12 }}
            />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6" style={{ marginTop: 4 }}>
            <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13, color: '#1a1a2e' }}>
              <input type="checkbox" checked={editing.published} onChange={e => set('published', e.target.checked)} style={{ accentColor: '#4a6cf7' }} />
              Published
            </label>
            <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13, color: '#1a1a2e' }}>
              <input type="checkbox" checked={editing.gated} onChange={e => set('gated', e.target.checked)} style={{ accentColor: '#4a6cf7' }} />
              Gated (require email)
            </label>
          </div>
        </div>
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 32px', color: '#1a1a2e' }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Inter, sans-serif' }}>Blog Posts</h1>
          <p style={{ fontSize: 12, color: '#8e8ea0', marginTop: 2, fontFamily: 'Inter, sans-serif' }}>
            {posts.length} post{posts.length !== 1 ? 's' : ''} · {posts.filter(p => p.published).length} published
          </p>
        </div>
        <button onClick={handleNew} style={btnStyle('rgba(74,108,247,0.15)', '#4a6cf7')}>
          <Plus size={14} /> New Post
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3" style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search posts…"
            style={{ ...inputStyle, paddingLeft: 32, width: '100%' }}
          />
        </div>
        {['all', 'published', 'draft'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === f ? 'rgba(74,108,247,0.15)' : 'transparent',
              color: filter === f ? '#4a6cf7' : '#8e8ea0',
              border: filter === f ? '1px solid rgba(74,108,247,0.3)' : '1px solid transparent',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#8e8ea0', fontFamily: 'Inter, sans-serif' }}>Loading…</div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <FileText size={40} style={{ color: '#e5e7ef', margin: '0 auto 12px' }} />
          <p style={{ color: '#8e8ea0', fontSize: 14 }}>No posts found</p>
          <button onClick={handleNew} style={{ ...btnStyle('rgba(74,108,247,0.15)', '#4a6cf7'), marginTop: 12 }}>
            <Plus size={14} /> Create your first post
          </button>
        </div>
      )}

      {/* Posts Grid */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {filtered.map(post => (
            <div
              key={post.id}
              style={{
                background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 12, padding: 16,
                cursor: 'pointer', transition: 'border-color 0.15s',
              }}
              onClick={() => handleEdit(post)}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(74,108,247,0.4)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7ef'}
            >
              {/* Top row: emoji + category */}
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 24 }}>{post.thumbnail_emoji || '📝'}</span>
                  {post.category && (
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                      background: 'rgba(74,108,247,0.1)', color: '#4a6cf7',
                      fontFamily: 'Inter, sans-serif',
                    }}>
                      {post.category}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                  background: post.published ? 'rgba(34,197,94,0.1)' : 'rgba(122,120,112,0.1)',
                  color: post.published ? '#22c55e' : '#8e8ea0',
                  fontFamily: 'Inter, sans-serif',
                }}>
                  {post.published ? 'Published' : 'Draft'}
                </span>
              </div>

              {/* Title */}
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.3, fontFamily: 'Inter, sans-serif' }}>
                {post.title || 'Untitled'}
              </h3>

              {/* Description */}
              {post.description && (
                <p style={{ fontSize: 12, color: '#8e8ea0', lineHeight: 1.4, marginBottom: 8,
                  overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {post.description}
                </p>
              )}

              {/* Media preview */}
              {post.media_url && post.media_type === 'image' && (
                <img src={post.media_url} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 8, border: '1px solid #e5e7ef' }} />
              )}

              {/* Footer */}
              <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
                <span style={{ fontSize: 10, color: '#8e8ea0', fontFamily: 'Inter, sans-serif' }}>
                  {post.created_at ? new Date(post.created_at).toLocaleDateString() : ''}
                </span>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleTogglePublish(post)}
                    title={post.published ? 'Unpublish' : 'Publish'}
                    style={iconBtnStyle}
                  >
                    {post.published ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <button onClick={() => handleEdit(post)} title="Edit" style={iconBtnStyle}>
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => handleDelete(post.id)} title="Delete" style={{ ...iconBtnStyle, color: '#ff5c5c' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
  background: '#f5f7fa', border: '1px solid #e5e7ef', color: '#1a1a2e',
  outline: 'none', fontFamily: 'Inter, sans-serif',
};

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#8e8ea0',
  marginBottom: 4, fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em',
};

function btnStyle(bg, color) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    background: bg, color: color, border: '1px solid ' + (color === '#4a6cf7' ? 'rgba(74,108,247,0.3)' : '#e5e7ef'),
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
  };
}

const iconBtnStyle = {
  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
  color: '#8e8ea0', transition: 'color 0.15s',
};
