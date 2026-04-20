import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Mail, Send, FileText, Inbox, Search, RefreshCw, Trash2,
  ChevronLeft, ChevronRight, Clock, Check, X, Edit3, Sparkles, Calendar,
  Star, Users, Ban, Flag, Reply, AlertTriangle, ChevronDown, Minimize2, Maximize2, Plus, Tag, Zap, Loader,
} from 'lucide-react';
import {
  getEmailQueue, updateQueueItem, deleteQueueItem, sendQueueItem,
  createQueueItem, getGmailInbox, getContacts, getLeads,
  addEmailLabel, removeEmailLabel, getGmailContacts, getGmailThread,
  getLabelDefs, createLabelDef, deleteLabelDef, getAIFollowups, trashGmailMessage,
} from '../api';

const TABS = [
  { key: 'inbox',   label: 'Inbox',   icon: Inbox },
  { key: 'sent',    label: 'Sent',    icon: Send },
  { key: 'drafts',  label: 'Drafts',  icon: FileText },
  { key: 'starred', label: 'Starred', icon: Star },
  { key: 'spam',    label: 'Spam',    icon: Ban },
];

const AVATAR_COLORS = ['var(--orange)','#784bd1','#22c55e','#f5a623','#ff5c5c','#00b8d4','#e91e8c','#ff6b35'];

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

