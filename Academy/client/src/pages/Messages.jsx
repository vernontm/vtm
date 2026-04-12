import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getMessages, sendMessage } from '../api';
import { Loader, Send, MessageSquare } from 'lucide-react';

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
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', margin: '-24px -28px', padding: 0 }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageSquare size={18} color="#E8650A" />
          </div>
          <div>
            <h1 style={{ fontFamily: 'Inter', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Messages</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Chat with your instructor</p>
          </div>
        </div>
      </div>

      {/* Message area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '20px 28px',
        display: 'flex', flexDirection: 'column', gap: 8,
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
                  fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-surface)',
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
                  : 'var(--bg-card)',
                color: isMe ? '#fff' : 'var(--text-primary)',
                fontSize: 14, lineHeight: 1.5,
                borderBottomRightRadius: isMe ? 4 : 14,
                borderBottomLeftRadius: isMe ? 14 : 4,
                border: isMe ? 'none' : '1px solid var(--border)',
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

      {/* Compose — stuck to bottom */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 28px 16px',
        borderTop: '1px solid var(--border)', background: 'var(--bg-surface)',
        alignItems: 'flex-end',
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
