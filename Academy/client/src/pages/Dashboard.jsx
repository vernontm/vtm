import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCourses, getProgress, getLessons, getBillingStatus } from '../api';
import { BookOpen, Activity, PlayCircle, Loader, TrendingUp, CheckCircle, Clock, Zap, ArrowRight, Crown } from 'lucide-react';

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 24,
};

export default function Dashboard() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [lessonMap, setLessonMap] = useState({});
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [data, bill] = await Promise.all([
          getCourses(),
          getBillingStatus().catch(() => null),
        ]);
        const enrolled = Array.isArray(data) ? data : [];
        setCourses(enrolled);
        setBilling(bill);

        const pMap = {};
        const lMap = {};
        await Promise.all(enrolled.map(async (c) => {
          try {
            const [prog, lessons] = await Promise.all([
              getProgress(c.id).catch(() => []),
              getLessons(c.id).catch(() => []),
            ]);
            pMap[c.id] = Array.isArray(prog) ? prog : [];
            lMap[c.id] = Array.isArray(lessons) ? lessons : [];
          } catch {}
        }));
        setProgressMap(pMap);
        setLessonMap(lMap);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      }
      setLoading(false);
    }
    load();
  }, []);

  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const isPremium = billing?.subscription_status === 'active';

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  // Compute stats
  let totalLessons = 0;
  let completedLessons = 0;
  let totalWatchSeconds = 0;
  let lastActivity = null;
  const recentItems = [];

  for (const c of courses) {
    const lessons = lessonMap[c.id] || [];
    const prog = progressMap[c.id] || [];
    totalLessons += lessons.length;

    for (const p of prog) {
      if (p.completed) completedLessons++;
      totalWatchSeconds += p.watch_seconds || 0;
      if (p.last_watched_at) {
        const lesson = lessons.find(l => l.id === p.lesson_id);
        recentItems.push({
          type: p.completed ? 'completed' : 'watched',
          lessonTitle: lesson?.title || 'Lesson',
          courseTitle: c.title,
          lessonId: p.lesson_id,
          at: p.last_watched_at,
        });
        if (!lastActivity || new Date(p.last_watched_at) > new Date(lastActivity.at)) {
          lastActivity = { lessonId: p.lesson_id, courseTitle: c.title, lessonTitle: lesson?.title, at: p.last_watched_at };
        }
      }
    }
  }

  recentItems.sort((a, b) => new Date(b.at) - new Date(a.at));
  const overallPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const watchHours = Math.floor(totalWatchSeconds / 3600);
  const watchMins = Math.floor((totalWatchSeconds % 3600) / 60);

  function timeAgo(ts) {
    if (!ts) return '';
    const diff = (Date.now() - new Date(ts)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  return (
    <div>
      {/* Upgrade Banner */}
      {!isPremium && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(232,101,10,0.15) 0%, rgba(255,140,58,0.08) 100%)',
          border: '1px solid rgba(232,101,10,0.25)',
          borderRadius: 14, padding: '20px 24px', marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Crown size={22} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                Upgrade to Premium
              </p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Unlock all courses, lessons, and exclusive content with a premium subscription.
              </p>
            </div>
          </div>
          <Link to="/account" style={{
            padding: '10px 22px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            Upgrade <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Welcome */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        Welcome back, {firstName}
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
        Here's your learning progress overview.
      </p>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={16} color="#E8650A" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Overall Progress</span>
          </div>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{overallPct}%</p>
          <div style={{ background: 'var(--bg-primary)', borderRadius: 6, height: 6, overflow: 'hidden', marginTop: 8 }}>
            <div style={{ width: `${overallPct}%`, height: '100%', background: 'linear-gradient(135deg, #E8650A, #ff8c3a)', borderRadius: 6, transition: 'width 0.4s' }} />
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={16} color="#22c55e" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Lessons Completed</span>
          </div>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{completedLessons}<span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}> / {totalLessons}</span></p>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={16} color="#3b82f6" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Watch Time</span>
          </div>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
            {watchHours > 0 ? `${watchHours}h ${watchMins}m` : `${watchMins}m`}
          </p>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={16} color="#f59e0b" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Enrolled Courses</span>
          </div>
          <p style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>{courses.length}</p>
        </div>
      </div>

      {/* Continue Learning */}
      {lastActivity && (
        <Link to={`/learn/${lastActivity.lessonId}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 24 }}>
          <div style={{
            ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 16, cursor: 'pointer',
            border: '1px solid rgba(232,101,10,0.2)', background: 'rgba(232,101,10,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <PlayCircle size={22} color="#fff" />
              </div>
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Continue Learning</p>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{lastActivity.lessonTitle || 'Resume lesson'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lastActivity.courseTitle}</p>
              </div>
            </div>
            <div style={{
              padding: '8px 18px', borderRadius: 8,
              background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              Resume <ArrowRight size={14} />
            </div>
          </div>
        </Link>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: courses.length > 0 ? '1fr 1fr' : '1fr', gap: 24 }}>
        {/* My Courses */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={16} style={{ color: '#E8650A' }} />
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>My Courses</h2>
            </div>
            <Link to="/courses" style={{ fontSize: 12, color: '#E8650A', fontWeight: 600, textDecoration: 'none' }}>View all</Link>
          </div>

          {courses.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 48 }}>
              <BookOpen size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                No courses yet. Browse the catalog to get started.
              </p>
              <Link to="/courses" style={{
                padding: '10px 20px', borderRadius: 10, border: 'none',
                background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
                color: '#fff', fontSize: 14, fontWeight: 600, textDecoration: 'none',
              }}>Browse Courses</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {courses.map(c => {
                const lessons = lessonMap[c.id] || [];
                const prog = progressMap[c.id] || [];
                const done = prog.filter(p => p.completed).length;
                const pct = lessons.length > 0 ? Math.round((done / lessons.length) * 100) : 0;
                return (
                  <Link to={`/courses/${c.slug}`} key={c.id} style={{ textDecoration: 'none' }}>
                    <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16 }}>
                      {c.cover_image_url ? (
                        <img src={c.cover_image_url} alt="" style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 80, height: 56, borderRadius: 8, background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <PlayCircle size={20} color="var(--text-muted)" />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{c.title}</p>
                        <div style={{ background: 'var(--bg-primary)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(135deg, #E8650A, #ff8c3a)', borderRadius: 4 }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{pct}%</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Activity size={16} style={{ color: '#E8650A' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Recent Activity</h2>
          </div>

          {recentItems.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 40 }}>
              <Activity size={28} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Your activity will appear here as you learn.</p>
            </div>
          ) : (
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              {recentItems.slice(0, 8).map((item, i) => (
                <Link to={`/learn/${item.lessonId}`} key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                  borderBottom: i < Math.min(recentItems.length, 8) - 1 ? '1px solid var(--border)' : 'none',
                  textDecoration: 'none',
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    background: item.type === 'completed' ? 'rgba(34,197,94,0.1)' : 'var(--primary-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {item.type === 'completed'
                      ? <CheckCircle size={14} color="#22c55e" />
                      : <PlayCircle size={14} color="#E8650A" />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.type === 'completed' ? 'Completed' : 'Watched'} {item.lessonTitle}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.courseTitle}</p>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(item.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
