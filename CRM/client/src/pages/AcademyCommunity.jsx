import React, { useState, useEffect } from 'react';
import { Users, Pin, Trash2, MessageCircle, Loader2 } from 'lucide-react';
import { getAcademyCommunityPosts, deleteAcademyPost, pinAcademyPost } from '../api';

const pageStyle = { padding: '24px 28px', background: '#f5f7fa', minHeight: '100vh' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 20, marginBottom: 16 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + 'm ago';
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours + 'h ago';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return diffDays + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function AcademyCommunity() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => { loadPosts(); }, []);

  async function loadPosts() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademyCommunityPosts();
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePin(id) {
    try {
      setActionLoading(id);
      await pinAcademyPost(id);
      setPosts(prev => prev.map(p => p.id === id ? { ...p, pinned: !p.pinned } : p));
    } catch (err) {
      alert('Failed to update pin: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    try {
      setActionLoading(id);
      await deleteAcademyPost(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = posts
    .filter(p => filter === 'All' || (filter === 'Pinned' && p.pinned))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
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
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load community posts</p>
          <p style={{ fontSize: 13, color: '#7a7f9a' }}>{error}</p>
          <button onClick={loadPosts} style={{ marginTop: 12, padding: '8px 20px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#22c55e18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={18} color="#22c55e" />
        </div>
        <h1 style={headingStyle}>Community Moderation</h1>
      </div>
      <p style={subStyle}>Moderate community posts, pin important content, and manage discussions.</p>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['All', 'Pinned'].map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: filter === tab ? '#4a6cf7' : '#fff',
              color: filter === tab ? '#fff' : '#7a7f9a',
              border: filter === tab ? 'none' : '1px solid #e5e7ef',
            }}
          >{tab}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#7a7f9a', padding: 40 }}>No posts found</div>
      ) : filtered.map(post => (
        <div key={post.id} style={{ ...cardStyle, borderLeft: post.pinned ? '3px solid #f59e0b' : undefined, opacity: actionLoading === post.id ? 0.6 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 12, flex: 1 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#4a6cf7', flexShrink: 0 }}>
                {getInitials(post.author_name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{post.author_name}</span>
                  <span style={{ fontSize: 11, color: '#7a7f9a' }}>{formatDate(post.created_at)}</span>
                  {post.pinned && (
                    <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600, background: '#f59e0b18', color: '#f59e0b', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <Pin size={10} /> Pinned
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: '#3a3a4e', margin: 0, lineHeight: 1.6 }}>{post.message}</p>
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: '#7a7f9a', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MessageCircle size={13} /> {post.reply_count || 0} replies
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
              <button
                onClick={() => handlePin(post.id)}
                disabled={actionLoading === post.id}
                style={{ background: post.pinned ? '#f59e0b18' : '#f5f7fa', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                title={post.pinned ? 'Unpin post' : 'Pin post'}
              >
                <Pin size={14} color="#f59e0b" />
              </button>
              <button
                onClick={() => handleDelete(post.id)}
                disabled={actionLoading === post.id}
                style={{ background: '#f5f7fa', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer' }}
                title="Delete post"
              >
                <Trash2 size={14} color="#ef4444" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
