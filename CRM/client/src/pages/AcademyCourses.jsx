import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Plus, Pencil, Trash2, Loader2, GripVertical, X } from 'lucide-react';
import { getAcademyCourses, createAcademyCourse, updateAcademyCourse, deleteAcademyCourse } from '../api';

const pageStyle = { padding: '24px 28px', background: '#f5f7fa', minHeight: '100vh' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 20, marginBottom: 16 };
const btnPrimary = { padding: '10px 20px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const thStyle = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#7a7f9a', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e5e7ef' };
const tdStyle = { padding: '12px 14px', fontSize: 13, color: '#1a1a2e', borderBottom: '1px solid #f0f1f5' };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#1a1a2e', marginBottom: 6, display: 'block' };
const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e5e7ef', borderRadius: 10, fontSize: 13, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };

function StatusBadge({ status }) {
  const isPublished = status === 'published';
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: isPublished ? '#22c55e18' : '#f59e0b18',
      color: isPublished ? '#22c55e' : '#f59e0b',
      textTransform: 'capitalize',
    }}>{status}</span>
  );
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function AcademyCourses() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm] = useState({ title: '', slug: '', description: '', status: 'draft' });
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  useEffect(() => { loadCourses(); }, []);

  async function loadCourses() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademyCourses();
      setCourses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      setSaving(true);
      await createAcademyCourse(form);
      setShowModal(false);
      setForm({ title: '', slug: '', description: '', status: 'draft' });
      await loadCourses();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteAcademyCourse(id);
      setDeleteConfirm(null);
      await loadCourses();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDragStart(index) {
    dragItem.current = index;
  }

  function handleDragEnter(index) {
    dragOverItem.current = index;
  }

  async function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const items = [...courses];
    const draggedItem = items[dragItem.current];
    items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, draggedItem);
    setCourses(items);

    // Update positions for all moved items
    try {
      await Promise.all(items.map((c, i) => updateAcademyCourse(c.id, { position: i })));
    } catch (err) {
      setError(err.message);
      await loadCourses();
    }

    dragItem.current = null;
    dragOverItem.current = null;
  }

  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="#4a6cf7" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={18} color="#4a6cf7" />
          </div>
          <h1 style={headingStyle}>Course Manager</h1>
        </div>
        <button style={btnPrimary} onClick={() => setShowModal(true)}><Plus size={15} /> Add Course</button>
      </div>
      <p style={subStyle}>Create, edit, and manage your academy courses and lesson content.</p>

      {error && (
        <div style={{ ...cardStyle, color: '#ef4444', fontSize: 13, padding: '12px 16px' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>Dismiss</button>
        </div>
      )}

      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }}></th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Lessons</th>
              <th style={thStyle}>Students</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {courses.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#7a7f9a', padding: 40 }}>
                  No courses yet. Click "Add Course" to create one.
                </td>
              </tr>
            ) : courses.map((c, i) => (
              <tr
                key={c.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{ cursor: 'grab' }}
              >
                <td style={tdStyle}><GripVertical size={14} color="#7a7f9a" /></td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.title}</td>
                <td style={tdStyle}><StatusBadge status={c.status || 'draft'} /></td>
                <td style={tdStyle}>{c.lesson_count ?? c.lessons ?? 0}</td>
                <td style={tdStyle}>{c.enrollment_count ?? c.students ?? 0}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => navigate(`/academy/courses/${c.id}/edit`)}
                      style={{ background: '#f5f7fa', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                    >
                      <Pencil size={14} color="#4a6cf7" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(c.id)}
                      style={{ background: '#f5f7fa', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                    >
                      <Trash2 size={14} color="#ef4444" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Course Modal */}
      {showModal && (
        <div style={overlayStyle} onClick={() => setShowModal(false)}>
          <div style={{ ...cardStyle, width: 480, maxWidth: '90vw', margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>Add New Course</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#7a7f9a" /></button>
            </div>

            <label style={labelStyle}>Title</label>
            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              placeholder="e.g. Forex Fundamentals"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value, slug: slugify(e.target.value) })}
            />

            <label style={labelStyle}>Slug</label>
            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              placeholder="forex-fundamentals"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />

            <label style={labelStyle}>Description</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginBottom: 12 }}
              placeholder="Course description..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />

            <label style={labelStyle}>Status</label>
            <select
              style={{ ...inputStyle, marginBottom: 20, cursor: 'pointer' }}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ ...btnPrimary, background: '#f5f7fa', color: '#7a7f9a' }}>Cancel</button>
              <button onClick={handleCreate} disabled={saving || !form.title} style={{ ...btnPrimary, opacity: saving || !form.title ? 0.6 : 1 }}>
                {saving ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div style={overlayStyle} onClick={() => setDeleteConfirm(null)}>
          <div style={{ ...cardStyle, width: 380, margin: 0, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <Trash2 size={28} color="#ef4444" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>Delete this course?</p>
            <p style={{ fontSize: 13, color: '#7a7f9a', marginBottom: 20 }}>This action cannot be undone. All lessons in this course will also be removed.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ ...btnPrimary, background: '#f5f7fa', color: '#7a7f9a' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ ...btnPrimary, background: '#ef4444' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
