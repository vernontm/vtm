import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail, Send, FileText, Inbox, Search, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, Clock, Check, X, Edit3, Sparkles, Calendar,
  Star, Users, Ban, Flag, Reply, AlertTriangle, ChevronDown, Minimize2, Maximize2, Plus, Tag, Zap, Loader, Menu, Paperclip, Filter,
} from 'lucide-react';
import { toast } from '../components/Toast';
import { useClient } from '../context/ClientContext';
import { useCompose } from '../context/ComposeContext';
import {
  getEmailQueue, updateQueueItem, deleteQueueItem, sendQueueItem,
  createQueueItem, getGmailInbox, getContacts, getLeads,
  addEmailLabel, removeEmailLabel, getGmailContacts, getGmailThread,
  getGmailLabels, createGmailLabel, deleteGmailLabel, applyGmailLabel, removeGmailLabel,
  getAIFollowups, trashGmailMessage, uploadEmailAttachment, gmailSync, gmailRefreshLabels,
} from '../api';

const TABS = [
  { key: 'inbox',   label: 'Inbox',   icon: Inbox },
  { key: 'sent',    label: 'Sent',    icon: Send },
  { key: 'drafts',  label: 'Drafts',  icon: FileText },
  { key: 'scheduled', label: 'Scheduled', icon: Clock },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'spam',    label: 'Spam',    icon: Ban },
];

const AVATAR_COLORS = ['var(--orange)','#784bd1','#22c55e','#f5a623','#ff5c5c','#00b8d4','#e91e8c','#2563eb'];

// Gmail system labels that are meaningful for filtering but noisy when rendered
// as pills on every message. Kept in customLabels so the sidebar can still show
// them and use them for the show/hide + filter controls; excluded from pills.
const HIDDEN_PILL_LABELS = new Set(['IMPORTANT', 'CATEGORY_PERSONAL']);

const LABEL_CONFIG = {
  favorite:    { icon: Star,          color: '#f5a623', label: 'Favorite' },
  'follow-up': { icon: Flag,          color: '#784bd1', label: 'Follow Up' },
  important:   { icon: AlertTriangle, color: '#ff5c5c', label: 'Important' },
  spam:        { icon: Ban,           color: 'var(--muted)', label: 'Spam' },
};

/* ── linkify + wrap helper (renders images/videos/YouTube inline) ─────────── */

function isImageUrl(url) { return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url); }
function isVideoUrl(url) { return /\.(mp4|webm|mov|avi)(\?|$)/i.test(url); }
function getYouTubeId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function renderUrl(part, key) {
  // YouTube embed
  const ytId = getYouTubeId(part);
  if (ytId) return (
    <div key={key} style={{ margin:'12px 0', borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', maxWidth:480 }}>
      <iframe src={`https://www.youtube.com/embed/${ytId}`} style={{ width:'100%', aspectRatio:'16/9', border:'none', display:'block' }} allowFullScreen />
    </div>
  );
  // Image
  if (isImageUrl(part)) return (
    <div key={key} style={{ margin:'12px 0' }}>
      <a href={part} target="_blank" rel="noopener noreferrer">
        <img src={part} alt="" style={{ maxWidth:'100%', maxHeight:400, borderRadius:10, border:'1px solid var(--border)', display:'block' }}
          onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML=`<a href="${part}" target="_blank" rel="noopener noreferrer" style="color:var(--orange);word-break:break-all">${part}</a>`; }} />
      </a>
    </div>
  );
  // Video
  if (isVideoUrl(part)) return (
    <div key={key} style={{ margin:'12px 0', maxWidth:480 }}>
      <video src={part} controls style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', display:'block' }} />
    </div>
  );
  // Regular link
  return <a key={key} href={part} target="_blank" rel="noopener noreferrer" style={{ color:'var(--orange)', wordBreak:'break-all' }}>{part}</a>;
}

function Linkify({ text }) {
  if (!text) return null;
  // Match a markdown link [text](url) OR a bare URL. Markdown links render with
  // their anchor text (e.g. "log into your portal here"); bare URLs render as-is.
  const tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
  const out = [];
  let last = 0, m, i = 0;
  while ((m = tokenRegex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(<a key={`md${i++}`} href={m[2]} target="_blank" rel="noopener noreferrer" style={{ color:'var(--orange)', wordBreak:'break-word' }}>{m[1]}</a>);
    } else {
      out.push(renderUrl(m[3], `u${i++}`));
    }
    last = tokenRegex.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ── HTML email renderer (sandboxed iframe) ──────────────────────────────── */

function looksLikeHtml(text) {
  if (!text) return false;
  return /<!DOCTYPE|<html|<head|<body|<table|<div\s|<style/i.test(text);
}

function HtmlEmail({ html }) {
  const ref = React.useRef(null);
  // Inject a <base target="_blank"> so all links open in new tab,
  // and a small script to post height back for auto-resize.
  const patched = React.useMemo(() => {
    if (!html) return '';
    const base = '<base target="_blank">';
    const themeStyle = `<style>
      html,body{background:#fff;color:#222;margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.55;}
      body *{color:inherit;}
      a{color:#1a73e8;}
      blockquote{color:#555;border-left:3px solid #ddd;margin:10px 0;padding:4px 12px;}
    </style>`;
    // Measure the true content height (the last element's bottom edge) so the
    // iframe hugs the email with no trailing dead space.
    const resizeScript = `<script>
      function contentH(){
        var b=document.body, max=0, kids=b.children;
        for(var i=0;i<kids.length;i++){var r=kids[i].getBoundingClientRect();if(r.bottom>max)max=r.bottom;}
        return Math.ceil(Math.min(max||b.scrollHeight, b.scrollHeight)) + 12;
      }
      function postH(){window.parent.postMessage({iframeHeight:contentH()},'*');}
      window.addEventListener('load',function(){postH();setTimeout(postH,300);setTimeout(postH,1200);});
      new MutationObserver(postH).observe(document.body,{childList:true,subtree:true,attributes:true});
    <\/script>`;
    // Insert base+style+script right after <head> if present, otherwise prepend
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, '$&' + base + themeStyle + resizeScript);
    }
    return base + themeStyle + resizeScript + html;
  }, [html]);

  React.useEffect(() => {
    const handler = (e) => {
      if (e.data?.iframeHeight && ref.current) {
        ref.current.style.height = Math.max(e.data.iframeHeight, 32) + 'px';
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return <iframe ref={ref} srcDoc={patched} sandbox="allow-same-origin allow-scripts allow-popups" style={{ width:'100%', border:'none', height:32, minHeight:32, borderRadius:8, background:'#fff', display:'block' }} />;
}

/* Helper: render body as HTML iframe or plain text with Linkify.
   Prefer the HTML part whenever the message ships one — that's the version
   the sender formatted (newsletters, receipts, threaded replies with quoting,
   anything with images / buttons / links). Plain-text is the fallback for
   messages that only ship a text part (simple hand-typed notes). */
function EmailBody({ msg, fallbackText }) {
  const html = (msg?.bodyHtml || '').trim();
  const text = (msg?.body || '').trim();
  if (html) return <HtmlEmail html={html} />;
  if (text && !looksLikeHtml(text)) return <Linkify text={text} />;
  const fb = (fallbackText || '').trim();
  if (looksLikeHtml(fb)) return <HtmlEmail html={fb} />;
  return <Linkify text={fb || text || '(empty)'} />;
}

/* ── tiny helpers ─────────────────────────────────────────────────────────── */

// Coerce a possibly-non-array (e.g. a double-encoded jsonb string from cache)
// into a real array so label rendering can never crash the page.
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs  = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function fmtFullDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true }).format(new Date(iso));
  } catch { return iso; }
}

function Avatar({ name, size = 40, color }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const bg = color || AVATAR_COLORS[(name || '').charCodeAt(0) % AVATAR_COLORS.length];
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.35, fontWeight:700, color:'#fff', flexShrink:0 }}>
      {initials}
    </div>
  );
}

/* ── Schedule quick-picks ────────────────────────────────────────────────── */

function getScheduleOptions() {
  const now = new Date();
  const opts = [];
  const tm = new Date(now); tm.setDate(tm.getDate()+1); tm.setHours(8,0,0,0);
  opts.push({ label:'Tomorrow morning', detail: tm.toLocaleDateString('en-US',{month:'short',day:'numeric'})+', 8:00 AM', value: tm.toISOString() });
  const af = new Date(now);
  if (now.getHours() < 13) { af.setHours(13,0,0,0); opts.push({ label:'This afternoon', detail: af.toLocaleDateString('en-US',{month:'short',day:'numeric'})+', 1:00 PM', value: af.toISOString() }); }
  else { af.setDate(af.getDate()+1); af.setHours(13,0,0,0); opts.push({ label:'Tomorrow afternoon', detail: af.toLocaleDateString('en-US',{month:'short',day:'numeric'})+', 1:00 PM', value: af.toISOString() }); }
  const mon = new Date(now); const dMon = ((8-mon.getDay())%7)||7; mon.setDate(mon.getDate()+dMon); mon.setHours(8,0,0,0);
  opts.push({ label:'Monday morning', detail: mon.toLocaleDateString('en-US',{month:'short',day:'numeric'})+', 8:00 AM', value: mon.toISOString() });
  return opts;
}

function SchedulePopup({ onSelect, onPickCustom, onClose }) {
  const ref = useRef(null);
  const options = getScheduleOptions();
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} style={{ position:'absolute', bottom:'100%', left:0, marginBottom:8, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,0.12)', width:300, zIndex:200, overflow:'hidden' }}>
      <div style={{ padding:'14px 18px 10px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>Schedule send</span>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex' }}><X size={16} /></button>
      </div>
      <div style={{ fontSize:11, color:'var(--muted)', padding:'6px 18px 4px' }}>{Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g,' ')}</div>
      {options.map((o,i) => (
        <div key={i} onClick={() => { onSelect(o.value); onClose(); }} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 18px', cursor:'pointer', borderTop:'1px solid var(--border)' }}
          onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}>
          <span style={{ fontSize:13, color:'var(--text)', fontWeight:500 }}>{o.label}</span>
          <span style={{ fontSize:12, color:'var(--muted)' }}>{o.detail}</span>
        </div>
      ))}
      <div onClick={() => { onPickCustom(); onClose(); }} style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 18px', cursor:'pointer', borderTop:'1px solid var(--border)' }}
        onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}>
        <Calendar size={14} color="var(--muted)" />
        <span style={{ fontSize:13, color:'var(--text)', fontWeight:500 }}>Pick date & time</span>
      </div>
    </div>
  );
}

