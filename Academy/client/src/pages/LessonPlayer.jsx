import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getLesson, getLessons, getProgress, updateProgress,
  getQuiz, submitQuiz, getHomework, submitHomework,
} from '../api';
import VideoPlayer from '../components/VideoPlayer';
import {
  Loader, ChevronLeft, CheckCircle, PlayCircle, Lock,
  FileText, Image, Send, Trophy, AlertCircle, Check, X,
  ChevronDown, ChevronUp,
} from 'lucide-react';

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
};
const sectionTitle = {
  fontFamily: 'Syne', fontSize: 18, color: 'var(--text-primary)', marginBottom: 12,
};

export default function LessonPlayer() {
  const { lessonId } = useParams();

  // Core data
  const [lesson, setLesson] = useState(null);
  const [allLessons, setAllLessons] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Quiz
  const [quiz, setQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);

  // Homework
  const [hwPrompt, setHwPrompt] = useState('');
  const [hwSubmissions, setHwSubmissions] = useState([]);
  const [hwText, setHwText] = useState('');
  const [hwSubmitting, setHwSubmitting] = useState(false);
  const [hwSuccess, setHwSuccess] = useState(false);
  const [showHomework, setShowHomework] = useState(false);

  // Progress save
  const saveTimer = useRef(null);
  const lastSaved = useRef(0);

  // Sidebar toggle (mobile)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load lesson + related data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setQuiz(null);
      setQuizResult(null);
      setQuizAnswers({});
      setHwSubmissions([]);
      setHwText('');
      setHwSuccess(false);
      try {
        const data = await getLesson(lessonId);
        if (cancelled) return;
        setLesson(data);

        // Load lessons list + progress in parallel
        if (data?.course_id) {
          const [lessons, progress] = await Promise.all([
            getLessons(data.course_id),
            getProgress(data.course_id),
          ]);
          if (cancelled) return;
          setAllLessons(Array.isArray(lessons) ? lessons.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : []);
          const pMap = {};
          (Array.isArray(progress) ? progress : []).forEach(p => { pMap[p.lesson_id] = p; });
          setProgressMap(pMap);
        }

        // Load quiz
        try {
          const q = await getQuiz(lessonId);
          if (!cancelled && q) setQuiz(q);
        } catch {}

        // Load homework
        if (data?.homework_prompt) {
          setHwPrompt(data.homework_prompt);
          try {
            const hw = await getHomework(lessonId);
            if (!cancelled) setHwSubmissions(Array.isArray(hw) ? hw : []);
          } catch {}
        }
      } catch (err) {
        console.error('Failed to load lesson:', err);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [lessonId]);

  // Debounced progress save (every 30s)
  const saveProgress = useCallback((watchSeconds, duration) => {
    const now = Date.now();
    if (now - lastSaved.current < 30000) return;
    lastSaved.current = now;

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const completed = duration > 0 && watchSeconds / duration >= 0.95;
      updateProgress({
        lesson_id: lessonId,
        watch_seconds: Math.round(watchSeconds),
        completed,
      }).then(result => {
        if (result && result.lesson_id) {
          setProgressMap(prev => ({ ...prev, [result.lesson_id]: result }));
        }
      }).catch(() => {});
    }, 1000);
  }, [lessonId]);

  // On video complete
  const handleComplete = useCallback(() => {
    updateProgress({
      lesson_id: lessonId,
      watch_seconds: Math.round(lesson?.duration || 0),
      completed: true,
    }).then(result => {
      if (result?.lesson_id) {
        setProgressMap(prev => ({ ...prev, [result.lesson_id]: result }));
      }
    }).catch(() => {});
  }, [lessonId, lesson]);

  // Save on unmount
  useEffect(() => {
    return () => clearTimeout(saveTimer.current);
  }, []);

  // Quiz handlers
  async function handleQuizSubmit() {
    if (!quiz) return;
    const questions = quiz.academy_quiz_questions || [];
    if (Object.keys(quizAnswers).length < questions.length) return;
    setQuizSubmitting(true);
    try {
      const result = await submitQuiz({ quiz_id: quiz.id, answers: quizAnswers });
      setQuizResult(result);
    } catch (err) {
      console.error('Quiz submit error:', err);
    }
    setQuizSubmitting(false);
  }

  // Homework handlers
  async function handleHomeworkSubmit(e) {
    e.preventDefault();
    if (!hwText.trim()) return;
    setHwSubmitting(true);
    try {
      const result = await submitHomework({ lesson_id: lessonId, submission_text: hwText });
      setHwSubmissions(prev => [result, ...prev]);
      setHwText('');
      setHwSuccess(true);
      setTimeout(() => setHwSuccess(false), 3000);
    } catch (err) {
      console.error('Homework submit error:', err);
    }
    setHwSubmitting(false);
  }

  // Find video content from lesson
  const videoContent = lesson?.academy_lesson_content?.find(c => c.content_type === 'video');
  const pdfContent = lesson?.academy_lesson_content?.find(c => c.content_type === 'pdf');
  const textContent = lesson?.content;
  const currentProgress = progressMap[lessonId];

  // Navigation helpers
  const currentIdx = allLessons.findIndex(l => l.id === lessonId);
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null;
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null;

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Lesson not found.</p>
        <Link to="/courses" style={{ color: '#E8650A', fontSize: 14, marginTop: 12, display: 'inline-block' }}>Back to courses</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 40px' }}>
      {/* Back link */}
      <Link to={lesson.course_slug ? `/courses/${lesson.course_slug}` : '/courses'} style={{
        color: 'var(--text-muted)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4,
        textDecoration: 'none', marginBottom: 16,
      }}>
        <ChevronLeft size={16} /> Back to course
      </Link>

      {/* Mobile sidebar toggle */}
      <button
        className="lesson-sidebar-toggle"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          display: 'none', width: '100%', padding: '10px 16px', marginBottom: 12,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
          color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer',
          justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>Lesson {currentIdx + 1} of {allLessons.length}</span>
        {sidebarOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Video Player */}
          {videoContent ? (
            <div style={{ marginBottom: 24 }}>
              <VideoPlayer
                src={videoContent.storage_url}
                poster={lesson.thumbnail_url}
                initialTime={currentProgress?.watch_seconds || 0}
                onTimeUpdate={saveProgress}
                onComplete={handleComplete}
              />
            </div>
          ) : pdfContent ? (
            <div style={{ ...card, marginBottom: 24, overflow: 'hidden' }}>
              <iframe
                src={pdfContent.storage_url}
                style={{ width: '100%', height: 600, border: 'none' }}
                title={lesson.title}
              />
            </div>
          ) : null}

          {/* Lesson Info */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h1 style={{ fontFamily: 'Syne', fontSize: 24, color: 'var(--text-primary)', flex: 1 }}>
                {lesson.title}
              </h1>
              {currentProgress?.completed && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                  borderRadius: 20, background: 'rgba(34,197,94,0.15)', color: '#22c55e',
                  fontSize: 12, fontWeight: 600,
                }}>
                  <CheckCircle size={13} /> Completed
                </span>
              )}
            </div>
            {lesson.description && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>
                {lesson.description}
              </p>
            )}
          </div>

          {/* Text content (markdown-like) */}
          {textContent && (
            <div style={{ ...card, padding: 24, marginBottom: 24 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                {textContent}
              </div>
            </div>
          )}

          {/* Quiz Section */}
          {quiz && quiz.academy_quiz_questions?.length > 0 && (
            <div style={{ ...card, marginBottom: 24, overflow: 'hidden' }}>
              <button
                onClick={() => setShowQuiz(!showQuiz)}
                style={{
                  width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', background: 'none', border: 'none',
                  borderBottom: showQuiz ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', color: 'var(--text-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Trophy size={18} style={{ color: '#E8650A' }} />
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 700 }}>
                    Lesson Quiz
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ({quiz.academy_quiz_questions.length} questions)
                  </span>
                </div>
                {showQuiz ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {showQuiz && (
                <div style={{ padding: 20 }}>
                  {quizResult ? (
                    <QuizResults result={quizResult} questions={quiz.academy_quiz_questions} answers={quizAnswers} />
                  ) : (
                    <>
                      {quiz.academy_quiz_questions.map((q, qi) => (
                        <div key={q.id} style={{ marginBottom: 24 }}>
                          <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                            {qi + 1}. {q.question_text || q.question}
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(q.options || []).map((opt) => {
                              const selected = quizAnswers[q.id] === opt.id;
                              return (
                                <label
                                  key={opt.id}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                                    borderRadius: 8, cursor: 'pointer',
                                    background: selected ? 'rgba(232,101,10,0.1)' : 'var(--bg-surface)',
                                    border: selected ? '1px solid rgba(232,101,10,0.3)' : '1px solid var(--border)',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  <input
                                    type="radio"
                                    name={`q-${q.id}`}
                                    checked={selected}
                                    onChange={() => setQuizAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                                    style={{ accentColor: '#E8650A' }}
                                  />
                                  <span style={{ fontSize: 13, color: selected ? '#E8650A' : 'var(--text-secondary)' }}>
                                    {opt.text}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={handleQuizSubmit}
                        disabled={quizSubmitting || Object.keys(quizAnswers).length < quiz.academy_quiz_questions.length}
                        style={{
                          padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: Object.keys(quizAnswers).length >= quiz.academy_quiz_questions.length ? '#E8650A' : '#333',
                          color: '#fff', fontSize: 14, fontWeight: 600,
                          opacity: quizSubmitting ? 0.6 : 1,
                        }}
                      >
                        {quizSubmitting ? 'Submitting...' : 'Submit Quiz'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Homework Section */}
          {hwPrompt && (
            <div style={{ ...card, marginBottom: 24, overflow: 'hidden' }}>
              <button
                onClick={() => setShowHomework(!showHomework)}
                style={{
                  width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', background: 'none', border: 'none',
                  borderBottom: showHomework ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', color: 'var(--text-primary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText size={18} style={{ color: '#E8650A' }} />
                  <span style={{ fontFamily: 'Syne', fontSize: 16, fontWeight: 700 }}>Homework</span>
                </div>
                {showHomework ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {showHomework && (
                <div style={{ padding: 20 }}>
                  {/* Assignment prompt */}
                  <div style={{
                    padding: 16, borderRadius: 10, background: 'rgba(232,101,10,0.06)',
                    border: '1px solid rgba(232,101,10,0.15)', marginBottom: 20,
                  }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#E8650A', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Assignment
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {hwPrompt}
                    </p>
                  </div>

                  {/* Previous submissions */}
                  {hwSubmissions.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
                        Your Submissions
                      </p>
                      {hwSubmissions.map((sub, i) => (
                        <div key={sub.id || i} style={{
                          padding: 14, borderRadius: 10, background: 'var(--bg-surface)',
                          border: '1px solid var(--border)', marginBottom: 8,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                              color: sub.status === 'approved' ? '#22c55e' : sub.status === 'rejected' ? '#ef4444' : '#f59e0b',
                              padding: '2px 8px', borderRadius: 4,
                              background: sub.status === 'approved' ? 'rgba(34,197,94,0.1)' : sub.status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                            }}>
                              {sub.status}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {new Date(sub.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {sub.submission_text}
                          </p>
                          {sub.admin_feedback && (
                            <div style={{
                              marginTop: 10, padding: 10, borderRadius: 8,
                              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
                            }}>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', marginBottom: 4 }}>Instructor Feedback</p>
                              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{sub.admin_feedback}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Submit form */}
                  <form onSubmit={handleHomeworkSubmit}>
                    <textarea
                      value={hwText}
                      onChange={(e) => setHwText(e.target.value)}
                      placeholder="Write your homework submission here..."
                      rows={5}
                      style={{
                        width: '100%', padding: 14, borderRadius: 10, border: '1px solid var(--border)',
                        background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 14,
                        resize: 'vertical', lineHeight: 1.6, outline: 'none',
                      }}
                      onFocus={(e) => e.target.style.borderColor = '#E8650A'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                      <button
                        type="submit"
                        disabled={hwSubmitting || !hwText.trim()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '9px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: hwText.trim() ? '#E8650A' : '#333', color: '#fff',
                          fontSize: 13, fontWeight: 600, opacity: hwSubmitting ? 0.6 : 1,
                        }}
                      >
                        <Send size={14} /> {hwSubmitting ? 'Submitting...' : 'Submit Homework'}
                      </button>
                      {hwSuccess && (
                        <span style={{ fontSize: 13, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Check size={14} /> Submitted successfully
                        </span>
                      )}
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* Prev / Next navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            {prevLesson ? (
              <Link to={`/learn/${prevLesson.id}`} style={{
                fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4,
                textDecoration: 'none', padding: '8px 14px', borderRadius: 8,
                border: '1px solid var(--border)', transition: 'border-color 0.15s',
              }}>
                <ChevronLeft size={14} /> Previous Lesson
              </Link>
            ) : <div />}
            {nextLesson ? (
              <Link to={`/learn/${nextLesson.id}`} style={{
                fontSize: 13, color: '#E8650A', display: 'flex', alignItems: 'center', gap: 4,
                textDecoration: 'none', padding: '8px 14px', borderRadius: 8,
                background: 'rgba(232,101,10,0.1)', border: '1px solid rgba(232,101,10,0.2)',
                fontWeight: 600, transition: 'background 0.15s',
              }}>
                Next Lesson <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
              </Link>
            ) : null}
          </div>
        </div>

        {/* Sidebar - Lesson List */}
        <div
          className="lesson-sidebar"
          style={{
            width: 280, minWidth: 280, ...card, padding: 0, overflow: 'hidden', alignSelf: 'flex-start',
            position: 'sticky', top: 20,
          }}
        >
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Syne' }}>
              Course Outline
            </h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'DM Mono, monospace' }}>
              {Object.values(progressMap).filter(p => p.completed).length}/{allLessons.length}
            </span>
          </div>
          <div style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
            {allLessons.map((l, i) => {
              const active = l.id === lessonId;
              const prog = progressMap[l.id];
              const completed = prog?.completed;
              return (
                <Link
                  key={l.id}
                  to={`/learn/${l.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px',
                    textDecoration: 'none',
                    borderLeft: active ? '3px solid #E8650A' : '3px solid transparent',
                    background: active ? 'rgba(232,101,10,0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, fontFamily: 'DM Mono, monospace',
                    background: completed ? 'rgba(34,197,94,0.15)' : active ? 'rgba(232,101,10,0.15)' : 'var(--bg-surface)',
                    color: completed ? '#22c55e' : active ? '#E8650A' : 'var(--text-muted)',
                    border: completed ? '1px solid rgba(34,197,94,0.3)' : active ? '1px solid rgba(232,101,10,0.3)' : '1px solid var(--border)',
                  }}>
                    {completed ? <Check size={12} /> : i + 1}
                  </span>
                  <span style={{
                    fontSize: 13, flex: 1,
                    color: active ? '#E8650A' : completed ? '#22c55e' : 'var(--text-secondary)',
                    fontWeight: active ? 600 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {l.title}
                  </span>
                  {prog && !completed && prog.watch_seconds > 0 && (
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', position: 'relative',
                      background: `conic-gradient(#E8650A ${(prog.watch_seconds / (l.duration || 1)) * 360}deg, var(--border) 0deg)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--bg-card)' }} />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 900px) {
          .lesson-sidebar { display: none !important; }
          .lesson-sidebar-toggle { display: flex !important; }
        }
      `}</style>
    </div>
  );
}

/* Quiz Results sub-component */
function QuizResults({ result, questions, answers }) {
  const passed = result.score >= 70;
  return (
    <div>
      <div style={{
        textAlign: 'center', padding: 24, marginBottom: 20,
        borderRadius: 12, background: passed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
        border: passed ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
        }}>
          {passed ? <Trophy size={28} style={{ color: '#22c55e' }} /> : <AlertCircle size={28} style={{ color: '#ef4444' }} />}
        </div>
        <h3 style={{ fontFamily: 'Syne', fontSize: 20, color: passed ? '#22c55e' : '#ef4444', marginBottom: 4 }}>
          {passed ? 'Great Job!' : 'Keep Studying'}
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          You scored <strong style={{ color: passed ? '#22c55e' : '#ef4444' }}>{result.score}%</strong>
        </p>
      </div>

      {/* Show answers */}
      {questions.map((q, qi) => {
        const userAnswer = answers[q.id];
        const isCorrect = userAnswer === q.correct_option_id;
        return (
          <div key={q.id} style={{ marginBottom: 16 }}>
            <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {isCorrect ? <Check size={14} style={{ color: '#22c55e' }} /> : <X size={14} style={{ color: '#ef4444' }} />}
              {qi + 1}. {q.question_text || q.question}
            </p>
            {(q.options || []).map(opt => {
              const isSelected = opt.id === userAnswer;
              const isAnswer = opt.id === q.correct_option_id;
              return (
                <div key={opt.id} style={{
                  padding: '8px 12px', borderRadius: 6, marginBottom: 3, fontSize: 13,
                  background: isAnswer ? 'rgba(34,197,94,0.1)' : isSelected && !isAnswer ? 'rgba(239,68,68,0.1)' : 'transparent',
                  color: isAnswer ? '#22c55e' : isSelected && !isAnswer ? '#ef4444' : 'var(--text-muted)',
                  border: isAnswer ? '1px solid rgba(34,197,94,0.2)' : isSelected && !isAnswer ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  {isAnswer && <Check size={12} />}
                  {isSelected && !isAnswer && <X size={12} />}
                  {opt.text}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
