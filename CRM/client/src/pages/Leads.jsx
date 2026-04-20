import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Plus, Search, Trash2, UserPlus, Mail, Phone, Upload, X, Check,
  ThumbsUp, ThumbsDown, Send, Clock, Download, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, ChevronDown, MessageSquare, Mic, MicOff, Play, Pause, Square, ListPlus, Loader, FileText,
  PhoneCall, PhoneOff, Voicemail,
} from 'lucide-react';
import { useRecorder } from '../context/RecorderContext';
import { useUi, usePageActions } from '../context/UiContext';
import { supabase } from '../lib/supabase';
import { getLeads, createLead, updateLead, deleteLead, convertLead, getCommLog, getLeadRecordings, getLeadRecordingCounts, getRecordingStats, getMeetingStats, createCommLog, getClients, addEmailContacts, getProcessingRecordings, getScripts, personalizeScript } from '../api';
import { copyToClipboard } from '../lib/clipboard';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import SelectionBar from '../components/SelectionBar';
import BulkImport from '../components/BulkImport';
import CopyCell from '../components/CopyCell';

// ─── Lead Statuses ────────────────────────────────────────────────────────────
const LEAD_STATUSES = ['New', 'Interested', 'Not Interested', 'Follow Up', 'Call Scheduled', 'Called', 'Won'];

const STATUS_STYLES = {
  'New':            { bg: 'rgba(3,105,161,0.2)', fg: '#38bdf8' }, // sky blue
  'Interested':     { bg: 'rgba(21,128,61,0.2)', fg: '#4ade80' }, // green
  'Not Interested': { bg: 'rgba(185,28,28,0.2)', fg: '#f87171' }, // red
  'Follow Up':      { bg: 'rgba(180,83,9,0.2)', fg: '#fbbf24' }, // amber
  'Call Scheduled': { bg: 'rgba(109,40,217,0.2)', fg: '#a78bfa' }, // violet
  'Called':         { bg: 'rgba(15,118,110,0.2)', fg: '#2dd4bf' }, // teal
  'Won':            { bg: 'rgba(4,120,87,0.2)', fg: '#34d399' }, // emerald
};

const FILTER_TABS = ['All Leads', ...LEAD_STATUSES];

// Sources that count as inbound (someone came to us)
const INBOUND_SOURCES = new Set([
  'TikTok', 'Instagram', 'YouTube', 'Threads', 'Facebook', 'X / Twitter',
  'LinkedIn', 'Website', 'Referral', 'Podcast', 'Event', 'Email',
]);

function segmentFromSource(source) {
  if (source === 'Cold Outreach') return 'cold';
  return 'inbound';
}

function assignedFromSegment(segment) {
  return segment === 'cold' ? 'Stephanie' : 'Ray';
}

const EMPTY = {
  name: '', status: 'New', company: '', email: '', phone: '',
  tiktok_username: '', ig_username: '', lead_source: '', notes: '', product_need: '',
  segment: 'inbound', assigned_to: 'Ray',
};

// ─── Package offerings ────────────────────────────────────────────────────────
const PRODUCT_NEEDS = [
  'Digital Presence',
  'Content Engine',
  'Growth System',
];

const PRODUCT_NEED_STYLES = {
  'Digital Presence': { bg: 'rgba(74,108,247,0.12)', fg: 'var(--orange)', icon: '🌐',
    subtitle: 'Website · App · Local SEO' },
  'Content Engine':   { bg: '#f59e0b20', fg: '#d97706', icon: '🎬',
    subtitle: 'AI Content · Reels · Intros/Outros' },
  'Growth System':    { bg: '#10b98120', fg: '#059669', icon: '🚀',
    subtitle: 'Automation · Email · CRM Flows' },
};

