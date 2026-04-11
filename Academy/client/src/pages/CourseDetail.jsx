import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getCourse, getLessons, getProgress } from '../api';
import { Loader, CheckCircle, Lock, Eye, PlayCircle } from 'lucide-react';

const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
};

export default function CourseDetail() {
  const { slug } = useParams();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const cData = await getCourse(slug);
        const c = Array.isArray(cData) ? cData[0] : cData;
        setCourse(c);
        if (c?.id) {
          const [ls, p] = await Promise.all([
            getLessons(c.id),
            getProgress(c.id).catch(() => null),
          ]);
          setLessons(Array.isArray(ls) ? ls.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) : []);
          setProgress(p);
        }
      } catch (err) {
        console.error('Failed to load course:', err);
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  if (!course) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16 }}>Course not found.</p>
        <Link to="/courses" style={{ color: '#E8650A', fontSize: 14, marginTop: 12, display: 'inline-block' }}>Back to courses</Link>
      </div>
    );
  }

  const completedIds = new Set(progress?.completed_lessons || []);
  const pct = progress?.percent_complete ?? 0;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Course Header */}
      {course.cover_url && (
        <img src={course.cover_url} alt="" style={{
          width: '100%', height: 240, objectFit: 'cover', borderRadius: 14, marginBottom: 24,
        }} />
      )}
      <h1 style={{ fontFamily: 'Syne', fontSize: 28, color: 'var(--text-primary)', marginBottom: 8 }}>
        {course.title}
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
        {course.description}
      </p>

      {/* Progress bar */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{lessons.length} lessons</span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{Math.round(pct)}% complete</span>
        </div>
        <div style={{ background: 'var(--bg-primary)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(135deg, #E8650A, #ff8c3a)', borderRadius: 6, transition: 'width 0.4s' }} />
        </div>
      </div>

      {/* Lesson List */}
      <div style={{ ...cardStyle, overflow: 'hidden' }}>
        {lessons.map((lesson, idx) => {
          const done = completedIds.has(lesson.id);
          const locked = lesson.drip_locked;
          const isPreview = lesson.free_preview;

          return (
            <div key={lesson.id} style={{
              borderBottom: idx < lessons.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {locked ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                  opacity: 0.5, cursor: 'not-allowed',
                }}>
                  <Lock size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{lesson.title}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Available soon</p>
                  </div>
                </div>
              ) : (
                <Link to={`/learn/${lesson.id}`} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                  textDecoration: 'none', transition: 'background 0.15s',
                }}>
                  {done ? (
                    <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0 }} />
                  ) : (
                    <PlayCircle size={18} style={{ color: '#E8650A', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{lesson.title}</p>
                    {lesson.duration_label && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{lesson.duration_label}</p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isPreview && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: '#E8650A', background: 'rgba(232,101,10,0.1)',
                        padding: '3px 8px', borderRadius: 6,
                      }}>
                        <Eye size={12} style={{ marginRight: 3, verticalAlign: -1 }} />Free Preview
                      </span>
                    )}
                  </div>
                </Link>
              )}
            </div>
          );
        })}
        {lessons.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No lessons published yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
