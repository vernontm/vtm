import React, { useState, useEffect } from 'react';
import { ClipboardCheck, CheckCircle, Clock, XCircle, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { getAcademyHomework, updateAcademyHomework } from '../api';

const pageStyle = { padding: '24px 28px', background: 'var(--bg)', minHeight: '100vh' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };

const tabs = ['All', 'pending', 'approved', 'rejected'];
const tabLabels = { All: 'All', pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

function statusColor(s) {
  if (s === 'pending') return '#f59e0b';
  if (s === 'approved') return '#22c55e';
  if (s === 'rejected') return '#ef4444';
  return '#7a7f9a';
}

function StatusIcon({ status }) {
  if (status === 'pending') return <Clock size={14} color={statusColor(status)} />;
  if (status === 'approved') return <CheckCircle size={14} color={statusColor(status)} />;
  if (status === 'rejected') return <XCircle size={14} color={statusColor(status)} />;
  return null;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AcademyHomework() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('All');
  const [expandedId, setExpandedId] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [saving, setSaving] = useState(null);

  useEffect(() => { loadHomework(); }, []);

  async function loadHomework() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademyHomework();
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(id, status) {
    try {
      setSaving(id);
      await updateAcademyHomework(id, { status, admin_feedback: feedbackText });
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status, admin_feedback: feedbackText } : s));
      setExpandedId(null);
      setFeedbackText('');
    } catch (err) {
      alert('Failed to update: ' + err.message);
    } finally {
      setSaving(null);
    }
  }

  function toggleExpand(id, currentFeedback) {
    if (expandedId === id) {
      setExpandedId(null);
      setFeedbackText('');
    } else {
      setExpandedId(id);
      setFeedbackText(currentFeedback || '');
    }
  }

  const filtered = submissions.filter(s => activeTab === 'All' || s.status === activeTab);

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
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load homework</p>
          <p style={{ fontSize: 13, color: '#7a7f9a' }}>{error}</p>
          <button onClick={loadHomework} style={{ marginTop: 12, padding: '8px 20px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f59e0b18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ClipboardCheck size={18} color="#f59e0b" />
        </div>
        <h1 style={headingStyle}>Homework Inbox</h1>
      </div>
      <p style={subStyle}>Review and grade student homework submissions across all courses.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: activeTab === tab ? '#4a6cf7' : '#fff',
              color: activeTab === tab ? '#fff' : '#7a7f9a',
              border: activeTab === tab ? 'none' : '1px solid #e5e7ef',
            }}
          >{tabLabels[tab]}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#7a7f9a', padding: 40 }}>
          No submissions found
        </div>
      ) : filtered.map(s => (
        <div key={s.id} style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}><span className="private-value">{s.student_name}</span></span>
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: statusColor(s.status) + '18', color: statusColor(s.status),
                  display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'capitalize',
                }}>
                  <StatusIcon status={s.status} /> {s.status}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 500, marginBottom: 6 }}>{s.lesson_title}</div>
              <p style={{ fontSize: 13, color: '#7a7f9a', margin: 0, lineHeight: 1.5 }}>
                {expandedId === s.id ? s.submission_text : (s.submission_text || '').slice(0, 150) + ((s.submission_text || '').length > 150 ? '...' : '')}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, marginLeft: 16 }}>
              <span style={{ fontSize: 11, color: '#7a7f9a' }}>{formatDate(s.created_at)}</span>
              <button
                onClick={() => toggleExpand(s.id, s.admin_feedback)}
                style={{ background: 'var(--bg)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
              >
                {expandedId === s.id ? <ChevronUp size={14} color="#4a6cf7" /> : <ChevronDown size={14} color="#4a6cf7" />}
              </button>
            </div>
          </div>

          {/* Expanded feedback form */}
          {expandedId === s.id && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f1f5' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'block' }}>Admin Feedback</label>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="Write your feedback for the student..."
                style={{ width: '100%', minHeight: 80, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={() => handleAction(s.id, 'approved')}
                  disabled={saving === s.id}
                  style={{ padding: '8px 18px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving === s.id ? 0.6 : 1 }}
                >
                  <CheckCircle size={14} /> Approve
                </button>
                <button
                  onClick={() => handleAction(s.id, 'rejected')}
                  disabled={saving === s.id}
                  style={{ padding: '8px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: saving === s.id ? 0.6 : 1 }}
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  onClick={() => { setExpandedId(null); setFeedbackText(''); }}
                  style={{ padding: '8px 18px', background: 'var(--bg)', color: '#7a7f9a', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >Cancel</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
