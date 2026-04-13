import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, X, Send, Loader, Check, Edit3, Minimize2, Maximize2 } from 'lucide-react';
import { emailAgent, runBulkAgent, createQueueItem, sendQueueItem } from '../api';

/* ── page context config ────────────────────────────────────────── */
const PAGE_CONTEXTS = {
  '/dashboard':         { label: 'Dashboard',         type: 'general',  placeholder: 'Ask anything about your CRM...' },
  '/leads':             { label: 'Leads',              type: 'general',  placeholder: 'Ask about leads, outreach, follow-ups...' },
  '/contacts':          { label: 'Contacts',           type: 'general',  placeholder: 'Ask about contacts, relationships...' },
  '/projects':          { label: 'Projects',           type: 'general',  placeholder: 'Ask about projects, deals...' },
  '/email':             { label: 'Email',              type: 'email',    placeholder: 'Describe the email you want to create...' },
  '/content-scheduler': { label: 'Content',            type: 'content',  placeholder: 'Describe a task for your content accounts...' },
  '/outreach':          { label: 'Outreach',           type: 'general',  placeholder: 'Ask about outreach campaigns...' },
  '/meetings':          { label: 'Meetings',           type: 'general',  placeholder: 'Ask about meetings, scheduling...' },
  '/invoices':          { label: 'Invoices',           type: 'general',  placeholder: 'Ask about invoices, billing...' },
  '/todos':             { label: 'Todos',              type: 'general',  placeholder: 'Ask about tasks, to-dos...' },
  '/blog':              { label: 'Blog',               type: 'general',  placeholder: 'Ask about blog posts, content...' },
  '/subscriptions':     { label: 'Subscriptions',      type: 'general',  placeholder: 'Ask about subscriptions...' },
  '/portfolio':         { label: 'Portfolio',           type: 'general',  placeholder: 'Ask about portfolio items...' },
  '/quick-notes':       { label: 'Notes',              type: 'general',  placeholder: 'Ask about notes...' },
  '/settings':          { label: 'Settings',           type: 'general',  placeholder: 'Ask about settings...' },
  '/notifications':     { label: 'Notifications',      type: 'general',  placeholder: 'Ask about notifications...' },
};

const QUICK_BUTTONS = {
  email: [
    'Write a cold outreach email to a new lead',
    'Follow up with a client about their project',
    'Send a check-in email to a client',
    'Write a proposal email for AI services',
  ],
  content: [
    { label: 'Create 5 posts for all accounts', icon: '\ud83d\udcdd' },
    { label: 'Schedule 10 Threads posts for all accounts', icon: '\ud83d\udcc5' },
    { label: 'Generate AI automation posts for all accounts', icon: '\ud83e\udd16' },
    { label: 'Schedule all unscheduled content', icon: '\u23f0' },
  ],
  general: [
    'What leads need follow-up?',
    'Summarize my pipeline',
    'Draft a quick email',
    'What tasks are overdue?',
  ],
};

function getContext(pathname) {
  const match = Object.entries(PAGE_CONTEXTS).find(([path]) => pathname.startsWith(path));
  return match ? match[1] : { label: 'CRM', type: 'general', placeholder: 'Ask me anything...' };
}

