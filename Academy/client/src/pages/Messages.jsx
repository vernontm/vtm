import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMessages, sendMessage } from '../api';
import { Loader, Send } from 'lucide-react';

export default function Messages() {
  const { session } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const intervalRef = useRef(null);

  const userId = session?.user?.id;

  useEffect(() => {
    loadMessages();
    intervalRef.current = setInterval(loadMessages, 10000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    try {
      const data = await getMessages();
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
    setLoading(false);
  }

  async function handleSend() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendMessage({ message: text.trim() });
      setText('');
      await loadMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
    }
    setSending(false);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  // Group messages by date
  const grouped = [];
  let lastDate = '';
  for (const msg of messages) {
    const date = formatDate(msg.created_at);
    if (date !== lastDate) {
      grouped.push({ type: 'date', label: date });
      lastDate = date;
    }
    grouped.push({ type: 'msg', data: msg });
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <h1 style={{ fontFamily: 'Syne', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Messages</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
        Chat with your instructor.
      </p>

      {/* Message area */}
      <div style={{
        flex: 1, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 20, display: 'flex', flexDirection: 'column', gap: 8,
        minHeight: 300,
      }}>
        {messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No messages yet. Say hello!</p>
          </div>
        )}

        {grouped.map((item, idx) => {
          if (item.type === 'date') {
            return (
              <div key={`d-${idx}`} style={{ textAlign: 'center', margin: '12px 0' }}>
                <span style={{
                  fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-primary)',
                  padding: '4px 12px', borderRadius: 10,
                }}>{item.label}</span>
              </div>
            );
          }
          const msg = item.data;
          const isMe = msg.sender_id === userId;
          return (
            <div key={msg.id || idx} style={{
              display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '70%', padding: '10px 16px', borderRadius: 14,
                background: isMe
                  ? 'linear-gradient(135deg, #E8650A, #ff8c3a)'
                  : 'var(--bg-primary)',
                color: isMe ? '#fff' : 'var(--text-primary)',
                fontSize: 14, lineHeight: 1.5,
                borderBottomRightRadius: isMe ? 4 : 14,
                borderBottomLeftRadius: isMe ? 14 : 4,
              }}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{msg.message}</p>
                <p style={{
                  fontSize: 10, marginTop: 4,
                  color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
                  textAlign: 'right',
                }}>{formatTime(msg.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div style={{
        display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-end',
      }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Type a message..."
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-primary)', fontSize: 14, outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button onClick={handleSend} disabled={sending || !text.trim()} style={{
          padding: '12px 18px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
          color: '#fff', cursor: sending ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: sending || !text.trim() ? 0.6 : 1,
        }}>
          {sending ? <Loader size={18} className="spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
