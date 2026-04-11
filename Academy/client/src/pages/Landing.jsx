import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicCourses } from '../api';
import {
  BookOpen, Play, Lock, Users, Award, MessageSquare,
  ChevronRight, Sparkles, CheckCircle, ArrowRight,
} from 'lucide-react';

export default function Landing() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicCourses()
      .then(data => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalLessons = courses.reduce((s, c) => s + (c.lesson_count || 0), 0);
  const freeCourses = courses.filter(c => !c.stripe_product_id);
  const paidCourses = courses.filter(c => !!c.stripe_product_id);

  return (
    <div style={{ background: '#0D0600', minHeight: '100vh', color: '#f5f5f5' }}>

      {/* ── Nav Bar ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(13,6,0,0.85)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(232,101,10,0.1)',
        padding: '14px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 16, color: '#fff',
          }}>V</div>
          <span style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 18 }}>VTM Academy</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/login" style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            color: '#ccc', textDecoration: 'none', transition: 'color 0.15s',
          }}>Log In</Link>
          <Link to="/signup" style={{
            padding: '9px 22px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            color: '#fff', textDecoration: 'none', transition: 'transform 0.15s',
          }}>Get Started Free</Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        padding: '80px 32px 60px', maxWidth: 900, margin: '0 auto', textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-block', padding: '5px 16px', borderRadius: 20,
          background: 'rgba(232,101,10,0.12)', border: '1px solid rgba(232,101,10,0.2)',
          fontSize: 12, fontWeight: 600, color: '#E8650A', marginBottom: 24,
          letterSpacing: '0.03em',
        }}>
          Learn at your own pace
        </div>
        <h1 style={{
          fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(36px, 5vw, 58px)',
          lineHeight: 1.1, marginBottom: 20, letterSpacing: '-0.02em',
        }}>
          Master the skills that{' '}
          <span style={{
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>move the needle</span>
        </h1>
        <p style={{
          fontSize: 17, color: '#999', lineHeight: 1.7, maxWidth: 560,
          margin: '0 auto 36px',
        }}>
          Practical, hands-on courses built from real-world experience.
          No fluff — just the frameworks, tools, and strategies you need to level up.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/signup" style={{
            padding: '13px 32px', borderRadius: 12, fontSize: 15, fontWeight: 700,
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 24px rgba(232,101,10,0.3)',
          }}>
            Start Learning <ArrowRight size={16} />
          </Link>
          <a href="#courses" style={{
            padding: '13px 32px', borderRadius: 12, fontSize: 15, fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#ccc', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            Browse Courses <ChevronRight size={16} />
          </a>
        </div>

        {/* Stats strip */}
        {courses.length > 0 && (
          <div style={{
            display: 'flex', gap: 32, justifyContent: 'center', marginTop: 48,
            flexWrap: 'wrap',
          }}>
            {[
              { val: courses.length, label: 'Courses' },
              { val: totalLessons, label: 'Lessons' },
              { val: freeCourses.length > 0 ? 'Yes' : '-', label: 'Free Content' },
            ].map(({ val, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'Syne', fontWeight: 800, fontSize: 28, color: '#E8650A',
                }}>{val}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── What's Inside ── */}
      <section style={{
        padding: '60px 32px', maxWidth: 1000, margin: '0 auto',
      }}>
        <h2 style={{
          fontFamily: 'Syne', fontWeight: 800, fontSize: 28, textAlign: 'center',
          marginBottom: 40,
        }}>
          Everything you need to <span style={{ color: '#E8650A' }}>grow</span>
        </h2>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}>
          {[
            { icon: Play, title: 'Video Lessons', desc: 'HD video content with custom player, speed controls & progress tracking' },
            { icon: Award, title: 'Quizzes', desc: 'Test your knowledge after each lesson with interactive quizzes' },
            { icon: BookOpen, title: 'Homework', desc: 'Practical assignments with personal instructor feedback' },
            { icon: MessageSquare, title: 'Direct Messaging', desc: 'Private 1-on-1 messaging with your instructor' },
            { icon: Users, title: 'Community', desc: 'Connect with other students, share wins, and ask questions' },
            { icon: Sparkles, title: 'Free + Premium', desc: 'Start free — upgrade to premium for full access to all courses' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} style={{
              padding: '24px 20px', borderRadius: 14,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              transition: 'border-color 0.2s',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'rgba(232,101,10,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
              }}>
                <Icon size={18} style={{ color: '#E8650A' }} />
              </div>
              <h3 style={{ fontFamily: 'Syne', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</h3>
              <p style={{ fontSize: 13, color: '#777', lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Course Catalog ── */}
      <section id="courses" style={{
        padding: '60px 32px 80px', maxWidth: 1000, margin: '0 auto',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 28, marginBottom: 8 }}>
            Courses
          </h2>
          <p style={{ fontSize: 14, color: '#777' }}>
            Browse what's available — create a free account to start learning
          </p>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{
              width: 32, height: 32, border: '3px solid #2a2a2a',
              borderTopColor: '#E8650A', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite', margin: '0 auto',
            }} />
          </div>
        ) : courses.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 24px', borderRadius: 16,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <BookOpen size={36} style={{ color: '#444', marginBottom: 12 }} />
            <p style={{ color: '#777', fontSize: 15 }}>Courses are being prepared. Check back soon!</p>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
          }}>
            {courses.map(course => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      {/* ── CTA ── */}
      <section style={{
        padding: '60px 32px 80px', maxWidth: 700, margin: '0 auto', textAlign: 'center',
      }}>
        <div style={{
          padding: '48px 32px', borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(232,101,10,0.12), rgba(232,101,10,0.04))',
          border: '1px solid rgba(232,101,10,0.15)',
        }}>
          <h2 style={{ fontFamily: 'Syne', fontWeight: 800, fontSize: 26, marginBottom: 12 }}>
            Ready to start?
          </h2>
          <p style={{ fontSize: 15, color: '#999', lineHeight: 1.6, marginBottom: 28 }}>
            Create your free account and begin learning today. No credit card required.
          </p>
          <Link to="/signup" style={{
            padding: '13px 36px', borderRadius: 12, fontSize: 15, fontWeight: 700,
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 24px rgba(232,101,10,0.3)',
          }}>
            Create Free Account <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: '24px 32px', borderTop: '1px solid rgba(255,255,255,0.06)',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 12, color: '#555' }}>
          Vernon Tech & Media Academy
        </p>
      </footer>
    </div>
  );
}


function CourseCard({ course }) {
  const isFree = !course.stripe_product_id;
  const hasCover = !!course.cover_image_url;

  return (
    <Link
      to="/signup"
      style={{
        display: 'block', borderRadius: 16, overflow: 'hidden',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        textDecoration: 'none', color: 'inherit', transition: 'border-color 0.2s, transform 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(232,101,10,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Cover image or gradient placeholder */}
      <div style={{
        height: 160, position: 'relative', overflow: 'hidden',
        background: hasCover ? `url(${course.cover_image_url}) center/cover` : 'linear-gradient(135deg, #1a1008, #0D0600)',
      }}>
        {!hasCover && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={40} style={{ color: 'rgba(232,101,10,0.2)' }} />
          </div>
        )}
        {/* Badge */}
        <div style={{
          position: 'absolute', top: 12, right: 12,
          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: isFree ? 'rgba(34,197,94,0.9)' : 'rgba(232,101,10,0.9)',
          color: '#fff', letterSpacing: '0.02em',
        }}>
          {isFree ? 'FREE' : 'PREMIUM'}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '18px 20px 20px' }}>
        <h3 style={{
          fontFamily: 'Syne', fontSize: 17, fontWeight: 700, color: '#f5f5f5',
          marginBottom: 6, lineHeight: 1.3,
        }}>
          {course.title}
        </h3>
        {course.description && (
          <p style={{
            fontSize: 13, color: '#888', lineHeight: 1.5, marginBottom: 14,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {course.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Play size={12} /> {course.lesson_count || 0} lessons
            </span>
            {course.free_lesson_count > 0 && (
              <span style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={12} /> {course.free_lesson_count} free
              </span>
            )}
          </div>
          <span style={{
            fontSize: 12, fontWeight: 600, color: '#E8650A',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {isFree ? 'Start Free' : 'Enroll'} <ChevronRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}