function Linkify({ text }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;
  const parts = text.split(urlRegex);
  const isUrl = /^https?:\/\//;
  return parts.map((part, i) => {
    if (!isUrl.test(part)) return part;
    // YouTube embed
    const ytId = getYouTubeId(part);
    if (ytId) return (
      <div key={i} style={{ margin:'12px 0', borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', maxWidth:480 }}>
        <iframe src={`https://www.youtube.com/embed/${ytId}`} style={{ width:'100%', aspectRatio:'16/9', border:'none', display:'block' }} allowFullScreen />
      </div>
    );
    // Image
    if (isImageUrl(part)) return (
      <div key={i} style={{ margin:'12px 0' }}>
        <a href={part} target="_blank" rel="noopener noreferrer">
          <img src={part} alt="" style={{ maxWidth:'100%', maxHeight:400, borderRadius:10, border:'1px solid var(--border)', display:'block' }}
            onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML=`<a href="${part}" target="_blank" rel="noopener noreferrer" style="color:var(--orange);word-break:break-all">${part}</a>`; }} />
        </a>
      </div>
    );
    // Video
    if (isVideoUrl(part)) return (
      <div key={i} style={{ margin:'12px 0', maxWidth:480 }}>
        <video src={part} controls style={{ width:'100%', borderRadius:10, border:'1px solid var(--border)', display:'block' }} />
      </div>
    );
    // Regular link
    return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color:'var(--orange)', wordBreak:'break-all' }}>{part}</a>;
  });
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
    const resizeScript = `<script>
      function postH(){window.parent.postMessage({iframeHeight:document.body.scrollHeight},'*');}
      window.addEventListener('load',function(){postH();setTimeout(postH,500);setTimeout(postH,1500);});
      new MutationObserver(postH).observe(document.body,{childList:true,subtree:true});
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
        ref.current.style.height = Math.max(e.data.iframeHeight + 20, 100) + 'px';
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return <iframe ref={ref} srcDoc={patched} sandbox="allow-same-origin allow-scripts allow-popups" style={{ width:'100%', border:'none', minHeight:200, borderRadius:8, background:'#fff' }} />;
}

/* Helper: render body as HTML iframe or plain text with Linkify */
function EmailBody({ msg, fallbackText }) {
  const html = msg?.bodyHtml || '';
  const body = msg?.body || fallbackText || '';
  // If bodyHtml is set from API, use it
  if (html) return <HtmlEmail html={html} />;
  // If the plain body looks like HTML (detection fallback), render in iframe
  if (looksLikeHtml(body)) return <HtmlEmail html={body} />;
  // Otherwise render as plain text with linkify
  return <Linkify text={body || '(empty)'} />;
}

/* ── tiny helpers ─────────────────────────────────────────────────────────── */

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
              <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, fontWeight:600, background:c._source==='lead'?'#f5a62310':c._source==='gmail'?'#22c55e10':'rgba(255,155,38,0.08)', color:c._source==='lead'?'#f5a623':c._source==='gmail'?'#22c55e':'var(--orange)' }}>{c._source==='lead'?'Lead':c._source==='gmail'?'Gmail':'Contact'}</span>
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

function ComposePopup({ replyTo, contacts, gmailContacts, onSend, onSchedule, onSaveDraft, onClose, sending, labelDefs = [] }) {
  const [to, setTo] = useState(replyTo?.from?.email || replyTo?.to_email || '');
  const [subject, setSubject] = useState(replyTo ? `Re: ${(replyTo.subject||'').replace(/^Re:\s*/i,'')}` : '');
  const [body, setBody] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [customSchedule, setCustomSchedule] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [selectedLabels, setSelectedLabels] = useState(() => labelDefs.some(l => l.name === 'Leads') ? ['Leads'] : []);
  const bodyRef = useRef(null);
  useEffect(() => { if (bodyRef.current && !minimized) bodyRef.current.focus(); }, [minimized]);

  const handleSend = () => { if (!to || !subject) return; onSend({ to, subject, body, labels: selectedLabels }); };
  const handleScheduleSelect = (iso) => { if (!to || !subject) return; onSchedule({ to, subject, body, scheduleDate: iso, labels: selectedLabels }); };
  const handleCustomSchedule = () => { if (!to || !subject || !customSchedule) return; onSchedule({ to, subject, body, scheduleDate: new Date(customSchedule).toISOString(), labels: selectedLabels }); };

  return (
    <div className="compose-popup" style={{
      position:'fixed', bottom:0, right:80, width:480, maxWidth:'100vw', zIndex:8000,
      background:'var(--surface)', borderRadius:'12px 12px 0 0', boxShadow:'0 -4px 32px rgba(0,0,0,0.15)',
      border:'1px solid var(--border)', borderBottom:'none', display:'flex', flexDirection:'column',
      maxHeight: minimized ? 44 : '70vh', transition:'max-height 0.2s ease',
    }}>
      {/* Title bar */}
      <div onClick={() => minimized && setMinimized(false)} style={{
        display:'flex', alignItems:'center', padding:'10px 16px', background:'var(--surface-3)', borderRadius:'12px 12px 0 0',
        cursor:'pointer', flexShrink:0,
      }}>
        <span style={{ fontSize:13, fontWeight:600, color:'#fff', flex:1 }}>
          {replyTo ? 'Reply' : 'New Message'}
        </span>
        <button onClick={e => { e.stopPropagation(); setMinimized(!minimized); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:4, marginRight:4 }}>
          {minimized ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
        </button>
        <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:4 }}>
          <X size={14} />
        </button>
      </div>

      {!minimized && (
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
          {/* Labels */}
          {labelDefs.length > 0 && (
            <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)', padding:'6px 16px', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500, width:50, flexShrink:0 }}>Labels</span>
              {labelDefs.map(l => {
                const on = selectedLabels.includes(l.name);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedLabels(prev => on ? prev.filter(x => x !== l.name) : [...prev, l.name])}
                    style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.15s', background: on ? (l.color||'var(--orange)')+'22' : 'var(--surface-3)', border:`1.5px solid ${on ? (l.color||'var(--orange)') : 'var(--border)'}`, color: on ? (l.color||'var(--orange)') : 'var(--muted)' }}
                  >
                    <div style={{ width:6, height:6, borderRadius:'50%', background:l.color||'var(--orange)', flexShrink:0 }} />
                    {l.name}
                  </button>
                );
              })}
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
          {/* Actions */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderTop:'1px solid var(--border)', position:'relative', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'stretch', borderRadius:8, overflow:'hidden' }}>
              <button onClick={handleSend} disabled={sending||!to||!subject}
                style={{ padding:'7px 16px', cursor:sending?'wait':'pointer', background:'linear-gradient(135deg,var(--orange),#ee7c1a)', border:'none', color:'#fff', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:5, opacity:(sending||!to||!subject)?0.5:1, borderRight:'1px solid rgba(255,255,255,0.2)' }}>
                <Send size={12} /> {sending?'Sending...':'Send'}
              </button>
              <button onClick={() => setShowSchedule(!showSchedule)} style={{ padding:'7px 8px', cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#ee7c1a)', border:'none', color:'#fff', display:'flex', alignItems:'center' }}>
                <ChevronDown size={13} />
              </button>
            </div>
            {showSchedule && <SchedulePopup onSelect={handleScheduleSelect} onPickCustom={() => setShowCustomPicker(true)} onClose={() => setShowSchedule(false)} />}
            <button onClick={() => onSaveDraft({ to, subject, body })} style={{ padding:'7px 12px', borderRadius:8, cursor:'pointer', background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--muted)', fontSize:12, fontWeight:500 }}>Draft</button>
            <div style={{ flex:1 }} />
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:4 }}><Trash2 size={14} /></button>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */

export default function EmailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab]                       = useState('inbox');
  const [queueEmails, setQueueEmails]       = useState([]);
  const [inboxMessages, setInboxMessages]   = useState([]);
  const [sentMessages, setSentMessages]     = useState([]);
  const [draftMessages, setDraftMessages]   = useState([]);
  const [loading, setLoading]               = useState(true);
  const [selected, setSelected]             = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [threadLoading, setThreadLoading]   = useState(false);
  const [search, setSearch]                 = useState('');
  const [refreshing, setRefreshing]         = useState(false);
  const [allContacts, setAllContacts]       = useState([]);
  const [gmailContactsList, setGmailContactsList] = useState([]);

  // Custom labels
  const [customLabels, setCustomLabels]     = useState([]);
  const [showNewLabel, setShowNewLabel]     = useState(false);
  const [newLabelName, setNewLabelName]     = useState('');
  const [newLabelColor, setNewLabelColor]   = useState('var(--orange)');

  // AI Follow-ups
  const [followups, setFollowups]           = useState([]);
  const [showFollowups, setShowFollowups]   = useState(false);
  const [followupsLoading, setFollowupsLoading] = useState(false);

  // Compose popup
  const [composeOpen, setComposeOpen]       = useState(false); // true = new, or an email obj for reply
  const [sending, setSending]               = useState(false);

  // Auto-open compose if navigated with ?compose=email
  useEffect(() => {
    const composeEmail = searchParams.get('compose');
    const composeName = searchParams.get('name');
    if (composeEmail) {
      setComposeOpen({ to_email: composeEmail, subject: '' });
      setSearchParams({}, { replace: true });
    }
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
    // Load custom labels
    getLabelDefs().then(l => setCustomLabels(l||[])).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const handleRefresh = async () => { setRefreshing(true); await load(true); setRefreshing(false); };

  // Label management
  const handleCreateLabel = async () => {
    if (!newLabelName.trim()) return;
    try {
      const created = await createLabelDef({ name: newLabelName.trim(), color: newLabelColor });
      setCustomLabels(prev => [...prev, created]);
      setNewLabelName(''); setShowNewLabel(false);
    } catch (e) { alert('Failed: ' + e.message); }
  };
  const handleDeleteLabel = async (id) => {
    try { await deleteLabelDef(id); setCustomLabels(prev => prev.filter(l => l.id !== id)); } catch {}
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

  const autoDraftCount = queueEmails.filter(e => e.status==='draft'&&e.auto_generated).length;
  const inboxCount = inboxMessages.filter(m => !(m.crmLabels||[]).includes('spam')).length;

  /* ── actions ─────────────────────────────────────────────────────────── */

  // Select email and load thread
  const selectEmail = async (email) => {
    setSelected(email);
    setThreadMessages([]);
    // Load full thread for Gmail messages
    if (email.threadId && (email._type==='gmail'||email._type==='gmail-sent'||email._type==='gmail-draft')) {
      setThreadLoading(true);
      try {
        const data = await getGmailThread(email.threadId);
        setThreadMessages(data?.messages || []);
      } catch (e) { console.error('Thread load error:', e); }
      setThreadLoading(false);
    }
  };

  const handleSendQueue = async id => { try { await sendQueueItem(id); await load(); setSelected(null); } catch(e) { alert('Send failed: '+e.message); } };
  const handleDelete = async id => { try { await deleteQueueItem(id); await load(); if(selected?.id===id) setSelected(null); } catch(e) { alert('Delete failed: '+e.message); } };
  const handleTrashGmail = async (email, e) => {
    e.stopPropagation();
    if (!confirm('Move this email to trash?')) return;
    try {
      await trashGmailMessage(email.id);
      const remove = prev => prev.filter(m => m.id !== email.id);
      setInboxMessages(remove); setSentMessages(remove); setDraftMessages(remove);
      if (selected?.id === email.id) setSelected(null);
    } catch(err) { alert('Trash failed: ' + err.message); }
  };
  const handleApprove = async email => { try { await updateQueueItem(email.id, {status:'pending'}); await load(); } catch(e) { alert('Approve failed: '+e.message); } };

  const openCompose = () => { setComposeOpen(true); setSelected(null); };
  const openReply = () => { setComposeOpen(selected); };

  const handleComposeSend = async ({ to, subject, body, labels }) => {
    if(!to||!subject) return; setSending(true);
    try { const c = await createQueueItem({to_email:to,subject,body,labels:labels||[],status:'draft'}); await sendQueueItem(c.id); setComposeOpen(false); await load(); } catch(e) { alert('Send failed: '+e.message); } finally { setSending(false); }
  };
  const handleComposeSchedule = async ({ to, subject, body, scheduleDate, labels }) => {
    if(!to||!subject||!scheduleDate) return; setSending(true);
    try { await createQueueItem({to_email:to,subject,body,labels:labels||[],status:'draft',follow_up_date:scheduleDate}); setComposeOpen(false); await load(); } catch(e) { alert('Schedule failed: '+e.message); } finally { setSending(false); }
  };
  const handleComposeDraft = async ({ to, subject, body, labels }) => {
    if(!to&&!subject&&!body) return;
    try { await createQueueItem({to_email:to,subject,body,labels:labels||[],status:'draft'}); setComposeOpen(false); await load(); } catch(e) { alert('Save failed: '+e.message); }
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

      {/* ── Left Sidebar ── */}
      <div className="email-sidebar" style={{ width:200, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div className="email-sidebar-compose" style={{ padding:'16px 14px 12px' }}>
          <button onClick={openCompose} style={{ width:'100%', padding:'10px 0', borderRadius:10, cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#ee7c1a)', border:'none', color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
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
            if (t.key==='inbox') count = inboxCount;
            return (
              <button key={t.key} onClick={() => { setTab(t.key); setSelected(null); }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 18px', border:'none', cursor:'pointer', fontSize:13, fontWeight:500,
                  background:isActive?'rgba(255,155,38,0.08)':'transparent', color:isActive?'var(--orange)':'var(--muted)', borderLeft:isActive?'3px solid var(--orange)':'3px solid transparent' }}>
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
              <button onClick={handleCreateLabel} style={{ background:'var(--orange)', border:'none', borderRadius:6, color:'#fff', fontSize:10, padding:'4px 8px', cursor:'pointer', fontWeight:600 }}>Add</button>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:2, maxHeight:120, overflow:'auto' }}>
            {customLabels.map(l => (
              <div key={l.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', borderRadius:6, cursor:'pointer', fontSize:12, color:'var(--muted)' }}
                onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:l.color||'var(--orange)', flexShrink:0 }} />
                <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.name}</span>
                <button onClick={e => { e.stopPropagation(); handleDeleteLabel(l.id); }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:1 }}
                  onMouseEnter={e => e.currentTarget.style.color='#ff5c5c'} onMouseLeave={e => e.currentTarget.style.color='var(--muted)'}>
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
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
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>

        {selected ? (
          /* ── Detail View ── */
          <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
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
                    style={{ background:'none', border:'none', cursor:'pointer', padding:4, color:(selected.crmLabels||[]).includes('spam')?'#f87171':'var(--muted)', display:'flex' }}><Ban size={16} /></button>
                </div>
              )}
              <span style={{ fontSize:12, color:'var(--muted)' }}>{currentIdx+1} of {filtered.length}</span>
              <button onClick={() => currentIdx>0 && setSelected(filtered[currentIdx-1])} disabled={currentIdx<=0}
                style={{ background:'none', border:'none', cursor:currentIdx>0?'pointer':'default', color:currentIdx>0?'var(--muted)':'var(--surface-3)', display:'flex' }}><ChevronLeft size={16} /></button>
              <button onClick={() => currentIdx<filtered.length-1 && setSelected(filtered[currentIdx+1])} disabled={currentIdx>=filtered.length-1}
                style={{ background:'none', border:'none', cursor:currentIdx<filtered.length-1?'pointer':'default', color:currentIdx<filtered.length-1?'var(--muted)':'var(--surface-3)', display:'flex' }}><ChevronRight size={16} /></button>
            </div>

            {/* Content */}
            <div className="email-detail-content" style={{ flex:1, overflow:'auto', padding:24 }}>
              <div className="email-detail-inner" style={{ maxWidth:740, margin:'0 auto' }}>
                <h1 style={{ fontSize:22, fontWeight:700, color:'var(--text)', margin:'0 0 6px' }}>{selected.subject||'(no subject)'}</h1>
                <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>{fmtFullDate(getDate(selected))}</div>

                {/* CRM labels */}
                {(selected.crmLabels||[]).filter(l=>l!=='spam').length > 0 && (
                  <div style={{ display:'flex', gap:6, marginBottom:16 }}>
                    {(selected.crmLabels||[]).filter(l=>l!=='spam').map(l => { const cfg=LABEL_CONFIG[l]; return cfg ? <span key={l} style={{ fontSize:10, padding:'4px 10px', borderRadius:6, background:cfg.color+'15', color:cfg.color, fontWeight:600 }}>{cfg.label}</span> : null; })}
                  </div>
                )}

                {selected.auto_generated && (
                  <div style={{ padding:'10px 16px', background:'rgba(255,155,38,0.05)', border:'1px solid var(--border-light)', borderRadius:8, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
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
                              {msg.isFromMe && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:4, background:'rgba(255,155,38,0.08)', color:'var(--orange)', fontWeight:700 }}>You</span>}
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
                    <div style={{ background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)', padding:16, fontSize:14, lineHeight:1.8, color:'var(--text)', wordBreak:'break-word', overflowWrap:'break-word' }}>
                      <EmailBody
                        msg={threadMessages.length === 1 ? threadMessages[0] : null}
                        fallbackText={threadMessages.length === 1 ? (threadMessages[0]?.body || selected.snippet) : (selected.body||selected.generated_body||selected.snippet)}
                      />
                    </div>
                  </>
                )}

                {selected.follow_up_date && (
                  <div style={{ marginTop:16, padding:'10px 16px', background:'rgba(255,155,38,0.06)', border:'1px solid rgba(255,155,38,0.2)', borderRadius:8, display:'flex', alignItems:'center', gap:8 }}>
                    <Calendar size={14} color="var(--orange)" />
                    <span style={{ fontSize:13, color:'var(--orange)', fontWeight:500 }}>Scheduled: {new Date(selected.follow_up_date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
                  </div>
                )}

                {/* Draft/pending actions */}
                {(selected.status==='draft'||selected.status==='pending') && (
                  <div style={{ marginTop:20, display:'flex', alignItems:'center', gap:10 }}>
                    {selected.auto_generated && selected.status==='draft' && (
                      <button onClick={() => handleApprove(selected)} style={{ padding:'9px 18px', borderRadius:8, cursor:'pointer', background:'#22c55e', border:'none', color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}><Check size={14} /> Approve</button>
                    )}
                    <button onClick={() => handleSendQueue(selected.id)} style={{ padding:'9px 18px', borderRadius:8, cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#ee7c1a)', border:'none', color:'#fff', fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}><Send size={13} /> Send Now</button>
                    {selected.auto_generated && selected.status==='draft' && (
                      <button onClick={() => handleDelete(selected.id)} style={{ padding:'9px 16px', borderRadius:8, cursor:'pointer', background:'none', border:'1px solid #ff5c5c40', color:'#ff5c5c', fontSize:13, fontWeight:500, display:'flex', alignItems:'center', gap:6 }}><X size={13} /> Deny</button>
                    )}
                  </div>
                )}

                {/* Reply button */}
                {selected._type!=='queue' && !(selected.status==='draft'||selected.status==='pending') && (
                  <button onClick={openReply} style={{ marginTop:20, display:'flex', alignItems:'center', gap:8, width:'100%', padding:'12px 18px', borderRadius:10, cursor:'pointer', background:'var(--surface)', border:'1px solid var(--border)', color:'var(--muted)', fontSize:13, fontWeight:500, transition:'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor='var(--orange)'; e.currentTarget.style.color='var(--orange)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)'; }}>
                    <Reply size={14} /> Click here to reply...
                  </button>
                )}
              </div>
            </div>
          </div>

        ) : (
          /* ── Email List (full width) ── */
          <>
            <div className="email-list-header" style={{ padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--text)', flex:1 }}>
                {TABS.find(t=>t.key===tab)?.label||'Email'}
              </span>
              <span style={{ fontSize:12, color:'var(--muted)' }}>{filtered.length} {filtered.length===1?'message':'messages'}</span>
            </div>

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

                  return (
                    <div key={email.id} onClick={() => selectEmail(email)}
                      className="email-list-item"
                      style={{
                        display:'flex', alignItems:'center', gap:14, padding:'12px 24px', cursor:'pointer',
                        borderBottom:'1px solid var(--border)', transition:'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
                      onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}>
                      <Avatar name={name} size={38} />
                      <div className="email-item-name" style={{ width:200, minWidth:0, flexShrink:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <span className="private-value" style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {isSentType ? `To: ${(email.to_email||email.to||'').replace(/<.*>/,'').trim().split(',')[0]}` : name}
                          </span>
                          {crmContact && <span style={{ fontSize:9, padding:'1px 5px', borderRadius:3, background:'rgba(255,155,38,0.08)', color:'var(--orange)', fontWeight:600, flexShrink:0 }}>{crmContact._source==='lead'?'Lead':'CRM'}</span>}
                          {email.isReply && <Reply size={11} color="var(--orange)" style={{flexShrink:0}} />}
                        </div>
                      </div>
                      <div className="email-item-preview" style={{ flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:8 }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:300 }}>
                          {email.subject||'(no subject)'}
                        </span>
                        <span className="email-item-snippet" style={{ fontSize:12, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>
                          — {getPreview(email)}
                        </span>
                      </div>
                      <div className="email-item-labels" style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                        {isGmail && <LabelButton labelKey="favorite" active={isFav} onClick={e => { e.stopPropagation(); toggleLabel(email,'favorite'); }} size={13} />}
                        {crmLabels.filter(l=>l!=='spam'&&l!=='favorite').map(l => { const cfg=LABEL_CONFIG[l]; return cfg ? <span key={l} style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:cfg.color+'15',color:cfg.color,fontWeight:600}}>{cfg.label}</span> : null; })}
                        {email.auto_generated && <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:'rgba(255,155,38,0.08)',color:'var(--orange)',fontWeight:600,display:'flex',alignItems:'center',gap:2}}><Sparkles size={8} /> Auto</span>}
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
      {composeOpen && (
        <ComposePopup
          replyTo={typeof composeOpen==='object' ? composeOpen : null}
          contacts={allContacts}
          gmailContacts={gmailContactsList}
          onSend={handleComposeSend}
          onSchedule={handleComposeSchedule}
          onSaveDraft={handleComposeDraft}
          onClose={() => setComposeOpen(false)}
          sending={sending}
          labelDefs={customLabels}
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
                    background: f.priority==='high'?'#ff5c5c15':f.priority==='medium'?'#f5a62315':'rgba(255,155,38,0.09)',
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
                  }} style={{ fontSize:11, padding:'5px 12px', borderRadius:6, cursor:'pointer', background:'linear-gradient(135deg,var(--orange),#ee7c1a)', border:'none', color:'#fff', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
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
