import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCourses } from '../api';
import { BookOpen, Loader, PlayCircle } from 'lucide-react';

const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 14, overflow: 'hidden', textDecoration: 'none',
  display: 'flex', flexDirection: 'column', transition: 'border-color 0.2s',
};

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCourses()
      .then(data => setCourses(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load courses:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Course Catalog</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
        Browse all available courses and start learning.
      </p>

      {courses.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
          textAlign: 'center', padding: 48,
        }}>
          <BookOpen size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>No courses available yet. Check back soon!</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {courses.map(c => (
            <Link to={`/courses/${c.slug}`} key={c.id} style={cardStyle}>
              {c.cover_image_url ? (
                <img src={c.cover_image_url} alt="" style={{ width: '100%', height: 160, objectFit: 'cover' }} />
              ) : (
                <div style={{
                  width: '100%', height: 160, background: 'var(--bg-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <PlayCircle size={40} style={{ color: 'var(--text-muted)' }} />
                </div>
              )}
              <div style={{ padding: 20, flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                  {c.title}
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14, flex: 1, lineHeight: 1.5 }}>
                  {c.description?.slice(0, 120)}{c.description?.length > 120 ? '...' : ''}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {c.lesson_count ?? '—'} lessons
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#E8650A' }}>View Course</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