function ProductNeedChip({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const style = (value ? (PRODUCT_NEED_STYLES[value] || { bg: '#8e8ea020', fg: '#8e8ea0', icon: '•' }) : null);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: value ? '3px 9px' : '3px 8px', borderRadius: 10,
          fontSize: 11, fontWeight: 600,
          background: value ? style.bg : 'var(--surface-3)',
          color: value ? style.fg : '#8e8ea0',
          border: value ? 'none' : '1px dashed #c0c0c8',
          cursor: 'pointer', lineHeight: 1.4, maxWidth: 150,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {value ? <><span style={{ fontSize: 10 }}>{style.icon}</span> {value}</> : '+ Need'}
      </button>
      {open && (
        <>
          <div onClick={e => { e.stopPropagation(); setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 51,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4, minWidth: 200,
              maxHeight: 320, overflowY: 'auto',
            }}
          >
            {PRODUCT_NEEDS.map(s => {
              const st = PRODUCT_NEED_STYLES[s] || PRODUCT_NEED_STYLES['Other'];
              return (
                <button
                  key={s}
                  onClick={() => { onChange(s); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    borderRadius: 5, fontSize: 12, fontWeight: 500, width: '100%',
                    background: value === s ? st.bg : 'transparent',
                    color: value === s ? st.fg : 'var(--text)',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (value !== s) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { if (value !== s) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ fontSize: 14 }}>{st.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s}</div>
                    {st.subtitle && <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 400 }}>{st.subtitle}</div>}
                  </div>
                </button>
              );
            })}
            {value && (
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  borderRadius: 5, fontSize: 12, color: '#ff5c5c', background: 'transparent',
                  border: 'none', cursor: 'pointer', width: '100%', borderTop: '1px solid var(--border)', marginTop: 2,
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

// ─── Platform chip (unchanged) ────────────────────────────────────────────────
const LEAD_SOURCES = [
  '', 'Website', 'Referral', 'Cold Outreach',
  'Email', 'TikTok', 'Instagram', 'YouTube', 'Threads', 'Facebook', 'X / Twitter', 'LinkedIn',
  'Podcast', 'Event', 'Other',
];

const PLATFORM_STYLES = {
  'Email':        { bg: 'rgba(74,108,247,0.12)', fg: 'var(--orange)', icon: '✉️' },
  'TikTok':       { bg: '#FF004F20', fg: '#E60048', icon: '🎵' },
  'Instagram':    { bg: '#E1306C20', fg: '#E1306C', icon: '📸' },
  'YouTube':      { bg: '#FF000020', fg: '#D00000', icon: '▶️' },
  'Threads':      { bg: '#1a1a2e20', fg: '#c8c8e0', icon: '@' },
  'Facebook':     { bg: '#1877F220', fg: '#1877F2', icon: 'f' },
  'X / Twitter':  { bg: '#71767B20', fg: '#9ca3af', icon: '𝕏' },
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
          background: value ? style.bg : 'var(--surface-3)',
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
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
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
                    color: value === s ? st.fg : 'var(--text)',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (value !== s) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
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
                  border: 'none', cursor: 'pointer', textAlign: 'left', borderTop: '1px solid var(--border)', marginTop: 2,
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
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
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
                    color: value === s ? st.fg : 'var(--text)',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { if (value !== s) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
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
  'var(--orange)', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6',
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
      { key: 'title',            label: 'Industry / Title' },
      { key: 'email',            label: 'Email' },
      { key: 'phone',            label: 'Phone' },
      { key: 'tiktok_username',  label: 'TikTok' },
      { key: 'ig_username',      label: 'Instagram' },
    ],
  },
  {
    title: 'Pipeline',
    fields: [
      { key: 'product_need',       label: 'Product / Need' },
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
  color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)',
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
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 0', gap: 8,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {title}
        </span>
        <ChevronDown size={13} style={{ color: 'var(--muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s', flexShrink: 0 }} />
      </button>
      {open && <div style={{ paddingBottom: 12 }}>{children}</div>}
    </div>
  );
}

// ─── Activity Timeline ────────────────────────────────────────────────────────
const ACTIVITY_ICONS = {
  call:      { icon: '📞', color: '#f87171', bg: 'rgba(239,68,68,0.15)' },
  email:     { icon: '✉️',  color: 'var(--orange)', bg: 'rgba(59,130,246,0.15)' },
  recording: { icon: '🎙️', color: '#a78bfa', bg: 'rgba(139,92,246,0.15)' },
  meeting:   { icon: '📅', color: '#38bdf8', bg: 'rgba(3,105,161,0.15)' },
  note:      { icon: '📝', color: '#fbbf24', bg: 'rgba(234,179,8,0.15)' },
  status:    { icon: '🔄', color: '#38bdf8', bg: 'rgba(3,105,161,0.15)' },
  created:   { icon: '✅', color: '#4ade80', bg: 'rgba(34,197,94,0.15)' },
  default:   { icon: '💬', color: 'var(--muted)', bg: 'rgba(107,114,128,0.15)' },
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
    hot:            { bg: 'rgba(185,28,28,0.2)', fg: '#f87171', label: '🔥 Hot' },
    warm:           { bg: 'rgba(180,83,9,0.2)', fg: '#fbbf24', label: '☀️ Warm' },
    cold:           { bg: 'rgba(3,105,161,0.2)', fg: '#38bdf8', label: '❄️ Cold' },
    not_interested: { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af', label: '👎 Not interested' },
  };

  return (
    <CollapsibleSection title="Activity" defaultOpen={true}>
      {events.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No activity yet.</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 20 }}>
          {/* Vertical line */}
          <div style={{ position: 'absolute', left: 7, top: 8, bottom: 8, width: 2, background: 'var(--border-light)', borderRadius: 1 }} />

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
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{ev.title}</span>
                      {ev.interestLevel && INTEREST_STYLES[ev.interestLevel] && (
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                          background: INTEREST_STYLES[ev.interestLevel].bg,
                          color: INTEREST_STYLES[ev.interestLevel].fg, whiteSpace: 'nowrap', flexShrink: 0,
                        }}>
                          {INTEREST_STYLES[ev.interestLevel].label}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: ev.body ? 4 : 0 }}>
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
                            <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 8px' }}>
                              {s.summary}
                            </p>
                          );
                        })()}
                        {/* Full player + detail card */}
                        <RecordingCard recording={ev.recording} />
                      </div>
                    ) : ev.type === 'meeting' ? (
                      <div style={{ marginTop: 4, padding: '10px 12px', background: 'rgba(59,130,246,0.08)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.25)' }}>
                        {/* Meeting details */}
                        {ev.metadata?.start_time && (
                          <div style={{ fontSize: 11, color: 'var(--blue)', marginBottom: 4, fontWeight: 600 }}>
                            📅 {new Date(ev.metadata.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                            {ev.metadata.duration_minutes ? ` · ${ev.metadata.duration_minutes}min` : ''}
                          </div>
                        )}
                        {ev.metadata?.attendees?.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: ev.metadata?.meet_link ? 6 : 0 }}>
                            <span style={{ color: 'var(--muted)' }}>Attendees: </span>
                            {ev.metadata.attendees.join(', ')}
                          </div>
                        )}
                        {ev.metadata?.meet_link && (
                          <a
                            href={ev.metadata.meet_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, textDecoration: 'none' }}
                          >
                            🎥 Join Google Meet ↗
                          </a>
                        )}
                        {ev.body && !ev.metadata?.meet_link && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                            {ev.body.length > 200 ? ev.body.slice(0, 200) + '…' : ev.body}
                          </div>
                        )}
                      </div>
                    ) : ev.body ? (
                      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginTop: 2 }}>
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
    <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Mic size={10} /> Call
          </span>
          {r.duration_seconds > 0 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>{fmt(r.duration_seconds)}</span>}
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          {r.audio_cleaned && (
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, fontWeight: 700, background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
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
                background: summarizing ? 'var(--surface-3)' : 'var(--orange)', color: summarizing ? 'var(--muted)' : '#fff',
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
                fontSize: 10, padding: '3px 8px', borderRadius: 8, fontWeight: 700, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--muted)',
                cursor: summarizing ? 'wait' : 'pointer',
              }}
            >
              {summarizing ? '…' : '↺'}
            </button>
          )}
          <span style={{
            fontSize: 9, padding: '2px 7px', borderRadius: 8, fontWeight: 700, textTransform: 'uppercase',
            background: r.transcript_status === 'done' ? 'rgba(34,197,94,0.15)' : r.transcript_status === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)',
            color: r.transcript_status === 'done' ? '#4ade80' : r.transcript_status === 'error' ? '#f87171' : '#fbbf24',
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
            background: 'var(--orange)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {loading ? <span style={{ fontSize: 8 }}>…</span> : playing ? <Pause size={12} /> : <Play size={12} />}
        </button>

        {/* Seek bar */}
        <div
          onClick={handleSeek}
          style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
        >
          <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--orange)', borderRadius: 2, transition: 'width 0.1s' }} />
        </div>

        <span style={{ fontSize: 10, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
          {fmt(currentTime)}{duration > 0 ? ` / ${fmt(duration)}` : ''}
        </span>

        <button
          onClick={handleStop}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2, display: 'flex', alignItems: 'center' }}
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
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {/* Interest + sentiment row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {summary.interest_level && (() => {
              const iMap = {
                hot:           { bg: 'rgba(185,28,28,0.2)', fg: '#f87171', label: '🔥 Hot' },
                warm:          { bg: 'rgba(180,83,9,0.2)', fg: '#fbbf24', label: '☀️ Warm' },
                cold:          { bg: 'rgba(3,105,161,0.2)', fg: '#38bdf8', label: '❄️ Cold' },
                not_interested:{ bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af', label: '👎 Not Interested' },
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
                positive: { bg: 'rgba(21,128,61,0.2)', fg: '#4ade80', label: '😊 Positive' },
                neutral:  { bg: 'rgba(107,114,128,0.15)', fg: '#9ca3af', label: '😐 Neutral' },
                negative: { bg: 'rgba(185,28,28,0.2)', fg: '#f87171', label: '😟 Negative' },
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
            <p style={{ fontSize: 12, color: 'var(--text)', margin: '0 0 8px', lineHeight: 1.6, fontWeight: 500 }}>
              {summary.summary}
            </p>
          )}

          {/* Interest reason */}
          {summary.interest_reason && (
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 8px', lineHeight: 1.5, fontStyle: 'italic' }}>
              {summary.interest_reason}
            </p>
          )}

          {/* Pain points */}
          {summary.pain_points?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Pain Points</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {summary.pain_points.map((p, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(234,179,8,0.15)', color: '#fbbf24' }}>{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Next steps */}
          {summary.next_steps?.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Next Steps</div>
              <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {summary.next_steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Topics */}
          {summary.topics?.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Topics</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {summary.topics.map((t, i) => (
                  <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.12)', color: 'var(--orange)' }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      {r.transcript && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', cursor: 'pointer', userSelect: 'none', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Full Transcript
          </summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {r.transcript.split('\n').filter(l => l.trim()).map((line, i) => {
              const match = line.match(/^(Speaker \d+):\s*(.*)$/);
              if (match) {
                const speakerNum = parseInt(match[1].replace('Speaker ', ''), 10);
                const colors = ['var(--orange)', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];
                const color = colors[(speakerNum - 1) % colors.length];
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color, background: `${color}15`,
                      padding: '2px 7px', borderRadius: 6, flexShrink: 0, marginTop: 1, whiteSpace: 'nowrap',
                    }}>
                      {match[1]}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{match[2]}</span>
                  </div>
                );
              }
              return <p key={i} style={{ fontSize: 12, color: 'var(--text)', margin: 0, lineHeight: 1.6 }}>{line}</p>;
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Script Browse Row (used in floating modal) ────────────────────────────────
function ScriptBrowseRow({ script }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function renderScript(text) {
    const parts = text.split(/(\[[^\]]+\])/g);
    return parts.map((part, i) =>
      /^\[.+\]$/.test(part)
        ? <mark key={i} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '0 2px', fontWeight: 600 }}>{part}</mark>
        : part
    );
  }

  function handleCopy() {
    copyToClipboard(script.content).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: expanded ? '#f9fafb' : '#fff' }}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = '#f9fafb'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = '#fff'; }}
      >
        <ChevronRight size={14} color="#8e8ea0" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1 }}>📞 {script.title}</span>
        {script.service && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(255,155,38,0.12)', color: 'var(--orange)' }}>{script.service}</span>
        )}
      </div>
      {expanded && (
        <div style={{ padding: '0 20px 16px 44px', background: 'var(--surface-2)' }}>
          <pre style={{ margin: 0, padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
            {renderScript(script.content)}
          </pre>
          <button
            onClick={handleCopy}
            style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 7, border: `1px solid ${copied ? '#22c55e40' : '#e5e7ef'}`, background: copied ? '#22c55e15' : '#fff', color: copied ? '#16a34a' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            {copied ? <><Check size={12} /> Copied!</> : <>📋 Copy Script</>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Call Script Widget ───────────────────────────────────────────────────────
function CallScriptWidget({ lead, scripts, onScriptSaved }) {
  const [copied, setCopied]         = useState(false);
  const [aiScript, setAiScript]     = useState(lead.ai_script || '');
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError, setAiError]       = useState('');
  // Default to AI view if lead has a cached ai_script
  const [showAi, setShowAi]         = useState(!!lead.ai_script);

  // Reset when switching between leads
  useEffect(() => {
    setAiScript(lead.ai_script || '');
    setShowAi(!!lead.ai_script);
    setAiError('');
  }, [lead.id, lead.ai_script]);

  const script = scripts.find(s => s.service === lead.product_need);

  function substituteTags(text, l) {
    const firstName = (l.name || '').split(' ')[0];
    return text
      .replace(/\[name\]/gi,       l.name          || '[name]')
      .replace(/\[first_name\]/gi, firstName        || '[first_name]')
      .replace(/\[company\]/gi,    l.company        || '[company]')
      .replace(/\[title\]/gi,      l.title          || '[title]')
      .replace(/\[phone\]/gi,      l.phone          || '[phone]')
      .replace(/\[email\]/gi,      l.email          || '[email]')
      .replace(/\[notes\]/gi,      l.notes          || '—')
      .replace(/\[budget\]/gi,     l.budget         || '—')
      .replace(/\[problem\]/gi,    l.problem        || '—')
      .replace(/\[goal\]/gi,       l.financial_goal || '—')
      .replace(/\[best_time\]/gi,  l.best_time      || '—');
  }

  const displayText = showAi && aiScript ? aiScript : (script ? substituteTags(script.content, lead) : '');

  function handleCopy() {
    if (!displayText) return;
    copyToClipboard(displayText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  }

  async function handlePersonalize() {
    if (!script) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await personalizeScript(substituteTags(script.content, lead), lead);
      setAiScript(result.script);
      setShowAi(true);
      // Persist to DB so the regenerated version survives reloads
      try {
        await updateLead(lead.id, { ai_script: result.script, ai_script_generated_at: new Date().toISOString() });
        onScriptSaved?.(lead.id, result.script);
      } catch {
        setAiError('Generated, but saving to DB failed. The script is still visible here.');
      }
    } catch (e) {
      setAiError(e.message || 'AI personalization failed');
    } finally {
      setAiLoading(false);
    }
  }

  function renderScript(text) {
    const parts = text.split(/(\[[^\]]+\])/g);
    return parts.map((part, i) =>
      /^\[.+\]$/.test(part)
        ? <mark key={i} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '0 2px', fontWeight: 600 }}>{part}</mark>
        : part
    );
  }

  if (!lead.product_need) {
    return (
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>📞 Call Script</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>Assign a Product / Need to this lead to load the matching call script.</div>
      </div>
    );
  }

  if (!script) {
    return (
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>📞 Call Script</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No script found for "{lead.product_need}".</div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 15 }}>📞</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{script.title}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {/* AI Personalize toggle */}
          {aiScript && (
            <button
              onClick={() => setShowAi(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: showAi ? 'rgba(255,155,38,0.12)' : '#f5f7fa', border: `1px solid ${showAi ? 'var(--orange)' : '#e5e7ef'}`, color: showAi ? 'var(--orange)' : '#6b7280', transition: 'all 0.15s' }}
            >
              {showAi ? '⚡ AI' : '📄 Base'}
            </button>
          )}
          <button
            onClick={handlePersonalize}
            disabled={aiLoading}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: aiLoading ? 'wait' : 'pointer', background: '#ff9b2618', border: '1px solid #ff9b2650', color: '#d97706', transition: 'all 0.15s', opacity: aiLoading ? 0.7 : 1 }}
          >
            {aiLoading ? <><Loader size={10} style={{ animation: 'spin 0.7s linear infinite' }} /> Personalizing…</> : '✨ AI Personalize'}
          </button>
          <button
            onClick={handleCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: copied ? '#22c55e15' : '#f5f7fa', border: `1px solid ${copied ? '#22c55e50' : '#e5e7ef'}`, color: copied ? '#16a34a' : '#6b7280', transition: 'all 0.15s' }}
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* AI mode badge */}
      {showAi && aiScript && (
        <div style={{ padding: '6px 16px', background: 'rgba(255,155,38,0.08)', borderBottom: '1px solid var(--orange)20', fontSize: 11, color: 'var(--orange)', fontWeight: 600 }}>
          ⚡ AI-personalized for {lead.name || lead.company} — based on their notes & situation
        </div>
      )}

      {aiError && (
        <div style={{ padding: '8px 16px', background: '#ff5c5c10', borderBottom: '1px solid #ff5c5c30', fontSize: 11, color: '#ff5c5c' }}>{aiError}</div>
      )}

      {/* Script body */}
      <div style={{ padding: '14px 16px', maxHeight: 400, overflowY: 'auto' }}>
        <pre style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'inherit' }}>
          {renderScript(displayText)}
        </pre>
      </div>
    </div>
  );
}

