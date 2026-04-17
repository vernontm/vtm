import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Trash2, UserPlus, Mail, Phone, Upload, X, Check,
  ThumbsUp, ThumbsDown, Send, Clock, Download, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, ChevronDown, MessageSquare, Mic, MicOff, Play, Pause, Square,
} from 'lucide-react';
import { useRecorder } from '../context/RecorderContext';
import { supabase } from '../lib/supabase';
import { getLeads, createLead, updateLead, deleteLead, convertLead, getCommLog, getLeadRecordings, getLeadRecordingCounts, getRecordingStats, createCommLog } from '../api';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import SelectionBar from '../components/SelectionBar';
import BulkImport from '../components/BulkImport';
import CopyCell from '../components/CopyCell';

// ─── Lead Statuses ────────────────────────────────────────────────────────────
const LEAD_STATUSES = ['New', 'Interested', 'Not Interested', 'Follow Up', 'Call Scheduled', 'Called', 'Won'];

const STATUS_STYLES = {
  'New':            { bg: '#E0F2FE', fg: '#0369A1' }, // sky blue
  'Interested':     { bg: '#DCFCE7', fg: '#15803D' }, // green
  'Not Interested': { bg: '#FEE2E2', fg: '#B91C1C' }, // red
  'Follow Up':      { bg: '#FEF3C7', fg: '#B45309' }, // amber
  'Call Scheduled': { bg: '#EDE9FE', fg: '#6D28D9' }, // violet
  'Called':         { bg: '#CCFBF1', fg: '#0F766E' }, // teal
  'Won':            { bg: '#D1FAE5', fg: '#047857' }, // emerald
};

const FILTER_TABS = ['All Leads', ...LEAD_STATUSES];

const EMPTY = {
  name: '', status: 'New', company: '', email: '', phone: '',
  tiktok_username: '', ig_username: '', lead_source: '', notes: '',
};

// ─── Platform chip (unchanged) ────────────────────────────────────────────────
const LEAD_SOURCES = [
  '', 'Website', 'Referral', 'Cold Outreach',
  'Email', 'TikTok', 'Instagram', 'YouTube', 'Threads', 'Facebook', 'X / Twitter', 'LinkedIn',
  'Podcast', 'Event', 'Other',
];

const PLATFORM_STYLES = {
  'Email':        { bg: '#4a6cf720', fg: '#4a6cf7', icon: '✉️' },
  'TikTok':       { bg: '#FF004F20', fg: '#E60048', icon: '🎵' },
  'Instagram':    { bg: '#E1306C20', fg: '#E1306C', icon: '📸' },
  'YouTube':      { bg: '#FF000020', fg: '#D00000', icon: '▶️' },
  'Threads':      { bg: '#1a1a2e20', fg: '#1a1a2e', icon: '@' },
  'Facebook':     { bg: '#1877F220', fg: '#1877F2', icon: 'f' },
  'X / Twitter':  { bg: '#71767B20', fg: '#4B5563', icon: '𝕏' },
  'LinkedIn':     { bg: '#0A66C220', fg: '#0A66C2', icon: 'in' },
  'Website':      { bg: '#10B98120', fg: '#059669', icon: '🌐' },
  'Referral':     { bg: '#F59E0B20', fg: '#B45309', icon: '🤝' },
  'Cold Outreach':{ bg: '#8B5CF620', fg: '#6D28D9', icon: '❄️' },
  'Podcast':      { bg: '#EC489920', fg: '#BE185D', icon: '🎙️' },
  'Event':        { bg: '#06B6D420', fg: '#0E7490', icon: '🎪' },
  'Other':        { bg: '#8e8ea020', fg: '#8e8ea0', icon: '•' },
};

