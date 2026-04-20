import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BookOpen, Save, Image, ToggleLeft, ToggleRight, GripVertical, Plus, Trash2, Pencil, Loader2, ArrowLeft, X, Sparkles, Upload } from 'lucide-react';
import { getAcademyCourses, updateAcademyCourse, getAcademyLessons, createAcademyLesson, updateAcademyLesson, deleteAcademyLesson, generateAcademyContent, uploadAcademyFile } from '../api';

const pageStyle = { padding: '24px 28px', background: 'var(--bg)', minHeight: '100vh' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 };
const btnPrimary = { padding: '10px 20px', background: 'var(--orange)', color: 'var(--surface)', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnOutline = { padding: '10px 20px', background: 'var(--surface)', color: 'var(--orange)', border: '1px solid var(--orange)', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'block' };
const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const btnAI = { padding: '8px 16px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'var(--surface)', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 };

function StatusBadge({ status }) {
  const isPublished = status === 'published';
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
      background: isPublished ? '#22c55e18' : '#f59e0b18',
      color: isPublished ? '#22c55e' : '#f59e0b',
      textTransform: 'capitalize',
    }}>{status}</span>
  );
}

export default function AcademyCourseEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({ title: '', slug: '', description: '', status: 'draft', cover_image_url: '', stripe_product_id: '', drip_enabled: false });
  const [lessons, setLessons] = useState([]);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', sort_order: 0, status: 'draft' });
  const [lessonSaving, setLessonSaving] = useState(false);
  const [generatingCover, setGeneratingCover] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);

  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const coverFileRef = useRef(null);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [allCourses, courseLessons] = await Promise.all([
        getAcademyCourses(),
        getAcademyLessons(id),
      ]);
      const course = (Array.isArray(allCourses) ? allCourses : []).find(c => String(c.id) === String(id));
      if (!course) {
        setError('Course not found');
        setLoading(false);
        return;
      }
      setForm({
        title: course.title || '',
        slug: course.slug || '',
        description: course.description || '',
        status: course.status || 'draft',
        cover_image_url: course.cover_image_url || '',
        stripe_product_id: course.stripe_product_id || '',
        drip_enabled: course.drip_enabled || false,
      });
      setLessons(Array.isArray(courseLessons) ? courseLessons : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await updateAcademyCourse(id, form);
      setSuccess('Course saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLesson() {
    try {
      setLessonSaving(true);
      await createAcademyLesson({ ...lessonForm, course_id: id });
      setShowLessonModal(false);
      setLessonForm({ title: '', description: '', sort_order: 0, status: 'draft' });
      const updated = await getAcademyLessons(id);
      setLessons(Array.isArray(updated) ? updated : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLessonSaving(false);
    }
  }

  async function handleDeleteLesson(lessonId) {
    if (!window.confirm('Delete this lesson?')) return;
    try {
      await deleteAcademyLesson(lessonId);
      const updated = await getAcademyLessons(id);
      setLessons(Array.isArray(updated) ? updated : []);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDragStart(index) { dragItem.current = index; }
  function handleDragEnter(index) { dragOverItem.current = index; }

  async function handleDragEnd() {
    if (dragItem.current === null || dragOverItem.current === null || dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const items = [...lessons];
    const dragged = items[dragItem.current];
    items.splice(dragItem.current, 1);
    items.splice(dragOverItem.current, 0, dragged);
    setLessons(items);

    try {
      await Promise.all(items.map((l, i) => updateAcademyLesson(l.id, { sort_order: i })));
    } catch (err) {
      setError(err.message);
      const updated = await getAcademyLessons(id);
      setLessons(Array.isArray(updated) ? updated : []);
    }

    dragItem.current = null;
    dragOverItem.current = null;
  }

  async function handleGenerateCover() {
    try {
      setGeneratingCover(true);
      setError(null);
      const result = await generateAcademyContent({
        action: 'generate-cover',
        prompt: coverPrompt,
        course_title: form.title || 'Course',
      });
      if (result?.url) {
        setForm(prev => ({ ...prev, cover_image_url: result.url }));
        setSuccess('Cover image generated successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(`Cover generation failed: ${err.message}`);
    } finally {
      setGeneratingCover(false);
    }
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingCover(true);
      setError(null);
      const path = `covers/${id}-${Date.now()}.${file.name.split('.').pop()}`;
      const result = await uploadAcademyFile('course-media', path, file, file.type);
      setForm(prev => ({ ...prev, cover_image_url: result.url }));
      setSuccess('Cover image uploaded');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploadingCover(false);
      if (coverFileRef.current) coverFileRef.current.value = '';
    }
  }

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="var(--orange)" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => navigate('/academy/courses')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <ArrowLeft size={18} color="#7a7f9a" />
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,155,38,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BookOpen size={18} color="var(--orange)" />
          </div>
          <h1 style={headingStyle}>Edit Course</h1>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          <Save size={15} /> {saving ? 'Saving...' : 'Save Course'}
        </button>
      </div>
      <p style={subStyle}>Configure course details, content drip settings, and manage lessons.</p>

      {error && (
        <div style={{ ...cardStyle, color: '#ef4444', fontSize: 13, padding: '12px 16px', marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>Dismiss</button>
        </div>
      )}
      {success && (
        <div style={{ ...cardStyle, color: '#22c55e', fontSize: 13, padding: '12px 16px', marginBottom: 16, background: '#22c55e08', border: '1px solid #22c55e30' }}>
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div>
          <div style={cardStyle}>
            <label style={labelStyle}>Course Title</label>
            <input style={{ ...inputStyle, marginBottom: 14 }} placeholder="e.g. Forex Fundamentals" value={form.title} onChange={(e) => updateField('title', e.target.value)} />

            <label style={labelStyle}>Slug</label>
            <input style={{ ...inputStyle, marginBottom: 14 }} placeholder="forex-fundamentals" value={form.slug} onChange={(e) => updateField('slug', e.target.value)} />

            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} placeholder="Course description..." value={form.description} onChange={(e) => updateField('description', e.target.value)} />
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Lessons ({lessons.length})</span>
              <button style={btnOutline} onClick={() => { setLessonForm({ title: '', description: '', sort_order: lessons.length, status: 'draft' }); setShowLessonModal(true); }}>
                <Plus size={14} /> Add Lesson
              </button>
            </div>
            {lessons.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#7a7f9a', fontSize: 13, background: 'var(--bg)', borderRadius: 10 }}>
                No lessons yet. Add one to get started.
              </div>
            ) : lessons.map((l, i) => (
              <div
                key={l.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragEnter={() => handleDragEnter(i)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg)', borderRadius: 10, marginBottom: 8, cursor: 'grab' }}
              >
                <GripVertical size={14} color="#7a7f9a" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#7a7f9a', width: 24 }}>#{l.sort_order ?? i + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{l.title}</span>
                <StatusBadge status={l.status || 'draft'} />
                <button onClick={() => navigate(`/academy/lessons/${l.id}/edit`)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Pencil size={14} color="var(--orange)" />
                </button>
                <button onClick={() => handleDeleteLesson(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Trash2 size={14} color="#ef4444" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={cardStyle}>
            <label style={labelStyle}>Cover Image</label>
            {form.cover_image_url ? (
              <div style={{ marginBottom: 14, position: 'relative' }}>
                <img src={form.cover_image_url} alt="Cover" style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 10 }} />
                <button
                  onClick={() => updateField('cover_image_url', '')}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 24, height: 24, borderRadius: 6,
                    background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <X size={14} color="var(--surface)" />
                </button>
              </div>
            ) : (
              <div
                style={{
                  height: 140, background: 'var(--bg)', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px dashed #e5e7ef', marginBottom: 14, cursor: 'pointer',
                }}
                onClick={() => coverFileRef.current?.click()}
              >
                <div style={{ textAlign: 'center' }}>
                  <Image size={24} color="#7a7f9a" />
                  <div style={{ fontSize: 12, color: '#7a7f9a', marginTop: 6 }}>Click to upload or use AI below</div>
                </div>
              </div>
            )}

            {/* Upload + URL input */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Image URL or upload..."
                value={form.cover_image_url}
                onChange={(e) => updateField('cover_image_url', e.target.value)}
              />
              <button
                onClick={() => coverFileRef.current?.click()}
                disabled={uploadingCover}
                style={{ ...btnOutline, padding: '8px 14px', flexShrink: 0 }}
              >
                <Upload size={14} /> {uploadingCover ? '...' : 'Upload'}
              </button>
              <input
                ref={coverFileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleCoverUpload}
              />
            </div>

            {/* AI Generate Cover */}
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Sparkles size={14} color="#8b5cf6" />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>AI Cover Generator</span>
              </div>
              <input
                style={{ ...inputStyle, marginBottom: 8, fontSize: 12 }}
                placeholder="Style prompt: e.g. futuristic, neon, minimalist..."
                value={coverPrompt}
                onChange={(e) => setCoverPrompt(e.target.value)}
              />
              <button
                onClick={handleGenerateCover}
                disabled={generatingCover || !form.title}
                style={{ ...btnAI, width: '100%', justifyContent: 'center', opacity: generatingCover || !form.title ? 0.6 : 1 }}
              >
                <Sparkles size={14} />
                {generatingCover ? 'Generating cover...' : 'Generate Cover with AI'}
              </button>
              {!form.title && (
                <div style={{ fontSize: 11, color: '#7a7f9a', marginTop: 6, textAlign: 'center' }}>
                  Add a course title first
                </div>
              )}
            </div>

            <label style={labelStyle}>Stripe Product ID</label>
            <input style={inputStyle} placeholder="prod_..." value={form.stripe_product_id} onChange={(e) => updateField('stripe_product_id', e.target.value)} />
          </div>

          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Content Drip</span>
              <button onClick={() => updateField('drip_enabled', !form.drip_enabled)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {form.drip_enabled
                  ? <ToggleRight size={24} color="var(--orange)" />
                  : <ToggleLeft size={24} color="#7a7f9a" />
                }
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#7a7f9a', margin: 0, lineHeight: 1.5 }}>
              When enabled, lessons are unlocked on a schedule rather than all at once.
            </p>
          </div>

          <div style={cardStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 8 }}>Status</span>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={(e) => updateField('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>
      </div>

      {/* Add Lesson Modal */}
      {showLessonModal && (
        <div style={overlayStyle} onClick={() => setShowLessonModal(false)}>
          <div style={{ ...cardStyle, width: 480, maxWidth: '90vw', margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Add New Lesson</span>
              <button onClick={() => setShowLessonModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="#7a7f9a" /></button>
            </div>

            <label style={labelStyle}>Title</label>
            <input style={{ ...inputStyle, marginBottom: 12 }} placeholder="Lesson title" value={lessonForm.title} onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })} />

            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical', marginBottom: 12 }} placeholder="Brief description..." value={lessonForm.description} onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Sort Order</label>
                <input type="number" style={inputStyle} value={lessonForm.sort_order} onChange={(e) => setLessonForm({ ...lessonForm, sort_order: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select style={{ ...inputStyle, cursor: 'pointer' }} value={lessonForm.status} onChange={(e) => setLessonForm({ ...lessonForm, status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowLessonModal(false)} style={{ ...btnPrimary, background: 'var(--bg)', color: '#7a7f9a' }}>Cancel</button>
              <button onClick={handleCreateLesson} disabled={lessonSaving || !lessonForm.title} style={{ ...btnPrimary, opacity: lessonSaving || !lessonForm.title ? 0.6 : 1 }}>
                {lessonSaving ? 'Creating...' : 'Create Lesson'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