function LeadDetailPanel({ lead, onClose, onFieldSave, onSaveAll, statuses, onEmail, onSchedule, onAddToList, lastFollowUp, convos, recordings, scripts, onPrev, onNext, hasPrev, hasNext, onScriptSaved }) {
  const { startRecording, stopRecording, isRecordingLead, status: recStatus, elapsed } = useRecorder();
  const isRec = isRecordingLead(lead.id);
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

  const [showOutcomeMenu, setShowOutcomeMenu] = useState(false);

  async function handleLogCall(outcome) {
    const now = new Date().toISOString();
    const updates = {
      last_call_date: now,
      last_call_outcome: outcome,
      last_contact_date: now,
      call_completed: true,
    };
    // Auto-move to Follow Up if they didn't answer (unless already terminal)
    if (outcome === 'no_answer' && !['Won', 'Not Interested', 'Converted'].includes(draft.status)) {
      updates.status = 'Follow Up';
    }
    Object.entries(updates).forEach(([k, v]) => set(k, v));
    await onSaveAll(lead.id, updates);
    setShowOutcomeMenu(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'relative', width: 560, background: 'var(--surface)',
        borderLeft: '1px solid var(--border)', overflowY: 'auto',
        boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Avatar name={draft.name} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }} className="private-value">
                    {draft.name || 'Unnamed Lead'}
                  </div>
                  {draft.company && (
                    <div style={{ fontSize: 11, color: 'var(--muted)' }} className="private-value">{draft.company}</div>
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
                      background: 'var(--orange)', color: '#fff',
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
                    fontSize: 12, fontWeight: 600, border: '1px solid var(--border)',
                    background: 'var(--surface-3)', color: 'var(--text)',
                  }}
                >
                  <CalendarIcon size={12} /> Schedule Meeting
                </button>
                <button
                  onClick={() => isRec ? stopRecording() : startRecording(lead.id, lead.name)}
                  disabled={recStatus === 'requesting' || recStatus === 'saving'}
                  title={isRec ? 'Stop recording' : 'Start recording call'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 14px', borderRadius: 6,
                    cursor: (recStatus === 'requesting' || recStatus === 'saving') ? 'wait' : 'pointer',
                    fontSize: 12, fontWeight: 600,
                    border: 'none',
                    background: isRec ? '#ff5c5c' : '#ff5c5c15',
                    color: isRec ? '#fff' : '#ff5c5c',
                    animation: isRec ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  }}
                >
                  {isRec ? <Square size={11} fill="#fff" /> : <Mic size={12} />}
                  {isRec ? `Recording · ${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}` : recStatus === 'requesting' ? 'Starting…' : recStatus === 'saving' ? 'Saving…' : 'Record Call'}
                </button>
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShowOutcomeMenu(v => !v)}
                    title="Log a call outcome"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-3)', color: 'var(--text)',
                    }}
                  >
                    <PhoneCall size={12} /> Log Call <ChevronDown size={11} />
                  </button>
                  {showOutcomeMenu && (
                    <>
                      <div
                        onClick={() => setShowOutcomeMenu(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                      />
                      <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 11,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                        minWidth: 180, overflow: 'hidden',
                      }}>
                        {[
                          { key: 'answered',  label: 'Answered',    icon: PhoneCall,  color: '#4ade80' },
                          { key: 'no_answer', label: 'No Answer',   icon: PhoneOff,   color: '#f87171' },
                          { key: 'voicemail', label: 'Left Voicemail', icon: Voicemail, color: '#fdab3d' },
                          { key: 'declined',  label: 'Declined',    icon: PhoneOff,   color: 'var(--muted)' },
                        ].map(({ key, label, icon: Icon, color }) => (
                          <button
                            key={key}
                            onClick={() => handleLogCall(key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                              padding: '10px 14px', border: 'none', background: 'transparent',
                              cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <Icon size={13} style={{ color }} /> {label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                {lead.email && (
                  <button
                    onClick={() => onAddToList(lead)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, border: '1px solid var(--border)',
                      background: 'var(--surface-3)', color: 'var(--text)',
                    }}
                  >
                    <ListPlus size={12} /> Add to Email List
                  </button>
                )}
                {lastFollowUp && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> Last: {formatFollowUp(lastFollowUp)}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                title="Previous lead"
                style={{ background: hasPrev ? '#f5f7fa' : 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: hasPrev ? 'pointer' : 'not-allowed', color: hasPrev ? '#1a1a2e' : '#d0d0d8', padding: '6px 7px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                title="Next lead"
                style={{ background: hasNext ? '#f5f7fa' : 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: hasNext ? 'pointer' : 'not-allowed', color: hasNext ? '#1a1a2e' : '#d0d0d8', padding: '6px 7px', display: 'flex', alignItems: 'center' }}
              >
                <ChevronRight size={15} />
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4, marginLeft: 4 }}>
                <X size={20} />
              </button>
            </div>
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
                    <span style={{ fontSize: 12, color: 'var(--muted)', paddingTop: 8 }}>{label}</span>
                    <EditableField fieldKey={key} value={draft[key]} onChange={val => set(key, val)} />
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          ))}

          {/* Call Script */}
          <CallScriptWidget lead={lead} scripts={scripts} onScriptSaved={onScriptSaved} />

          {/* Activity Timeline */}
          <ActivityTimeline lead={lead} convos={convos} recordings={recordings} />
        </div>

        <div style={{
          position: 'sticky', bottom: 0, padding: '12px 24px',
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button
            onClick={handleSaveAll}
            disabled={saving || !isDirty}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 6, cursor: isDirty ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 700, border: 'none',
              background: isDirty ? 'var(--orange)' : '#e5e7ef',
              color: isDirty ? '#fff' : '#8e8ea0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {saving ? 'Saving…' : saved ? <><Check size={14} /> Saved!</> : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            style={{ padding: '9px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)' }}
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
  const headers = ['Name', 'Company', 'Phone', 'Email', 'Lead Source', 'Product Need', 'Status', 'TikTok', 'Instagram', 'Budget', 'Notes', 'Created'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = leads.map(l => [
    l.name, l.company, l.phone, l.email, l.lead_source, l.product_need, l.status,
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

// ─── Email List Modal ─────────────────────────────────────────────────────────
function EmailListModal({ lead, onClose, onSuccess }) {
  const [clients,    setClients]   = useState([]);
  const [clientId,   setClientId]  = useState('');
  const [tags,       setTags]      = useState('');
  const [saving,     setSaving]    = useState(false);
  const [error,      setError]     = useState('');

  useEffect(() => {
    getClients().then(data => {
      const list = Array.isArray(data) ? data : (data?.clients || []);
      setClients(list);
      if (list.length === 1) setClientId(list[0].id);
    }).catch(() => {});
  }, []);

  async function handleAdd() {
    if (!clientId) return setError('Please select an email list');
    if (!lead.email) return setError('This lead has no email address');
    setSaving(true);
    setError('');
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      await addEmailContacts({
        client_id: clientId,
        contacts: [{ name: lead.name || '', email: lead.email, tags: tagList }],
      });
      onSuccess();
    } catch (e) {
      setError(e.message || 'Failed to add to list');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ListPlus size={16} color="var(--orange)" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Add to Email List</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={17} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Lead info */}
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{lead.name || 'Unnamed'}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>{lead.email || <span style={{ color: '#ff5c5c' }}>No email on file</span>}</div>
            </div>
          </div>

          {error && (
            <div style={{ background: '#fff1f0', border: '1px solid #ff5c5c40', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ff5c5c' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Select Email List *</label>
            <select style={inputStyle} value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">— Choose a list —</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.business_name || c.name || c.id}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>
              Tags <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional, comma-separated)</span>
            </label>
            <input
              style={inputStyle}
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="e.g. lead, crm, warm"
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 18px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || !lead.email}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (saving || !lead.email) ? 'not-allowed' : 'pointer', opacity: (saving || !lead.email) ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {saving ? 'Adding…' : <><ListPlus size={13} /> Add to List</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Leads() {
  const { startRecording, stopRecording, isRecordingLead, status: recStatus } = useRecorder();
  const { setLeadPanelOpen } = useUi();
  // Cleanup: reset leadPanelOpen whenever this page unmounts (navigating away)
  useEffect(() => () => setLeadPanelOpen(false), [setLeadPanelOpen]);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [scriptsModalOpen, setScriptsModalOpen] = useState(false);
  const [allCommLog, setAllCommLog] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [activeTab, setActiveTab] = useState('All Leads');
  const [activeSegment, setActiveSegment] = useState('cold');
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
  const [emailListLead, setEmailListLead] = useState(null);
  const [toast, setToast] = useState('');
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  // Processing tracker state
  const [processingLeadIds, setProcessingLeadIds] = useState(new Set()); // lead IDs with in-flight recordings
  const [processedNotifs, setProcessedNotifs] = useState([]); // [{id, leadId, leadName}] completed
  const knownProcessingRef = useRef(new Map()); // recordingId → {leadId, leadName}

  // Poll for processing recordings every 8s
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const rows = await getProcessingRecordings();
        if (cancelled) return;
        const currentIds = new Set(rows.map(r => r.id));
        const prev = knownProcessingRef.current;

        // Detect newly completed (was in prev, not in current)
        const completed = [];
        for (const [recId, info] of prev.entries()) {
          if (!currentIds.has(recId)) completed.push({ id: recId, ...info });
        }

        // Update known map to current — resolve name from loaded leads
        const next = new Map();
        for (const r of rows) {
          const leadName = leads.find(l => l.id === r.lead_id)?.name || null;
          next.set(r.id, { leadId: r.lead_id, leadName });
        }
        knownProcessingRef.current = next;

        setProcessingLeadIds(new Set(rows.map(r => r.lead_id)));
        if (completed.length) {
          setProcessedNotifs(n => [...n, ...completed.map(c => ({ ...c, ts: Date.now() }))]);
          // Refresh recording counts so badge updates
          getLeadRecordingCounts().then(counts => setRecordingCounts(counts || {})).catch(() => {});
        }
      } catch { /* silent */ }
    }
    poll();
    const timer = setInterval(poll, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [leads]);

  const load = async () => {
    try {
      const leadsData = await getLeads();
      setLeads(leadsData.filter(l => !l.archived));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { getScripts().then(s => setScripts(s || [])).catch(() => {}); }, []);

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

  // Segment counts for the top-level tabs
  const segmentCounts = useMemo(() => ({
    inbound: leads.filter(l => (l.segment || 'inbound') === 'inbound').length,
    cold:    leads.filter(l => l.segment === 'cold').length,
  }), [leads]);

  // Counts per status tab within the active segment
  const statusCounts = useMemo(() => {
    const c = { 'All Leads': 0 };
    LEAD_STATUSES.forEach(s => { c[s] = 0; });
    leads.filter(l => (l.segment || 'inbound') === activeSegment).forEach(l => {
      c['All Leads']++;
      if (c[l.status] !== undefined) c[l.status]++;
    });
    return c;
  }, [leads, activeSegment]);

  const filtered = useMemo(() => {
    let list = leads.filter(l => (l.segment || 'inbound') === activeSegment);
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

  useEffect(() => { setPage(1); setActiveTab('All Leads'); }, [activeSegment]);
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

  const openAdd    = () => { setForm({ ...EMPTY, segment: activeSegment, assigned_to: assignedFromSegment(activeSegment) }); setModal('add'); };
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
  const [meetingStats,   setMeetingStats]     = useState({ meets_7d: 0, meets_30d: 0 });
  const [scheduleLead, setScheduleLead] = useState(null); // lead to schedule meeting for
  useEffect(() => {
    getLeadRecordingCounts().then(c => setRecordingCounts(c || {})).catch(() => {});
    getRecordingStats().then(s => setRecordingStats(s || { calls_24h: 0, calls_7d: 0, calls_30d: 0 })).catch(() => {});
  }, [recStatus]); // refresh after each recording finishes
  useEffect(() => {
    getMeetingStats().then(s => setMeetingStats(s || { meets_7d: 0, meets_30d: 0 })).catch(() => {});
  }, []);

  // Register Header action buttons
  // eslint-disable-next-line react-hooks/exhaustive-deps
  usePageActions(() => (
    <>
      <button
        onClick={() => exportCSV(filtered)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: 13, background: 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
        title="Export current view to CSV"
      >
        <Download size={13} /> Export
      </button>
      <button
        onClick={() => setShowImport(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: 13, background: 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
      >
        <Upload size={13} /> Import
      </button>
      <button className="btn-primary" onClick={openAdd}><Plus size={15} /> New Lead</button>
    </>
  ), [filtered, setShowImport, openAdd]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>

      {/* ── Search bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search leads…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
      </div>

      {/* ── Segment tabs ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
        {[
          { key: 'inbound', label: 'Inbound', emoji: '📥', accent: 'var(--orange)', accentRaw: '#ff9b26', bg: 'rgba(255,155,38,0.1)', owner: 'Ray' },
          { key: 'cold',    label: 'Cold Calls', emoji: '❄️', accent: '#38bdf8', accentRaw: '#38bdf8', bg: 'rgba(56,189,248,0.1)', owner: 'Stephanie' },
        ].map(seg => {
          const active = activeSegment === seg.key;
          return (
            <button key={seg.key} onClick={() => { setActiveSegment(seg.key); load(); }} style={{
              padding: '8px 16px', border: `1px solid ${active ? (seg.accentRaw + '60') : 'var(--border)'}`,
              cursor: 'pointer', borderRadius: 10,
              background: active ? seg.bg : 'var(--surface-2)',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{seg.emoji}</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: active ? seg.accent : 'var(--text)', fontFamily: 'var(--font-display)' }}>{seg.label}</div>
                <div style={{ fontSize: 10, color: active ? seg.accent : 'var(--muted)', opacity: active ? 0.85 : 1, fontFamily: 'var(--font-display)' }}>{segmentCounts[seg.key]} leads · {seg.owner}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Stats bar ───────────────────────────────────────────────────────── */}
      {(() => {
        const won = leads.filter(l => l.status === 'Won').length;
        const stats = [
          { label: 'Calls (24h)',      value: recordingStats.calls_24h,  icon: '📞', color: '#38bdf8', bg: 'rgba(3,105,161,0.15)' },
          { label: 'Calls (7d)',       value: recordingStats.calls_7d,   icon: '📞', color: '#2dd4bf', bg: 'rgba(45,212,191,0.12)' },
          { label: 'Calls (30d)',      value: recordingStats.calls_30d,  icon: '📞', color: '#a78bfa', bg: 'rgba(139,92,246,0.12)' },
          { label: 'Meets This Week',  value: meetingStats.meets_7d,     icon: '📅', color: '#60a5fa', bg: 'rgba(59,130,246,0.12)' },
          { label: 'Meets (30d)',      value: meetingStats.meets_30d,    icon: '📅', color: '#38bdf8', bg: 'rgba(14,165,233,0.12)' },
          { label: 'Leads Won',        value: won,                      icon: '🏆', color: '#34d399', bg: 'rgba(4,120,87,0.12)' },
        ];
        return (
          <div style={{ padding: '12px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
      <div style={{ padding: '12px 20px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {FILTER_TABS.map(tab => {
          const active = activeTab === tab;
          const count = statusCounts[tab] || 0;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 14px', borderRadius: '6px 6px 0 0', border: 'none',
                background: active ? 'rgba(255,155,38,0.1)' : 'transparent',
                color: active ? 'var(--orange)' : 'var(--muted)',
                fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
                borderBottom: active ? '2px solid var(--orange)' : '2px solid transparent',
                marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {tab}
              <span style={{ fontSize: 10, color: active ? 'var(--orange)' : '#b0b0c0', background: active ? '#fff' : 'var(--surface-3)', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>
                {count}
              </span>
            </button>
          );
        })}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10 }}>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 6, fontSize: 12, padding: '5px 8px', cursor: 'pointer', outline: 'none' }}
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
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</div>
        ) : paged.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No leads in this view.</div>
        ) : paged.map(lead => {
          const st = STATUS_STYLES[lead.status] || STATUS_STYLES['New'];
          const pst = PLATFORM_STYLES[lead.lead_source] || null;
          return (
            <div key={lead.id} className="mobile-card" onClick={() => { setDetailLead(lead); setLeadPanelOpen(true); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Avatar name={lead.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="private-value" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{lead.name || '—'}</div>
                  {lead.company && <div className="private-value" style={{ fontSize: 11, color: 'var(--muted)' }}>{lead.company}</div>}
                </div>
                <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 600, background: st.bg, color: st.fg }}>
                  {lead.status || 'New'}
                </span>
              </div>
              {lead.phone && (
                <div className="mobile-card-row">
                  <Phone size={12} style={{ color: 'var(--muted)' }} /> <span className="private-value">{lead.phone}</span>
                </div>
              )}
              {lead.email && (
                <div className="mobile-card-row">
                  <Mail size={12} style={{ color: 'var(--orange)' }} /> <span className="private-value">{lead.email}</span>
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
                <div className="mobile-card-row" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  <Clock size={10} /> Last contact: {formatFollowUp(lastFollowUps[lead.id])}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="table-container desktop-table" style={{ background: 'var(--surface)', margin: 20, borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
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
              <th style={{ minWidth: 160 }}>Product Need</th>
              <th style={{ minWidth: 130 }}>Lead Status</th>
              <th style={{ minWidth: 100 }}>Last Contact</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>
                No leads in this view. {activeTab === 'All Leads' && 'Click "New Lead" to add one.'}
              </td></tr>
            ) : paged.map(lead => (
              <tr
                key={lead.id}
                style={{
                  background: selectedIds.has(lead.id) ? 'rgba(255,155,38,0.08)' : undefined,
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onMouseEnter={() => setHoveredId(lead.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(e) => {
                  if (e.target.closest('input[type="checkbox"]') || e.target.closest('.lead-action-bar') || e.target.closest('button') || e.target.closest('a')) return;
                  setDetailLead(lead);
                  setLeadPanelOpen(true);
                }}
              >
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(lead.id)} onChange={() => toggleSelect(lead.id)} />
                </td>
                <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                  {(() => {
                    const active = isRecordingLead(lead.id);
                    const count = recordingCounts[lead.id] || 0;
                    const processing = processingLeadIds.has(lead.id);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div style={{ position: 'relative' }}>
                          <button
                            title={active ? 'Stop recording' : `Record call${count ? ` (${count} recorded)` : ''}`}
                            onClick={() => active ? stopRecording() : startRecording(lead.id, lead.name)}
                            disabled={recStatus === 'saving' || recStatus === 'requesting'}
                            style={{
                              width: 28, height: 28, borderRadius: '50%', border: 'none',
                              cursor: recStatus === 'saving' || recStatus === 'requesting' ? 'not-allowed' : 'pointer',
                              background: active ? '#FEE2E2' : 'var(--surface-3)',
                              color: active ? '#f87171' : '#8e8ea0',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'all 0.15s',
                              boxShadow: active ? '0 0 0 2px #C0000040' : 'none',
                              animation: active ? 'recPulse 1.2s infinite' : 'none',
                            }}
                            onMouseEnter={e => { if (!active) { e.currentTarget.style.background = '#FFE0E0'; e.currentTarget.style.color = '#f87171'; } }}
                            onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = '#8e8ea0'; } }}
                          >
                            {active ? <MicOff size={12} /> : <Mic size={12} />}
                          </button>
                          {processing && (
                            <span title="Processing call..." style={{
                              position: 'absolute', top: -3, right: -3,
                              width: 9, height: 9, borderRadius: '50%',
                              background: '#E8650A',
                              boxShadow: '0 0 0 0 rgba(232,101,10,0.4)',
                              animation: 'recPulse 1.2s infinite',
                              display: 'block',
                            }} />
                          )}
                        </div>
                        {processing ? (
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--orange)', background: '#FFF5F0', borderRadius: 6, padding: '0px 4px', lineHeight: '14px' }}>
                            AI…
                          </span>
                        ) : count > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface-3)', borderRadius: 6, padding: '0px 4px', lineHeight: '14px' }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div className="private-value" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{lead.name || '—'}</div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                          background: (lead.assigned_to || 'Ray') === 'Stephanie' ? '#E0F2FE' : '#FFF5F0',
                          color: (lead.assigned_to || 'Ray') === 'Stephanie' ? '#0369A1' : '#E8650A',
                          flexShrink: 0,
                        }}>
                          {lead.assigned_to || 'Ray'}
                        </span>
                      </div>
                      {lead.company && <div className="private-value" style={{ fontSize: 11, color: 'var(--muted)' }}>{lead.company}</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <CopyCell value={lead.phone}>
                    <span className="private-value" style={{ fontSize: 12, color: 'var(--muted)' }}>{lead.phone || '—'}</span>
                  </CopyCell>
                </td>
                <td>
                  <CopyCell value={lead.email}>
                    <span className="private-value" style={{ fontSize: 12, color: 'var(--muted)' }}>{lead.email || '—'}</span>
                  </CopyCell>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <PlatformChip
                    value={lead.lead_source || ''}
                    onChange={(val) => handleFieldSave(lead.id, 'lead_source', val)}
                  />
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <ProductNeedChip
                    value={lead.product_need || ''}
                    onChange={(val) => handleFieldSave(lead.id, 'product_need', val)}
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
                    <span style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Clock size={10} /> {formatFollowUp(lastFollowUps[lead.id])}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                  )}
                </td>

                {hoveredId === lead.id && (
                  <td style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', padding: 0, border: 'none', width: 'auto', background: 'transparent' }}>
                    <div
                      className="lead-action-bar"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 2,
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '3px 4px',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {lead.email && (
                        <button aria-label="Send email" onClick={() => handleEmail(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--orange)', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
                          <Mail size={14} />
                        </button>
                      )}
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} aria-label="Call"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--orange)', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center', textDecoration: 'none' }}
                          onClick={e => e.stopPropagation()}>
                          <Phone size={14} />
                        </a>
                      )}
                      <button aria-label="Interested" onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'up' ? null : 'up')}
                        style={{
                          background: lead.interest === 'up' ? 'rgba(74,108,247,0.12)' : 'none',
                          border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px 7px',
                          color: lead.interest === 'up' ? 'var(--orange)' : '#8e8ea0',
                          display: 'flex', alignItems: 'center',
                        }}>
                        <ThumbsUp size={13} />
                      </button>
                      <button aria-label="Not interested" onClick={() => handleFieldSave(lead.id, 'interest', lead.interest === 'down' ? null : 'down')}
                        style={{
                          background: lead.interest === 'down' ? 'rgba(255,92,92,0.12)' : 'none',
                          border: 'none', borderRadius: 5, cursor: 'pointer', padding: '5px 7px',
                          color: lead.interest === 'down' ? '#ff5c5c' : '#8e8ea0',
                          display: 'flex', alignItems: 'center',
                        }}>
                        <ThumbsDown size={13} />
                      </button>
                      {lead.status !== 'Won' && (
                        <button aria-label="Move to Contacts" onClick={() => openConvert(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
                          <UserPlus size={14} />
                        </button>
                      )}
                      {lead.email && (
                        <button aria-label="Add to Email List" onClick={() => setEmailListLead(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--orange)'; e.currentTarget.style.background = 'rgba(255,155,38,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#8e8ea0'; e.currentTarget.style.background = 'none'; }}
                        >
                          <ListPlus size={14} />
                        </button>
                      )}
                      <button aria-label="Delete" onClick={() => openDelete(lead)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '5px 7px', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
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
            padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
              Rows Per Page
              <select
                value={pageSize}
                onChange={e => setPageSize(Number(e.target.value))}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '4px 8px', fontSize: 12, cursor: 'pointer', outline: 'none' }}
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setPage(1)} disabled={page === 1}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 5, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? 'var(--muted)' : '#8e8ea0', fontSize: 12 }}>
                «
              </button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 5, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? 'var(--muted)' : '#8e8ea0', fontSize: 12 }}>
                <ChevronLeft size={12} />
              </button>
              <span style={{ padding: '4px 10px', fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                {page} / {totalPages}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 5, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? 'var(--muted)' : '#8e8ea0', fontSize: 12 }}>
                <ChevronRight size={12} />
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                style={{ padding: '4px 8px', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 5, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? 'var(--muted)' : '#8e8ea0', fontSize: 12 }}>
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

      {detailLead && (() => {
        const idx = filtered.findIndex(l => l.id === detailLead.id);
        const hasPrev = idx > 0;
        const hasNext = idx >= 0 && idx < filtered.length - 1;
        return (
          <LeadDetailPanel
            lead={detailLead}
            onClose={() => { setDetailLead(null); setLeadPanelOpen(false); }}
            onFieldSave={handleFieldSave}
            onSaveAll={handleSaveAllFields}
            statuses={LEAD_STATUSES}
            onEmail={handleEmail}
            onSchedule={(lead) => { setScheduleLead(lead); }}
            onAddToList={(lead) => setEmailListLead(lead)}
            lastFollowUp={lastFollowUps[detailLead.id]}
            convos={detailConvos}
            recordings={detailRecordings}
            scripts={scripts}
            onPrev={hasPrev ? () => setDetailLead(filtered[idx - 1]) : undefined}
            onNext={hasNext ? () => setDetailLead(filtered[idx + 1]) : undefined}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onScriptSaved={(id, script) => {
              setLeads(ls => ls.map(l => l.id === id ? { ...l, ai_script: script } : l));
              setDetailLead(d => d && d.id === id ? { ...d, ai_script: script } : d);
            }}
          />
        );
      })()}

      {showImport && (
        <BulkImport onClose={() => setShowImport(false)} onImported={() => { load(); setShowImport(false); }} />
      )}

      {scheduleLead && (
        <ScheduleMeetingModal
          initialTitle={`VernonTM 30 Minute Call w/ ${scheduleLead.name || 'Lead'}`}
          initialLeadName={scheduleLead.name || ''}
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
            // Refresh meeting stats
            getMeetingStats().then(s => setMeetingStats(s || { meets_7d: 0, meets_30d: 0 })).catch(() => {});
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
              <select className="form-select" value={form.lead_source} onChange={e => {
                const src = e.target.value;
                const seg = segmentFromSource(src);
                setForm(f => ({ ...f, lead_source: src, segment: seg, assigned_to: assignedFromSegment(seg) }));
              }}>
                {LEAD_SOURCES.map(s => <option key={s}>{s || '— Select —'}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Segment</label>
              <select className="form-select" value={form.segment || 'inbound'} onChange={e => {
                const seg = e.target.value;
                setForm(f => ({ ...f, segment: seg, assigned_to: assignedFromSegment(seg) }));
              }}>
                <option value="inbound">📥 Inbound</option>
                <option value="cold">❄️ Cold Call</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned To</label>
              <select className="form-select" value={form.assigned_to || 'Ray'} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
                <option value="Ray">Ray</option>
                <option value="Stephanie">Stephanie</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Product / Service Need</label>
            <select className="form-select" value={form.product_need || ''} onChange={e => setForm(f => ({ ...f, product_need: e.target.value }))}>
              <option value="">— Select —</option>
              {PRODUCT_NEEDS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
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
          <p style={{ color: 'var(--muted)' }}>Delete <strong style={{ color: 'var(--text)' }}>{selected?.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
      {modal === 'convert' && (
        <Modal title="Move to Contacts" onClose={() => setModal(null)} onSubmit={handleConvert} submitLabel="Convert to Contact">
          <p style={{ color: 'var(--muted)' }}>Move <strong style={{ color: 'var(--text)' }}>{selected?.name}</strong> to Contacts?</p>
        </Modal>
      )}

      {emailListLead && (
        <EmailListModal
          lead={emailListLead}
          onClose={() => setEmailListLead(null)}
          onSuccess={() => {
            setEmailListLead(null);
            showToast(`${emailListLead.name || 'Lead'} added to email list ✓`);
          }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--orange)', color: 'var(--text)',
          padding: '10px 20px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}>
          <Check size={14} color="var(--orange)" /> {toast}
        </div>
      )}

      {/* ── Floating Scripts Button ──────────────────────────────────────── */}
      {!detailLead && (
        <button
          onClick={() => setScriptsModalOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 18px', borderRadius: 30, fontWeight: 700, fontSize: 13,
            background: 'var(--surface)', color: '#fff', border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
          }}
        >
          <FileText size={15} /> Call Scripts
        </button>
      )}

      {/* ── Scripts Browse Modal ─────────────────────────────────────────── */}
      {scriptsModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <div onClick={() => setScriptsModalOpen(false)} style={{ position: 'absolute', inset: 0 }} />
          <div style={{ position: 'relative', width: 520, maxHeight: '85vh', background: 'var(--surface)', borderRadius: '12px 12px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)' }}>
              <FileText size={16} color="#ff9b26" />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff', flex: 1 }}>Call Scripts</span>
              <button onClick={() => setScriptsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {scripts.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No scripts found.</div>
              ) : scripts.map(s => <ScriptBrowseRow key={s.id} script={s} />)}
            </div>
          </div>
        </div>
      )}

      {/* ── Processing-complete notifications ────────────────────────────── */}
      <div style={{ position: 'fixed', bottom: 24, right: detailLead ? 24 : 140, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
        {processedNotifs.map(n => (
          <div key={n.id} style={{
            background: 'var(--surface)', color: '#fff', borderRadius: 10,
            padding: '12px 16px', minWidth: 260, maxWidth: 340,
            boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'flex-start', gap: 12,
            animation: 'slideInRight 0.25s ease',
          }}>
            <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>✅</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Call processed</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.leadName || 'Lead'} — summary ready
              </div>
            </div>
            <button onClick={() => setProcessedNotifs(ns => ns.filter(x => x.id !== n.id))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
