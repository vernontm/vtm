import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPublicCourses } from '../api';
import {
  BookOpen, Play, Lock, Users, Award, MessageSquare,
  ChevronRight, Sparkles, CheckCircle, ArrowRight,
} from 'lucide-react';

const FONT_DISPLAY = "'Plus Jakarta Sans', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";
const ORANGE = '#ff9b26';
const ORANGE_DARK = '#ee4c27';
const BG = '#111112';
const SURFACE = '#1a1a1c';
const SURFACE_2 = '#222226';
const BORDER = 'rgba(255,255,255,0.07)';
const TEXT = '#f0f0f0';
const MUTED = '#6b6b72';

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
    <div style={{
      background: BG, minHeight: '100vh', color: TEXT, fontFamily: FONT_BODY,
      WebkitFontSmoothing: 'antialiased', position: 'relative',
    }}>
      {/* Ambient gradient overlay — matches portfolio */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,155,38,0.09) 0%, transparent 70%), radial-gradient(ellipse 40% 30% at 80% 80%, rgba(238,76,39,0.05) 0%, transparent 60%)',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Nav Bar ── */}
        <nav style={{
          padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          animation: 'fadeDown 0.6s ease both',
        }}>
          <a href="/" style={{ display: 'block', lineHeight: 0 }}>
            <img src="/Logo /VTM_logo.svg" alt="Vernon Tech & Media" style={{ height: 46, width: 'auto', display: 'block' }} />
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <Link to="/login" style={{
              color: MUTED, textDecoration: 'none', fontSize: 14, transition: 'color 0.2s',
            }}>Log In</Link>
            <Link to="/signup" style={{
              background: SURFACE_2, padding: '8px 18px', borderRadius: 8,
              color: TEXT, fontWeight: 500, fontSize: 14, textDecoration: 'none', transition: 'color 0.2s',
            }}>Get Started Free</Link>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section style={{
          textAlign: 'center', padding: '60px 40px 20px', maxWidth: 800, margin: '0 auto',
          animation: 'fadeUp 0.7s ease both',
        }}>
          <h1 style={{
            fontFamily: FONT_DISPLAY, fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: 800, lineHeight: 1.1, marginBottom: 16,
          }}>
            Master the skills that{' '}
            <em style={{ fontStyle: 'italic', color: ORANGE }}>move the needle</em>
          </h1>
          <p style={{
            fontSize: 16, color: MUTED, lineHeight: 1.7, maxWidth: 600, margin: '0 auto',
          }}>
            Practical, hands-on courses built from real-world experience.
            No fluff — just the frameworks, tools, and strategies you need to level up.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 36 }}>
            <Link to="/signup" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DARK})`,
              color: '#fff', padding: '14px 32px', borderRadius: 10,
              fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15,
              textDecoration: 'none', transition: 'transform 0.2s, box-shadow 0.2s',
              boxShadow: '0 4px 20px rgba(255,155,38,0.25)',
            }}>
              Start Learning <ArrowRight size={16} />
            </Link>
            <a href="#courses" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: SURFACE_2, border: `1px solid ${BORDER}`,
              color: TEXT, padding: '14px 32px', borderRadius: 10,
              fontWeight: 500, fontSize: 15, textDecoration: 'none', transition: 'border-color 0.2s',
            }}>
              Browse Courses <ChevronRight size={16} />
            </a>
          </div>

          {/* Stats strip */}
          {courses.length > 0 && (
            <div style={{
              display: 'flex', gap: 40, justifyContent: 'center', marginTop: 48, flexWrap: 'wrap',
            }}>
              {[
                { val: courses.length, label: 'Courses' },
                { val: totalLessons, label: 'Lessons' },
                { val: freeCourses.length > 0 ? 'Yes' : '-', label: 'Free Content' },
              ].map(({ val, label }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 28, color: ORANGE,
                  }}>{val}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Course Catalog (portfolio-style cards) ── */}
        <section id="courses" style={{
          padding: '60px 40px 40px', maxWidth: 1200, margin: '0 auto', width: '100%',
          animation: 'fadeUp 0.7s ease both', animationDelay: '0.1s',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{
              fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 'clamp(24px, 4vw, 36px)',
              marginBottom: 10,
            }}>
              Courses
            </h2>
            <p style={{ fontSize: 15, color: MUTED }}>
              Browse what's available — create a free account to start learning
            </p>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: MUTED, fontSize: 14 }}>
              Loading courses...
            </div>
          ) : courses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: MUTED, fontSize: 15 }}>
              Courses are being prepared. Check back soon!
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 24,
            }}>
              {courses.map(course => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </section>

        {/* ── What's Inside ── */}
        <section style={{
          padding: '60px 40px', maxWidth: 1000, margin: '0 auto',
          animation: 'fadeUp 0.7s ease both', animationDelay: '0.15s',
        }}>
          <h2 style={{
            fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 'clamp(24px, 4vw, 36px)',
            textAlign: 'center', marginBottom: 40,
          }}>
            Everything you need to <em style={{ fontStyle: 'italic', color: ORANGE }}>grow</em>
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
                padding: '24px 20px', borderRadius: 16,
                background: SURFACE, border: `1px solid ${BORDER}`,
                transition: 'transform 0.25s, box-shadow 0.25s',
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'rgba(255,155,38,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                }}>
                  <Icon size={18} style={{ color: ORANGE }} />
                </div>
                <h3 style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{
          textAlign: 'center', padding: '40px 40px 80px',
          animation: 'fadeUp 0.7s ease both', animationDelay: '0.2s',
        }}>
          <h2 style={{
            fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 28, marginBottom: 16,
          }}>
            Ready to start?
          </h2>
          <p style={{ color: MUTED, fontSize: 15, marginBottom: 28 }}>
            Create your free account and begin learning today. No credit card required.
          </p>
          <Link to="/signup" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: ORANGE, color: '#111', padding: '14px 32px', borderRadius: 10,
            fontWeight: 700, fontSize: 15, textDecoration: 'none',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}>
            Create Free Account <ArrowRight size={16} />
          </Link>
        </section>

        {/* ── Footer ── */}
        <footer style={{
          padding: '24px 40px', borderTop: `1px solid ${BORDER}`, textAlign: 'center',
        }}>
          <p style={{ fontSize: 12, color: MUTED }}>
            Vernon Tech & Media Academy
          </p>
        </footer>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 768px) {
          #courses .portfolio-grid-inner { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}


function CourseCard({ course }) {
  const isFree = !course.stripe_product_id;
  const hasCover = !!course.cover_image_url;
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      to="/signup"
      style={{
        display: 'block', borderRadius: 16, overflow: 'hidden',
        background: SURFACE, border: `1px solid ${BORDER}`,
        textDecoration: 'none', color: 'inherit',
        transition: 'transform 0.25s, box-shadow 0.25s',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered ? '0 12px 40px rgba(0,0,0,0.4)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Cover image — portfolio-style aspect ratio */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '16/10',
        background: hasCover ? `url(${course.cover_image_url}) center/cover` : '#0d0d0f',
        overflow: 'hidden',
      }}>
        {!hasCover && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={40} style={{ color: 'rgba(255,155,38,0.15)' }} />
          </div>
        )}
        {/* Badge — portfolio cat-badge style */}
        <div style={{
          position: 'absolute', top: 12, left: 12,
          background: 'rgba(17,17,18,0.85)', backdropFilter: 'blur(8px)',
          padding: '4px 12px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, color: isFree ? '#22c55e' : ORANGE,
          fontFamily: FONT_DISPLAY, display: 'flex', alignItems: 'center', lineHeight: 1,
        }}>
          {isFree ? 'FREE' : 'PREMIUM'}
        </div>
      </div>

      {/* Info — portfolio-info style */}
      <div style={{ padding: 20 }}>
        <h3 style={{
          fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: TEXT,
          marginBottom: 6,
        }}>
          {course.title}
        </h3>
        {course.description && (
          <p style={{
            fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 14,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {course.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: MUTED, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Play size={12} /> {course.lesson_count || 0} lessons
            </span>
            {course.free_lesson_count > 0 && (
              <span style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={12} /> {course.free_lesson_count} free
              </span>
            )}
          </div>
          <span style={{
            fontSize: 12, fontWeight: 600, color: ORANGE,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {isFree ? 'Start Free' : 'Enroll'} <ChevronRight size={14} />
          </span>
        </div>
      </div>
    </Link>
  );
}
