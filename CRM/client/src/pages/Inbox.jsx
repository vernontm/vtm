import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MessageSquare, Send, Search, Plus, X, ArrowLeft } from 'lucide-react';
import { toast } from '../components/Toast';
import { getImsgThreads, getImsgThread, sendImsg } from '../api';

// Two-way iMessage inbox for the business number. Threads are grouped by the
// contact's phone. Sends are queued and delivered by the bridge running on the
// Mac signed into the business Apple ID (imessage-bridge/), which also forwards
// replies from known clients and leads back here.

const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  const ten = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return p || '';
};
const fmtTime = (t) => {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
// Outbound status as a person reads it. 'queued' and 'sending' mean the Mac
// bridge has not confirmed the send yet.
const STATUS_LABEL = { queued: 'queued', sending: 'sending', sent: 'sent', failed: 'failed' };

export default function Inbox() {
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);       // active phone
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newBody, setNewBody] = useState('');
  const scrollRef = useRef(null);

  const loadThreads = async () => {
    try { setThreads(await getImsgThreads() || []); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    loadThreads();
    const t = setInterval(loadThreads, 20000);
    return () => clearInterval(t);
  }, []);

  const openThread = async (phone) => {
    setActive(phone); setMessages([]);
    try { setMessages(await getImsgThread(phone) || []); }
    catch (e) { toast('error', e.message); }
  };
  // Poll the open thread a little faster than the list so a queued send flips
  // to sent, and replies show up, without a manual refresh.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try { setMessages(await getImsgThread(active) || []); } catch (_) { /* keep quiet on poll */ }
    }, 6000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const doSend = async () => {
    const body = reply.trim();
    if (!body || !active) return;
    setSending(true);
    try {
      await sendImsg(active, body);
      setReply('');
      setMessages(await getImsgThread(active) || []);
      loadThreads();
    } catch (e) { toast('error', e.message); }
    finally { setSending(false); }
  };

  const startNew = async () => {
    const phone = newPhone.trim(), body = newBody.trim();
    if (phone.replace(/\D/g, '').length < 10) { toast('error', 'Enter a valid phone number.'); return; }
    if (!body) { toast('error', 'Enter a message.'); return; }
    setSending(true);
    try {
      await sendImsg(phone, body);
      toast('success', 'Queued. Your Mac sends it in a few seconds.');
      setComposing(false); setNewPhone(''); setNewBody('');
      await loadThreads();
      openThread(phone);
    } catch (e) { toast('error', e.message); }
    finally { setSending(false); }
  };

  const visibleThreads = useMemo(() => {
    const list = (threads || []).slice().sort(
      (a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0)
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(t => fmtPhone(t.phone).toLowerCase().includes(q) || (t.last?.body || '').toLowerCase().includes(q));
  }, [threads, search]);

  const input = {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5,
    fontFamily: 'var(--font-display)', boxSizing: 'border-box',
  };
  const label = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-display)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Inbox</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Text your clients over iMessage from your business number. Replies land here.
          </div>
        </div>
        <button className="btn-primary" onClick={() => setComposing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> New message
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14, marginTop: 12 }}>
        {/* Threads */}
        <div style={{ width: 320, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ position: 'relative', padding: 12, borderBottom: '1px solid var(--border)' }}>
            <Search size={15} style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input placeholder="Search conversations…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, paddingLeft: 32 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: 16 }}>Loading…</div>
            ) : visibleThreads.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>
                No conversations yet.
              </div>
            ) : visibleThreads.map(t => (
              <div key={t.phone} onClick={() => openThread(t.phone)}
                style={{
                  padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: active === t.phone ? 'var(--surface-2)' : 'transparent',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{fmtPhone(t.phone)}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{fmtTime(t.last?.created_at)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.last?.direction === 'out' ? 'You: ' : ''}{t.last?.body || ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!active ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <MessageSquare size={34} style={{ marginBottom: 12, opacity: 0.6 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Select a conversation</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Or start a new message.</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => setActive(null)} className="inbox-back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'none' }}><ArrowLeft size={18} /></button>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{fmtPhone(active)}</span>
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.map(m => {
                  const out = m.direction === 'out';
                  const failed = out && m.status === 'failed';
                  return (
                    <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
                      <div style={{
                        padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        background: out ? (failed ? '#b91c1c' : 'var(--orange)') : 'var(--surface-2)',
                        color: out ? '#fff' : 'var(--text)',
                        border: out ? 'none' : '1px solid var(--border)',
                      }}>{m.body}</div>
                      <div style={{ fontSize: 10.5, color: failed ? '#b91c1c' : 'var(--muted)', marginTop: 3, textAlign: out ? 'right' : 'left' }}>
                        {fmtTime(m.created_at)}{out && m.status ? ` · ${STATUS_LABEL[m.status] || m.status}` : ''}{failed && m.error ? ` (${m.error})` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <textarea value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }}
                  placeholder="Type a message…"
                  rows={1} style={{ ...input, resize: 'none', minHeight: 40, maxHeight: 120 }} />
                <button className="btn-primary" onClick={doSend} disabled={sending || !reply.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Send size={14} /> {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {composing && (
        <div onClick={() => !sending && setComposing(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 460, maxWidth: '94vw', padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>New message</div>
              <button onClick={() => setComposing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span style={label}>To (mobile number)</span>
                <input style={input} type="tel" autoFocus value={newPhone} placeholder="(000) 000-0000"
                  onChange={e => setNewPhone(e.target.value)} />
              </div>
              <div>
                <span style={label}>Message</span>
                <textarea style={{ ...input, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }} value={newBody}
                  placeholder="Your message. It sends as an iMessage from your business number."
                  onChange={e => setNewBody(e.target.value)} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                Sends as a personal iMessage from your business number. Text people who expect to hear from you.
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setComposing(false)} disabled={sending}
                style={{ padding: '9px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button className="btn-primary" onClick={startNew} disabled={sending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Send size={14} /> {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