function PlatformChip({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const style = PLATFORM_STYLES[value] || PLATFORM_STYLES['Other'];
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: value ? '3px 9px' : '3px 8px',
          borderRadius: 10, fontSize: 11, fontWeight: 600,
          background: value ? style.bg : '#f0f2f8',
          color: value ? style.fg : '#8e8ea0',
          border: value ? 'none' : '1px dashed #c0c0c8',
          cursor: 'pointer', lineHeight: 1.4, maxWidth: 120,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {value ? <><span style={{ fontSize: 10 }}>{style.icon}</span> {value}</> : '+ Platform'}
      </button>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 51,
              background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 160,
              display: 'grid', gap: 2, maxHeight: 320, overflowY: 'auto',
            }}
          >
            {LEAD_SOURCES.filter(s => s).map(s => {
              const st = PLATFORM_STYLES[s] || PLATFORM_STYLES['Other'];
              return (
                <button
                  key={s}
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 5, fontSize: 12, fontWeight: 500,
                    background: value === s ? st.bg : 'transparent',
                    color: value === s ? st.fg : '#1a1a2e',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (value !== s) e.currentTarget.style.background = '#f5f7fa'; }}
                  onMouseLeave={e => { if (value !== s) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 11 }}>{st.icon}</span> {s}
                </button>
              );
            })}
            {value && (
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  borderRadius: 5, fontSize: 12, color: '#ff5c5c', background: 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid #e5e7ef', marginTop: 2,
                }}
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const style = STATUS_STYLES[value] || STATUS_STYLES['New'];
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: style.bg, color: style.fg,
          border: 'none', cursor: 'pointer',
        }}
      >
        {value || 'New'}
      </button>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 51,
              background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 170,
              display: 'grid', gap: 2,
            }}
          >
            {LEAD_STATUSES.map(s => {
              const st = STATUS_STYLES[s];
              return (
                <button
                  key={s}
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderRadius: 5, fontSize: 12, fontWeight: 500,
                    background: value === s ? st.bg : 'transparent',
                    color: value === s ? st.fg : '#1a1a2e',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (value !== s) e.currentTarget.style.background = '#f5f7fa'; }}
                  onMouseLeave={e => { if (value !== s) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: st.fg, marginRight: 8 }} />{s}</span>
                  {value === s && <Check size={12} />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#4a6cf7', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6',
  '#06B6D4', '#EF4444', '#059669', '#D97706', '#6366F1',
];
function avatarColor(name) {
  const s = name || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name[0].toUpperCase();
}
function Avatar({ name }) {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: '50%',
      background: avatarColor(name), color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Goal summary / follow-up helpers ─────────────────────────────────────────
function summarizeGoal(lead) {
  const parts = [lead.problem, lead.current_situation, lead.financial_goal, lead.notes].filter(Boolean);
  if (parts.length === 0) return '';
  const combined = parts.join(' ').trim();
  if (combined.length <= 80) return combined;
  return combined.slice(0, 80).replace(/\s+\S*$/, '') + '…';
}
function formatFollowUp(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const diff = new Date() - d;
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
const LONG_FIELDS = new Set(['problem', 'current_situation', 'financial_goal', 'notes']);

const DETAIL_SECTIONS = [
  {
    title: 'Contact Info',
    fields: [
      { key: 'name',             label: 'Name' },
      { key: 'company',          label: 'Company' },
      { key: 'email',            label: 'Email' },
      { key: 'phone',            label: 'Phone' },
      { key: 'tiktok_username',  label: 'TikTok' },
      { key: 'ig_username',      label: 'Instagram' },
    ],
  },
  {
    title: 'Pipeline',
    fields: [
      { key: 'problem',           label: 'Problem' },
      { key: 'current_situation',  label: 'Current State' },
      { key: 'financial_goal',     label: 'Goal' },
      { key: 'budget',             label: 'Budget Tier' },
      { key: 'best_time',          label: 'Best Time' },
    ],
  },
  {
    title: 'Notes',
    fields: [
      { key: 'notes',        label: 'Notes' },
      { key: 'lead_source',  label: 'Source' },
    ],
  },
];

const inputStyle = {
  width: '100%', padding: '6px 9px', borderRadius: 5, fontSize: 12,
  color: '#1a1a2e', background: '#ffffff', border: '1px solid #e5e7ef',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};

function EditableField({ fieldKey, value, onChange }) {
  if (LONG_FIELDS.has(fieldKey)) {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
      />
    );
  }
  return <input value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />;
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: '1px solid #f0f2f8' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 0', gap: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {title}
        </span>
        <ChevronDown size={13} style={{ color: '#8e8ea0', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  );
}

// ─── Activity Timeline ────────────────────────────────────────────────────────
const ACTIVITY_ICONS = {
  call:      { icon: '📞', color: '#C00000', bg: '#FEE2E2' },
  email:     { icon: '✉️',  color: '#4a6cf7', bg: '#EEF4FF' },
  recording: { icon: '🎙️', color: '#7C3AED', bg: '#EDE9FE' },
  meeting:   { icon: '📅', color: '#0369A1', bg: '#E0F2FE' },
  note:      { icon: '📝', color: '#B45309', bg: '#FEF3C7' },
  status:    { icon: '🔄', color: '#0369A1', bg: '#E0F2FE' },
  created:   { icon: '✅', color: '#15803D', bg: '#DCFCE7' },
  default:   { icon: '💬', color: '#6B7280', bg: '#F3F4F6' },
};

function fmtDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function ActivityTimeline({ lead, convos, recordings }) {
  // Build unified event list
  const events = useMemo(() => {
    const list = [];

    // Lead created
    if (lead.created_at) {
      list.push({
        id: 'created',
        type: 'created',
        date: lead.created_at,
        title: 'Lead created',
        body: null,
      });
    }

    // Comm log entries
    (convos || []).forEach(c => {
      const type = c.channel === 'call' ? 'call'
        : c.channel === 'email' ? 'email'
        : c.channel === 'meeting' ? 'meeting'
        : 'note';
      // For meetings, body is stored as JSON with __meetingMeta flag
      let metadata = null;
      let displayBody = c.body;
      if (type === 'meeting' && c.body) {
        try {
          const parsed = JSON.parse(c.body);
          if (parsed?.__meetingMeta) { metadata = parsed; displayBody = null; }
        } catch {}
      }
      list.push({
        id: `convo-${c.id}`,
        type,
        date: c.created_at,
        title: c.subject || (type === 'call' ? 'Phone call' : type === 'meeting' ? 'Meeting scheduled' : type === 'email' ? 'Email sent' : 'Note'),
        body: displayBody,
        metadata,
      });
    });

    // Recordings
    (recordings || []).forEach(r => {
      list.push({
        id: `rec-${r.id}`,
        type: 'recording',
        date: r.created_at,
        title: `Call recorded${r.duration_seconds ? ` · ${Math.floor(r.duration_seconds/60)}:${String(r.duration_seconds%60).padStart(2,'0')}` : ''}`,
        body: null,
        interestLevel: r.summary?.interest_level || null,
        recording: r,
      });
    });

    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [lead, convos, recordings]);

  const INTEREST_STYLES = {
    hot:            { bg: '#FEE2E2', fg: '#B91C1C', label: '🔥 Hot' },
    warm:           { bg: '#FEF3C7', fg: '#B45309', label: '☀️ Warm' },
    cold:           { bg: '#E0F2FE', fg: '#0369A1', label: '❄️ Cold' },
    not_interested: { bg: '#F3F4F6', fg: '#6B7280', label: '👎 Not interested' },
  };

  return (
    <CollapsibleSection title="Activity" defaultOpen={true}>
      {events.length === 0 ? (
        <div style={{ fontSize: 12, color: '#c0c0c0', fontStyle: 'italic' }}>No activity yet.</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 20 }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: '#e5e7ef', borderRadius: 1 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((ev, idx) => {
              const style = ACTIVITY_ICONS[ev.type] || ACTIVITY_ICONS.default;
              const isLast = idx === events.length - 1;
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 16, position: 'relative' }}>
                  {/* Dot */}
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    background: style.bg, border: `2px solid ${style.color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, marginTop: 2, position: 'relative', zIndex: 1,
                  }}>
                    <span>{style.icon}</span>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e' }}>{ev.title}</span>
                      {ev.interestLevel && INTEREST_STYLES[ev.interestLevel] && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                          background: INTEREST_STYLES[ev.interestLevel].bg,
                          color: INTEREST_STYLES[ev.interestLevel].fg, whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {INTEREST_STYLES[ev.interestLevel].label}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: '#8e8ea0', marginBottom: ev.body ? 4 : 0 }}>
                      {fmtDateTime(ev.date)}
                    </div>
                    {ev.recording ? (
                      <div style={{ marginTop: 4 }}>
                        {/* Summary preview — always visible */}
                        {(() => {
                          const s = typeof ev.recording.summary === 'string'
                            ? (() => { try { return JSON.parse(ev.recording.summary); } catch { return null; } })()
                            : ev.recording.summary;
                          if (!s?.summary) return null;
                          return (
                            <p style={{ fontSize: 11, color: '#4B5563', lineHeight: 1.5, margin: '0 0 8px' }}>
                              {s.summary}
                            </p>
                          );
                        })()}
                        {/* Full player + detail card */}
                        <RecordingCard recording={ev.recording} />
                      </div>
                    ) : ev.type === 'meeting' ? (
                      <div style={{ marginTop: 4, padding: '10px 12px', background: '#EFF6FF', borderRadius: 8, border: '1px solid #BFDBFE' }}>
                        {/* Meeting details */}
                        {ev.metadata?.start_time && (
                          <div style={{ fontSize: 11, color: '#1E40AF', marginBottom: 4, fontWeight: 600 }}>
                            📅 {new Date(ev.metadata.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            {ev.metadata.duration_minutes ? ` · ${ev.metadata.duration_minutes}min` : ''}
                          </div>
                        )}
                        {ev.metadata?.attendees?.length > 0 && (
                          <div style={{ fontSize: 11, color: '#374151', marginBottom: ev.metadata?.meet_link ? 6 : 0 }}>
                            <span style={{ color: '#8e8ea0' }}>Attendees: </span>
                            {ev.metadata.attendees.join(', ')}
                          </div>
                        )}
                        {ev.metadata?.meet_link && (
                          <a
                            href={ev.metadata.meet_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: '#4a6cf7', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, textDecoration: 'none' }}
                          >
                            🎥 Join Google Meet ↗
                          </a>
                        )}
                        {ev.body && !ev.metadata?.meet_link && (
                          <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>
                            {ev.body.length > 200 ? ev.body.slice(0, 200) + '…' : ev.body}
                          </div>
                        )}
                      </div>
                    ) : ev.body ? (
                      <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.5, marginTop: 2 }}>
                        {ev.body.length > 160 ? ev.body.slice(0, 160) + '…' : ev.body}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}

// ─── Recording audio player card ──────────────────────────────────────────────
function RecordingCard({ recording: rawR }) {
  // Supabase jsonb can occasionally arrive as a string — parse defensively
  const r = useMemo(() => {
    if (!rawR) return rawR;
    const summary = typeof rawR.summary === 'string' ? (() => { try { return JSON.parse(rawR.summary); } catch { return null; } })() : rawR.summary;
    return { ...rawR, summary };
  }, [rawR]);
  const audioRef = useRef(null);
  const [url, setUrl]             = useState(null);
  const [loading, setLoading]     = useState(false);
  const [playing, setPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]   = useState(r.duration_seconds || 0);
  const [summary, setSummary]     = useState(r.summary || null);
  const [summarizing, setSummarizing] = useState(false);

  const handleSummarize = async () => {
    setSummarizing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/crm/recordings?action=summarize&id=${r.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ lead_name: r.lead_name }),
      });
      const data = await res.json();
      if (data.summary) setSummary(data.summary);
      else if (!res.ok) throw new Error(data.error || 'Failed');
    } catch (e) {
      alert(`AI summary failed: ${e.message}`);
    } finally {
      setSummarizing(false);
    }
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  const loadAndPlay = async () => {
    if (!url) {
      setLoading(true);
      try {
        const { data, error } = await supabase.storage
          .from('lead-recordings')
          .createSignedUrl(r.storage_path, 3600);
        if (error) throw error;
        setUrl(data.signedUrl);
      } catch (e) {
        alert(`Could not load audio: ${e.message}`);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    // Play after url is set — handled via useEffect below
    setPlaying(true);
  };

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !url) return;
    if (playing) {
      el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [playing, url]);

  const handleToggle = () => {
    if (!url) { loadAndPlay(); return; }
    setPlaying(p => !p);
  };

  const handleStop = () => {
    const el = audioRef.current;
    if (el) { el.pause(); el.currentTime = 0; }
    setPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
    setCurrentTime(pct * duration);
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div style={{ padding: '10px 12px', background: '#f5f7fa', borderRadius: 8, border: '1px solid #e5e7ef' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#C00000', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Mic size={10} /> Call
          </span>
          {r.duration_seconds > 0 && <span style={{ fontSize: 10, color: '#8e8ea0' }}>{fmt(r.duration_seconds)}</span>}
          <span style={{ fontSize: 10, color: '#8e8ea0' }}>
            {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {r.audio_cleaned && (
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: '#EDE9FE', color: '#6D28D9' }}>
              ✨ Cleaned
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {r.transcript_status === 'done' && !summary && (
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              style={{
                fontSize: 10, padding: '3px 9px', borderRadius: 8, fontWeight: 700, border: 'none',
                background: summarizing ? '#e5e7ef' : '#4a6cf7', color: summarizing ? '#8e8ea0' : '#fff',
                cursor: summarizing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {summarizing ? '…Analyzing' : '✨ Analyze'}
            </button>
          )}
          {summary && (
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              title="Re-analyze with AI"
              style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 8, fontWeight: 700, border: '1px solid #e5e7ef',
                background: summarizing ? '#e5e7ef' : '#f5f7fa', color: summarizing ? '#8e8ea0' : '#8e8ea0',
                cursor: summarizing ? 'wait' : 'pointer',
              }}
            >
              {summarizing ? '…' : '↺'}
            </button>
          )}
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 8, fontWeight: 700, textTransform: 'uppercase',
            background: r.transcript_status === 'done' ? '#DCFCE7' : r.transcript_status === 'error' ? '#FEE2E2' : '#FEF3C7',
            color: r.transcript_status === 'done' ? '#15803D' : r.transcript_status === 'error' ? '#B91C1C' : '#B45309',
          }}>
            {r.transcript_status === 'done' ? 'Transcribed' : r.transcript_status === 'error' ? 'Error' : 'Processing…'}
          </span>
        </div>
      </div>

      {/* Player */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={handleToggle}
          disabled={loading}
          style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none', cursor: loading ? 'wait' : 'pointer',
            background: '#4a6cf7', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {loading ? <span style={{ fontSize: 8 }}>…</span> : playing ? <Pause size={12} /> : <Play size={12} />}
        </button>

        {/* Seek bar */}
        <div
          onClick={handleSeek}
          style={{ flex: 1, height: 4, background: '#e5e7ef', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
        >
          <div style={{ width: `${progress * 100}%`, height: '100%', background: '#4a6cf7', borderRadius: 2, transition: 'width 0.1s' }} />
        </div>

        <span style={{ fontSize: 10, color: '#8e8ea0', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
          {fmt(currentTime)}{duration > 0 ? ` / ${fmt(duration)}` : ''}
        </span>

        <button
          onClick={handleStop}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: 2, display: 'flex', alignItems: 'center' }}
          title="Stop"
        >
          <Square size={10} />
        </button>
      </div>

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={url || undefined}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || r.duration_seconds || 0)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        style={{ display: 'none' }}
      />

      {/* AI Summary */}
      {summary && (
        <div style={{ marginTop: 10, borderTop: '1px solid #e5e7ef', paddingTop: 10 }}>
          {/* Interest + sentiment row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {summary.interest_level && (() => {
              const iMap = {
                hot:           { bg: '#FEE2E2', fg: '#B91C1C', label: '🔥 Hot' },
                warm:          { bg: '#FEF3C7', fg: '#B45309', label: '☀️ Warm' },
                cold:          { bg: '#E0F2FE', fg: '#0369A1', label: '❄️ Cold' },
                not_interested:{ bg: '#F3F4F6', fg: '#6B7280', label: '👎 Not Interested' },
              };
              const s = iMap[summary.interest_level] || iMap.warm;
              return (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 8, background: s.bg, color: s.fg }}>
                  {s.label}
                </span>
              );
            })()}
            {summary.sentiment && (() => {
              const sMap = {
                positive: { bg: '#DCFCE7', fg: '#15803D', label: '😊 Positive' },
                neutral:  { bg: '#F3F4F6', fg: '#6B7280', label: '😐 Neutral' },
                negative: { bg: '#FEE2E2', fg: '#B91C1C', label: '😟 Negative' },
              };
              const s = sMap[summary.sentiment] || sMap.neutral;
              return (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 8, background: s.bg, color: s.fg }}>
                  {s.label}
                </span>
              );
            })()}
          </div>

          {/* Summary text */}
          {summary.summary && (
            <p style={{ fontSize: 12, color: '#1a1a2e', margin: '0 0 8px', lineHeight: 1.6, fontWeight: 500 }}>
              {summary.summary}
            </p>
          )}

          {/* Interest reason */}
          {summary.interest_reason && (
            <p style={{ fontSize: 11, color: '#8e8ea0', margin: '0 0 8px', lineHeight: 1.5, fontStyle: 'italic' }}>
              {summary.interest_reason}
            </p>
          )}

          {/* Pain points */}
          {summary.pain_points?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Pain Points</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {summary.pain_points.map((p, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#FEF3C7', color: '#B45309' }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Next steps */}
          {summary.next_steps?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Next Steps</div>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {summary.next_steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 11, color: '#1a1a2e', lineHeight: 1.5 }}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Topics */}
          {summary.topics?.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Topics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {summary.topics.map((t, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#EEF4FF', color: '#4a6cf7' }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      {r.transcript && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, fontWeight: 600, color: '#8e8ea0', cursor: 'pointer', userSelect: 'none', borderTop: '1px solid #e5e7ef', paddingTop: 8 }}>
            Full Transcript
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {r.transcript.split('\n').filter(l => l.trim()).map((line, i) => {
              const match = line.match(/^(Speaker \d+):\s*(.*)$/);
              if (match) {
                const speakerNum = parseInt(match[1].replace('Speaker ', ''), 10);
                const colors = ['#4a6cf7', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];
                const color = colors[(speakerNum - 1) % colors.length];
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color, background: `${color}15`,
                      padding: '2px 7px', borderRadius: 6, flexShrink: 0, marginTop: 1, whiteSpace: 'nowrap',
                    }}>
                      {match[1]}
                    </span>
                    <span style={{ fontSize: 12, color: '#1a1a2e', lineHeight: 1.6 }}>{match[2]}</span>
                  </div>
                );
              }
              return <p key={i} style={{ fontSize: 12, color: '#1a1a2e', margin: 0, lineHeight: 1.6 }}>{line}</p>;
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function LeadDetailPanel({ lead, onClose, onFieldSave, onSaveAll, statuses, onEmail, onSchedule, lastFollowUp, convos, recordings }) {
  const [draft, setDraft]   = useState({ ...lead });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  useEffect(() => { setDraft(d => ({ ...d, ...lead })); }, [lead]);

  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }));

  const editableKeys = DETAIL_SECTIONS.flatMap(s => s.fields.map(f => f.key));
  const isDirty = editableKeys.some(k => draft[k] !== lead[k]);

  async function handleSaveAll() {
    setSaving(true);
    try {
      const updates = {};
      editableKeys.forEach(k => { if (draft[k] !== lead[k]) updates[k] = draft[k]; });
      if (Object.keys(updates).length > 0) await onSaveAll(lead.id, updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally { setSaving(false); }
  }

  const handleStatus = (s) => { set('status', s); onFieldSave(lead.id, 'status', s); };

  const handleCallToggle = async () => {
    const next = !draft.call_completed;
    set('call_completed', next);
    await onFieldSave(lead.id, 'call_completed', next);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'relative', width: 560, background: '#ffffff',
        borderLeft: '1px solid #e5e7ef', overflowY: 'auto',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #e5e7ef', position: 'sticky', top: 0, background: '#ffffff', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Avatar name={draft.name} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }} className="private-value">
                    {draft.name || 'Unnamed Lead'}
                  </div>
                  {draft.company && (
                    <div style={{ fontSize: 11, color: '#8e8ea0' }} className="private-value">{draft.company}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusPill value={draft.status} onChange={handleStatus} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {lead.email && (
                  <button
                    onClick={() => onEmail(lead)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, border: 'none',
                      background: '#4a6cf7', color: '#fff',
                    }}
                  >
                    <Send size={12} /> Email
                  </button>
                )}
                <button
                  onClick={() => onSchedule(lead)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, border: '1px solid #e5e7ef',
                    background: '#f0f2f8', color: '#1a1a2e',
                  }}
                >
                  <CalendarIcon size={12} /> Schedule Meeting
                </button>
                {lastFollowUp && (
                  <span style={{ fontSize: 11, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> Last: {formatFollowUp(lastFollowUp)}
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: 4, flexShrink: 0 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {DETAIL_SECTIONS.map(section => (
            <CollapsibleSection
              key={section.title}
              title={section.title}
              defaultOpen={section.title !== 'Pipeline' && section.title !== 'Notes'}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.fields.map(({ key, label }) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, color: '#8e8ea0', paddingTop: 8 }}>{label}</span>
                    <EditableField fieldKey={key} value={draft[key]} onChange={val => set(key, val)} />
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          ))}

          {/* Activity Timeline */}
          <ActivityTimeline lead={lead} convos={convos} recordings={recordings} />
        </div>

        <div style={{
          position: 'sticky', bottom: 0, padding: '12px 24px',
          background: '#ffffff', borderTop: '1px solid #e5e7ef',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button
            onClick={handleSaveAll}
            disabled={saving || !isDirty}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 6, cursor: isDirty ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700, border: 'none',
              background: isDirty ? '#4a6cf7' : '#e5e7ef',
              color: isDirty ? '#fff' : '#8e8ea0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? 'Saving…' : saved ? <><Check size={14} /> Saved!</> : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: 'none', border: '1px solid #e5e7ef', color: '#8e8ea0' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CSV export ───────────────────────────────────────────────────────────────
function exportCSV(leads) {
  const headers = ['Name', 'Company', 'Phone', 'Email', 'Lead Source', 'Status', 'TikTok', 'Instagram', 'Budget', 'Notes', 'Created'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = leads.map(l => [
    l.name, l.company, l.phone, l.email, l.lead_source, l.status,
    l.tiktok_username, l.ig_username, l.budget, l.notes,
    l.created_at ? new Date(l.created_at).toISOString().slice(0, 10) : '',
  ].map(esc).join(','));
  const csv = [headers.map(esc).join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Leads() {
  const { startRecording, stopRecording, isRecordingLead, status: recStatus } = useRecorder();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [allCommLog, setAllCommLog] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [activeTab, setActiveTab] = useState('All Leads');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [detailLead, setDetailLead] = useState(null);
  const [sort, setSort] = useState('newest');
  const [hoveredId, setHoveredId] = useState(null);
  const [lastFollowUps, setLastFollowUps] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = async () => {
    try {
      const leadsData = await getLeads();
      setLeads(leadsData.filter(l => !l.archived));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    getCommLog().then(logs => {
      setAllCommLog(logs || []);
      const map = {};
      (logs || []).forEach(log => {
        if (log.lead_id && !map[log.lead_id]) map[log.lead_id] = log.created_at;
      });
      setLastFollowUps(map);
    }).catch(() => {});
  }, [leads]);

  // Counts per tab
  const statusCounts = useMemo(() => {
    const c = { 'All Leads': 0 };
    LEAD_STATUSES.forEach(s => { c[s] = 0; });
    leads.forEach(l => {
      c['All Leads']++;
      if (c[l.status] !== undefined) c[l.status]++;
    });
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    let list = leads;
    if (activeTab !== 'All Leads') list = list.filter(l => l.status === activeTab);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.name?.toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.lead_source || '').toLowerCase().includes(q)
      );
    }
    const sortFn =
      sort === 'newest'  ? (a, b) => (b.created_at || '').localeCompare(a.created_at || '') :
      sort === 'oldest'  ? (a, b) => (a.created_at || '').localeCompare(b.created_at || '') :
      sort === 'name_az' ? (a, b) => (a.name || '').localeCompare(b.name || '') :
      sort === 'name_za' ? (a, b) => (b.name || '').localeCompare(a.name || '') : null;
    return sortFn ? [...list].sort(sortFn) : list;
  }, [leads, activeTab, search, sort]);

  useEffect(() => { setPage(1); }, [activeTab, search, sort, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleAllOnPage = () => {
    const allSelected = paged.every(l => selectedIds.has(l.id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      paged.forEach(l => allSelected ? next.delete(l.id) : next.add(l.id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const selectedItems = leads.filter(l => selectedIds.has(l.id));

  const handleFieldSave = async (id, field, value) => {
    try {
      await updateLead(id, { [field]: value });
      setLeads(ls => ls.map(l => l.id === id ? { ...l, [field]: value } : l));
      if (detailLead?.id === id) setDetailLead(d => ({ ...d, [field]: value }));
    } catch (e) { console.error(e); }
  };

  const handleSaveAllFields = async (id, updates) => {
    try {
      await updateLead(id, updates);
      setLeads(ls => ls.map(l => l.id === id ? { ...l, ...updates } : l));
      if (detailLead?.id === id) setDetailLead(d => ({ ...d, ...updates }));
    } catch (e) { console.error(e); }
  };

  const openAdd    = () => { setForm(EMPTY); setModal('add'); };
  const openDelete = (l) => { setSelected(l); setModal('delete'); };
  const openConvert = (l) => { setSelected(l); setModal('convert'); };

  const handleEmail = (lead) => {
    if (lead.email) {
      navigate(`/email?compose=${encodeURIComponent(lead.email)}&name=${encodeURIComponent(lead.name || '')}`);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim() && !form.company?.trim()) return;
    try { await createLead(form); await load(); setModal(null); } catch (e) { alert(e.message); }
  };
  const handleDelete = async () => {
    try { await deleteLead(selected.id); await load(); setModal(null); } catch (e) { alert(e.message); }
  };
  const handleConvert = async () => {
    try { await convertLead(selected.id); await load(); setModal(null); } catch (e) { alert(e.message); }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} lead(s)? This cannot be undone.`)) return;
    try { await Promise.all([...selectedIds].map(id => deleteLead(id))); setLeads(ls => ls.filter(l => !selectedIds.has(l.id))); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkArchive = async () => {
    try { await Promise.all([...selectedIds].map(id => updateLead(id, { archived: true }))); setLeads(ls => ls.filter(l => !selectedIds.has(l.id))); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkDuplicate = async () => {
    try { const items = leads.filter(l => selectedIds.has(l.id)); await Promise.all(items.map(({ id, created_at, updated_at, ...rest }) => createLead({ ...rest, name: `${rest.name} (copy)` }))); await load(); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkConvert = async () => {
    try { await Promise.all([...selectedIds].map(id => convertLead(id))); await load(); clearSelection(); } catch (e) { console.error(e); }
  };
  const handleBulkMoveTo = async (status) => {
    try { await Promise.all([...selectedIds].map(id => updateLead(id, { status }))); setLeads(ls => ls.map(l => selectedIds.has(l.id) ? { ...l, status } : l)); clearSelection(); } catch (e) { console.error(e); }
  };

  const detailConvos = useMemo(() => {
    if (!detailLead) return [];
    return allCommLog.filter(l => l.lead_id === detailLead.id);
  }, [detailLead, allCommLog]);

  const [detailRecordings, setDetailRecordings] = useState([]);
  useEffect(() => {
    if (!detailLead) { setDetailRecordings([]); return; }
    getLeadRecordings(detailLead.id).then(r => setDetailRecordings(r || [])).catch(() => {});
  }, [detailLead, recStatus]); // re-fetch when recording finishes

  const [recordingCounts, setRecordingCounts] = useState({});
  const [recordingStats, setRecordingStats]   = useState({ calls_24h: 0, calls_7d: 0, calls_30d: 0 });
  const [scheduleLead, setScheduleLead] = useState(null); // lead to schedule meeting for
  useEffect(() => {
    getLeadRecordingCounts().then(c => setRecordingCounts(c || {})).catch(() => {});
    getRecordingStats().then(s => setRecordingStats(s || { calls_24h: 0, calls_7d: 0, calls_30d: 0 })).catch(() => {});
  }, [recStatus]); // refresh after each recording finishes

  return (
    <div style={{ minHeight: '100%', background: '#f5f7fa' }}>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="page-title">Leads</div>
          <span style={{ fontSize: 12, color: '#8e8ea0', padding: '2px 10px', background: '#e5e7ef', borderRadius: 12 }}>
            {leads.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
            <input className="search-input" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button
            className="btn-ghost"
            onClick={() => exportCSV(filtered)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8e8ea0', border: '1px solid #e5e7ef', padding: '6px 12px', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}
            title="Export current view to CSV"
          >
            <Download size={14} /> Export
          </button>
          <button className="btn-ghost" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#8e8ea0', border: '1px solid #e5e7ef', padding: '6px 12px', borderRadius: 6, fontSize: 13 }}>
            <Upload size={14} /> Import
          </button>
          <button className="btn-primary" onClick={openAdd}><Plus size={16} /> New Lead</button>
        </div>
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      {(() => {
        const now = Date.now();
        const meetings = allCommLog.filter(c => c.channel === 'meeting');
        const meetsThisWeek = meetings.filter(c => now - new Date(c.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length;
        const meets30d      = meetings.filter(c => now - new Date(c.created_at).getTime() <= 30 * 24 * 60 * 60 * 1000).length;
        const won = leads.filter(l => l.status === 'Won').length;
        const stats = [
          { label: 'Calls (24h)',      value: recordingStats.calls_24h, icon: '📞', color: '#0369A1', bg: '#E0F2FE' },
          { label: 'Calls (7d)',       value: recordingStats.calls_7d,  icon: '📞', color: '#0F766E', bg: '#CCFBF1' },
          { label: 'Calls (30d)',      value: recordingStats.calls_30d, icon: '📞', color: '#6D28D9', bg: '#EDE9FE' },
          { label: 'Meets This Week',  value: meetsThisWeek,           icon: '📅', color: '#1D4ED8', bg: '#DBEAFE' },
          { label: 'Meets (30d)',      value: meets30d,                 icon: '📅', color: '#0C4A6E', bg: '#BAE6FD' },
          { label: 'Leads Won',        value: won,                      icon: '🏆', color: '#047857', bg: '#D1FAE5' },
        ];
        return (
          <div style={{ padding: '12px 20px', background: '#fff', borderBottom: '1px solid #f0f2f8', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {stats.map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderRadius: 10, background: s.bg,
                minWidth: 120, flex: '1 1 auto', maxWidth: 180,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: s.color, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>
                    {s.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Filter tabs */}
      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #e5e7ef', background: '#ffffff' }}>
        {FILTER_TABS.map(tab => {
          const active = activeTab === tab;
          const count = statusCounts[tab] || 0;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 14px', borderRadius: '6px 6px 0 0', border: 'none',
                background: active ? '#EEF4FF' : 'transparent',
                color: active ? '#4a6cf7' : '#8e8ea0',
                fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
                borderBottom: active ? '2px solid #4a6cf7' : '2px solid transparent',
                marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {tab}
              <span style={{ fontSize: 10, color: active ? '#4a6cf7' : '#b0b0c0', background: active ? '#fff' : '#f0f2f8', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                {count}
              </span>
            </button>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{ background: '#ffffff', border: '1px solid #e5e7ef', color: '#8e8ea0', borderRadius: 6, fontSize: 12, padding: '5px 8px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name_az">Name A→Z</option>
            <option value="name_za">Name Z→A</option>
          </select>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="mobile-cards">
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>Loading...</div>
        ) : paged.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>No leads in this view.</div>
        ) : paged.map(lead => {
          const st = STATUS_STYLES[lead.status] || STATUS_STYLES['New'];
          const pst = PLATFORM_STYLES[lead.lead_source] || null;
          return (
            <div key={lead.id} className="mobile-card" onClick={() => setDetailLead(lead)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Avatar name={lead.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="private-value" style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e' }}>{lead.name || '—'}</div>
                  {lead.company && <div className="private-value" style={{ fontSize: 11, color: '#8e8ea0' }}>{lead.company}</div>}
                </div>
                <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: st.bg, color: st.fg }}>
                  {lead.status || 'New'}
                </span>
              </div>
              {lead.phone && (
                <div className="mobile-card-row">
                  <Phone size={12} style={{ color: '#8e8ea0' }} /> <span className="private-value">{lead.phone}</span>
                </div>
              )}
              {lead.email && (
                <div className="mobile-card-row">
                  <Mail size={12} style={{ color: '#4a6cf7' }} /> <span className="private-value">{lead.email}</span>
                </div>
              )}
              {pst && (
                <div className="mobile-card-row" style={{ padding: 0, marginTop: 4 }}>
                  <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: pst.bg, color: pst.fg }}>
                    {pst.icon} {lead.lead_source}
                  </span>
                </div>
              )}
              {lastFollowUps[lead.id] && (
                <div className="mobile-card-row" style={{ fontSize: 10, color: '#b0b0c0', marginTop: 2 }}>
                  <Clock size={10} /> Last contact: {formatFollowUp(lastFollowUps[lead.id])}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="table-container desktop-table" style={{ background: '#ffffff', margin: 20, borderRadius: 10, border: '1px solid #e5e7ef', overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={paged.length > 0 && paged.every(l => selectedIds.has(l.id))}
                  onChange={toggleAllOnPage}
                />
              </th>
              <th style={{ width: 40 }} title="Record call"></th>
              <th style={{ minWidth: 220 }}>Name</th>
              <th style={{ minWidth: 150 }}>Phone Number</th>
              <th style={{ minWidth: 200 }}>Email</th>
              <th style={{ minWidth: 130 }}>Lead Source</th>
              <th style={{ minWidth: 130 }}>Lead Status</th>
              <th style={{ minWidth: 100 }}>Last Contact</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>Loading...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>
                No leads in this view. {activeTab === 'All Leads' && 'Click "New Lead" to add one.'}
              </td></tr>
            ) : paged.map(lead => (
              <tr
                key={lead.id}
                style={{
                  background: selectedIds.has(lead.id) ? 'rgba(74,108,247,0.08)' : undefined,
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={() => setHoveredId(lead.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => {
                  if (e.target.closest('input[type="checkbox"]') || e.target.closest('.lead-action-bar') || e.target.closest('button') || e.target.closest('a')) return;
                  setDetailLead(lead);
                }}
              >
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                </td>
                <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                  {(() => {
                    const active = isRecordingLead(lead.id);
                    const count = recordingCounts[lead.id] || 0;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <button
                          title={active ? 'Stop recording' : `Record call${count ? ` (${count} recorded)` : ''}`}
                          onClick={() => active ? stopRecording() : startRecording(lead.id, lead.name)}
                          disabled={recStatus === 'saving' || recStatus === 'requesting'}
                          style={{
                            width: 28, height: 28, borderRadius: '50%', border: 'none',
                            cursor: recStatus === 'saving' || recStatus === 'requesting' ? 'not-allowed' : 'pointer',
                            background: active ? '#FEE2E2' : '#f0f2f8',
                            color: active ? '#C00000' : '#8e8ea0',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                            boxShadow: active ? '0 0 0 2px #C0000040' : 'none',
                            animation: active ? 'recPulse 1.2s infinite' : 'none',
                          }}
                          onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#FFE0E0'; e.currentTarget.style.color = '#C00000'; } }}
                          onMouseLeave={e => { if (!active) { e.currentTarget.style.background = '#f0f2f8'; e.currentTarget.style.color = '#8e8ea0'; } }}
                        >
                          {active ? <MicOff size={12} /> : <Mic size={12} />}
                        </button>
                        {count > 0 && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: '#8e8ea0',
                            background: '#f0f2f8', borderRadius: 6,
                            padding: '0px 4px', lineHeight: '14px',
                          }}>
                            {count}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Avatar name={lead.name} />
                    <div style={{ minWidth: 0 }}>
                      <div className="private-value" style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{lead.name || '—'}</div>
                      {lead.company && <div className="private-value" style={{ fontSize: 11, color: '#8e8ea0' }}>{lead.company}</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <CopyCell value={lead.phone}>
                    <span className="private-value" style={{ fontSize: 12, color: '#8e8ea0' }}>{lead.phone || '—'}</span>
                  </CopyCell>
                </td>
                <td>
                  <CopyCell value={lead.email}>
                    <span className="private-value" style={{ fontSize: 12, color: '#8e8ea0' }}>{lead.email || '—'}</span>
                  </CopyCell>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <PlatformChip
                    value={lead.lead_source || ''}
                    onChange={(val) => handleFieldSave(lead.id, 'lead_source', val)}
                  />
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <StatusPill
                    value={lead.status || 'New'}
                    onChange={(val) => handleFieldSave(lead.id, 'status', val)}
                  />
                </td>
                <td>
                  {lastFollowUps[lead.id] ? (
                    <span style={{ fontSize: 11, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={10} /> {formatFollowUp(lastFollowUps[lead.id])}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#c0c0c0' }}>—</span>
                  )}
                </td>

                {hoveredId === lead.id && (
                  <td style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', padding: 0, border: 'none', width: 'auto', background: 'transparent' }}>
                    <div
                      className="lead-action-bar"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 2,
                        background: '#ffffff', border: '1px solid #e5e7ef',
                        borderRadius: 8, padding: '3px 4px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {lead.email && (
                        <button title="Send email" onClick={() => handleEmail(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6cf7', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
                          <Mail size={14} />
                        </button>
                      )}
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} title="Call"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a6cf7', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}>
                          <Phone size={14} />
                        </a>
                      )}
                      <button title="Interested" onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'up' ? null : 'up')}
                        style={{
                          background: lead.interest === 'up' ? 'rgba(74,108,247,0.12)' : 'none',
                          border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px 7px',
                          color: lead.interest === 'up' ? '#4a6cf7' : '#8e8ea0',
                          display: 'flex', alignItems: 'center',
                        }}>
                        <ThumbsUp size={13} />
                      </button>
                      <button title="Not interested" onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'down' ? null : 'down')}
                        style={{
                          background: lead.interest === 'down' ? 'rgba(255,92,92,0.12)' : 'none',
                          border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px 7px',
                          color: lead.interest === 'down' ? '#ff5c5c' : '#8e8ea0',
                          display: 'flex', alignItems: 'center',
                        }}>
                        <ThumbsDown size={13} />
                      </button>
                      {lead.status !== 'Won' && (
                        <button title="Move to Contacts" onClick={() => openConvert(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
                          <UserPlus size={14} />
                        </button>
                      )}
                      <button title="Delete" onClick={() => openDelete(lead)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderTop: '1px solid #e5e7ef', background: '#fafbfc',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8e8ea0' }}>
              Rows Per Page
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                style={{ background: '#fff', border: '1px solid #e5e7ef', borderRadius: 5, padding: '4px 8px', fontSize: 12, cursor: 'pointer', outline: 'none' }}
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12, color: '#8e8ea0' }}>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setPage(1)} disabled={page === 1}
                style={{ padding: '4px 8px', border: '1px solid #e5e7ef', background: '#fff', borderRadius: 5, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#c0c0c0' : '#8e8ea0', fontSize: 12 }}>
                «
              </button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '4px 8px', border: '1px solid #e5e7ef', background: '#fff', borderRadius: 5, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#c0c0c0' : '#8e8ea0', fontSize: 12 }}>
                <ChevronLeft size={12} />
              </button>
              <span style={{ padding: '4px 10px', fontSize: 12, color: '#1a1a2e', fontWeight: 600 }}>
                {page} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '4px 8px', border: '1px solid #e5e7ef', background: '#fff', borderRadius: 5, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#c0c0c0' : '#8e8ea0', fontSize: 12 }}>
                <ChevronRight size={12} />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                style={{ padding: '4px 8px', border: '1px solid #e5e7ef', background: '#fff', borderRadius: 5, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#c0c0c0' : '#8e8ea0', fontSize: 12 }}>
                »
              </button>
            </div>
          </div>
        )}
      </div>

      <SelectionBar
        count={selectedIds.size}
        selectedItems={selectedItems}
        onClear={clearSelection}
        onDelete={handleBulkDelete}
        onArchive={handleBulkArchive}
        onDuplicate={handleBulkDuplicate}
        onConvert={handleBulkConvert}
        moveToOptions={LEAD_STATUSES.map(s => ({ label: s, value: s }))}
        onMoveTo={handleBulkMoveTo}
      />

      {detailLead && (
        <LeadDetailPanel
          lead={detailLead}
          onClose={() => setDetailLead(null)}
          onFieldSave={handleFieldSave}
          onSaveAll={handleSaveAllFields}
          statuses={LEAD_STATUSES}
          onEmail={handleEmail}
          onSchedule={(lead) => { setScheduleLead(lead); }}
          lastFollowUp={lastFollowUps[detailLead.id]}
          convos={detailConvos}
          recordings={detailRecordings}
        />
      )}

      {showImport && (
        <BulkImport onClose={() => setShowImport(false)} onImported={() => { load(); setShowImport(false); }} />
      )}

      {scheduleLead && (
        <ScheduleMeetingModal
          initialTitle={`Demo Call with ${scheduleLead.name || 'Lead'}`}
          initialAttendees={scheduleLead.email ? [{ name: scheduleLead.name || '', email: scheduleLead.email }] : []}
          onClose={() => setScheduleLead(null)}
          onComplete={async (result) => {
            const lid = scheduleLead.id;
            // Auto-update lead status to Call Scheduled
            handleFieldSave(lid, 'status', 'Call Scheduled');
            // Log meeting to activity timeline
            try {
              const startISO = result?.start_time;
              const endISO   = result?.end_time;
              const durationMins = (startISO && endISO)
                ? Math.round((new Date(endISO) - new Date(startISO)) / 60000)
                : null;
              const meetMeta = {
                __meetingMeta: true,
                meet_link:        result?.meet_link || null,
                start_time:       startISO || null,
                duration_minutes: durationMins,
                attendees:        (result?.participants || []).map(p => p.email).filter(Boolean),
              };
              await createCommLog({
                lead_id: lid,
                channel: 'meeting',
                subject: result?.title || result?.summary || 'Google Meet scheduled',
                body: JSON.stringify(meetMeta),
                direction: 'outbound',
              });
            } catch (e) {
              console.warn('Failed to log meeting to activity:', e.message);
            }
            setScheduleLead(null);
            // Refresh comm log so new meeting shows in timeline
            getCommLog().then(logs => setAllCommLog(logs || [])).catch(() => {});
          }}
        />
      )}

      {modal === 'add' && (
        <Modal title="New Lead" onClose={() => setModal(null)} onSubmit={handleSave} submitLabel="Add Lead">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" required />
            </div>
            <div className="form-group">
              <label className="form-label">Company</label>
              <input className="form-input" value={form.company || ''} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Business name" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {LEAD_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Lead Source</label>
              <select className="form-select" value={form.lead_source} onChange={e => setForm(f => ({ ...f, lead_source: e.target.value }))}>
                {LEAD_SOURCES.map(s => <option key={s}>{s || '— Select —'}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">TikTok Username</label>
              <input className="form-input" value={form.tiktok_username || ''} onChange={e => setForm(f => ({ ...f, tiktok_username: e.target.value.replace(/^@/, '') }))} placeholder="@username" />
            </div>
            <div className="form-group">
              <label className="form-label">Instagram Username</label>
              <input className="form-input" value={form.ig_username || ''} onChange={e => setForm(f => ({ ...f, ig_username: e.target.value.replace(/^@/, '') }))} placeholder="@username" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete Lead" onClose={() => setModal(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
          <p style={{ color: '#8e8ea0' }}>Delete <strong style={{ color: '#1a1a2e' }}>{selected?.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
      {modal === 'convert' && (
        <Modal title="Move to Contacts" onClose={() => setModal(null)} onSubmit={handleConvert} submitLabel="Convert to Contact">
          <p style={{ color: '#8e8ea0' }}>Move <strong style={{ color: '#1a1a2e' }}>{selected?.name}</strong> to Contacts?</p>
        </Modal>
      )}
    </div>
  );
}
