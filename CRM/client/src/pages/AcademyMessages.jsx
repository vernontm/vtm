import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Search, Circle, Loader2 } from 'lucide-react';
import { getAcademyThreads, getAcademyThread, sendAcademyMessage } from '../api';

const pageStyle = { padding: '24px 28px', background: '#f5f7fa', minHeight: '100vh' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 0, marginBottom: 16, overflow: 'hidden' };
const headingStyle = { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const searchStyle = { width: '100%', padding: '10px 14px 10px 38px', border: 'none', borderBottom: '1px solid #e5e7ef', fontSize: 13, color: '#1a1a2e', outline: 'none', background: '#fff', boxSizing: 'border-box' };

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'now';
  if (diffMins < 60) return diffMins + 'm ago';
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return diffHours + 'h ago';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return diffDays + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function AcademyMessages() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => { loadThreads(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (selectedThread) {
      pollRef.current = setInterval(() => {
        loadMessages(selectedThread.student_id || selectedThread.id, true);
      }, 10000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedThread]);

  async function loadThreads() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademyThreads();
      setThreads(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(studentId, silent = false) {
    if (!silent) setMessagesLoading(true);
    try {
      const data = await getAcademyThread(studentId);
      setMessages(Array.isArray(data) ? data : (data?.messages || []));
    } catch {
      if (!silent) setMessages([]);
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }

  async function selectThread(thread) {
    setSelectedThread(thread);
    setMessageText('');
    const studentId = thread.student_id || thread.id;
    await loadMessages(studentId);
  }

  async function handleSend() {
    if (!messageText.trim() || !selectedThread) return;
    const studentId = selectedThread.student_id || selectedThread.id;
    try {
      setSending(true);
      await sendAcademyMessage({ student_id: studentId, message: messageText.trim() });
      setMessageText('');
      await loadMessages(studentId, true);
    } catch (err) {
      alert('Failed to send: ' + err.message);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const filteredThreads = threads.filter(t => {
    const q = searchQuery.toLowerCase();
    return !q || (t.student_name || t.full_name || '').toLowerCase().includes(q);
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
        <div style={{ ...cardStyle, padding: 40, color: '#ef4444', textAlign: 'center' }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load messages</p>
          <p style={{ fontSize: 13, color: '#7a7f9a' }}>{error}</p>
          <button onClick={loadThreads} style={{ marginTop: 12, padding: '8px 20px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MessageSquare size={18} color="#4a6cf7" />
        </div>
        <h1 style={headingStyle}>Student Messages</h1>
      </div>
      <p style={subStyle}>Direct messaging with students. Respond to questions and provide support.</p>

      <div style={{ ...cardStyle, display: 'flex', height: 520 }}>
        {/* Left panel - thread list */}
        <div style={{ width: 300, borderRight: '1px solid #e5e7ef', display: 'flex', flexDirection: 'column' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="#7a7f9a" style={{ position: 'absolute', left: 12, top: 11 }} />
            <input
              style={searchStyle}
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredThreads.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#7a7f9a', fontSize: 13 }}>No conversations</div>
            ) : filteredThreads.map((t, i) => {
              const isSelected = selectedThread && (selectedThread.student_id || selectedThread.id) === (t.student_id || t.id);
              return (
                <div
                  key={t.student_id || t.id || i}
                  onClick={() => selectThread(t)}
                  style={{
                    padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f1f5',
                    background: isSelected ? '#4a6cf708' : '#fff',
                    borderLeft: isSelected ? '3px solid #4a6cf7' : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{t.student_name || t.full_name}</span>
                    <span style={{ fontSize: 11, color: '#7a7f9a' }}>{formatTime(t.last_message_at || t.updated_at)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {(t.unread_count > 0) && <Circle size={7} fill="#4a6cf7" color="#4a6cf7" />}
                    <span style={{ fontSize: 12, color: '#7a7f9a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.last_message || t.preview || ''}</span>
                    {(t.unread_count > 0) && (
                      <span style={{ marginLeft: 'auto', background: '#4a6cf7', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px', minWidth: 16, textAlign: 'center' }}>{t.unread_count}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel - messages */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!selectedThread ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7a7f9a', fontSize: 13 }}>
              Select a conversation to view messages
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7ef' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{selectedThread.student_name || selectedThread.full_name}</span>
              </div>

              <div style={{ flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messagesLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <Loader2 size={22} color="#4a6cf7" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#7a7f9a', fontSize: 13, padding: 40 }}>No messages yet</div>
                ) : messages.map((m, i) => {
                  const isAdmin = m.from === 'admin' || m.sender === 'admin' || m.is_admin;
                  return (
                    <div key={m.id || i} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '70%', padding: '10px 14px', borderRadius: 12,
                        background: isAdmin ? '#4a6cf7' : '#f5f7fa',
                        color: isAdmin ? '#fff' : '#1a1a2e',
                      }}>
                        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{m.message || m.text}</div>
                        <div style={{ fontSize: 10, marginTop: 4, opacity: 0.7 }}>{formatMessageTime(m.created_at || m.time)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '12px 20px', borderTop: '1px solid #e5e7ef', display: 'flex', gap: 10 }}>
                <input
                  style={{ flex: 1, padding: '10px 14px', border: '1px solid #e5e7ef', borderRadius: 10, fontSize: 13, outline: 'none' }}
                  placeholder="Type a message..."
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !messageText.trim()}
                  style={{
                    padding: '10px 16px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 10,
                    cursor: sending || !messageText.trim() ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13,
                    opacity: sending || !messageText.trim() ? 0.6 : 1,
                  }}
                >
                  {sending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />} Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
