import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader } from 'lucide-react';
import { toast } from './Toast';
import { askAssistant } from '../api';

// Reusable assistant chat: message list + input, manages its own conversation
// and calls /api/crm/assistant. Used by the Assistant page and the Inbox popup.
export default function AssistantChat({ starters = [], placeholder = 'Ask the assistant…', compact = false }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy]);

  const send = async (text) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    const history = messages.slice();
    setMessages(m => [...m, { role: 'user', content: prompt }]);
    setInput('');
    setBusy(true);
    try {
      const r = await askAssistant(prompt, history);
      setMessages(m => [...m, { role: 'assistant', content: r?.answer || 'No answer.' }]);
    } catch (e) {
      toast('error', e.message);
      setMessages(m => [...m, { role: 'assistant', content: `Sorry, something went wrong: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  const pad = compact ? 14 : 24;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: pad }}>
        {messages.length === 0 ? (
          <div style={{ maxWidth: compact ? '100%' : 720, margin: '0 auto', paddingTop: compact ? 4 : 24 }}>
            {starters.length > 0 && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Try one of these:</div>}
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
              {starters.map(s => (
                <button key={s} onClick={() => send(s)}
                  style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: compact ? '100%' : 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '86%', padding: '10px 14px', borderRadius: 15, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: m.role === 'user' ? 'var(--orange)' : 'var(--surface)', color: m.role === 'user' ? '#fff' : 'var(--text)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                }}>{m.content}</div>
              </div>
            ))}
            {busy && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '10px 14px', borderRadius: 15, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Thinking…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: compact ? 10 : 14, background: 'var(--surface)' }}>
        <div style={{ maxWidth: compact ? '100%' : 760, margin: '0 auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={placeholder} rows={1}
            style={{ flex: 1, resize: 'none', minHeight: 42, maxHeight: 150, padding: '10px 13px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font-display)', boxSizing: 'border-box' }} />
          <button className="btn-primary" onClick={() => send()} disabled={busy || !input.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 42 }}>
            <Send size={15} />{compact ? '' : ' Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
