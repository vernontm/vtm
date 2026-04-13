import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, X, Send, Loader, Check, Edit3, ChevronUp, ChevronDown } from 'lucide-react';
import { emailAgent, runBulkAgent, createQueueItem, sendQueueItem } from '../api';

/* ── page context config ────────────────────────────────────────── */
const PAGE_CONTEXTS = {
  '/dashboard':         { label: 'Dashboard',    type: 'general' },
  '/leads':             { label: 'Leads',         type: 'general' },
  '/contacts':          { label: 'Contacts',      type: 'general' },
  '/projects':          { label: 'Projects',      type: 'general' },
  '/email':             { label: 'Email',          type: 'email' },
  '/content-scheduler': { label: 'Content',        type: 'content' },
  '/outreach':          { label: 'Outreach',       type: 'general' },
  '/meetings':          { label: 'Meetings',       type: 'general' },
  '/invoices':          { label: 'Invoices',       type: 'general' },
  '/todos':             { label: 'Todos',          type: 'general' },
  '/blog':              { label: 'Blog',           type: 'general' },
  '/subscriptions':     { label: 'Subscriptions',  type: 'general' },
  '/portfolio':         { label: 'Portfolio',      type: 'general' },
  '/quick-notes':       { label: 'Notes',          type: 'general' },
  '/settings':          { label: 'Settings',       type: 'general' },
  '/notifications':     { label: 'Notifications',  type: 'general' },
};

const PLACEHOLDERS = {
  email: 'Describe the email you want to create...',
  content: 'Describe a task for your content accounts...',
  general: 'Ask me anything about your CRM...',
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
  return match ? match[1] : { label: 'CRM', type: 'general' };
}

