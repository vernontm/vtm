import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getCommunityPosts, createCommunityPost, createCommunityReply } from '../api';
import { Loader, Send, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';

const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
};

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  fontFamily: 'inherit', resize: 'vertical',
};

const btnStyle = {
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

export default function Community() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);
  const [expandedPost, setExpandedPost] = useState(null);
  const [replyText, setReplyText] = useState({});
  const [replyLoading, setReplyLoading] = useState({});

  useEffect(() => {
    loadPosts();
  }, []);

  async function loadPosts() {
    try {
      const data = await getCommunityPosts();
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load posts:', err);
    }
    setLoading(false);
  }

  async function handlePost() {
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      await createCommunityPost({ message: newPost.trim() });
      setNewPost('');
      await loadPosts();
    } catch (err) {
      console.error('Failed to create post:', err);
    }
    setPosting(false);
  }

  async function handleReply(postId) {
    const text = replyText[postId]?.trim();
    if (!text) return;
    setReplyLoading(prev => ({ ...prev, [postId]: true }));
    try {
      await createCommunityReply(postId, { message: text });
      setReplyText(prev => ({ ...prev, [postId]: '' }));
      await loadPosts();
    } catch (err) {
      console.error('Failed to reply:', err);
    }
    setReplyLoading(prev => ({ ...prev, [postId]: false }));
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString();
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Community</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Connect with fellow students and share your journey.
      </p>

      {/* Compose */}
      <div style={{ ...cardStyle, padding: 20, marginBottom: 24 }}>
        <textarea
          rows={3}
          value={newPost}
          onChange={e => setNewPost(e.target.value)}
          placeholder="Share something with the community..."
          style={inputStyle}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={handlePost} disabled={posting || !newPost.trim()} style={{
            ...btnStyle, opacity: posting || !newPost.trim() ? 0.6 : 1,
            cursor: posting ? 'not-allowed' : 'pointer',
          }}>
            {posting ? <Loader size={14} className="spin" /> : <Send size={14} />}
            Post
          </button>
        </div>
      </div>

      {/* Feed */}
      {posts.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
          <MessageSquare size={32} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No posts yet. Be the first to share!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map(post => {
            const expanded = expandedPost === post.id;
            const initial = (post.author_name || '?')[0].toUpperCase();
            return (
              <div key={post.id} style={{ ...cardStyle, padding: 20 }}>
                {/* Author row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0,
                  }}>{initial}</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{post.author_name || 'Student'}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTime(post.created_at)}</p>
                  </div>
                </div>

                {/* Message */}
                <p style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 14, whiteSpace: 'pre-wrap' }}>
                  {post.message}
                </p>

                {/* Reply toggle */}
                <button onClick={() => setExpandedPost(expanded ? null : post.id)} style={{
                  background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                }}>
                  <MessageSquare size={14} />
                  {post.reply_count ?? post.replies?.length ?? 0} replies
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {/* Replies */}
                {expanded && (
                  <div style={{ marginTop: 14, paddingLeft: 20, borderLeft: '2px solid var(--border)' }}>
                    {(post.replies || []).map(r => (
                      <div key={r.id} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', flexShrink: 0,
                          }}>{(r.author_name || '?')[0].toUpperCase()}</div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.author_name || 'Student'}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatTime(r.created_at)}</span>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, paddingLeft: 32 }}>{r.message}</p>
                      </div>
                    ))}

                    {/* Reply input */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input
                        value={replyText[post.id] || ''}
                        onChange={e => setReplyText(prev => ({ ...prev, [post.id]: e.target.value }))}
                        placeholder="Write a reply..."
                        onKeyDown={e => e.key === 'Enter' && handleReply(post.id)}
                        style={{ ...inputStyle, padding: '8px 12px', fontSize: 13 }}
                      />
                      <button onClick={() => handleReply(post.id)} disabled={replyLoading[post.id]} style={{
                        ...btnStyle, padding: '8px 14px', fontSize: 13, flexShrink: 0,
                      }}>
                        <Send size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
