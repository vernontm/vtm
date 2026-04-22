import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, X, Send, Loader, Check, Edit3, ChevronUp, ChevronDown, Copy, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { emailAgent, runBulkAgent, createQueueItem, sendQueueItem, sequenceAgent, editPosts } from '../api';
import { copyToClipboard } from '../lib/clipboard';
import { useUi } from '../context/UiContext';

/* ── page context config ────────────────────────────────────────── */
const PAGE_CONTEXTS = {
  '/dashboard':         { label: 'Dashboard',    type: 'general' },
  '/leads':             { label: 'Leads',         type: 'general' },
  '/contacts':          { label: 'Contacts',      type: 'general' },
  '/projects':          { label: 'Projects',      type: 'general' },
  '/email':             { label: 'Email',          type: 'email' },
  '/content-scheduler': { label: 'Content',        type: 'content' },
  '/meetings':          { label: 'Meetings',       type: 'general' },
  '/invoices':          { label: 'Invoices',       type: 'general' },
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
  youtube: 'Create a YouTube script about...',
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
  youtube: [
    'Create a script about AI automation for business',
    'Analyze my last 5 competitor videos',
    'Generate a thumbnail for my latest script',
    'Complete the package for my draft script',
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

// Route by INTENT (what the user is asking), not just by current page.
// Keywords + attachments override the page default so the agent can do any
// task from any page.
function detectIntent(prompt, attachments, pageType) {
  const p = (prompt || '').toLowerCase();
  const hasImage = (attachments || []).some(a => a.kind === 'image');

  const contentSignals = [
    'post', 'posts', 'caption', 'captions', 'hashtag', 'hashtags',
    'schedule this', 'schedule the', 'schedule a post', 'auto schedule',
    'upload and schedule', 'upload this', 'reel', 'story', 'instagram',
    'tiktok', 'threads', 'social', 'carousel', 'content scheduler',
    'generate posts', 'generate a post', 'post for', 'scripts', 'script',
  ];
  const emailSignals = [
    'email', 'emails', 'draft an email', 'write an email', 'reply to',
    'send to', 'follow up with', 'newsletter', 'broadcast', 'campaign',
    'template', 'subject line',
  ];
  const youtubeSignals = ['youtube', 'video idea', 'thumbnail', 'channel'];
  const sequenceSignals = [
    'sequence', 'drip', 'drip campaign', 'welcome series', 'welcome sequence',
    'nurture sequence', 'nurture series', 'email series', 'onboarding series',
    'onboarding sequence', 'reactivation sequence', 'autoresponder',
  ];

  const hits = (list) => list.filter(k => p.includes(k)).length;
  const cHits = hits(contentSignals) + (hasImage ? 2 : 0);
  const eHits = hits(emailSignals);
  const yHits = hits(youtubeSignals);
  const sHits = hits(sequenceSignals);

  if (sHits >= 1) return 'sequence';
  if (cHits >= 2 || (cHits >= 1 && cHits > eHits)) return 'content';
  if (eHits >= 1 && eHits >= cHits) return 'email';
  if (yHits >= 1) return 'youtube';
  // Fall back to the page default
  return pageType || 'general';
}

export default function GlobalAgent() {
  const location = useLocation();
  const navigate = useNavigate();
  const ctx = getContext(location.pathname);
  const { leadPanelOpen, contentContext } = useUi();
  const hidden = leadPanelOpen || location.pathname === '/leads';

  // @mention of posts — only enabled on /content-scheduler with a loaded client
  const mentionEnabled = location.pathname.startsWith('/content-scheduler')
    && !!contentContext?.client
    && Array.isArray(contentContext?.scripts);
  // Queue = not delivered and not errored. Matches the "Queued Posts" tab
  // on the content scheduler (delivered = posted/exported).
  const DELIVERED_STATUSES = ['posted', 'exported'];
  const ERROR_STATUSES = ['failed', 'error'];
  const selectedIds = new Set(mentionEnabled ? (contentContext.selectedScriptIds || []) : []);
  const mentionScripts = mentionEnabled
    ? contentContext.scripts.filter(s =>
        !DELIVERED_STATUSES.includes(s.status) && !ERROR_STATUSES.includes(s.status))
    : [];

  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(null);
  const [sending, setSending] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [attachments, setAttachments] = useState([]); // [{ name, type, media_type, data_base64, size }]
  const [attachError, setAttachError] = useState('');

  // @mention state (only meaningful when mentionEnabled)
  const [taggedScriptIds, setTaggedScriptIds] = useState(new Set());
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  // Clear tags when leaving the content scheduler
  useEffect(() => {
    if (!mentionEnabled) {
      setTaggedScriptIds(new Set());
      setMentionOpen(false);
      setMentionQuery('');
    }
  }, [mentionEnabled]);

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (expanded && endRef.current) {
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [messages, loading, expanded]);

  // Focus input when expanded
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 150);
  }, [expanded]);

  /* ── attachment handling ──────────────────────────────────────── */
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB per file
  const MAX_TOTAL_FILES = 5;

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result || '';
      const comma = res.indexOf(',');
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const fileToText = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || '');
    reader.onerror = reject;
    reader.readAsText(file);
  });

  const handleFiles = async (fileList) => {
    setAttachError('');
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (attachments.length + files.length > MAX_TOTAL_FILES) {
      setAttachError(`Max ${MAX_TOTAL_FILES} files at a time.`);
      return;
    }
    const next = [];
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        setAttachError(`${f.name} is larger than 10MB.`);
        continue;
      }
      const mt = f.type || 'application/octet-stream';
      try {
        if (mt.startsWith('image/')) {
          const data = await fileToBase64(f);
          next.push({ name: f.name, kind: 'image', media_type: mt, data_base64: data, size: f.size });
        } else if (mt === 'application/pdf') {
          const data = await fileToBase64(f);
          next.push({ name: f.name, kind: 'pdf', media_type: mt, data_base64: data, size: f.size });
        } else {
          // treat as text (md, txt, csv, json, code)
          const text = await fileToText(f);
          next.push({ name: f.name, kind: 'text', media_type: mt, text: text.slice(0, 120000), size: f.size });
        }
      } catch (e) {
        setAttachError('Failed to read ' + f.name);
      }
    }
    if (next.length) setAttachments(prev => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (idx) => {
    setAttachments(prev => prev.filter((_, i) => i !== idx));
    setAttachError('');
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  /* ── @mention handlers (content-scheduler only) ──────────────── */
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (!mentionEnabled) return;
    const caret = e.target.selectionStart ?? val.length;
    const upToCaret = val.slice(0, caret);
    const atIdx = upToCaret.lastIndexOf('@');
    if (atIdx >= 0) {
      const token = upToCaret.slice(atIdx + 1);
      if (!/\s/.test(token)) {
        setMentionOpen(true);
        setMentionQuery(token.toLowerCase());
        return;
      }
    }
    setMentionOpen(false);
    setMentionQuery('');
  };

  const insertMention = (script) => {
    const el = inputRef.current;
    const val = input;
    const caret = el?.selectionStart ?? val.length;
    const upToCaret = val.slice(0, caret);
    const atIdx = upToCaret.lastIndexOf('@');
    const before = atIdx >= 0 ? val.slice(0, atIdx) : val;
    const after = val.slice(caret);
    const cleaned = (before + after).replace(/\s{2,}/g, ' ');
    setInput(cleaned);
    setTaggedScriptIds(prev => { const next = new Set(prev); next.add(script.id); return next; });
    setMentionOpen(false);
    setMentionQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const removeTag = (id) => {
    setTaggedScriptIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  /* ── handle send ──────────────────────────────────────────────── */
  const handleSend = async (overrideMsg) => {
    const msg = (overrideMsg || input).trim();
    if ((!msg && attachments.length === 0) || loading) return;
    if (!overrideMsg) setInput('');
    const msgAttachments = attachments;
    const displayText = msg + (msgAttachments.length ? `\n\n📎 ${msgAttachments.map(a => a.name).join(', ')}` : '');
    setMessages(prev => [...prev, { role: 'user', content: displayText || '(files attached)' }]);
    setAttachments([]);
    setLoading(true);
    setDraft(null);
    if (!expanded) setExpanded(true);

    // If the user tagged posts with @ on the content scheduler, route to
    // the edit-posts endpoint so Claude edits the referenced scripts.
    const taggedIds = mentionEnabled ? Array.from(taggedScriptIds) : [];
    const intent = taggedIds.length > 0 ? 'edit-posts' : detectIntent(msg, msgAttachments, ctx.type);

    try {
      if (intent === 'edit-posts') {
        try {
          const result = await editPosts({
            client_id: contentContext.client.id,
            script_ids: taggedIds,
            prompt: msg,
          });
          const updated = result.updated || [];
          const errors = result.errors || [];
          const titles = updated.map(u => u.title).filter(Boolean).slice(0, 3).join(', ');
          const extra = updated.length > 3 ? `, +${updated.length - 3} more` : '';
          const tail = errors.length ? ` · ${errors.length} failed` : '';
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Updated ${updated.length} post${updated.length === 1 ? '' : 's'}${titles ? `: ${titles}${extra}` : ''}${tail}`,
          }]);
          setTaggedScriptIds(new Set());
        } catch (e) {
          setMessages(prev => [...prev, { role: 'assistant', content: 'Edit failed: ' + e.message }]);
        }
      } else if (intent === 'email') {
        const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const result = await emailAgent({ prompt: msg, conversation: convo, attachments: msgAttachments });
        if (result.action === 'ask' || result.needs_info) {
          setMessages(prev => [...prev, { role: 'assistant', content: result.question || 'Could you provide more details?' }]);
        } else if (result.action === 'draft_email') {
          setDraft(result);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Email ready for ${result.to_name || result.to_email}${result.reasoning ? ` - ${result.reasoning}` : ''}`,
          }]);
        } else if (result.message || result.answer) {
          setMessages(prev => [...prev, { role: 'assistant', content: result.message || result.answer }]);
        }
      } else if (intent === 'sequence') {
        const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const result = await sequenceAgent({ prompt: msg, conversation: convo });
        if (result.action === 'ask' || result.needs_info) {
          setMessages(prev => [...prev, { role: 'assistant', content: result.question || 'Which client is this sequence for?' }]);
        } else if (result.created) {
          const tagLine = (result.trigger_tags_all || []).length
            ? `\nQualification tags: ${result.trigger_tags_all.join(', ')}${(result.trigger_tags_none || []).length ? ` (excludes: ${result.trigger_tags_none.join(', ')})` : ''}`
            : '';
          const body = `\u2705 Created sequence "${result.name}" for ${result.client_name} with ${result.steps_created} emails.${tagLine}\n\nWhy: ${result.reasoning || result.summary || 'Structured for typical engagement curves.'}\n\nThe sequence is inactive - review the steps in Email Marketing > Sequences and toggle it on when ready.`;
          setMessages(prev => [...prev, { role: 'assistant', content: body }]);
        } else if (result.message || result.answer) {
          setMessages(prev => [...prev, { role: 'assistant', content: result.message || result.answer }]);
        }
      } else if (intent === 'content') {
        const result = await runBulkAgent({ prompt: msg, attachments: msgAttachments });
        let summary = `${result.interpretation}\n\nCompleted ${result.successful}/${result.total_actions} actions:\n`;
        for (const r of result.results) {
          const icon = r.status === 'success' ? '\u2705' : r.status === 'skipped' ? '\u23ed' : '\u274c';
          const detail = r.status === 'success'
            ? (r.count ? `${r.count} posts created`
                : r.scheduled ? `${r.scheduled} scripts scheduled`
                : r.scheduled_datetime ? `"${r.title || 'Post'}" scheduled for ${r.scheduled_datetime}`
                : 'done')
            : (r.reason || r.error || r.status);
          summary += `${icon} ${r.client_name}: ${detail}\n`;
        }
        setMessages(prev => [...prev, { role: 'assistant', content: summary.trim() }]);
      } else if (intent === 'youtube') {
        const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const res = await fetch('/api/crm/global-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: msg, conversation: convo, page: '/youtube', context_type: 'youtube', attachments: msgAttachments }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Agent error');
        const result = await res.json();
        setMessages(prev => [...prev, { role: 'assistant', content: result.message || result.answer || JSON.stringify(result) }]);
      } else {
        const convo = messages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({ role: m.role, content: m.content }));
        const res = await fetch('/api/crm/global-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: msg, conversation: convo, page: location.pathname, attachments: msgAttachments }),
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

  if (hidden) return null;

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
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
          borderBottom: '1px solid var(--border)',
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
                      padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)',
                      background: 'var(--surface-2)', fontSize: 11, color: 'var(--muted)', cursor: 'pointer',
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
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '75%', position: 'relative', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{
                  padding: '6px 12px', borderRadius: 10, fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, var(--orange), var(--orange-dark))' : msg.role === 'system' ? 'var(--surface-3)' : 'var(--surface-2)',
                  color: '#fff',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                }}>
                  {msg.content}
                </div>
                {msg.role === 'assistant' && (
                  <button
                    onClick={() => {
                      copyToClipboard(msg.content).then(() => {
                        setCopiedIdx(i);
                        setTimeout(() => setCopiedIdx(c => c === i ? null : c), 1500);
                      }).catch(() => {});
                    }}
                    style={{
                      alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
                      color: copiedIdx === i ? '#22c55e' : '#8e8ea0', fontSize: 10, fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 3, padding: '2px 4px',
                    }}
                  >
                    {copiedIdx === i ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                )}
              </div>
            ))}

            {/* Draft preview */}
            {draft && (
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, maxWidth: '85%' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--orange)', marginBottom: 4, letterSpacing: 0.5 }}>DRAFT</div>
                <div style={{ fontSize: 11, color: 'var(--text)' }}><strong>To:</strong> {draft.to_name} &lt;{draft.to_email}&gt;</div>
                <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: 4 }}><strong>Subject:</strong> {draft.subject}</div>
                <div style={{
                  fontSize: 11, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)',
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
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
                    color: 'var(--orange)', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <Edit3 size={10} /> Edit
                  </button>
                  <button onClick={handleDeny} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', cursor: 'pointer',
                    color: '#f87171', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3,
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
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <Loader size={11} className="spin" />
                {ctx.type === 'email' ? 'Generating email...' : ctx.type === 'content' ? 'Running across accounts...' : ctx.type === 'youtube' ? 'Working on YouTube...' : 'Thinking...'}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* Attachment chips row */}
      {(attachments.length > 0 || attachError) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
          padding: '6px 14px 0', background: 'var(--surface)',
        }}>
          {attachments.map((a, i) => (
            <div key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 6px 3px 8px', borderRadius: 6,
              background: 'var(--accent-dim)', border: '1px solid var(--border)',
              fontSize: 10, color: 'var(--orange)', fontWeight: 600, maxWidth: 220,
            }}>
              {a.kind === 'image' ? <ImageIcon size={10} /> : <FileText size={10} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <button onClick={() => removeAttachment(i)} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: 'var(--orange)', display: 'flex', alignItems: 'center',
              }}>
                <X size={10} />
              </button>
            </div>
          ))}
          {attachError && (
            <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 500 }}>{attachError}</span>
          )}
        </div>
      )}

      {/* Tag chips (content-scheduler @mentions) */}
      {mentionEnabled && taggedScriptIds.size > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          padding: '6px 14px 0', background: 'var(--surface)',
        }}>
          {Array.from(taggedScriptIds).map(id => {
            const s = mentionScripts.find(x => x.id === id);
            const label = s?.title || s?.hook || `Post ${id}`;
            return (
              <span key={id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(255,107,0,0.12)', color: 'var(--orange)',
                border: '1px solid rgba(255,107,0,0.3)', borderRadius: 999,
                padding: '3px 8px 3px 10px', fontSize: 11, fontWeight: 600, maxWidth: 220,
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{label}
                </span>
                <button onClick={() => removeTag(id)} style={{
                  border: 'none', background: 'transparent', color: 'var(--orange)',
                  cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center',
                }} title="Remove tag">
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Bottom input bar (always visible) ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px',
        background: 'var(--surface)',
        position: 'relative',
      }}>
        {/* @mention autocomplete */}
        {mentionEnabled && mentionOpen && (() => {
          const matches = mentionScripts
            .filter(s => !taggedScriptIds.has(s.id))
            .filter(s => {
              if (!mentionQuery) return true;
              const hay = `${s.title || ''} ${s.hook || ''}`.toLowerCase();
              return hay.includes(mentionQuery);
            })
            .sort((a, b) => {
              const aSel = selectedIds.has(a.id) ? 0 : 1;
              const bSel = selectedIds.has(b.id) ? 0 : 1;
              return aSel - bSel;
            })
            .slice(0, 8);
          if (matches.length === 0) return null;
          return (
            <div style={{
              position: 'absolute', bottom: '100%', left: 14, right: 14,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: '0 -6px 20px rgba(0,0,0,0.25)',
              maxHeight: 220, overflowY: 'auto', zIndex: 30, marginBottom: 6,
            }}>
              {matches.map(s => (
                <div key={s.id}
                  onMouseDown={e => { e.preventDefault(); insertMention(s); }}
                  style={{
                    padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      @{s.title || s.hook || `Post ${s.id}`}
                    </span>
                    {selectedIds.has(s.id) && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: 'var(--orange)',
                        background: 'rgba(255,107,0,0.12)', border: '1px solid rgba(255,107,0,0.3)',
                        borderRadius: 4, padding: '1px 5px', letterSpacing: 0.3, flexShrink: 0,
                      }}>SELECTED</span>
                    )}
                  </div>
                  {(s.platform || s.status) && (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      {s.platform}{s.platform && s.status ? ' · ' : ''}{s.status}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        {/* Toggle expand */}
        <button onClick={() => setExpanded(!expanded)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--orange)',
          display: 'flex', alignItems: 'center', padding: 2,
        }}>
          {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        {/* Agent icon + context label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <MessageSquare size={14} color="var(--orange)" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--orange)' }}>{ctx.label}</span>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf,text/*,.md,.txt,.csv,.json,.js,.jsx,.ts,.tsx,.html,.css,.log"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />

        {/* Paperclip */}
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Attach reference files (images, PDFs, text)"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: attachments.length ? 'var(--orange)' : 'var(--muted)',
            display: 'flex', alignItems: 'center', padding: 2, flexShrink: 0,
          }}
        >
          <Paperclip size={15} />
        </button>

        {/* Input */}
        <input
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={e => {
            if (e.key === 'Escape' && mentionOpen) { setMentionOpen(false); return; }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          onPaste={onPaste}
          onFocus={() => { if (!expanded && messages.length === 0) setExpanded(true); }}
          placeholder={
            mentionEnabled && taggedScriptIds.size > 0
              ? 'Describe the edit (e.g. "shorten caption", "add hashtags")…'
              : mentionEnabled
                ? 'Type @ to reference a post, or describe a task…'
                : (PLACEHOLDERS[ctx.type] || PLACEHOLDERS.general)
          }
          style={{
            flex: 1, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
            fontSize: 12, outline: 'none', fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--text)',
            minWidth: 0,
          }}
        />

        {/* Send button */}
        <button onClick={() => handleSend()} disabled={(!input.trim() && attachments.length === 0) || loading} style={{
          padding: '7px 12px', borderRadius: 8, border: 'none',
          cursor: (input.trim() || attachments.length) && !loading ? 'pointer' : 'default',
          background: (input.trim() || attachments.length) && !loading ? 'linear-gradient(135deg, var(--orange), #ffb347)' : 'var(--surface-3)',
          color: (input.trim() || attachments.length) && !loading ? '#fff' : 'var(--muted)',
          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          <Send size={12} />
        </button>

        {/* Clear */}
        {messages.length > 0 && (
          <button onClick={clearChat} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
            color: 'var(--muted)', fontSize: 10, padding: '4px 8px', fontWeight: 500, flexShrink: 0,
          }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