/* ── Contact Search ──────────────────────────────────────────────────────── */

function ContactSearch({ value, onChange, contacts, gmailContacts }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);

  const all = [...contacts];
  const seen = new Set(contacts.map(c => c.email.toLowerCase()));
  (gmailContacts||[]).forEach(gc => { if (gc.email && !seen.has(gc.email.toLowerCase())) { seen.add(gc.email.toLowerCase()); all.push({ name:gc.name||'', email:gc.email, _source:'gmail', photo:gc.photo }); } });

  const filtered = query.length > 0 ? all.filter(c => (c.name||'').toLowerCase().includes(query.toLowerCase()) || (c.email||'').toLowerCase().includes(query.toLowerCase())).slice(0,10) : all.slice(0,10);

  return (
    <div ref={ref} style={{ flex:1, position:'relative' }}>
      <input value={value} onChange={e => { onChange(e.target.value); setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder="Search contacts or type email..." style={{ width:'100%', border:'none', outline:'none', fontSize:13, color:'var(--text)', background:'transparent' }} />
      {open && filtered.length > 0 && (
        <div style={{ position:'absolute', bottom:'100%', left:-16, right:-16, marginBottom:6, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:100, maxHeight:260, overflow:'auto' }}>
          {filtered.map((c,i) => (
            <div key={c.email+i} onClick={() => { onChange(c.email); setOpen(false); setQuery(''); }}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', borderBottom: i<filtered.length-1?'1px solid var(--border)':'none' }}
              onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}>
              {c.photo ? <img src={c.photo} style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover' }} alt="" /> : <Avatar name={c.name||c.email} size={28} />}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name||c.email}</div>
                <div style={{ fontSize:10, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.email}</div>
              </div>
              <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, fontWeight:600, background:c._source==='lead'?'#f5a62310':c._source==='gmail'?'#22c55e10':'rgba(37,99,235,0.08)', color:c._source==='lead'?'#f5a623':c._source==='gmail'?'#22c55e':'var(--orange)' }}>{c._source==='lead'?'Lead':c._source==='gmail'?'Gmail':'Contact'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Label Button ────────────────────────────────────────────────────────── */

function LabelButton({ labelKey, active, onClick, size = 14 }) {
  const cfg = LABEL_CONFIG[labelKey]; if (!cfg) return null; const Icon = cfg.icon;
  return (
    <button onClick={onClick} title={active?`Remove ${cfg.label}`:`Mark as ${cfg.label}`}
      style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', color:active?cfg.color:'var(--muted)', transition:'color 0.15s' }}
      onMouseEnter={e => { if(!active) e.currentTarget.style.color=cfg.color; }} onMouseLeave={e => { if(!active) e.currentTarget.style.color='var(--muted)'; }}>
      <Icon size={size} fill={active?cfg.color:'none'} />
    </button>
  );
}

/* ── Floating Compose Popup ──────────────────────────────────────────────── */

function ComposePopup({ replyTo, draft, onDraftChange, contacts, gmailContacts, onSend, onSchedule, onSaveDraft, onClose, onMinimize, sending, labelDefs = [], clientId, uploadAttachment }) {
  // Hydrate from persisted draft when available so the composer restores
  // fully after a minimize + navigation trip. Falls back to sensible defaults.
  const initialTo      = draft?.to ?? (replyTo?.from?.email || replyTo?.to_email || '');
  const initialSubject = draft?.subject ?? (replyTo ? `Re: ${(replyTo.subject||'').replace(/^Re:\s*/i,'')}` : '');
  const initialBody    = draft?.body ?? '';
  const initialLabels  = Array.isArray(draft?.labels) && draft.labels.length
    ? draft.labels
    : (labelDefs.some(l => l.name === 'Leads') ? ['Leads'] : []);
  const initialAttach  = Array.isArray(draft?.attachments) ? draft.attachments : [];

  const [to, setToState] = useState(initialTo);
  const [subject, setSubjectState] = useState(initialSubject);
  const [body, setBodyState] = useState(initialBody);
  const [showSchedule, setShowSchedule] = useState(false);
  const [customSchedule, setCustomSchedule] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [selectedLabels, setSelectedLabelsState] = useState(initialLabels);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [attachments, setAttachmentsState] = useState(initialAttach);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const bodyRef = useRef(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.focus(); }, []);

  // Sync each field change back to the persistent draft store so leaving the
  // page and coming back restores exactly what you were typing.
  const sync = (patch) => { onDraftChange?.(patch); };
  const setTo = (v)      => { setToState(v);      sync({ to: v }); };
  const setSubject = (v) => { setSubjectState(v); sync({ subject: v }); };
  const setBody = (v)    => { setBodyState(v);    sync({ body: v }); };
  const setSelectedLabels = (updater) => {
    setSelectedLabelsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      sync({ labels: next });
      return next;
    });
  };
  const setAttachments = (updater) => {
    setAttachmentsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      sync({ attachments: next });
      return next;
    });
  };

  const handlePickFiles = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of files) {
        try {
          const meta = await uploadAttachment(clientId, f);
          setAttachments(a => [...a, meta]);
        } catch (e) { toast('error', `Upload failed: ${e.message}`); }
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const removeAttachment = (url) => setAttachments(a => a.filter(x => x.url !== url));
  const fmtSize = (n) => n < 1024 ? `${n}B` : n < 1048576 ? `${(n/1024).toFixed(1)}KB` : `${(n/1048576).toFixed(1)}MB`;

  const handleSend = () => { if (!to || !subject) return; onSend({ to, subject, body, labels: selectedLabels, attachments }); };
  const handleScheduleSelect = (iso) => { if (!to || !subject) return; onSchedule({ to, subject, body, scheduleDate: iso, labels: selectedLabels, attachments }); };
  const handleCustomSchedule = () => { if (!to || !subject || !customSchedule) return; onSchedule({ to, subject, body, scheduleDate: new Date(customSchedule).toISOString(), labels: selectedLabels, attachments }); };

  return (
    <div className="compose-popup" style={{
      position:'fixed', bottom:0, right:80, width:480, maxWidth:'100vw', zIndex:8000,
      background:'var(--surface)', borderRadius:'12px 12px 0 0', boxShadow:'0 -4px 32px rgba(0,0,0,0.15)',
      border:'1px solid var(--border)', borderBottom:'none', display:'flex', flexDirection:'column',
      maxHeight: '70vh',
    }}>
      {/* Title bar */}
      <div style={{
        display:'flex', alignItems:'center', padding:'10px 16px', background:'var(--surface-3)', borderRadius:'12px 12px 0 0',
        flexShrink:0,
      }}>
        <span style={{ fontSize:13, fontWeight:600, color:'#fff', flex:1 }}>
          {replyTo ? 'Reply' : 'New Message'}
        </span>
        {onMinimize && (
          <button onClick={() => onMinimize()} title="Minimize (keep draft while you browse the CRM)" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:4, marginRight:4 }}>
            <Minimize2 size={13} />
          </button>
        )}
        <button onClick={() => onClose()} title="Discard draft" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:4 }}>
          <X size={14} />
        </button>
      </div>

      <>
          {/* To */}
          <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)', padding:'7px 16px' }}>
            <span style={{ fontSize:12, color:'var(--muted)', fontWeight:500, width:50 }}>To</span>
            <ContactSearch value={to} onChange={setTo} contacts={contacts} gmailContacts={gmailContacts} />
          </div>
          {/* Subject */}
          <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)', padding:'7px 16px' }}>
            <span style={{ fontSize:12, color:'var(--muted)', fontWeight:500, width:50 }}>Subject</span>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject"
              style={{ flex:1, border:'none', outline:'none', fontSize:13, color:'var(--text)', background:'transparent' }} />
          </div>
          {/* Labels — solid chips + add-from-dropdown */}
          {labelDefs.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)', padding:'8px 16px', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500, width:50, flexShrink:0 }}>Labels</span>
              {selectedLabels.map(name => {
                const def = labelDefs.find(l => l.name === name);
                const color = def?.color || 'var(--orange)';
                return (
                  <span key={name} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 5px 3px 9px', borderRadius:5, fontSize:11, fontWeight:700, background:color, color:'#fff' }}>
                    {name}
                    <button type="button" onClick={() => setSelectedLabels(prev => prev.filter(x => x !== name))}
                      style={{ background:'rgba(255,255,255,0.25)', border:'none', borderRadius:4, cursor:'pointer', color:'#fff', display:'flex', padding:1 }}><X size={10} /></button>
                  </span>
                );
              })}
              {labelDefs.some(l => !selectedLabels.includes(l.name)) && (
                <div style={{ position:'relative' }}>
                  <button type="button" onClick={() => setLabelMenuOpen(o => !o)} onBlur={() => setTimeout(() => setLabelMenuOpen(false), 150)} title="Add a label"
                    style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:8, border:'1px dashed var(--border)', background:'var(--surface)', color:'var(--muted)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    <Plus size={12} /> {selectedLabels.length ? 'Add' : 'Add label'} <ChevronDown size={11} />
                  </button>
                  {labelMenuOpen && (
                    <div onMouseDown={e => e.preventDefault()} style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, zIndex:60, background:'var(--surface)', border:'1px solid var(--border-light)', borderRadius:10, boxShadow:'var(--shadow-lg)', minWidth:200, maxHeight:220, overflow:'auto', padding:5 }}>
                      {labelDefs.filter(l => !selectedLabels.includes(l.name)).map(l => (
                        <button key={l.id} type="button" onClick={() => { setSelectedLabels(prev => [...prev, l.name]); setLabelMenuOpen(false); }}
                          style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', borderRadius:6, border:'none', background:'transparent', color:'var(--text)', cursor:'pointer', fontSize:12.5, textAlign:'left' }}
                          onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ width:10, height:10, borderRadius:'50%', background:l.color||'var(--orange)', flexShrink:0 }} />{l.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Custom schedule picker */}
          {showCustomPicker && (
            <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)', padding:'7px 16px', background:'var(--surface-2)', gap:8 }}>
              <Clock size={13} color="var(--muted)" />
              <input type="datetime-local" value={customSchedule} onChange={e => setCustomSchedule(e.target.value)}
                min={new Date().toISOString().slice(0,16)} style={{ flex:1, border:'none', outline:'none', fontSize:12, color:'var(--text)', background:'transparent' }} />
              <button onClick={handleCustomSchedule} disabled={!customSchedule||!to||!subject}
                style={{ fontSize:11, padding:'4px 10px', borderRadius:6, background:'var(--orange)', color:'#fff', border:'none', cursor:'pointer', fontWeight:600, opacity:(!customSchedule||!to||!subject)?0.5:1 }}>Schedule</button>
              <button onClick={() => { setShowCustomPicker(false); setCustomSchedule(''); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:2 }}><X size={13} /></button>
            </div>
          )}
          {/* Body */}
          <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)}
            placeholder={replyTo ? 'Write your reply...' : 'Compose your email...'}
            style={{ flex:1, minHeight:180, padding:'12px 16px', border:'none', outline:'none', fontSize:13, lineHeight:1.7, color:'var(--text)', resize:'none', fontFamily:'Inter, sans-serif', boxSizing:'border-box' }} />
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, padding:'8px 16px', borderTop:'1px solid var(--border)', background:'var(--surface-2)' }}>
              {attachments.map(a => (
                <div key={a.url} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 8px 4px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:6, fontSize:11.5, color:'var(--text)' }}>
                  <Paperclip size={11} color="var(--muted)" />
                  <span style={{ fontWeight:600, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</span>
                  <span style={{ color:'var(--muted)', fontSize:10.5 }}>{fmtSize(a.size)}</span>
                  <button onClick={() => removeAttachment(a.url)} style={{ background:'none', border:'none', cursor:'pointer', padding:2, display:'flex', color:'var(--muted)' }}><X size={11} /></button>
                </div>
              ))}
            </div>
          )}
          {/* Actions */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderTop:'1px solid var(--border)', position:'relative', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'stretch', borderRadius:8, overflow:'hidden' }}>
              <button onClick={handleSend} disabled={sending||!to||!subject||uploading}
                style={{ padding:'7px 16px', cursor:sending?'wait':'pointer', background:'linear-gradient(135deg,var(--orange),#2563eb)', border:'none', color:'#fff', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:5, opacity:(sending||!to||!subject||uploading)?0.5:1, borderRight:'1px solid var(--border)' }}>
                <Send size={12} /> {sending?'Sending...':'Send'}
              </button>
              <button onClick={() => setShowSchedule(!showSchedule)} style={{ padding:'7px 8px', cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#2563eb)', border:'none', color:'#fff', display:'flex', alignItems:'center' }}>
                <ChevronDown size={13} />
              </button>
            </div>
            {showSchedule && <SchedulePopup onSelect={handleScheduleSelect} onPickCustom={() => setShowCustomPicker(true)} onClose={() => setShowSchedule(false)} />}
            <button onClick={() => onSaveDraft({ to, subject, body, attachments })} style={{ padding:'7px 12px', borderRadius:8, cursor:'pointer', background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--muted)', fontSize:12, fontWeight:500 }}>Draft</button>
            <input ref={fileRef} type="file" multiple onChange={e => handlePickFiles(Array.from(e.target.files || []))} style={{ display:'none' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Attach files" style={{ padding:'7px 10px', borderRadius:8, cursor:uploading?'wait':'pointer', background:'var(--surface-2)', border:'1px solid var(--border)', color:uploading?'var(--orange)':'var(--muted)', display:'flex', alignItems:'center', gap:5, fontSize:12 }}>
              {uploading ? <Loader size={12} className="spin" /> : <Paperclip size={13} />}
            </button>
            <div style={{ flex:1 }} />
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:4 }}><Trash2 size={14} /></button>
          </div>
        </>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */

export default function EmailPage() {
  const { selectedClient } = useClient();
  const clientId = selectedClient?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  // Persist tab + selected email in the URL AND localStorage so both switching
  // pages within the CRM and refreshes remember what you had open.
  const LAST_TAB_LS  = 'vtm-email-last-tab';
  const LAST_OPEN_LS = 'vtm-email-last-open';
  const [tab, setTabInternal] = useState(() => {
    const t = searchParams.get('tab') || (typeof localStorage !== 'undefined' ? localStorage.getItem(LAST_TAB_LS) : null);
    return ['inbox','sent','drafts','starred','spam'].includes(t) ? t : 'inbox';
  });
  const setTab = (nextTab) => {
    setTabInternal(nextTab);
    try { localStorage.setItem(LAST_TAB_LS, nextTab); } catch {}
    const params = new URLSearchParams(searchParams);
    if (nextTab === 'inbox') params.delete('tab'); else params.set('tab', nextTab);
    setSearchParams(params, { replace: true });
  };
  const [queueEmails, setQueueEmails]       = useState([]);
  const [inboxMessages, setInboxMessages]   = useState([]);
  const [sentMessages, setSentMessages]     = useState([]);
  const [draftMessages, setDraftMessages]   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [selected, setSelectedInternal]     = useState(null);
  // Persist open email in URL + localStorage. Functional updaters (label refresh
  // patches, real-time sync) don't change identity, so skip the URL write.
  const setSelected = (arg) => {
    if (typeof arg === 'function') { setSelectedInternal(arg); return; }
    setSelectedInternal(arg);
    try {
      if (arg?.id) localStorage.setItem(LAST_OPEN_LS, arg.id);
      else localStorage.removeItem(LAST_OPEN_LS);
    } catch {}
    const params = new URLSearchParams(searchParams);
    if (arg?.id) params.set('open', arg.id); else params.delete('open');
    setSearchParams(params, { replace: true });
  };
  const [foldersOpen, setFoldersOpen]       = useState(false); // mobile folders drawer
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading]   = useState(false);
  const [search, setSearch]                 = useState('');
  const [refreshing, setRefreshing]         = useState(false);
  const [allContacts, setAllContacts]       = useState([]);
  const [gmailContactsList, setGmailContactsList] = useState([]);
  const historyIdRef = useRef(null);
  const syncingRef = useRef(false);
  const [labelFilter, setLabelFilter] = useState(() => new Set());
  const toggleLabelFilter = (labelId) => setLabelFilter(prev => {
    const next = new Set(prev);
    if (next.has(labelId)) next.delete(labelId); else next.add(labelId);
    return next;
  });
  const clearLabelFilters = () => setLabelFilter(new Set());

  // Category visibility — user can hide entire Gmail categories from the inbox.
  // Persisted so the choice sticks across sessions. Default: hide Promotions.
  const EXCLUDED_LS_KEY = 'vtm-email-excluded-labels';
  const [excludedLabels, setExcludedLabels] = useState(() => {
    try {
      const raw = localStorage.getItem(EXCLUDED_LS_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set(['CATEGORY_PROMOTIONS']);
  });
  useEffect(() => {
    try { localStorage.setItem(EXCLUDED_LS_KEY, JSON.stringify(Array.from(excludedLabels))); } catch {}
  }, [excludedLabels]);
  const toggleCategoryVisible = (labelId) => setExcludedLabels(prev => {
    const next = new Set(prev);
    if (next.has(labelId)) next.delete(labelId); else next.add(labelId);
    return next;
  });

  // Custom labels
  const [customLabels, setCustomLabels]     = useState([]);
  const [showNewLabel, setShowNewLabel]     = useState(false);
  const [newLabelName, setNewLabelName]     = useState('');
  const [newLabelColor, setNewLabelColor]   = useState('var(--orange)');

  // Row selection (checkboxes) for bulk-labeling
  const [selectedIds, setSelectedIds]       = useState(new Set());
  const [labelMenuOpen, setLabelMenuOpen]   = useState(false);
  const toggleSelectId = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // AI Follow-ups
  const [followups, setFollowups]           = useState([]);
  const [showFollowups, setShowFollowups]   = useState(false);
  const [followupsLoading, setFollowupsLoading] = useState(false);

  // Compose popup — draft + open/minimized state live in ComposeContext so they
  // persist across page changes and browser refresh.
  const compose = useCompose();
  const composeOpen = compose.isOpen ? (compose.draft?.replyTo || true) : false;
  const [sending, setSending]               = useState(false);
  const setComposeOpen = (v) => {
    if (!v) { compose.close(); return; }
    if (v === true) { compose.openCompose(null); return; }
    compose.openCompose(v);
  };

  // Auto-open compose if navigated with ?compose=email
  useEffect(() => {
    const composeEmail = searchParams.get('compose');
    const composeName = searchParams.get('name');
    if (composeEmail) {
      setComposeOpen({ to_email: composeEmail, subject: '' });
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── data loading (cache-first, then background sync) ─────────────── */

  const load = useCallback(async (forceSync = false) => {
    setLoading(true);

    // Step 1: Load from cache (instant)
    const [queueRes, inboxRes, sentRes, draftRes] = await Promise.allSettled([
      getEmailQueue(),
      getGmailInbox({ label:'INBOX' }),
      getGmailInbox({ label:'SENT' }),
      getGmailInbox({ label:'DRAFT' }),
    ]);

    setQueueEmails(queueRes.status==='fulfilled' && Array.isArray(queueRes.value) ? queueRes.value : []);
    setInboxMessages(inboxRes.status==='fulfilled' && inboxRes.value?.messages ? inboxRes.value.messages : []);
    setSentMessages(sentRes.status==='fulfilled' && sentRes.value?.messages ? sentRes.value.messages : []);
    setDraftMessages(draftRes.status==='fulfilled' && draftRes.value?.messages ? draftRes.value.messages : []);
    setLoading(false);

    // Step 2: Background sync for new emails (don't block UI)
    if (forceSync || inboxRes.value?.cached) {
      Promise.allSettled([
        getGmailInbox({ label:'INBOX', sync:'true' }),
        getGmailInbox({ label:'SENT', sync:'true' }),
        getGmailInbox({ label:'DRAFT', sync:'true' }),
      ]).then(([inboxSync, sentSync, draftSync]) => {
        if (inboxSync.status==='fulfilled' && inboxSync.value?.messages) setInboxMessages(inboxSync.value.messages);
        if (sentSync.status==='fulfilled' && sentSync.value?.messages) setSentMessages(sentSync.value.messages);
        if (draftSync.status==='fulfilled' && draftSync.value?.messages) setDraftMessages(draftSync.value.messages);
      });
    }
  }, []);

  useEffect(() => {
    async function loadContacts() {
      const results = [];
      try { const c = await getContacts(); (c||[]).forEach(x => { if(x.email) results.push({name:x.name||'',email:x.email,_source:'contact'}); }); } catch{}
      try { const l = await getLeads(); (l||[]).forEach(x => { if(x.email) results.push({name:x.name||'',email:x.email,_source:'lead'}); }); } catch{}
      const seen = new Set();
      setAllContacts(results.filter(c => { if(seen.has(c.email)) return false; seen.add(c.email); return true; }));
      try { const gc = await getGmailContacts({pageSize:'100'}); setGmailContactsList(gc?.contacts||[]); } catch{}
    }
    loadContacts();
    // Load real Gmail labels (synced both ways — see gmail-labels.js)
    getGmailLabels().then(l => setCustomLabels(l||[])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  // Restore the previously-open email either from ?open=<id> or, if the URL
  // was reset by a sidebar navigation, from the last-open id we cached in
  // localStorage. Waits until the relevant list has actually loaded before firing.
  const restoredOpenRef = useRef(false);
  useEffect(() => {
    if (restoredOpenRef.current) return;
    let openId = searchParams.get('open');
    if (!openId) {
      try { openId = localStorage.getItem(LAST_OPEN_LS); } catch {}
    }
    if (!openId) return;
    const pool = [...inboxMessages, ...sentMessages, ...draftMessages, ...queueEmails];
    const found = pool.find(m => m.id === openId);
    if (!found) return;
    restoredOpenRef.current = true;
    selectEmail(found);
  }, [inboxMessages, sentMessages, draftMessages, queueEmails, searchParams]);

  // Real-time label sync — poll Gmail's history endpoint every 20s while this
  // page is open and visible. Any label add/remove that happened outside the
  // CRM (mobile Gmail, gmail.com, filters, another client) shows up here
  // without a manual refresh. Pauses while the tab is hidden to avoid burning
  // Gmail quota. See api/crm/gmail-sync.js for the server side.
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const applyChanges = (changes, deleted, newMessages) => {
      if (!changes?.length && !deleted?.length && !newMessages?.length) return;
      const changeMap = new Map((changes || []).map(c => [c.id, c.labelIds]));
      const deletedSet = new Set(deleted || []);
      const update = prev => prev
        .filter(m => !deletedSet.has(m.id))
        .map(m => changeMap.has(m.id) ? { ...m, labelIds: changeMap.get(m.id) } : m);
      setInboxMessages(prev => {
        const filteredPrev = prev.filter(m => !deletedSet.has(m.id))
          .map(m => changeMap.has(m.id) ? { ...m, labelIds: changeMap.get(m.id) } : m);
        // Prepend any brand-new inbox arrivals, skipping ones we already have.
        if (newMessages?.length) {
          const have = new Set(filteredPrev.map(m => m.id));
          const fresh = newMessages
            .filter(m => !have.has(m.id))
            .map(m => ({ ...m, _type: 'gmail' }));
          return [...fresh, ...filteredPrev];
        }
        return filteredPrev;
      });
      setSentMessages(update);
      setDraftMessages(update);
      setSelected(s => {
        if (!s) return s;
        if (deletedSet.has(s.id)) return null;
        if (changeMap.has(s.id)) return { ...s, labelIds: changeMap.get(s.id) };
        return s;
      });
    };

    const tick = async () => {
      if (cancelled || document.hidden || syncingRef.current) return;
      syncingRef.current = true;
      try {
        const startHistoryId = historyIdRef.current;
        const data = await gmailSync(startHistoryId);
        if (cancelled) return;
        if (data?.historyId) historyIdRef.current = data.historyId;
        if (data?.reset) return; // server re-anchored us; nothing to apply this cycle
        applyChanges(data?.changes, data?.deleted, data?.newMessages);
      } catch (e) {
        // Silent — polling should never spam toasts on a transient network blip.
        console.debug('gmail-sync tick failed:', e.message);
      } finally {
        syncingRef.current = false;
      }
    };

    // Anchor: fetch the current historyId once, then start polling.
    (async () => {
      try {
        const anchor = await gmailSync();
        if (cancelled) return;
        historyIdRef.current = anchor?.historyId || null;
      } catch (e) { console.debug('gmail-sync anchor failed:', e.message); }
      timer = setInterval(tick, 20000);
    })();

    // Catch up immediately whenever the tab becomes visible again.
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Auto-sync every 5 minutes for new emails
  useEffect(() => {
    const interval = setInterval(() => {
      Promise.allSettled([
        getGmailInbox({ label:'INBOX', sync:'true' }),
        getGmailInbox({ label:'SENT', sync:'true' }),
        getGmailInbox({ label:'DRAFT', sync:'true' }),
      ]).then(([inboxSync, sentSync, draftSync]) => {
        if (inboxSync.status==='fulfilled' && inboxSync.value?.messages) setInboxMessages(inboxSync.value.messages);
        if (sentSync.status==='fulfilled' && sentSync.value?.messages) setSentMessages(sentSync.value.messages);
        if (draftSync.status==='fulfilled' && draftSync.value?.messages) setDraftMessages(draftSync.value.messages);
      });
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load(true);
      // Also force-refresh labelIds on every currently-cached Gmail message so
      // any labels applied before our real-time sync started running get pulled in.
      const ids = [
        ...inboxMessages.map(m => m.id),
        ...sentMessages.map(m => m.id),
        ...draftMessages.map(m => m.id),
      ].filter(Boolean);
      if (ids.length) {
        try {
          const { changes = [] } = await gmailRefreshLabels(ids);
          if (changes.length) {
            const map = new Map(changes.map(c => [c.id, c.labelIds]));
            const update = prev => prev.map(m => map.has(m.id) ? { ...m, labelIds: map.get(m.id) } : m);
            setInboxMessages(update); setSentMessages(update); setDraftMessages(update);
            setSelected(s => s && map.has(s.id) ? { ...s, labelIds: map.get(s.id) } : s);
          }
        } catch (e) { console.debug('label refresh failed:', e.message); }
      }
    } finally { setRefreshing(false); }
  };

  // Label management — creates/deletes a real Gmail label (two-way synced)
  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      const created = await createGmailLabel({ name: newLabelName.trim(), color: newLabelColor });
      setCustomLabels(prev => [...prev.filter(l => l.id !== created.id), created]);
      setNewLabelName(''); setShowNewLabel(false);
    } catch (e) { toast('error', 'Failed: ' + e.message); }
  };
  const handleDeleteLabel = async (id) => {
    try { await deleteGmailLabel(id); setCustomLabels(prev => prev.filter(l => l.id !== id)); }
    catch (e) { toast('error', 'Failed: ' + e.message); }
  };

  // Apply/remove a real Gmail label on a specific message (updates local
  // state immediately; the message's `labelIds` array is the source of truth).
  const toggleGmailLabel = async (msg, label) => {
    const has = asArray(msg.labelIds).includes(label.id);
    try {
      if (has) await removeGmailLabel(msg.id, label.id);
      else await applyGmailLabel(msg.id, label.id);
      const update = prev => prev.map(m => {
        if (m.id !== msg.id) return m;
        return { ...m, labelIds: has ? asArray(m.labelIds).filter(l => l !== label.id) : [...asArray(m.labelIds), label.id] };
      });
      setInboxMessages(update); setSentMessages(update); setDraftMessages(update);
      if (selected?.id === msg.id) {
        setSelected(s => ({ ...s, labelIds: has ? asArray(s.labelIds).filter(l => l !== label.id) : [...asArray(s.labelIds), label.id] }));
      }
    } catch (e) { toast('error', 'Label failed: ' + e.message); }
  };

  // Apply a label to every currently-selected email (bulk action from the toolbar).
  const applyLabelToSelected = async (label) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    const msgs = filtered.filter(e => selectedIds.has(e.id) && e._type !== 'queue');
    try {
      await Promise.all(msgs.map(m => asArray(m.labelIds).includes(label.id) ? null : applyGmailLabel(m.id, label.id)).filter(Boolean));
      const update = prev => prev.map(m => selectedIds.has(m.id) && !asArray(m.labelIds).includes(label.id)
        ? { ...m, labelIds: [...asArray(m.labelIds), label.id] } : m);
      setInboxMessages(update); setSentMessages(update); setDraftMessages(update);
      setSelectedIds(new Set());
      toast('success', `Labeled ${msgs.length} email${msgs.length === 1 ? '' : 's'} “${label.name}”`);
    } catch (e) { toast('error', 'Label failed: ' + e.message); }
  };

  // AI Follow-ups
  const loadFollowups = async () => {
    setFollowupsLoading(true);
    try { const data = await getAIFollowups(); setFollowups(data?.suggestions||[]); setShowFollowups(true); }
    catch (e) { console.error('Follow-up error:', e); }
    finally { setFollowupsLoading(false); }
  };

  /* ── label actions ───────────────────────────────────────────────────── */

  const toggleLabel = async (msg, labelKey) => {
    const hasLabel = (msg.crmLabels||[]).includes(labelKey);
    try {
      if (hasLabel) { await removeEmailLabel(msg.id, labelKey); }
      else { await addEmailLabel({ gmail_message_id:msg.id, gmail_thread_id:msg.threadId||'', label:labelKey, from_email:msg.from?.email||msg.from||'', to_email:msg.to||'', subject:msg.subject||'', snippet:msg.snippet||'', date:msg.date ? new Date(msg.date).toISOString() : new Date().toISOString() }); }
      const update = prev => prev.map(m => { if(m.id!==msg.id) return m; return { ...m, crmLabels: hasLabel ? (m.crmLabels||[]).filter(l=>l!==labelKey) : [...(m.crmLabels||[]),labelKey] }; });
      setInboxMessages(update); setSentMessages(update); setDraftMessages(update);
      if (selected?.id===msg.id) setSelected(s => ({ ...s, crmLabels: hasLabel ? (s.crmLabels||[]).filter(l=>l!==labelKey) : [...(s.crmLabels||[]),labelKey] }));
    } catch(e) { console.error('Label error:', e); }
  };

  /* ── filtered list ───────────────────────────────────────────────────── */

  const contactMap = {}; allContacts.forEach(c => { contactMap[c.email] = c; });

  let filtered = [];
  if (tab==='inbox') {
    filtered = inboxMessages.filter(m => !(m.crmLabels||[]).includes('spam')).map(m => ({...m, _type:'gmail'}));
  } else if (tab==='sent') {
    // Gmail sent messages + queue sent items
    const gmailSent = sentMessages.map(m => ({...m, _type:'gmail-sent'}));
    const queueSent = queueEmails.filter(e => e.status==='sent').map(e => ({...e, _type:'queue'}));
    filtered = [...gmailSent, ...queueSent].sort((a,b) => new Date(b.date||b.created_at||0) - new Date(a.date||a.created_at||0));
  } else if (tab==='drafts') {
    // Gmail drafts + queue drafts
    const gmailDrafts = draftMessages.map(m => ({...m, _type:'gmail-draft'}));
    const queueDrafts = queueEmails.filter(e => e.status==='draft'||e.status==='pending').map(e => ({...e, _type:'queue'}));
    filtered = [...gmailDrafts, ...queueDrafts].sort((a,b) => new Date(b.date||b.created_at||0) - new Date(a.date||a.created_at||0));
  } else if (tab==='scheduled') {
    // Queue items waiting to auto-send at their scheduled_for time.
    filtered = queueEmails.filter(e => e.status==='scheduled').map(e => ({...e, _type:'queue'}))
      .sort((a,b) => new Date(a.scheduled_for||0) - new Date(b.scheduled_for||0));
  } else if (tab==='starred') {
    filtered = inboxMessages.filter(m => (m.crmLabels||[]).some(l => l==='favorite'||l==='follow-up'||l==='important')).map(m => ({...m, _type:'gmail'}));
  } else if (tab==='spam') {
    filtered = inboxMessages.filter(m => (m.crmLabels||[]).includes('spam')).map(m => ({...m, _type:'gmail'}));
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e => {
      const name = e._type==='queue' ? (e.lead_name||e.to_email||'') : (e.from?.name||e.from?.email||'');
      return name.toLowerCase().includes(q) || (e.subject||'').toLowerCase().includes(q) || (e.to_email||e.to||'').toLowerCase().includes(q);
    });
  }

  // Category exclusions — hide anything carrying an excluded label (Promotions
  // by default). Doesn't affect queue rows.
  if (excludedLabels.size > 0) {
    const hidden = Array.from(excludedLabels);
    filtered = filtered.filter(e => {
      if (e._type === 'queue') return true;
      const ids = asArray(e.labelIds);
      return !hidden.some(id => ids.includes(id));
    });
  }

  // Label filter — intersection: every filter must be present on the message.
  // Only meaningful for Gmail-backed rows (queue rows don't have labelIds).
  if (labelFilter.size > 0) {
    const wanted = Array.from(labelFilter);
    filtered = filtered.filter(e => {
      if (e._type === 'queue') return false; // queue items aren't Gmail-labeled
      const ids = asArray(e.labelIds);
      return wanted.every(id => ids.includes(id));
    });
  }

  const autoDraftCount = queueEmails.filter(e => e.status==='draft'&&e.auto_generated).length;
  const scheduledCount = queueEmails.filter(e => e.status==='scheduled').length;
  const inboxCount = inboxMessages.filter(m => !(m.crmLabels||[]).includes('spam')).length;

  /* ── actions ─────────────────────────────────────────────────────────── */

  // Select email and load thread
  const selectEmail = async (email) => {
    setSelected(email);
    setThreadMessages([]);
    // Load full thread for Gmail messages — this also refreshes the label state
    // from Gmail so labels applied outside the CRM (mobile Gmail, gmail.com, other
    // clients) show up here without waiting for a manual sync.
    if (email.threadId && (email._type==='gmail'||email._type==='gmail-sent'||email._type==='gmail-draft')) {
      setThreadLoading(true);
      try {
        const data = await getGmailThread(email.threadId);
        const msgs = data?.messages || [];
        setThreadMessages(msgs);

        // Find this specific message in the thread and pull its fresh labelIds
        // + the RFC 2822 Message-ID / References headers. We need those headers
        // to make a Reply actually thread inside Gmail (In-Reply-To + References
        // + threadId) instead of showing up as a brand-new conversation.
        const fresh = msgs.find(m => m.id === email.id);
        if (fresh) {
          const freshIds = Array.isArray(fresh.labelIds) ? fresh.labelIds : (email.labelIds || []);
          const patch = {
            labelIds: freshIds,
            threadId: fresh.threadId || email.threadId,
            messageIdHeader: fresh.messageIdHeader || null,
            references: fresh.references || null,
          };
          setSelected(s => s && s.id === email.id ? { ...s, ...patch } : s);
          const update = prev => prev.map(m => m.id === email.id ? { ...m, ...patch } : m);
          setInboxMessages(update); setSentMessages(update); setDraftMessages(update);
        }
      } catch (e) { console.error('Thread load error:', e); }
      setThreadLoading(false);
    }
  };

  const handleSendQueue = async id => { try { await sendQueueItem(id); await load(); setSelected(null); } catch(e) { toast('error', 'Send failed: '+e.message); } };
  const handleDelete = async id => { try { await deleteQueueItem(id); await load(); if(selected?.id===id) setSelected(null); } catch(e) { toast('error', 'Delete failed: '+e.message); } };
  const handleUnschedule = async id => { try { await updateQueueItem(id, {status:'draft', scheduled_for:null}); await load(); setSelected(null); } catch(e) { toast('error', 'Unschedule failed: '+e.message); } };
  const handleTrashGmail = async (email, e) => {
    e.stopPropagation();
    if (!confirm('Move this email to trash?')) return;
    try {
      await trashGmailMessage(email.id);
      const remove = prev => prev.filter(m => m.id !== email.id);
      setInboxMessages(remove); setSentMessages(remove); setDraftMessages(remove);
      if (selected?.id === email.id) setSelected(null);
    } catch(err) { toast('error', 'Trash failed: ' + err.message); }
  };
  const handleApprove = async email => { try { await updateQueueItem(email.id, {status:'pending'}); await load(); } catch(e) { toast('error', 'Approve failed: '+e.message); } };

  const openCompose = () => { setComposeOpen(true); setSelected(null); };
  const openReply = () => { setComposeOpen(selected); };

  // When the composer is in reply mode, thread the outgoing message into the
  // original Gmail conversation by carrying threadId + Message-ID/References
  // headers all the way to Gmail's send API through the queue row.
  const replyThreading = () => {
    const rt = compose.draft?.replyTo;
    if (!rt) return {};
    const inReplyTo = rt.messageIdHeader || rt.rfc_message_id || null;
    const references = rt.references
      ? (inReplyTo ? `${rt.references} ${inReplyTo}` : rt.references)
      : (inReplyTo || null);
    return {
      reply_thread_id: rt.threadId || null,
      reply_rfc_message_id: references || inReplyTo || null,
    };
  };

  const handleComposeSend = async ({ to, subject, body, labels, attachments }) => {
    if(!to||!subject) return; setSending(true);
    try { const c = await createQueueItem({to_email:to,subject,body,labels:labels||[],attachments:attachments||[],status:'draft',...replyThreading()}); await sendQueueItem(c.id); setComposeOpen(false); await load(); } catch(e) { toast('error', 'Send failed: '+e.message); } finally { setSending(false); }
  };
  const handleComposeSchedule = async ({ to, subject, body, scheduleDate, labels, attachments }) => {
    if(!to||!subject||!scheduleDate) return; setSending(true);
    try { await createQueueItem({to_email:to,subject,body,labels:labels||[],attachments:attachments||[],status:'draft',follow_up_date:scheduleDate,...replyThreading()}); setComposeOpen(false); await load(); } catch(e) { toast('error', 'Schedule failed: '+e.message); } finally { setSending(false); }
  };
  const handleComposeDraft = async ({ to, subject, body, labels, attachments }) => {
    if(!to&&!subject&&!body) return;
    try { await createQueueItem({to_email:to,subject,body,labels:labels||[],attachments:attachments||[],status:'draft',...replyThreading()}); setComposeOpen(false); await load(); } catch(e) { toast('error', 'Save failed: '+e.message); }
  };

  /* ── display helpers ─────────────────────────────────────────────────── */

  function getName(email) {
    if (email._type==='queue') return email.lead_name||email.to_email||'Unknown';
    if (email._type==='gmail-sent') { const to = email.to||''; const c = contactMap[to.replace(/.*<(.+)>/,'$1')]; return c?.name || to.replace(/<.*>/,'').trim() || to; }
    const c = contactMap[email.from?.email]; return c?.name || email.from?.name || email.from?.email || 'Unknown';
  }
  function getDate(email) { return email._type==='queue' ? (email.created_at||'') : (email.date||''); }
  function getPreview(email) { return email._type==='queue' ? (email.body||email.generated_body||'').slice(0,120) : (email.snippet||''); }
  function getRecipient(email) {
    if (email._type==='gmail-sent'||email._type==='queue') return email.to_email||email.to||'';
    return email.from?.email||'';
  }

  const currentIdx = selected ? filtered.findIndex(e => e.id===selected.id) : -1;

  /* ════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="email-page-wrap" style={{ height:'100%', display:'flex', background:'var(--bg)', fontFamily:'var(--font-display)' }}>

      {/* Mobile drawer overlay */}
      <div className={`email-sidebar-overlay${foldersOpen ? ' open' : ''}`} onClick={() => setFoldersOpen(false)} />

      {/* ── Left Sidebar ── */}
      <div className={`email-sidebar${foldersOpen ? ' open' : ''}`} style={{ width:200, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div className="email-sidebar-compose" style={{ padding:'16px 14px 12px' }}>
          <button onClick={openCompose} style={{ width:'100%', padding:'10px 0', borderRadius:10, cursor:'pointer', background:'var(--btn-black)', border:'none', color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Edit3 size={14} /> Compose
          </button>
        </div>
        <div className="email-sidebar-search" style={{ padding:'0 14px 12px' }}>
          <div style={{ position:'relative' }}>
            <Search size={13} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              style={{ width:'100%', padding:'8px 10px 8px 30px', borderRadius:8, fontSize:12, background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)', outline:'none' }} />
          </div>
        </div>
        <div className="email-sidebar-tabs" style={{ flex:1 }}>
          {TABS.map(t => {
            const isActive = tab===t.key;
            let count = 0;
            if (t.key==='drafts') count = autoDraftCount;
            if (t.key==='scheduled') count = scheduledCount;
            if (t.key==='inbox') count = inboxCount;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setSelected(null); setSelectedIds(new Set()); setFoldersOpen(false); }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 18px', border:'none', cursor:'pointer', fontSize:13, fontWeight:isActive?700:500,
                  background:isActive?'var(--surface-2)':'transparent', color:isActive?'var(--text)':'var(--muted)', borderLeft:isActive?'3px solid var(--link)':'3px solid transparent' }}>
                <t.icon size={16} /> {t.label}
                {count > 0 && <span style={{ marginLeft:'auto', background:t.key==='drafts'?'var(--red)':'var(--orange)', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }}>{count}</span>}
              </button>
            );
          })}
        </div>
        {/* ── Custom Labels ── */}
        <div className="email-sidebar-labels" style={{ borderTop:'1px solid var(--border)', padding:'8px 14px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontSize:10, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Labels</span>
            <button onClick={() => setShowNewLabel(!showNewLabel)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--orange)', display:'flex', padding:2 }}>
              <Plus size={13} />
            </button>
          </div>
          {showNewLabel && (
            <div style={{ display:'flex', gap:4, marginBottom:6 }}>
              <input
                type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)}
                style={{ width:24, height:24, border:'none', cursor:'pointer', borderRadius:4, padding:0, background:'none' }}
              />
              <input
                value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                placeholder="Label name..."
                onKeyDown={e => e.key==='Enter' && handleCreateLabel()}
                style={{ flex:1, fontSize:11, padding:'4px 8px', border:'1px solid var(--border)', borderRadius:6, outline:'none', color:'var(--text)', background:'var(--surface-2)' }}
              />
              <button onClick={handleCreateLabel} style={{ background:'var(--btn-black)', border:'none', borderRadius:6, color:'#fff', fontSize:10, padding:'4px 8px', cursor:'pointer', fontWeight:600 }}>Add</button>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:120, overflow:'auto' }}>
            {customLabels.filter(l => !l.system).map(l => {
              const hasSelection = selectedIds.size > 0;
              const applied = !hasSelection && selected && asArray(selected.labelIds).includes(l.id);
              const clickable = hasSelection || !!selected;
              const isFilter = labelFilter.has(l.id);
              const onLabelClick = () => { if (hasSelection) applyLabelToSelected(l); else if (selected) toggleGmailLabel(selected, l); };
              const hint = hasSelection ? `Apply "${l.name}" to ${selectedIds.size} selected` : (selected ? (applied ? `Remove "${l.name}" from this email` : `Apply "${l.name}" to this email`) : l.name);
              return (
                <div key={l.id}
                  onClick={onLabelClick}
                  title={hint}
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:6, cursor:clickable?'pointer':'default', fontSize:12, color: applied ? 'var(--text)' : 'var(--muted)', background: applied ? 'var(--surface-2)' : 'transparent' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background=applied?'var(--surface-2)':'transparent'}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:l.color||'var(--orange)', flexShrink:0 }} />
                  <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name}</span>
                  {applied && <Check size={11} style={{ color:l.color||'var(--orange)', flexShrink:0 }} />}
                  <button
                    onClick={e => { e.stopPropagation(); toggleLabelFilter(l.id); }}
                    title={isFilter ? `Stop filtering by "${l.name}"` : `Filter inbox by "${l.name}"`}
                    style={{ background: isFilter ? 'var(--orange)' : 'none', border:'none', cursor:'pointer', color: isFilter ? '#fff' : 'var(--muted)', display:'flex', padding:2, borderRadius:4 }}
                    onMouseEnter={e => e.currentTarget.style.color = isFilter ? '#fff' : 'var(--orange)'}
                    onMouseLeave={e => e.currentTarget.style.color = isFilter ? '#fff' : 'var(--muted)'}>
                    <Filter size={11} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDeleteLabel(l.id); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:1 }}
                    onMouseEnter={e => e.currentTarget.style.color='#ff5c5c'} onMouseLeave={e => e.currentTarget.style.color='var(--muted)'}>
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Categories (Gmail's built-ins) — checkbox to show/hide from inbox, filter icon to focus */}
          {customLabels.some(l => l.system) && (
            <>
              <div style={{ marginTop:10, marginBottom:6, fontSize:10, fontWeight:600, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Categories</div>
              <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:180, overflow:'auto' }}>
                {customLabels.filter(l => l.system).map(l => {
                  const isFilter = labelFilter.has(l.id);
                  const visible = !excludedLabels.has(l.id);
                  return (
                    <div key={l.id}
                      style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:6, fontSize:12, color: isFilter ? 'var(--text)' : 'var(--muted)', background: isFilter ? 'var(--surface-2)' : 'transparent' }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = isFilter ? 'var(--surface-2)' : 'transparent'}>
                      <input type="checkbox" checked={visible} onChange={() => toggleCategoryVisible(l.id)}
                        title={visible ? `Hide ${l.name} from inbox` : `Show ${l.name} in inbox`}
                        style={{ width:12, height:12, cursor:'pointer', accentColor:'var(--orange)', flexShrink:0 }} />
                      <div style={{ width:10, height:10, borderRadius:'50%', background:l.color||'var(--muted)', flexShrink:0, opacity: visible ? 1 : 0.35 }} />
                      <span onClick={() => toggleLabelFilter(l.id)}
                        title={isFilter ? `Stop filtering by "${l.name}"` : `Filter inbox by "${l.name}"`}
                        style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', opacity: visible ? 1 : 0.5 }}>{l.name}</span>
                      {isFilter && <Filter size={11} style={{ color:'var(--orange)', flexShrink:0 }} />}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── AI Follow-ups & Refresh ── */}
        <div className="email-sidebar-actions" style={{ padding:'8px 14px 12px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
          <button onClick={loadFollowups} disabled={followupsLoading}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 0', border:'1px solid var(--border)', borderRadius:8, background:followupsLoading?'var(--surface-3)':'var(--surface-2)', color:followupsLoading?'var(--muted)':'var(--orange)', fontSize:12, cursor:followupsLoading?'wait':'pointer', fontWeight:500 }}>
            <Zap size={12} /> {followupsLoading ? 'Analyzing...' : 'AI Follow-ups'}
          </button>
          <button onClick={handleRefresh} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 0', border:'1px solid var(--border)', borderRadius:8, background:'var(--surface-2)', color:'var(--muted)', fontSize:12, cursor:'pointer' }}>
            <RefreshCw size={12} style={{ animation:refreshing?'spin 1s linear infinite':'none' }} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, minHeight:0 }}>

        {selected ? (
          /* ── Detail View ── */
          <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
            {/* Header */}
            <div className="email-detail-header" style={{ padding:'12px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--orange)', display:'flex', alignItems:'center', gap:4, fontSize:13, fontWeight:500 }}>
                <ChevronLeft size={16} /> Back
              </button>
              <div style={{ flex:1 }} />
              {(selected._type==='gmail'||selected._type==='gmail-sent'||selected._type==='gmail-draft') && (
                <div style={{ display:'flex', alignItems:'center', gap:2, marginRight:8 }}>
                  {['favorite','follow-up','important'].map(lbl => (
                    <LabelButton key={lbl} labelKey={lbl} active={(selected.crmLabels||[]).includes(lbl)} onClick={() => toggleLabel(selected,lbl)} size={16} />
                  ))}
                  <button onClick={() => toggleLabel(selected,'spam')} title={(selected.crmLabels||[]).includes('spam')?'Remove from spam':'Mark as spam'}
                    style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:(selected.crmLabels||[]).includes('spam')?'var(--red)':'var(--muted)', display:'flex' }}><Ban size={16} /></button>
                </div>
              )}
              <span style={{ fontSize:12, color:'var(--muted)' }}>{currentIdx+1} of {filtered.length}</span>
              <button onClick={() => currentIdx>0 && setSelected(filtered[currentIdx-1])} disabled={currentIdx<=0}
                style={{ background:'none', border:'none', cursor:currentIdx>0?'pointer':'default', color:currentIdx>0?'var(--muted)':'var(--surface-3)', display:'flex' }}><ChevronLeft size={16} /></button>
              <button onClick={() => currentIdx<filtered.length-1 && setSelected(filtered[currentIdx+1])} disabled={currentIdx>=filtered.length-1}
                style={{ background:'none', border:'none', cursor:currentIdx<filtered.length-1?'pointer':'default', color:currentIdx<filtered.length-1?'var(--muted)':'var(--surface-3)', display:'flex' }}><ChevronRight size={16} /></button>
            </div>

            {/* Content */}
            <div className="email-detail-content" style={{ flex:1, overflowY:'auto', overflowX:'hidden', minHeight:0, padding:'24px 32px' }}>
              <div className="email-detail-inner" style={{ width:'100%' }}>
                <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text)', margin:'0 0 6px' }}>{selected.subject||'(no subject)'}</h1>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>{fmtFullDate(getDate(selected))}</div>

                {/* CRM labels */}
                {(selected.crmLabels||[]).filter(l=>l!=='spam').length > 0 && (
                  <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                    {(selected.crmLabels||[]).filter(l=>l!=='spam').map(l => {
                      const cfg = LABEL_CONFIG[l];
                      if (!cfg) return null;
                      return (
                        <span key={l} style={{ fontSize:11, padding:'3px 5px 3px 10px', borderRadius:5, background:cfg.color, color:'#fff', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                          {cfg.label}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleLabel(selected, l); }}
                            title={`Remove ${cfg.label}`}
                            style={{ background:'rgba(0,0,0,0.18)', border:'none', color:'#fff', width:14, height:14, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0, lineHeight:1 }}>
                            <X size={9} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Real Gmail labels — click a label in the sidebar to toggle it here */}
                {customLabels.some(l => !HIDDEN_PILL_LABELS.has(l.id) && asArray(selected.labelIds).includes(l.id)) && (
                  <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
                    {customLabels.filter(l => !HIDDEN_PILL_LABELS.has(l.id) && asArray(selected.labelIds).includes(l.id)).map(l => (
                      <span key={l.id} style={{ fontSize:11.5, padding:'3px 5px 3px 11px', borderRadius:5, background:l.color||'var(--orange)', color:'#fff', fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                        <Tag size={11} /> {l.name}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleGmailLabel(selected, l); }}
                          title={`Remove ${l.name}`}
                          style={{ background:'rgba(0,0,0,0.22)', border:'none', color:'#fff', width:15, height:15, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0, lineHeight:1, marginLeft:2 }}>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {selected.auto_generated && (
                  <div style={{ padding:'10px 16px', background:'rgba(37,99,235,0.05)', border:'1px solid var(--border-light)', borderRadius:8, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                    <Sparkles size={14} color="var(--orange)" /><span style={{ fontSize:13, color:'var(--orange)', fontWeight:500 }}>Auto-drafted from a lead submission.</span>
                  </div>
                )}

                {/* Thread messages or single message */}
                {threadLoading ? (
                  <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:13 }}>Loading conversation...</div>
                ) : threadMessages.length > 1 ? (
                  /* Full thread view */
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {threadMessages.map((msg, idx) => (
                      <div key={msg.id} style={{
                        background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)', overflow:'hidden',
                        borderLeft: msg.isFromMe ? '3px solid var(--orange)' : '3px solid #22c55e',
                      }}>
                        {/* Message header */}
                        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
                          <Avatar name={msg.from?.name || msg.from?.email || '?'} size={32} color={msg.isFromMe ? 'var(--orange)' : undefined} />
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span className="private-value" style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{msg.from?.name || msg.from?.email}</span>
                              {msg.isFromMe && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:4, background:'rgba(37,99,235,0.08)', color:'var(--orange)', fontWeight:700 }}>You</span>}
                            </div>
                            <div className="private-value" style={{ fontSize:11, color:'var(--muted)' }}>
                              to {(msg.to||'').replace(/<.*>/,'').trim().split(',')[0]}
                            </div>
                          </div>
                          <span style={{ fontSize:11, color:'var(--muted)' }}>{fmtFullDate(msg.date)}</span>
                        </div>
                        {/* Message body */}
                        <div style={{ padding:'16px 20px', fontSize:13, lineHeight:1.8, color:'var(--text)', whiteSpace: (msg.bodyHtml || looksLikeHtml(msg.body)) ? 'normal' : 'pre-wrap', wordBreak:'break-word', overflowWrap:'break-word' }}>
                          <EmailBody msg={msg} fallbackText={msg.snippet} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Single message */
                  <>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, padding:'14px 18px', background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)' }}>
                      <Avatar name={getName(selected)} size={42} />
                      <div style={{ flex:1 }}>
                        <div className="private-value" style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{getName(selected)}</div>
                        <div className="private-value" style={{ fontSize:12, color:'var(--muted)' }}>
                          {selected._type==='gmail-sent'||selected._type==='queue' ? `To: ${getRecipient(selected)}` : getRecipient(selected)}
                        </div>
                      </div>
                      {selected._type==='queue' && (
                        <button onClick={() => handleDelete(selected.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#ff5c5c', display:'flex', padding:6 }}><Trash2 size={15} /></button>
                      )}
                    </div>
                    <div style={{ background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)', padding:16, fontSize:14, lineHeight:1.8, color:'var(--text)', wordBreak:'break-word', overflowWrap:'break-word', whiteSpace: (selected.bodyHtml || looksLikeHtml(selected.body || '')) ? 'normal' : 'pre-wrap' }}>
                      <EmailBody
                        msg={threadMessages.length === 1 ? threadMessages[0] : null}
                        fallbackText={threadMessages.length === 1 ? (threadMessages[0]?.body || selected.snippet) : (selected.body||selected.generated_body||selected.snippet)}
                      />
                    </div>
                  </>
                )}

                {selected.follow_up_date && (
                  <div style={{ marginTop:16, padding:'10px 16px', background:'rgba(37,99,235,0.06)', border:'1px solid rgba(37,99,235,0.2)', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
                    <Calendar size={14} color="var(--orange)" />
                    <span style={{ fontSize:13, color:'var(--orange)', fontWeight:500 }}>Scheduled: {new Date(selected.follow_up_date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
                  </div>
                )}

                {/* Scheduled banner + actions */}
                {selected.status==='scheduled' && selected.scheduled_for && (
                  <>
                    <div style={{ marginTop:16, padding:'10px 16px', background:'rgba(37,99,235,0.06)', border:'1px solid rgba(37,99,235,0.2)', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
                      <Clock size={14} color="var(--orange)" />
                      <span style={{ fontSize:13, color:'var(--orange)', fontWeight:500 }}>Auto-sends {new Date(selected.scheduled_for).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
                    </div>
                    <div style={{ marginTop:20, display:'flex', alignItems:'center', gap:10 }}>
                      <button onClick={() => handleSendQueue(selected.id)} style={{ padding:'9px 18px', borderRadius:8, cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#2563eb)', border:'none', color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}><Send size={13} /> Send Now</button>
                      <button onClick={() => handleUnschedule(selected.id)} style={{ padding:'9px 16px', borderRadius:8, cursor:'pointer', background:'none', border:'1px solid var(--border)', color:'var(--muted)', fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:6 }}><X size={13} /> Unschedule</button>
                    </div>
                  </>
                )}

                {/* Draft/pending actions */}
                {(selected.status==='draft'||selected.status==='pending') && (
                  <div style={{ marginTop:20, display:'flex', alignItems:'center', gap:10 }}>
                    {selected.auto_generated && selected.status==='draft' && (
                      <button onClick={() => handleApprove(selected)} style={{ padding:'9px 18px', borderRadius:8, cursor:'pointer', background:'#22c55e', border:'none', color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}><Check size={14} /> Approve</button>
                    )}
                    <button onClick={() => handleSendQueue(selected.id)} style={{ padding:'9px 18px', borderRadius:8, cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#2563eb)', border:'none', color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}><Send size={13} /> Send Now</button>
                    {selected.auto_generated && selected.status==='draft' && (
                      <button onClick={() => handleDelete(selected.id)} style={{ padding:'9px 16px', borderRadius:8, cursor:'pointer', background:'none', border:'1px solid #ff5c5c40', color:'#ff5c5c', fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:6 }}><X size={13} /> Deny</button>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* Sticky Reply bar — pinned to the bottom of the reading pane */}
            {selected._type!=='queue' && !(selected.status==='draft'||selected.status==='pending') && (
              <div style={{ flexShrink:0, borderTop:'1px solid var(--border)', background:'var(--surface)', padding:'12px 32px' }}>
                <button onClick={openReply} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, width:'100%', padding:'12px 18px', borderRadius:10, cursor:'pointer', background:'var(--btn-black)', border:'none', color:'#fff', fontSize:14, fontWeight:700 }}>
                  <Reply size={15} /> Reply
                </button>
              </div>
            )}
          </div>

        ) : (
          /* ── Email List (full width) ── */
          <>
            {selectedIds.size > 0 ? (
              <div className="email-list-header" style={{ padding:'10px 24px', background:'rgba(37,99,235,0.08)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>{selectedIds.size} selected</span>
                <div style={{ position:'relative' }}>
                  <button onClick={() => setLabelMenuOpen(o => !o)} onBlur={() => setTimeout(() => setLabelMenuOpen(false), 150)}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>
                    <Tag size={13} /> Add label <ChevronDown size={12} />
                  </button>
                  {labelMenuOpen && (
                    <div onMouseDown={e => e.preventDefault()} style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:40, background:'var(--surface)', border:'1px solid var(--border-light)', borderRadius:10, boxShadow:'var(--shadow-lg)', minWidth:180, padding:5, maxHeight:260, overflow:'auto' }}>
                      {customLabels.filter(l => !l.system).length === 0 ? (
                        <div style={{ fontSize:12, color:'var(--muted)', padding:'8px 10px' }}>No labels yet — create one in the sidebar.</div>
                      ) : customLabels.filter(l => !l.system).map(l => (
                        <button key={l.id} onClick={() => { setLabelMenuOpen(false); applyLabelToSelected(l); }}
                          style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'8px 10px', borderRadius:6, border:'none', background:'transparent', color:'var(--text)', cursor:'pointer', fontSize:12.5, textAlign:'left' }}
                          onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                          <span style={{ width:10, height:10, borderRadius:'50%', background:l.color||'var(--orange)', flexShrink:0 }} />{l.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft:'auto', background:'none', border:'none', color:'var(--muted)', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>Clear</button>
              </div>
            ) : (
              <div className="email-list-header" style={{ padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <button className="email-folders-btn" onClick={() => setFoldersOpen(true)} aria-label="Folders"
                  style={{ alignItems:'center', justifyContent:'center', width:34, height:34, borderRadius:8, flexShrink:0, background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)', cursor:'pointer' }}>
                  <Menu size={18} />
                </button>
                <span style={{ fontSize:16, fontWeight:700, color:'var(--text)', flex:1 }}>
                  {TABS.find(t=>t.key===tab)?.label||'Email'}
                </span>
                <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} {filtered.length===1?'message':'messages'}</span>
              </div>
            )}

            {/* Active label filters */}
            {labelFilter.size > 0 && (
              <div style={{ padding:'8px 24px', background:'rgba(255,155,38,0.06)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <Filter size={12} color="var(--orange)" />
                <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Filtering by</span>
                {Array.from(labelFilter).map(id => {
                  const l = customLabels.find(x => x.id === id);
                  if (!l) return null;
                  return (
                    <span key={id} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11.5, padding:'3px 5px 3px 10px', borderRadius:5, background:l.color||'var(--orange)', color:'#fff', fontWeight:600 }}>
                      {l.name}
                      <button onClick={() => toggleLabelFilter(id)} title={`Remove filter`}
                        style={{ background:'rgba(0,0,0,0.22)', border:'none', color:'#fff', width:14, height:14, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                        <X size={9} />
                      </button>
                    </span>
                  );
                })}
                <button onClick={clearLabelFilters} style={{ marginLeft:'auto', background:'none', border:'1px solid var(--border)', color:'var(--muted)', borderRadius:6, padding:'3px 10px', fontSize:11, cursor:'pointer', fontWeight:500 }}>
                  Clear all
                </button>
              </div>
            )}

            {tab==='drafts' && autoDraftCount > 0 && (
              <div className="email-draft-banner" style={{ padding:'8px 24px', background:'var(--surface-2)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:6, fontSize:12 }}>
                <Sparkles size={12} color="var(--orange)" />
                <span style={{ color:'var(--orange)', fontWeight:500 }}>{autoDraftCount} auto-drafted — review & approve</span>
              </div>
            )}

            <div style={{ flex:1, overflow:'auto', background:'var(--surface)' }}>
              {loading ? (
                <div style={{ textAlign:'center', padding:60, color:'var(--muted)', fontSize:13 }}>Loading...</div>
              ) : filtered.length===0 ? (
                <div style={{ textAlign:'center', padding:80 }}>
                  <Mail size={40} style={{ color:'var(--surface-3)', margin:'0 auto 12px' }} />
                  <div style={{ color:'var(--muted)', fontSize:14, fontWeight:600 }}>{tab==='spam'?'No spam':tab==='starred'?'No labeled emails':'No emails'}</div>
                </div>
              ) : (
                filtered.map((email, idx) => {
                  const name = getName(email);
                  const isGmail = email._type==='gmail'||email._type==='gmail-sent'||email._type==='gmail-draft';
                  const crmLabels = email.crmLabels || [];
                  const isFav = crmLabels.includes('favorite');
                  const crmContact = isGmail ? contactMap[email.from?.email] : null;
                  const isSentType = email._type==='gmail-sent'||email._type==='queue';
                  const isChecked = selectedIds.has(email.id);
                  // Label pills shown at the FRONT of the row: real Gmail labels
                  // first, then CRM labels (follow-up / important).
                  const gmailPills = customLabels.filter(l => !HIDDEN_PILL_LABELS.has(l.id) && asArray(email.labelIds).includes(l.id));
                  const crmPills = crmLabels.filter(l => l!=='spam' && l!=='favorite').map(l => LABEL_CONFIG[l]).filter(Boolean);

                  return (
                    <div key={email.id} onClick={() => selectEmail(email)}
                      className="email-list-item"
                      style={{
                        display:'flex', alignItems:'center', gap:12, padding:'12px 24px', cursor:'pointer',
                        borderBottom:'1px solid var(--border)', transition:'background 0.1s',
                        background: isChecked ? 'rgba(37,99,235,0.06)' : undefined,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = isChecked ? 'rgba(37,99,235,0.10)' : 'var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background = isChecked ? 'rgba(37,99,235,0.06)' : 'var(--surface)'}>
                      {/* Select checkbox */}
                      <input type="checkbox" checked={isChecked} onClick={e => e.stopPropagation()} onChange={() => toggleSelectId(email.id)}
                        style={{ flexShrink:0, width:15, height:15, cursor:'pointer', accentColor:'var(--orange)' }} />
                      <Avatar name={name} size={38} />
                      <div className="email-item-body">
                        <div className="email-item-name" style={{ width:200, minWidth:0, flexShrink:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span className="private-value" style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {email._type==='queue' ? name : isSentType ? `To: ${(email.to_email||email.to||'').replace(/<.*>/,'').trim().split(',')[0]}` : name}
                            </span>
                            {crmContact && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'rgba(37,99,235,0.08)', color:'var(--orange)', fontWeight:600, flexShrink:0 }}>{crmContact._source==='lead'?'Lead':'CRM'}</span>}
                            {email.isReply && <Reply size={11} color="var(--orange)" style={{flexShrink:0}} />}
                          </div>
                        </div>
                        {/* Label pills — after the sender name, solid like Gmail */}
                        {(gmailPills.length > 0 || crmPills.length > 0) && (
                          <div className="email-item-pills" style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0, maxWidth:240, overflow:'hidden' }}>
                            {gmailPills.map(l => (
                              <span key={l.id} style={{ fontSize:11, padding:'2px 9px', borderRadius:5, background:l.color||'var(--orange)', color:'#fff', fontWeight:700, whiteSpace:'nowrap' }}>{l.name}</span>
                            ))}
                            {crmPills.map(cfg => (
                              <span key={cfg.label} style={{ fontSize:11, padding:'2px 9px', borderRadius:5, background:cfg.color, color:'#fff', fontWeight:700, whiteSpace:'nowrap' }}>{cfg.label}</span>
                            ))}
                          </div>
                        )}
                        <div className="email-item-preview" style={{ flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:8 }}>
                          <span className="email-item-subject" style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:300 }}>
                            {email.subject||'(no subject)'}
                          </span>
                          <span className="email-item-snippet" style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>
                            — {getPreview(email)}
                          </span>
                        </div>
                      </div>
                      <div className="email-item-labels" style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        {isGmail && <LabelButton labelKey="favorite" active={isFav} onClick={e => { e.stopPropagation(); toggleLabel(email,'favorite'); }} size={13} />}
                        {email.auto_generated && <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(37,99,235,0.08)',color:'var(--orange)',fontWeight:600,display:'flex',alignItems:'center',gap:2}}><Sparkles size={8} /> Auto</span>}
                      </div>
                      <span className="email-item-time" style={{ fontSize:11, color:'var(--muted)', flexShrink:0, width:70, textAlign:'right' }}>
                        {timeAgo(getDate(email))}
                      </span>
                      <button className="email-trash-btn"
                        onClick={e => isGmail ? handleTrashGmail(email, e) : (e.stopPropagation(), handleDelete(email.id))}
                        style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:'var(--muted)', display:'flex', opacity:0, transition:'opacity 0.15s, color 0.15s', flexShrink:0 }}
                        onMouseEnter={e => e.currentTarget.style.color='#ff5c5c'}
                        onMouseLeave={e => e.currentTarget.style.color='var(--muted)'}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Floating Compose Popup ── */}
      {compose.isOpen && (
        <ComposePopup
          replyTo={compose.draft?.replyTo || null}
          draft={compose.draft}
          onDraftChange={compose.updateDraft}
          contacts={allContacts}
          gmailContacts={gmailContactsList}
          onSend={handleComposeSend}
          onSchedule={handleComposeSchedule}
          onSaveDraft={handleComposeDraft}
          onClose={() => setComposeOpen(false)}
          onMinimize={compose.minimize}
          sending={sending}
          labelDefs={customLabels}
          clientId={clientId}
          uploadAttachment={uploadEmailAttachment}
        />
      )}

      {/* ── AI Follow-up Suggestions Popup ── */}
      {showFollowups && followups.length > 0 && (
        <div style={{
          position:'fixed', bottom:16, left:'50%', transform:'translateX(-50%)', zIndex:7000,
          background:'var(--surface)', borderRadius:14, boxShadow:'0 8px 40px rgba(0,0,0,0.15)', border:'1px solid var(--border)',
          width:520, maxWidth:'calc(100vw - 32px)', maxHeight:'60vh', display:'flex', flexDirection:'column',
        }}>
          <div style={{ display:'flex', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
            <Zap size={16} color="var(--orange)" />
            <span style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginLeft:8, flex:1 }}>Follow-up Suggestions</span>
            <span style={{ fontSize:11, color:'var(--muted)', marginRight:10 }}>{followups.length} suggestion{followups.length!==1?'s':''}</span>
            <button onClick={() => setShowFollowups(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex' }}><X size={16} /></button>
          </div>
          <div style={{ flex:1, overflow:'auto', padding:'8px 0' }}>
            {followups.map((f, i) => (
              <div key={f.id||i} style={{ padding:'12px 18px', borderBottom: i<followups.length-1?'1px solid var(--border)':'none' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{
                    fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4, textTransform:'uppercase',
                    background: f.priority==='high'?'#ff5c5c15':f.priority==='medium'?'#f5a62315':'rgba(37,99,235,0.09)',
                    color: f.priority==='high'?'#ff5c5c':f.priority==='medium'?'#f5a623':'var(--orange)',
                  }}>{f.priority}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {f.original_subject}
                  </span>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{f.days_since_sent}d ago</span>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>To: {(f.original_to||'').replace(/<.*>/,'').trim()}</div>
                {f.suggested_body && (
                  <div style={{ fontSize:12, color:'var(--muted)', background:'var(--surface-2)', borderRadius:8, padding:'8px 12px', marginBottom:8, lineHeight:1.6, maxHeight:60, overflow:'hidden' }}>
                    {f.suggested_body}
                  </div>
                )}
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => {
                    setComposeOpen({ subject: f.suggested_subject, to_email: f.original_to, from: { email: f.original_to } });
                    setFollowups(prev => prev.filter((_,j) => j!==i));
                  }} style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#2563eb)', border:'none', color:'#fff', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                    <Edit3 size={10} /> Draft Follow-up
                  </button>
                  <button onClick={() => setFollowups(prev => prev.filter((_,j) => j!==i))}
                    style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--muted)', fontWeight:500 }}>
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding:'10px 18px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
            <button onClick={() => { setFollowups([]); setShowFollowups(false); }} style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--muted)', fontWeight:500 }}>
              Dismiss All
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
