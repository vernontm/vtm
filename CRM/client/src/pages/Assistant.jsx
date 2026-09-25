import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader } from 'lucide-react';
import { toast } from '../components/Toast';
import { askAssistant } from '../api';

// The CRM assistant: ask about availability, leads to follow up, people, and
// the calendar. Read-only for now; it uses live CRM data through server tools.
const STARTERS = [
  'Check availability next week for a 1 hour in-person meetup',
  'Which leads need to be followed up with?',
  "What's on my calendar in the next day?",
  'Find open times tomorrow for a 30 minute call',
];

export default function Assistant() {
  const [messages, setMessages] = useState([]); // { role, content }
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: 'var(--font-display)' }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={18} style={{ color: 'var(--orange)' }} />
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>Assistant</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Ask about availability, follow-ups, people, and your calendar.</div>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {messages.length === 0 ? (
          <div style={{ maxWidth: 720, margin: '0 auto', paddingTop: 24 }}>
            <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 14 }}>Try one of these:</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {STARTERS.map(s => (
                <button key={s} onClick={() => send(s)}
                  style={{ textAlign: 'left', padding: '13px 15px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', lineHeight: 1.4 }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%', padding: '11px 15px', borderRadius: 16, fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: m.role === 'user' ? 'var(--orange)' : 'var(--surface)', color: m.role === 'user' ? '#fff' : 'var(--text)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                }}>{m.content}</div>
              </div>
            ))}
            {busy && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '11px 15px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Thinking…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: 14, background: 'var(--surface)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask the assistant…" rows={1}
            style={{ flex: 1, resize: 'none', minHeight: 44, maxHeight: 160, padding: '11px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-display)', boxSizing: 'border-box' }} />
          <button className="btn-primary" onClick={() => send()} disabled={busy || !input.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 44 }}>
            <Send size={15} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
