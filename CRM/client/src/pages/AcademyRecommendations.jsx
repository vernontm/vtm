import React, { useState, useEffect } from 'react';
import { Star, Plus, Pencil, Trash2, ExternalLink, X, Loader2, GripVertical } from 'lucide-react';
import { getAcademyRecommendations, createAcademyRecommendation, updateAcademyRecommendation, deleteAcademyRecommendation } from '../api';

const pageStyle = { padding: '24px 28px', background: 'var(--bg)', minHeight: '100vh' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 };
const btnPrimary = { padding: '10px 20px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const thStyle = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#7a7f9a', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' };
const tdStyle = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid #f0f1f5' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'block' };
const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', marginBottom: 14 };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const modalStyle = { background: 'var(--surface)', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' };

const categoryColors = { Tools: 'var(--orange)', Books: '#8b5cf6', Resources: '#22c55e', Brokers: '#f59e0b' };

function CategoryBadge({ category }) {
  const c = categoryColors[category] || '#7a7f9a';
  return (
    <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: c + '18', color: c }}>{category}</span>
  );
}

const emptyForm = { title: '', description: '', affiliate_url: '', image_url: '', category: '', sort_order: 0 };

export default function AcademyRecommendations() {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRecs(); }, []);

  async function loadRecs() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademyRecommendations();
      setRecs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  }

  function openEdit(rec) {
    setEditingId(rec.id);
    setForm({ title: rec.title || '', description: rec.description || '', affiliate_url: rec.affiliate_url || '', image_url: rec.image_url || '', category: rec.category || '', sort_order: rec.sort_order || 0 });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  async function handleSave() {
    if (!form.title.trim()) return alert('Title is required');
    try {
      setSaving(true);
      if (editingId) {
        await updateAcademyRecommendation(editingId, form);
        setRecs(prev => prev.map(r => r.id === editingId ? { ...r, ...form } : r));
      } else {
        const created = await createAcademyRecommendation(form);
        if (created && created.id) {
          setRecs(prev => [...prev, created]);
        } else {
          await loadRecs();
        }
      }
      closeModal();
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this recommendation?')) return;
    try {
      await deleteAcademyRecommendation(id);
      setRecs(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  function updateField(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="var(--orange)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, color: '#ef4444', textAlign: 'center', padding: 40 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load recommendations</p>
          <p style={{ fontSize: 13, color: '#7a7f9a' }}>{error}</p>
          <button onClick={loadRecs} style={{ marginTop: 12, padding: '8px 20px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f59e0b18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={18} color="#f59e0b" />
          </div>
          <h1 style={headingStyle}>Recommendations</h1>
        </div>
        <button style={btnPrimary} onClick={openAdd}><Plus size={15} /> Add Recommendation</button>
      </div>
      <p style={subStyle}>Manage tools, books, brokers, and resources you recommend to students.</p>

      <div style={cardStyle}>
        {recs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7a7f9a', padding: 32, fontSize: 13 }}>No recommendations yet. Click "Add Recommendation" to create one.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Order</th>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>URL</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(r => (
                <tr key={r.id}>
                  <td style={{ ...tdStyle, width: 50 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#7a7f9a' }}>
                      <GripVertical size={12} /> {r.sort_order || 0}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.image_url && <img src={r.image_url} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />}
                      {r.title}
                    </div>
                  </td>
                  <td style={tdStyle}><CategoryBadge category={r.category} /></td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#7a7f9a' }}>{r.description}</td>
                  <td style={tdStyle}>
                    {r.affiliate_url && (
                      <a href={r.affiliate_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--orange)', fontSize: 12, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {r.affiliate_url.replace(/https?:\/\//, '').split('/')[0]} <ExternalLink size={11} />
                      </a>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => openEdit(r)} style={{ background: 'var(--bg)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}><Pencil size={14} color="var(--orange)" /></button>
                      <button onClick={() => handleDelete(r.id)} style={{ background: 'var(--bg)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}><Trash2 size={14} color="#ef4444" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div style={overlayStyle} onClick={closeModal}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{editingId ? 'Edit Recommendation' : 'Add Recommendation'}</h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="#7a7f9a" /></button>
            </div>

            <label style={labelStyle}>Title *</label>
            <input style={inputStyle} value={form.title} onChange={e => updateField('title', e.target.value)} placeholder="e.g. TradingView Pro" />

            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }}
              value={form.description}
              onChange={e => updateField('description', e.target.value)}
              placeholder="Brief description of the recommendation..."
            />

            <label style={labelStyle}>URL</label>
            <input style={inputStyle} value={form.affiliate_url} onChange={e => updateField('affiliate_url', e.target.value)} placeholder="https://..." />

            <label style={labelStyle}>Image URL</label>
            <input style={inputStyle} value={form.image_url} onChange={e => updateField('image_url', e.target.value)} placeholder="https://..." />

            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Category</label>
                <input style={inputStyle} value={form.category} onChange={e => updateField('category', e.target.value)} placeholder="e.g. Tools, Books, Brokers" />
              </div>
              <div style={{ width: 100 }}>
                <label style={labelStyle}>Sort Order</label>
                <input style={inputStyle} type="number" value={form.sort_order} onChange={e => updateField('sort_order', parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button onClick={closeModal} style={{ padding: '10px 20px', background: 'var(--bg)', color: '#7a7f9a', border: '1px solid var(--border)', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
