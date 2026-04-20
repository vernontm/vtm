import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText, Save, Sparkles, HelpCircle, Plus, Trash2, Loader2, ArrowLeft, CheckCircle,
  Upload, Film, FileImage, File, X, GripVertical,
} from 'lucide-react';
import {
  getAcademyCourses, getAcademyLesson, getAcademyLessons, updateAcademyLesson,
  generateAcademyContent, uploadAcademyFile, createLessonContent, deleteLessonContent,
  transcribeLessonMedia,
} from '../api';

const pageStyle = { padding: '24px 28px', background: 'var(--bg)', minHeight: '100vh' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 };
const btnPrimary = { padding: '10px 20px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnOutline = { padding: '10px 20px', background: 'var(--surface)', color: 'var(--orange)', border: '1px solid #4a6cf7', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnAI = { padding: '10px 20px', background: 'linear-gradient(135deg, #8b5cf6, #4a6cf7)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnDanger = { padding: '6px 12px', background: 'var(--surface)', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'block' };
const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' };

const EMPTY_QUESTION = { question: '', options: ['', '', '', ''], correct_answer: 0 };

const CONTENT_TYPE_ICONS = {
  video: Film,
  image: FileImage,
  pdf: File,
  audio: Film,
};

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getContentTypeFromMime(mime) {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'video'; // DB constraint only allows video/pdf/image/text
  if (mime === 'application/pdf') return 'pdf';
  return 'text';
}

export default function AcademyLessonEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [transcribing, setTranscribing] = useState(null); // content_id being transcribed
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    title: '', description: '', homework_prompt: '',
    sort_order: 0, status: 'draft', drip_days: 0, course_id: null, is_free_preview: false,
  });
  const [quiz, setQuiz] = useState([]);
  const [contentItems, setContentItems] = useState([]);

  useEffect(() => { loadLesson(); }, [id]);

  async function loadLesson() {
    try {
      setLoading(true);
      setError(null);

      // Try fetching lesson directly by ID (admin endpoint supports ?id=)
      let found = null;
      try {
        found = await getAcademyLesson(id);
      } catch (_) {
        // Fallback: search through courses
        const courses = await getAcademyCourses();
        for (const course of (Array.isArray(courses) ? courses : [])) {
          try {
            const lessons = await getAcademyLessons(course.id);
            const match = (Array.isArray(lessons) ? lessons : []).find(l => String(l.id) === String(id));
            if (match) { found = { ...match, course_id: course.id }; break; }
          } catch (_) { /* skip */ }
        }
      }

      if (!found) {
        setError('Lesson not found');
        setLoading(false);
        return;
      }

      setForm({
        title: found.title || '',
        description: found.description || '',
        homework_prompt: found.homework_prompt || '',
        sort_order: found.sort_order ?? 0,
        status: found.status || 'draft',
        drip_days: found.drip_days ?? 0,
        course_id: found.course_id,
        is_free_preview: found.is_free_preview || false,
      });
      setQuiz(Array.isArray(found.quiz) ? found.quiz.map(q => ({
        ...q,
        options: (q.options || []).map(o => typeof o === 'string' ? o : (o && o.text ? o.text : String(o))),
      })) : []);
      setContentItems(Array.isArray(found.academy_lesson_content) ? found.academy_lesson_content : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAll() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await updateAcademyLesson(id, { ...form, quiz });
      setSuccess('Lesson saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function normalizeOptions(opts) {
    if (!Array.isArray(opts)) return ['', '', '', ''];
    return opts.map(o => typeof o === 'string' ? o : (o && o.text ? o.text : String(o)));
  }

  async function handleGenerateAll() {
    try {
      setGenerating('all');
      setError(null);

      // Get transcript content if available
      const transcript = contentItems.find(c => c.transcript)?.transcript || '';
      const inputText = transcript || form.description || form.title;

      // Run all three in parallel
      const [titleResult, quizResult, hwResult] = await Promise.all([
        generateAcademyContent({ action: 'generate-title', content: inputText, lesson_id: id }).catch(() => null),
        generateAcademyContent({ action: 'generate-quiz', content: inputText, lesson_id: id }).catch(() => null),
        generateAcademyContent({ action: 'generate-homework', content: inputText, lesson_id: id }).catch(() => null),
      ]);

      // Apply title + description
      if (titleResult) {
        setForm(prev => ({
          ...prev,
          title: titleResult.title || prev.title,
          description: titleResult.description || prev.description,
        }));
      }

      // Apply quiz
      if (quizResult) {
        const questions = Array.isArray(quizResult.questions) ? quizResult.questions : Array.isArray(quizResult.quiz) ? quizResult.quiz : [];
        if (questions.length > 0) {
          setQuiz(questions.map(q => ({
            question: q.question || q.question_text || q.q || '',
            options: normalizeOptions(q.options || [q.a, q.b, q.c, q.d].filter(Boolean)),
            correct_answer: typeof q.correct_answer === 'number' ? q.correct_answer
              : q.correct_option_id ? q.correct_option_id.charCodeAt(0) - 97
              : (q.correct || 0),
          })));
        }
      }

      // Apply homework
      if (hwResult) {
        setForm(prev => ({
          ...prev,
          homework_prompt: hwResult.homework_prompt || hwResult.homework || hwResult.prompt || hwResult.content || prev.homework_prompt,
        }));
      }

      setSuccess('Title, description, quiz, and homework generated!');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(null);
    }
  }

  async function handleFileUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    setError(null);

    const newItems = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})...`);

        const contentType = getContentTypeFromMime(file.type);
        const path = `lessons/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

        // Upload to storage
        const uploadResult = await uploadAcademyFile('course-media', path, file, file.type);

        // Create lesson content record
        const contentRecord = await createLessonContent({
          lesson_id: id,
          content_type: contentType,
          storage_url: uploadResult.url,
          file_name: file.name,
          file_size_bytes: file.size,
          sort_order: contentItems.length + i,
        });

        newItems.push(contentRecord);
        setContentItems(prev => [...prev, contentRecord]);
      }
      setSuccess(`${files.length} file${files.length > 1 ? 's' : ''} uploaded successfully`);
      setTimeout(() => setSuccess(null), 3000);

      // Auto-transcribe video/audio files
      for (const item of newItems) {
        if (item.content_type === 'video' || item.content_type === 'audio') {
          handleTranscribe(item.id);
          break; // transcribe the first one
        }
      }
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDeleteContent(contentId) {
    if (!window.confirm('Remove this media file from the lesson?')) return;
    try {
      await deleteLessonContent(contentId);
      setContentItems(prev => prev.filter(c => c.id !== contentId));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleTranscribe(contentId) {
    try {
      setTranscribing(contentId);
      setSuccess('Transcribing media — this may take a moment...');

      // Update local state to show processing
      setContentItems(prev => prev.map(c =>
        c.id === contentId ? { ...c, transcription_status: 'processing' } : c
      ));

      const result = await transcribeLessonMedia(contentId, id);

      // Update local content item with transcript
      setContentItems(prev => prev.map(c =>
        c.id === contentId ? { ...c, transcript: result.transcript, transcription_status: 'complete' } : c
      ));

      // Update form if AI generated title/description
      if (result.generated) {
        setForm(prev => ({
          ...prev,
          title: result.generated.title && (!prev.title || prev.title === 'Untitled Lesson' || prev.title === '') ? result.generated.title : prev.title,
          description: result.generated.description && !prev.description ? result.generated.description : prev.description,
        }));
        setSuccess('Transcription complete — title and description auto-generated!');
      } else {
        setSuccess('Transcription complete!');
      }
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(`Transcription failed: ${err.message}`);
      setContentItems(prev => prev.map(c =>
        c.id === contentId ? { ...c, transcription_status: 'failed' } : c
      ));
    } finally {
      setTranscribing(null);
    }
  }

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateQuestion(index, field, value) {
    setQuiz(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function updateOption(qIndex, oIndex, value) {
    setQuiz(prev => {
      const updated = [...prev];
      const opts = [...updated[qIndex].options];
      opts[oIndex] = value;
      updated[qIndex] = { ...updated[qIndex], options: opts };
      return updated;
    });
  }

  function addQuestion() {
    setQuiz(prev => [...prev, { ...EMPTY_QUESTION, options: ['', '', '', ''] }]);
  }

  function removeQuestion(index) {
    setQuiz(prev => prev.filter((_, i) => i !== index));
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
          <button onClick={() => form.course_id ? navigate(`/academy/courses/${form.course_id}/edit`) : navigate('/academy/courses')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            <ArrowLeft size={18} color="#7a7f9a" />
          </button>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={18} color="#4a6cf7" />
          </div>
          <h1 style={headingStyle}>Edit Lesson</h1>
        </div>
        <button onClick={handleSaveAll} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          <Save size={15} /> {saving ? 'Saving...' : 'Save All'}
        </button>
      </div>
      <p style={subStyle}>Edit lesson content, upload media, configure quizzes, and use AI tools.</p>

      {error && (
        <div style={{ ...cardStyle, color: '#ef4444', fontSize: 13, padding: '12px 16px', marginBottom: 16 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 600 }}>Dismiss</button>
        </div>
      )}
      {success && (
        <div style={{ ...cardStyle, color: '#22c55e', fontSize: 13, padding: '12px 16px', marginBottom: 16, background: '#22c55e08', border: '1px solid #22c55e30' }}>
          <CheckCircle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />{success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <div>
          {/* Lesson fields */}
          <div style={cardStyle}>
            <label style={labelStyle}>Lesson Title</label>
            <input style={{ ...inputStyle, marginBottom: 14 }} placeholder="e.g. Introduction to Forex" value={form.title} onChange={(e) => updateField('title', e.target.value)} />

            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} placeholder="Lesson description — what students will learn..." value={form.description} onChange={(e) => updateField('description', e.target.value)} />
          </div>

          {/* ── Media Upload ── */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Upload size={16} color="#4a6cf7" />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  Lesson Media ({contentItems.length})
                </span>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ ...btnOutline, opacity: uploading ? 0.6 : 1 }}
              >
                <Plus size={14} /> {uploading ? uploadProgress : 'Upload Files'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*,audio/*,image/*,.pdf"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </div>

            {contentItems.length === 0 ? (
              <div
                style={{
                  padding: 32, textAlign: 'center', color: '#7a7f9a', fontSize: 13,
                  background: 'var(--bg)', borderRadius: 10, border: '2px dashed #e5e7ef',
                  cursor: 'pointer', transition: 'border-color 0.2s',
                }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#4a6cf7'; }}
                onDragLeave={(e) => { e.currentTarget.style.borderColor = '#e5e7ef'; }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = '#e5e7ef';
                  const dt = e.dataTransfer;
                  if (dt.files.length > 0) {
                    const input = fileInputRef.current;
                    // Create synthetic event
                    handleFileUpload({ target: { files: dt.files } });
                  }
                }}
              >
                <Upload size={28} color="#7a7f9a" style={{ marginBottom: 8 }} />
                <div>Drop files here or click to upload</div>
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
                  Videos, images, PDFs, audio files
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {contentItems
                  .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
                  .map((item) => {
                    const Icon = CONTENT_TYPE_ICONS[item.content_type] || File;
                    const isVideo = item.content_type === 'video';
                    const isImage = item.content_type === 'image';

                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', background: 'var(--bg)', borderRadius: 10,
                      }}>
                        {/* Thumbnail / icon */}
                        {isImage && item.storage_url ? (
                          <img src={item.storage_url} alt="" style={{
                            width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0,
                          }} />
                        ) : isVideo && item.storage_url ? (
                          <div style={{
                            width: 48, height: 48, borderRadius: 8, background: 'var(--surface)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Film size={20} color="#4a6cf7" />
                          </div>
                        ) : (
                          <div style={{
                            width: 48, height: 48, borderRadius: 8, background: '#e5e7ef',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <Icon size={20} color="#7a7f9a" />
                          </div>
                        )}

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 13, fontWeight: 500, color: 'var(--text)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.file_name || 'Unnamed file'}
                          </div>
                          <div style={{ fontSize: 11, color: '#7a7f9a', display: 'flex', gap: 12, marginTop: 2 }}>
                            <span style={{
                              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                              background: '#4a6cf718', color: 'var(--orange)', textTransform: 'uppercase',
                            }}>
                              {item.content_type}
                            </span>
                            {item.file_size_bytes && (
                              <span>{formatFileSize(item.file_size_bytes)}</span>
                            )}
                            {item.duration_seconds && (
                              <span>{Math.floor(item.duration_seconds / 60)}:{String(item.duration_seconds % 60).padStart(2, '0')}</span>
                            )}
                          </div>
                        </div>

                        {/* Transcription status */}
                        {(item.content_type === 'video' || item.content_type === 'audio') && (
                          item.transcription_status === 'processing' || transcribing === item.id ? (
                            <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 500, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Transcribing...
                            </span>
                          ) : item.transcription_status === 'complete' ? (
                            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 500, flexShrink: 0 }}>Transcribed</span>
                          ) : (
                            <button
                              onClick={() => handleTranscribe(item.id)}
                              disabled={!!transcribing}
                              style={{
                                fontSize: 11, color: '#8b5cf6', background: '#8b5cf618', border: 'none',
                                borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                              }}
                            >
                              <Sparkles size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                              Transcribe
                            </button>
                          )
                        )}

                        {/* Preview link */}
                        {item.storage_url && (
                          <a
                            href={item.storage_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: 'var(--orange)', textDecoration: 'none', fontWeight: 500, flexShrink: 0 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Preview
                          </a>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteContent(item.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}
                        >
                          <Trash2 size={14} color="#ef4444" />
                        </button>
                      </div>
                    );
                  })}

                {/* Upload more button at bottom */}
                <div
                  style={{
                    padding: 14, textAlign: 'center', color: '#7a7f9a', fontSize: 12,
                    background: 'var(--bg)', borderRadius: 10, border: '2px dashed #e5e7ef',
                    cursor: 'pointer', transition: 'border-color 0.2s',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Add more files
                </div>
              </div>
            )}
          </div>

          {/* Homework */}
          <div style={cardStyle}>
            <label style={labelStyle}>Homework Prompt</label>
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Describe the homework assignment for students..." value={form.homework_prompt} onChange={(e) => updateField('homework_prompt', e.target.value)} />
          </div>

          {/* AI Tools */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="#8b5cf6" />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>AI Tools</span>
              </div>
              <button
                style={{ ...btnAI, opacity: generating ? 0.6 : 1 }}
                disabled={!!generating}
                onClick={handleGenerateAll}
              >
                <Sparkles size={14} /> {generating ? 'Generating...' : 'Generate All'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: '#7a7f9a', marginTop: 8, marginBottom: 0 }}>
              Generates title, description, quiz, and homework from {contentItems.some(c => c.transcript) ? 'the video transcript' : 'the lesson description'}.
            </p>
          </div>
        </div>

        <div>
          {/* Settings */}
          <div style={cardStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Sort Order</label>
                <input type="number" style={inputStyle} value={form.sort_order} onChange={(e) => updateField('sort_order', parseInt(e.target.value) || 0)} />
              </div>
              <div>
                <label style={labelStyle}>Drip Days</label>
                <input type="number" style={inputStyle} value={form.drip_days} onChange={(e) => updateField('drip_days', parseInt(e.target.value) || 0)} />
              </div>
            </div>
            <label style={labelStyle}>Status</label>
            <select style={{ ...inputStyle, cursor: 'pointer', marginBottom: 14 }} value={form.status} onChange={(e) => updateField('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>

            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: 'var(--bg)', borderRadius: 10,
            }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Free Preview</span>
              <button
                onClick={() => updateField('is_free_preview', !form.is_free_preview)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 20 }}
              >
                {form.is_free_preview
                  ? <span style={{ color: '#22c55e', fontWeight: 700 }}>ON</span>
                  : <span style={{ color: '#7a7f9a' }}>OFF</span>
                }
              </button>
            </div>
          </div>

          {/* Quiz Builder */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={16} color="#22c55e" />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Quiz Builder ({quiz.length})</span>
              </div>
              <button style={btnOutline} onClick={addQuestion}><Plus size={14} /> Add Question</button>
            </div>

            {quiz.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#7a7f9a', fontSize: 13, background: 'var(--bg)', borderRadius: 10 }}>
                No quiz questions yet. Add one or use AI to generate.
              </div>
            ) : quiz.map((q, qi) => (
              <div key={qi} style={{ background: 'var(--bg)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>Question {qi + 1}</span>
                  <button onClick={() => removeQuestion(qi)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} color="#ef4444" />
                  </button>
                </div>

                <input
                  style={{ ...inputStyle, marginBottom: 10, background: 'var(--surface)' }}
                  placeholder="Question text..."
                  value={q.question}
                  onChange={(e) => updateQuestion(qi, 'question', e.target.value)}
                />

                {['A', 'B', 'C', 'D'].map((letter, oi) => (
                  <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <button
                      onClick={() => updateQuestion(qi, 'correct_answer', oi)}
                      style={{
                        width: 26, height: 26, borderRadius: 6, border: '2px solid',
                        borderColor: q.correct_answer === oi ? '#22c55e' : '#e5e7ef',
                        background: q.correct_answer === oi ? '#22c55e18' : '#fff',
                        color: q.correct_answer === oi ? '#22c55e' : '#7a7f9a',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      {letter}
                    </button>
                    <input
                      style={{ ...inputStyle, background: 'var(--surface)' }}
                      placeholder={`Option ${letter}`}
                      value={(q.options && q.options[oi]) || ''}
                      onChange={(e) => updateOption(qi, oi, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            ))}

            {quiz.length > 0 && (
              <button onClick={handleSaveAll} disabled={saving} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginTop: 8, opacity: saving ? 0.6 : 1 }}>
                <Save size={14} /> {saving ? 'Saving...' : 'Save Quiz'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