export default function GlobalAgent() {
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = getContext(location.pathname);

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (open && endRef.current) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages, loading, open]);

  /* ── handle send ──────────────────────────────────────────────── */
  const handleSend = async (overrideMsg) => {
    const msg = (overrideMsg || input).trim();
    if (!msg || loading) return;
    if (!overrideMsg) setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    setDraft(null);

    try {
      if (ctx.type === 'email') {
        // Email agent
        const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const result = await emailAgent({ prompt: msg, conversation: convo });
        if (result.action === 'ask' || result.needs_info) {
          setMessages(prev => [...prev, { role: 'assistant', content: result.question || 'Could you provide more details?' }]);
        } else if (result.action === 'draft_email') {
          setDraft(result);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Email ready for ${result.to_name || result.to_email}${result.reasoning ? `\n\n${result.reasoning}` : ''}`,
            isDraft: true,
          }]);
        }
      } else if (ctx.type === 'content') {
        // Bulk agent
        const result = await runBulkAgent({ prompt: msg });
        let summary = `${result.interpretation}\n\n`;
        summary += `Completed ${result.successful}/${result.total_actions} actions:\n`;
        for (const r of result.results) {
          const icon = r.status === 'success' ? '\u2705' : r.status === 'skipped' ? '\u23ed' : '\u274c';
          const detail = r.status === 'success'
            ? (r.count ? `${r.count} posts created` : r.scheduled ? `${r.scheduled} scripts scheduled` : 'done')
            : (r.reason || r.error || r.status);
          summary += `${icon} ${r.client_name}: ${detail}\n`;
        }
        setMessages(prev => [...prev, { role: 'assistant', content: summary.trim() }]);
      } else {
        // General CRM agent
        const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const res = await fetch('/api/crm/global-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: msg, conversation: convo, page: location.pathname }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Agent error');
        const result = await res.json();
        if (result.action === 'draft_email') {
          setDraft(result);
          setMessages(prev => [...prev, { role: 'assistant', content: result.reasoning || `Email draft ready for ${result.to_name || result.to_email}` }]);
        } else if (result.action === 'navigate') {
          setMessages(prev => [...prev, { role: 'assistant', content: result.message || 'Navigating...' }]);
          if (result.path) navigate(result.path);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: result.message || result.answer || JSON.stringify(result) }]);
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }]);
    }
    setLoading(false);
  };

  /* ── draft actions ────────────────────────────────────────────── */
  const handleApprove = async () => {
    if (!draft) return;
    setSending(true);
    try {
      const queueItem = await createQueueItem({
        lead_email: draft.to_email,
        lead_name: draft.to_name || '',
        subject_lines: JSON.stringify([draft.subject]),
        body: draft.body,
        status: 'draft',
        email_type: 'agent_generated',
        auto_generated: true,
        generated_at: new Date().toISOString(),
      });
      await sendQueueItem(queueItem.id);
      setMessages(prev => [...prev, { role: 'system', content: `\u2705 Email sent to ${draft.to_email}` }]);
      setDraft(null);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'system', content: '\u274c Failed to send: ' + e.message }]);
    }
    setSending(false);
  };

  const handleEdit = () => {
    if (!draft) return;
    // Navigate to email page with compose params
    navigate(`/email?compose=${encodeURIComponent(draft.to_email)}&name=${encodeURIComponent(draft.to_name || '')}`);
    setDraft(null);
  };

  const handleDeny = () => {
    setDraft(null);
    setMessages(prev => [...prev, { role: 'system', content: 'Draft discarded.' }]);
  };

  const clearChat = () => {
    setMessages([]);
    setDraft(null);
    setInput('');
  };

  const quickBtns = QUICK_BUTTONS[ctx.type] || QUICK_BUTTONS.general;

  /* ── floating button (closed state) ───────────────────────────── */
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 8000,
        width: 52, height: 52, borderRadius: '50%',
        background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)',
        border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(74,108,247,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(74,108,247,0.5)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(74,108,247,0.4)'; }}
      >
        <MessageSquare size={22} color="#fff" />
      </button>
    );
  }

  /* ── minimized bar ────────────────────────────────────────────── */
  if (minimized) {
    return (
      <div onClick={() => setMinimized(false)} style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 8000,
        background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)',
        borderRadius: 14, padding: '10px 18px', cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(74,108,247,0.4)',
        display: 'flex', alignItems: 'center', gap: 10, color: '#fff',
      }}>
        <MessageSquare size={16} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Agent - {ctx.label}</span>
        {loading && <Loader size={14} className="spin" />}
        <Maximize2 size={14} style={{ marginLeft: 8, opacity: 0.7 }} />
      </div>
    );
  }

  /* ── full panel ───────────────────────────────────────────────── */
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 8000,
      background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', border: '1px solid #e5e7ef',
      width: 400, maxWidth: 'calc(100vw - 40px)', height: 500, maxHeight: 'calc(100vh - 80px)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px',
        background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)',
        flexShrink: 0, gap: 8,
      }}>
        <MessageSquare size={16} color="#fff" />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', flex: 1 }}>
          Agent
          <span style={{ fontWeight: 400, opacity: 0.8, marginLeft: 6, fontSize: 11 }}>{ctx.label}</span>
        </span>
        <button onClick={clearChat} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600 }}>Clear</button>
        <button onClick={() => setMinimized(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 2 }}><Minimize2 size={14} /></button>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 2 }}><X size={14} /></button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '24px 10px', color: '#8e8ea0', fontSize: 12, lineHeight: 1.7 }}>
            {ctx.type === 'email' ? (
              <>Tell me what email to write.<br /><span style={{ fontSize: 11, opacity: 0.7 }}>e.g. "Follow up with John at Acme about our AI services"</span></>
            ) : ctx.type === 'content' ? (
              <>Describe a task for your content accounts.<br /><span style={{ fontSize: 11, opacity: 0.7 }}>e.g. "Create 5 posts for every client"</span></>
            ) : (
              <>Ask me anything about your CRM.<br /><span style={{ fontSize: 11, opacity: 0.7 }}>Context-aware based on current page</span></>
            )}
          </div>
        )}

        {/* Quick buttons */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, justifyContent: 'center' }}>
            {quickBtns.map((q, i) => {
              const label = typeof q === 'string' ? q : q.label;
              const icon = typeof q === 'object' ? q.icon : null;
              return (
                <button key={i} onClick={() => handleSend(label)}
                  style={{
                    padding: '5px 10px', borderRadius: 8, border: '1px solid #e5e7ef',
                    background: '#f8f9fc', fontSize: 10, color: '#5a5a6e', cursor: 'pointer',
                    fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  {icon && <span>{icon}</span>} {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Message bubbles */}
        {messages.map((msg, i) => (
          <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{
              padding: '8px 13px', borderRadius: 12, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              background: msg.role === 'user' ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : msg.role === 'system' ? '#f0f2f8' : '#f8f9fc',
              color: msg.role === 'user' ? '#fff' : '#1a1a2e',
              border: msg.role === 'user' ? 'none' : '1px solid #e5e7ef',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Draft preview */}
        {draft && (
          <div style={{ background: '#f8f9fc', border: '1px solid #e5e7ef', borderRadius: 12, padding: 12, marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#8e8ea0', marginBottom: 6, letterSpacing: 0.5 }}>DRAFT PREVIEW</div>
            <div style={{ fontSize: 11, color: '#5a5a6e', marginBottom: 3 }}>
              <strong>To:</strong> {draft.to_name} &lt;{draft.to_email}&gt;
            </div>
            <div style={{ fontSize: 11, color: '#5a5a6e', marginBottom: 6 }}>
              <strong>Subject:</strong> {draft.subject}
            </div>
            <div style={{
              fontSize: 11, color: '#1a1a2e', background: '#fff', border: '1px solid #e5e7ef',
              borderRadius: 8, padding: '8px 10px', lineHeight: 1.6, whiteSpace: 'pre-wrap',
              maxHeight: 140, overflow: 'auto',
            }}>
              {draft.body}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button onClick={handleApprove} disabled={sending} style={{
                flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', cursor: sending ? 'wait' : 'pointer',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontSize: 11, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                {sending ? <><Loader size={11} className="spin" /> Sending...</> : <><Check size={12} /> Approve & Send</>}
              </button>
              <button onClick={handleEdit} style={{
                padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7ef', background: '#fff', cursor: 'pointer',
                color: '#4a6cf7', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Edit3 size={11} /> Edit
              </button>
              <button onClick={handleDeny} style={{
                padding: '7px 12px', borderRadius: 8, border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer',
                color: '#ef4444', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <X size={11} /> Deny
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '8px 13px', borderRadius: 12,
            background: '#f8f9fc', border: '1px solid #e5e7ef',
            fontSize: 12, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Loader size={12} className="spin" />
            {ctx.type === 'email' ? 'Generating email...' : ctx.type === 'content' ? 'Running across accounts...' : 'Thinking...'}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f2f8', display: 'flex', gap: 8, flexShrink: 0 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={ctx.placeholder}
          style={{
            flex: 1, padding: '9px 13px', borderRadius: 10, border: '1px solid #e5e7ef',
            fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#f8f9fc',
          }}
        />
        <button onClick={() => handleSend()} disabled={!input.trim() || loading} style={{
          padding: '9px 13px', borderRadius: 10, border: 'none',
          cursor: input.trim() && !loading ? 'pointer' : 'default',
          background: input.trim() && !loading ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#e5e7ef',
          color: input.trim() && !loading ? '#fff' : '#b0b0c0',
          fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
