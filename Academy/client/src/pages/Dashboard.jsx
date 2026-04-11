import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCourses, getProgress } from '../api';
import { BookOpen, Activity, PlayCircle, Loader } from 'lucide-react';

const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 24,
};

const btnStyle = {
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
};

export default function Dashboard() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getCourses();
        const enrolled = Array.isArray(data) ? data : [];
        setCourses(enrolled);

        const pMap = {};
        for (const c of enrolled) {
          try {
            const p = await getProgress(c.id);
            pMap[c.id] = p;
          } catch { /* no progress yet */ }
        }
        setProgressMap(pMap);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  const lastCourse = courses[0];
  const lastProgress = lastCourse ? progressMap[lastCourse.id] : null;
  const lastLessonId = lastProgress?.last_lesson_id;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      {/* Welcome */}
      <h1 style={{ fontFamily: 'Syne', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>
        Welcome back, {firstName}
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
        Here's what's happening in your academy.
      </p>

      {/* Continue Learning */}
      {lastCourse && lastLessonId && (
        <div style={{ ...cardStyle, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <PlayCircle size={32} style={{ color: '#E8650A' }} />
            <div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>Continue Learning</p>
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{lastCourse.title}</p>
            </div>
          </div>
          <Link to={`/learn/${lastLessonId}`} style={btnStyle}>
            Resume
          </Link>
        </div>
      )}

      {/* My Courses */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BookOpen size={18} style={{ color: '#E8650A' }} />
        <h2 style={{ fontFamily: 'Syne', fontSize: 20, color: 'var(--text-primary)' }}>My Courses</h2>
      </div>

      {courses.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
          <BookOpen size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 16 }}>
            No courses yet. Browse the catalog to get started.
          </p>
          <Link to="/courses" style={btnStyle}>Browse Courses</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 32 }}>
          {courses.map(c => {
            const prog = progressMap[c.id];
            const pct = prog?.percent_complete ?? 0;
            return (
              <Link to={`/courses/${c.slug}`} key={c.id} style={{ textDecoration: 'none' }}>
                <div style={cardStyle}>
                  {c.cover_url && (
                    <img src={c.cover_url} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10, marginBottom: 12 }} />
                  )}
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{c.title}</h3>
                  <div style={{ background: 'var(--bg-primary)', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(135deg, #E8650A, #ff8c3a)', borderRadius: 6, transition: 'width 0.4s' }} />
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Math.round(pct)}% complete</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Recent Activity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Activity size={18} style={{ color: '#E8650A' }} />
        <h2 style={{ fontFamily: 'Syne', fontSize: 20, color: 'var(--text-primary)' }}>Recent Activity</h2>
      </div>
      <div style={{ ...cardStyle, textAlign: 'center', padding: 40 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Your recent activity will appear here.</p>
      </div>
    </div>
  );
}