export default function GlobalAgent() {
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = getContext(location.pathname);

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (expanded && endRef.current) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages, loading, expanded]);

  // Focus input when expanded
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 150);
  }, [expanded]);

  /* ── handle send ──────────────────────────────────────────────── */
  const handleSend = async (overrideMsg) => {
    const msg = (overrideMsg || input).trim();
    if (!msg || loading) return;
    if (!overrideMsg) setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    setDraft(null);
    if (!expanded) setExpanded(true);

    try {
      if (ctx.type === 'email') {
        const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const result = await emailAgent({ prompt: msg, conversation: convo });
        if (result.action === 'ask' || result.needs_info) {
          setMessages(prev => [...prev, { role: 'assistant', content: result.question || 'Could you provide more details?' }]);
        } else if (result.action === 'draft_email') {
          setDraft(result);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Email ready for ${result.to_name || result.to_email}${result.reasoning ? ` - ${result.reasoning}` : ''}`,
          }]);
        }
      } else if (ctx.type === 'content') {
        const result = await runBulkAgent({ prompt: msg });
        let summary = `${result.interpretation}\n\nCompleted ${result.successful}/${result.total_actions} actions:\n`;
        for (const r of result.results) {
          const icon = r.status === 'success' ? '\u2705' : r.status === 'skipped' ? '\u23ed' : '\u274c';
          const detail = r.status === 'success'
            ? (r.count ? `${r.count} posts created` : r.scheduled ? `${r.scheduled} scripts scheduled` : 'done')
            : (r.reason || r.error || r.status);
          summary += `${icon} ${r.client_name}: ${detail}\n`;
        }
        setMessages(prev => [...prev, { role: 'assistant', content: summary.trim() }]);
      } else {
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
        lead_email: draft.to_email, lead_name: draft.to_name || '',
        subject_lines: JSON.stringify([draft.subject]), body: draft.body,
        status: 'draft', email_type: 'agent_generated',
        auto_generated: true, generated_at: new Date().toISOString(),
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
    navigate(`/email?compose=${encodeURIComponent(draft.to_email)}&name=${encodeURIComponent(draft.to_name || '')}`);
    setDraft(null);
  };

  const handleDeny = () => {
    setDraft(null);
    setMessages(prev => [...prev, { role: 'system', content: 'Draft discarded.' }]);
  };

  const clearChat = () => { setMessages([]); setDraft(null); setInput(''); };

  const quickBtns = QUICK_BUTTONS[ctx.type] || QUICK_BUTTONS.general;

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid #e5e7ef',
      background: '#fff',
      display: 'flex',
      flexDirection: 'column',
      transition: 'height 0.25s ease',
    }}>
      {/* ── Expanded chat area ── */}
      {expanded && (
        <div style={{
          height: 280,
          display: 'flex',
          flexDirection: 'column',
          borderBottom: '1px solid #f0f2f8',
        }}>
          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Quick buttons when empty */}
            {messages.length === 0 && !loading && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '8px 0' }}>
                {quickBtns.map((q, i) => {
                  const label = typeof q === 'string' ? q : q.label;
                  const icon = typeof q === 'object' ? q.icon : null;
                  return (
                    <button key={i} onClick={() => handleSend(label)} style={{
                      padding: '4px 10px', borderRadius: 7, border: '1px solid #e5e7ef',
                      background: '#f8f9fc', fontSize: 11, color: '#5a5a6e', cursor: 'pointer',
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
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                <div style={{
                  padding: '6px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
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
              <div style={{ background: '#f8f9fc', border: '1px solid #e5e7ef', borderRadius: 10, padding: 10, maxWidth: '85%' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8e8ea0', marginBottom: 4, letterSpacing: 0.5 }}>DRAFT</div>
                <div style={{ fontSize: 11, color: '#5a5a6e' }}><strong>To:</strong> {draft.to_name} &lt;{draft.to_email}&gt;</div>
                <div style={{ fontSize: 11, color: '#5a5a6e', marginBottom: 4 }}><strong>Subject:</strong> {draft.subject}</div>
                <div style={{
                  fontSize: 11, color: '#1a1a2e', background: '#fff', border: '1px solid #e5e7ef',
                  borderRadius: 6, padding: '6px 8px', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  maxHeight: 80, overflow: 'auto',
                }}>
                  {draft.body}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={handleApprove} disabled={sending} style={{
                    flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', cursor: sending ? 'wait' : 'pointer',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontSize: 11, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                    {sending ? <><Loader size={10} className="spin" /> Sending...</> : <><Check size={11} /> Approve & Send</>}
                  </button>
                  <button onClick={handleEdit} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7ef', background: '#fff', cursor: 'pointer',
                    color: '#4a6cf7', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <Edit3 size={10} /> Edit
                  </button>
                  <button onClick={handleDeny} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', cursor: 'pointer',
                    color: '#ef4444', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <X size={10} /> Deny
                  </button>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{
                alignSelf: 'flex-start', padding: '6px 12px', borderRadius: 10,
                background: '#f8f9fc', border: '1px solid #e5e7ef',
                fontSize: 11, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <Loader size={11} className="spin" />
                {ctx.type === 'email' ? 'Generating email...' : ctx.type === 'content' ? 'Running across accounts...' : 'Thinking...'}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* ── Bottom input bar (always visible) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        background: '#fff',
      }}>
        {/* Toggle expand */}
        <button onClick={() => setExpanded(!expanded)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#4a6cf7',
          display: 'flex', alignItems: 'center', padding: 2,
        }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        {/* Agent icon + context label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <MessageSquare size={14} color="#4a6cf7" />
          <span style={{ fontSize: 11, fontWeight: 600, color: '#4a6cf7' }}>{ctx.label}</span>
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          onFocus={() => { if (!expanded && messages.length === 0) setExpanded(true); }}
          placeholder={PLACEHOLDERS[ctx.type] || PLACEHOLDERS.general}
          style={{
            flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid #e5e7ef',
            fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#f8f9fc',
            minWidth: 0,
          }}
        />

        {/* Send button */}
        <button onClick={() => handleSend()} disabled={!input.trim() || loading} style={{
          padding: '7px 12px', borderRadius: 8, border: 'none',
          cursor: input.trim() && !loading ? 'pointer' : 'default',
          background: input.trim() && !loading ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#e5e7ef',
          color: input.trim() && !loading ? '#fff' : '#b0b0c0',
          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          <Send size={12} />
        </button>

        {/* Clear */}
        {messages.length > 0 && (
          <button onClick={clearChat} style={{
            background: 'none', border: '1px solid #e5e7ef', borderRadius: 6, cursor: 'pointer',
            color: '#8e8ea0', fontSize: 10, padding: '4px 8px', fontWeight: 500, flexShrink: 0,
          }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
