import React, { useState, useEffect } from 'react';
import { Users, Search, Eye, X, Loader2, Mail, Calendar, BookOpen } from 'lucide-react';
import { getAcademyStudents, getAcademyStudent } from '../api';

const pageStyle = { padding: '24px 28px', background: 'var(--bg)', minHeight: '100vh' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const thStyle = { textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#7a7f9a', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border)' };
const tdStyle = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid #f0f1f5' };
const searchStyle = { width: '100%', maxWidth: 360, padding: '10px 14px 10px 38px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none', background: 'var(--surface)' };

const statusColors = { active: '#22c55e', cancelled: '#ef4444', trialing: '#f59e0b', inactive: '#7a7f9a' };

function StatusBadge({ status }) {
  const color = statusColors[status] || '#7a7f9a';
  return (
    <span style={{
      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: color + '18', color,
      textTransform: 'capitalize',
    }}>{status}</span>
  );
}

function ProgressBar({ value }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#f0f1f5', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct > 70 ? '#22c55e' : '#4a6cf7', borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: '#7a7f9a', fontWeight: 500, minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AcademyStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => { loadStudents(); }, []);

  async function loadStudents() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademyStudents();
      setStudents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function viewStudent(student) {
    setSelectedStudent(student);
    setDetailLoading(true);
    try {
      const data = await getAcademyStudent(student.id);
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedStudent(null);
    setDetail(null);
  }

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return !q || (s.full_name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="#4a6cf7" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, color: '#ef4444', textAlign: 'center', padding: 40 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load students</p>
          <p style={{ fontSize: 13, color: '#7a7f9a' }}>{error}</p>
          <button onClick={loadStudents} style={{ marginTop: 12, padding: '8px 20px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={18} color="#4a6cf7" />
        </div>
        <h1 style={headingStyle}>Student Management</h1>
      </div>
      <p style={subStyle}>View and manage enrolled students, track progress, and manage access.</p>

      <div style={cardStyle}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={16} color="#7a7f9a" style={{ position: 'absolute', left: 12, top: 11 }} />
          <input
            style={searchStyle}
            placeholder="Search students by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Enrolled</th>
              <th style={thStyle}>Progress</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#7a7f9a', padding: 32 }}>No students found</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => viewStudent(s)}>
                <td style={{ ...tdStyle, fontWeight: 600 }}><span className="private-value">{s.full_name}</span></td>
                <td style={tdStyle}><span className="private-value">{s.email}</span></td>
                <td style={tdStyle}><StatusBadge status={s.subscription_status} /></td>
                <td style={tdStyle}>{formatDate(s.created_at)}</td>
                <td style={{ ...tdStyle, minWidth: 120 }}><ProgressBar value={s.completed_lessons} /></td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <button onClick={e => { e.stopPropagation(); viewStudent(s); }} style={{ background: 'var(--bg)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}><Eye size={14} color="#4a6cf7" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Student Detail Side Panel */}
      {selectedStudent && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: 'var(--surface)', boxShadow: '-4px 0 24px rgba(0,0,0,0.1)', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Student Details</h2>
            <button onClick={closeDetail} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} color="#7a7f9a" /></button>
          </div>
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            {detailLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <Loader2 size={24} color="#4a6cf7" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: 'var(--orange)' }}>
                    {(selectedStudent.full_name || '').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}><span className="private-value">{selectedStudent.full_name}</span></div>
                    <StatusBadge status={selectedStudent.subscription_status} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Mail size={14} color="#7a7f9a" />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>{selectedStudent.email}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Calendar size={14} color="#7a7f9a" />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>Enrolled {formatDate(selectedStudent.created_at)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <BookOpen size={14} color="#7a7f9a" />
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>Progress: {selectedStudent.completed_lessons || 0}%</span>
                  </div>
                </div>

                {detail && typeof detail === 'object' && (
                  <div style={{ marginTop: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Additional Info</div>
                    {detail.completed_lessons_list && detail.completed_lessons_list.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#7a7f9a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed Lessons</div>
                        {detail.completed_lessons_list.map((lesson, i) => (
                          <div key={i} style={{ fontSize: 13, color: 'var(--text)', padding: '6px 0', borderBottom: '1px solid #f0f1f5' }}>{lesson.title || lesson}</div>
                        ))}
                      </div>
                    )}
                    {detail.last_active && (
                      <div style={{ fontSize: 13, color: '#7a7f9a' }}>Last active: {formatDate(detail.last_active)}</div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Overlay */}
      {selectedStudent && (
        <div onClick={closeDetail} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.2)', zIndex: 999 }} />
      )}
    </div>
  );
}
