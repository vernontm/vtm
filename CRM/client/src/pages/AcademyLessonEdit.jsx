import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Save, Sparkles, HelpCircle, Plus, Trash2, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { getAcademyCourses, getAcademyLessons, updateAcademyLesson, generateAcademyContent } from '../api';

const pageStyle = { padding: '24px 28px', background: '#f5f7fa', minHeight: '100vh' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 20, marginBottom: 16 };
const btnPrimary = { padding: '10px 20px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnOutline = { padding: '10px 20px', background: '#fff', color: '#4a6cf7', border: '1px solid #4a6cf7', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnAI = { padding: '10px 20px', background: 'linear-gradient(135deg, #8b5cf6, #4a6cf7)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#1a1a2e', marginBottom: 6, display: 'block' };
const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e5e7ef', borderRadius: 10, fontSize: 13, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box' };

const EMPTY_QUESTION = { question: '', options: ['', '', '', ''], correct_answer: 0 };

export default function AcademyLessonEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(null); // track which AI action is running
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    title: '', description: '', content: '', homework_prompt: '',
    sort_order: 0, status: 'draft', drip_days: 0, course_id: null,
  });
  const [quiz, setQuiz] = useState([]);

  useEffect(() => { loadLesson(); }, [id]);

  async function loadLesson() {
    try {
      setLoading(true);
      setError(null);
      // We need course_id to fetch lessons; try fetching with a broad query
      // The admin-lessons endpoint may support fetching by lesson id directly
      // We'll try fetching all lessons by omitting course_id, or by searching
      // Since the API requires course_id, we'll use a workaround:
      // Fetch all courses, then search each for our lesson
      const courses = await getAcademyCourses();
      let found = null;
      for (const course of (Array.isArray(courses) ? courses : [])) {
        try {
          const lessons = await getAcademyLessons(course.id);
          const match = (Array.isArray(lessons) ? lessons : []).find(l => String(l.id) === String(id));
          if (match) { found = { ...match, course_id: course.id }; break; }
        } catch (_) { /* skip */ }
      }
      if (!found) {
        setError('Lesson not found');
        setLoading(false);
        return;
      }
      setForm({
        title: found.title || '',
        description: found.description || '',
        content: found.content || '',
        homework_prompt: found.homework_prompt || '',
        sort_order: found.sort_order ?? 0,
        status: found.status || 'draft',
        drip_days: found.drip_days ?? 0,
        course_id: found.course_id,
      });
      setQuiz(Array.isArray(found.quiz) ? found.quiz : []);
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

  async function handleGenerate(action) {
    try {
      setGenerating(action);
      setError(null);
      const result = await generateAcademyContent({
        action,
        content: form.content || form.description || form.title,
        lesson_id: id,
      });
      if (action === 'generate-title' && result) {
        setForm(prev => ({
          ...prev,
          title: result.title || prev.title,
          description: result.description || prev.description,
        }));
      } else if (action === 'generate-quiz' && result) {
        const questions = Array.isArray(result.questions) ? result.questions : Array.isArray(result.quiz) ? result.quiz : [];
        if (questions.length > 0) {
          setQuiz(questions.map(q => ({
            question: q.question || q.q || '',
            options: q.options || [q.a, q.b, q.c, q.d].filter(Boolean) || ['', '', '', ''],
            correct_answer: typeof q.correct_answer === 'number' ? q.correct_answer : (q.correct || 0),
          })));
        }
      } else if (action === 'generate-homework' && result) {
        setForm(prev => ({
          ...prev,
          homework_prompt: result.homework_prompt || result.homework || result.content || prev.homework_prompt,
        }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(null);
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
      <p style={subStyle}>Edit lesson content, configure quizzes, and use AI tools.</p>

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
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginBottom: 14 }} placeholder="Brief lesson description..." value={form.description} onChange={(e) => updateField('description', e.target.value)} />

            <label style={labelStyle}>Lesson Content</label>
            <textarea style={{ ...inputStyle, minHeight: 200, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Write or paste your lesson content here..." value={form.content} onChange={(e) => updateField('content', e.target.value)} />
          </div>

          {/* Homework */}
          <div style={cardStyle}>
            <label style={labelStyle}>Homework Prompt</label>
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Describe the homework assignment for students..." value={form.homework_prompt} onChange={(e) => updateField('homework_prompt', e.target.value)} />
          </div>

          {/* AI Tools */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Sparkles size={16} color="#8b5cf6" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>AI Tools</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                style={{ ...btnAI, opacity: generating ? 0.6 : 1 }}
                disabled={!!generating}
                onClick={() => handleGenerate('generate-title')}
              >
                <Sparkles size={14} /> {generating === 'generate-title' ? 'Generating...' : 'Generate Title & Description'}
              </button>
              <button
                style={{ ...btnAI, opacity: generating ? 0.6 : 1 }}
                disabled={!!generating}
                onClick={() => handleGenerate('generate-quiz')}
              >
                <Sparkles size={14} /> {generating === 'generate-quiz' ? 'Generating...' : 'Generate Quiz'}
              </button>
              <button
                style={{ ...btnAI, opacity: generating ? 0.6 : 1 }}
                disabled={!!generating}
                onClick={() => handleGenerate('generate-homework')}
              >
                <Sparkles size={14} /> {generating === 'generate-homework' ? 'Generating...' : 'Generate Homework'}
              </button>
            </div>
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
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={form.status} onChange={(e) => updateField('status', e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          {/* Quiz Builder */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <HelpCircle size={16} color="#22c55e" />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>Quiz Builder ({quiz.length})</span>
              </div>
              <button style={btnOutline} onClick={addQuestion}><Plus size={14} /> Add Question</button>
            </div>

            {quiz.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#7a7f9a', fontSize: 13, background: '#f5f7fa', borderRadius: 10 }}>
                No quiz questions yet. Add one or use AI to generate.
              </div>
            ) : quiz.map((q, qi) => (
              <div key={qi} style={{ background: '#f5f7fa', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#4a6cf7' }}>Question {qi + 1}</span>
                  <button onClick={() => removeQuestion(qi)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} color="#ef4444" />
                  </button>
                </div>

                <input
                  style={{ ...inputStyle, marginBottom: 10, background: '#fff' }}
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
                      style={{ ...inputStyle, background: '#fff' }}
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
