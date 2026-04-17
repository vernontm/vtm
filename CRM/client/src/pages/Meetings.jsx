import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar, Plus, Video, Edit2, Trash2, Check, Sparkles, Link as LinkIcon,
  Search, X, Loader, ChevronDown, ChevronRight, RefreshCw, AlertCircle,
  ExternalLink,
} from 'lucide-react';
import {
  getUpcomingMeetings, getPastMeetings, deleteMeeting,
  getMeetingLeadLinks, createMeetingLeadLink, deleteMeetingLeadLink,
  getLeads, syncMeetings,
} from '../api';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal';

// ── Constants ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4a6cf7', '#4a6cf7', '#fdab3d', '#784bd1', '#ff5c5c', '#00d1d1'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
  } catch { return iso; }
}

function formatDuration(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

// ── Lead status colour helper ──────────────────────────────────────────────────
const LEAD_STATUS_COLORS = {
  'New':            { bg: '#4a6cf722', fg: '#4a6cf7' },
  'Contacted':      { bg: '#fdab3d22', fg: '#fdab3d' },
  'Call Scheduled': { bg: '#784bd122', fg: '#784bd1' },
  'Called':         { bg: '#CCFBF1',   fg: '#0F766E' },
  'Won':            { bg: '#00d1d122', fg: '#00a8a8' },
  'Not Interested': { bg: '#ff5c5c22', fg: '#ff5c5c' },
  'Follow Up':      { bg: '#fdab3d22', fg: '#d97706' },
};

// ── Participant Avatars with hover card ────────────────────────────────────────
function ParticipantAvatars({ participants = [], max = 4, allLeads = [] }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const shown = participants.slice(0, max);
  const extra = participants.length - max;

  function findLead(p) {
    if (!p.email) return null;
    return allLeads.find(l => l.email?.toLowerCase() === p.email.toLowerCase()) || null;
  }

  return (
    <div style={{ display: 'flex' }}>
      {shown.map((p, i) => {
        const initial     = (p.name || p.email || '?')[0].toUpperCase();
        const color       = AVATAR_COLORS[i % AVATAR_COLORS.length];
        const matchedLead = findLead(p);
        const statusStyle = matchedLead?.status ? (LEAD_STATUS_COLORS[matchedLead.status] || { bg: '#e5e7ef', fg: '#8e8ea0' }) : null;
        return (
          <div
            key={i}
            style={{ position: 'relative', marginLeft: i > 0 ? -6 : 0, zIndex: hoveredIdx === i ? 50 : shown.length - i }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: color + '25', border: `2px solid ${color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color, cursor: 'default',
            }}>
              {initial}
            </div>

            {/* Hover card — appears below to avoid clipping */}
            {hoveredIdx === i && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
                background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 10, padding: '10px 13px',
                minWidth: 190, zIndex: 9999, boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
                pointerEvents: 'none', whiteSpace: 'nowrap',
              }}>
                {/* Arrow */}
                <div style={{
                  position: 'absolute', top: -5, left: '50%',
                  width: 8, height: 8, background: '#ffffff', border: '1px solid #e5e7ef',
                  borderBottom: 'none', borderRight: 'none',
                  transform: 'translateX(-50%) rotate(45deg)',
                }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: color + '25', border: `2px solid ${color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color, flexShrink: 0,
                  }}>
                    {initial}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3 }}>
                      {p.name && p.name !== p.email ? p.name : (p.email || '?')}
                    </div>
                    {p.name && p.name !== p.email && p.email && (
                      <div style={{ fontSize: 11, color: '#8e8ea0' }}>{p.email}</div>
                    )}
                  </div>
                </div>
                {matchedLead && (
                  <div style={{ borderTop: '1px solid #f0f0f5', paddingTop: 7, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {matchedLead.phone && (
                      <div style={{ fontSize: 11, color: '#8e8ea0' }}>📞 {matchedLead.phone}</div>
                    )}
                    {matchedLead.company && (
                      <div style={{ fontSize: 11, color: '#8e8ea0' }}>🏢 {matchedLead.company}</div>
                    )}
                    {matchedLead.status && (
                      <div style={{ marginTop: 2 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8,
                          background: statusStyle.bg, color: statusStyle.fg,
                        }}>
                          {matchedLead.status}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {extra > 0 && (
        <div style={{
          width: 26, height: 26, borderRadius: '50%', background: '#e5e7ef',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: '#8e8ea0', marginLeft: -6, position: 'relative',
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
// ── Status badge for past meetings ────────────────────────────────────────────
function MeetingStatusBadge({ status }) {
  const map = {
    summarized:   { color: '#4a6cf7', label: 'Summarized' },
    processing:   { color: '#fdab3d', label: 'Processing…' },
    recorded:     { color: '#4a6cf7', label: 'Recording Found' },
    no_recording: { color: '#8e8ea0', label: 'No Recording' },
  };
  const s = map[status];
  if (!s) return <span style={{ fontSize: 12, color: '#8e8ea0' }}>— No recording</span>;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: s.color + '22', color: s.color, border: `1px solid ${s.color}44`,
    }}>
      {s.label}
    </span>
  );
}

export default function Meetings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab]         = useState('upcoming');
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [pastEvents, setPastEvents]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');
  const [syncing, setSyncing]             = useState(false);

  const [showScheduleModal, setShowScheduleModal]   = useState(false);
  const [editingEvent, setEditingEvent]             = useState(null);
  const [expandedPastId, setExpandedPastId]         = useState(null);

  // Link to Lead
  const [showLinkModal, setShowLinkModal]   = useState(false);
  const [linkingEvent, setLinkingEvent]     = useState(null);
  const [leads, setLeads]                   = useState([]);
  const [leadLinks, setLeadLinks]           = useState([]);
  const [leadSearch, setLeadSearch]         = useState('');
  const [linkingLeadId, setLinkingLeadId]   = useState('');

  const [toast, setToast]   = useState('');

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadUpcoming = useCallback(async () => {
    try {
      const data = await getUpcomingMeetings();
      setUpcomingEvents(data);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  const loadPast = useCallback(async () => {
    try {
      const data = await getPastMeetings();
      setPastEvents(data);
    } catch (e) {
      // Only set error if not already set by loadUpcoming (same issue)
      if (!error) setError(e.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadUpcoming(), loadPast()]).finally(() => setLoading(false));
    getLeads().then(setLeads).catch(() => {});
    getMeetingLeadLinks().then(setLeadLinks).catch(() => {});
  }, []);

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // ── Sync ─────────────────────────────────────────────────────────────────
  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncMeetings();
      await Promise.all([loadUpcoming(), loadPast()]);
      showToast(`✓ Synced ${result.total} meetings`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  // ── Delete meeting ────────────────────────────────────────────────────────
  async function handleDelete(event) {
    if (!window.confirm(`Cancel "${event.title}"? This will remove it from Google Calendar and notify attendees.`)) return;
    try {
      await deleteMeeting(event.google_event_id);
      setUpcomingEvents(prev => prev.filter(e => e.google_event_id !== event.google_event_id));
      showToast('Meeting cancelled');
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  }

  // ── Link to Lead ──────────────────────────────────────────────────────────
  function openLinkModal(event) {
    setLinkingEvent(event);
    setLeadSearch('');
    setLinkingLeadId('');
    setShowLinkModal(true);
  }

  async function handleLinkLead(lead) {
    if (!linkingEvent) return;
    setLinkingLeadId(lead.id);
    try {
      const link = await createMeetingLeadLink({
        meeting_id:      linkingEvent.google_event_id,
        google_event_id: linkingEvent.google_event_id,
        lead_id:         lead.id,
      });
      setLeadLinks(prev => [...prev, link]);
      setShowLinkModal(false);
      showToast(`Linked to ${lead.name || lead.email}`);
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setLinkingLeadId('');
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const isApiDisabled    = error === 'CALENDAR_API_DISABLED';
  const isReconnectError = error === 'CALENDAR_RECONNECT_NEEDED';

  const filteredLeads = leads.filter(l => {
    const q = leadSearch.toLowerCase();
    return (l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q);
  });

  function getLinkedLeads(googleEventId) {
    const links = leadLinks.filter(l => l.google_event_id === googleEventId);
    return links.map(link => leads.find(l => l.id === link.lead_id)).filter(Boolean);
  }

  // ── Tab style helper ───────────────────────────────────────────────────────
  function tabStyle(tab) {
    const active = activeTab === tab;
    return {
      padding: '10px 18px', cursor: 'pointer', fontSize: 14, fontWeight: active ? 700 : 500,
      color: active ? '#fff' : '#8e8ea0', background: 'none', border: 'none',
      borderBottom: `2px solid ${active ? '#4a6cf7' : 'transparent'}`,
      transition: 'color 0.15s, border-color 0.15s',
    };
  }

  // ── TABLE STYLES ──────────────────────────────────────────────────────────
  const thStyle = { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', background: '#ffffff', borderBottom: '1px solid #e5e7ef' };
  const tdStyle = { padding: '12px 14px', borderBottom: '1px solid #ffffff', fontSize: 13, color: '#8e8ea0', verticalAlign: 'middle' };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, minHeight: '100%', background: '#f5f7fa' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Calendar size={22} color="#4a6cf7" />
          <span style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>Meetings</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '7px 12px' }}
          >
            <RefreshCw size={13} style={{ animation: syncing ? 'spin 0.7s linear infinite' : 'none' }} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 16px' }}
          >
            <Plus size={14} /> Schedule Meeting
          </button>
        </div>
      </div>

      {/* Calendar API not enabled in Google Cloud */}
      {isApiDisabled && (
        <div style={{ background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertCircle size={15} color="#ff5c5c" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#ff5c5c', marginBottom: 4 }}>
              Google Calendar API is not enabled
            </div>
            <div style={{ fontSize: 12, color: '#8e8ea0', lineHeight: 1.6 }}>
              You need to enable the Calendar API in your Google Cloud Console, then reconnect your account.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <a
                href="https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=582263175613"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: '#1a1a2e', background: '#ff5c5c', padding: '4px 12px', borderRadius: 5, textDecoration: 'none', fontWeight: 600 }}
              >
                Enable Calendar API →
              </a>
              <Link to="/settings" style={{ fontSize: 12, color: '#4a6cf7', fontWeight: 600, textDecoration: 'none', padding: '4px 0' }}>
                Then Reconnect in Settings →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* OAuth reconnect needed */}
      {isReconnectError && (
        <div style={{ background: '#fdab3d15', border: '1px solid #fdab3d40', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={15} color="#fdab3d" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#fdab3d', flex: 1 }}>
            Google Calendar needs additional permissions.
          </span>
          <Link to="/settings" style={{ fontSize: 12, color: '#4a6cf7', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
            Reconnect in Settings →
          </Link>
        </div>
      )}

      {/* Generic error */}
      {error && !isApiDisabled && !isReconnectError && (
        <div style={{ background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#ff5c5c' }}>
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid #e5e7ef', marginBottom: 0, display: 'flex' }}>
        <button style={tabStyle('upcoming')} onClick={() => setActiveTab('upcoming')}>
          Upcoming
          {upcomingEvents.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 11, background: '#4a6cf725', color: '#4a6cf7', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
              {upcomingEvents.length}
            </span>
          )}
        </button>
        <button style={tabStyle('past')} onClick={() => setActiveTab('past')}>
          Past Meetings
          {pastEvents.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 11, background: '#e5e7ef', color: '#8e8ea0', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
              {pastEvents.length}
            </span>
          )}
        </button>
      </div>

      {/* Content panel */}
      <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderTop: 'none', borderRadius: '0 0 12px 12px' }}>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#8e8ea0', gap: 10 }}>
            <Loader size={18} style={{ animation: 'spin 0.7s linear infinite' }} />
            Loading meetings…
          </div>
        ) : activeTab === 'upcoming' ? (

          /* ── UPCOMING TAB ── */
          upcomingEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8e8ea0' }}>
              <Calendar size={42} style={{ opacity: 0.25, marginBottom: 14 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No upcoming meetings</div>
              <div style={{ fontSize: 13 }}>Click "Schedule Meeting" to create one.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Participants</th>
                    <th style={thStyle}>Date & Time</th>
                    <th style={thStyle}>Duration</th>
                    <th style={thStyle}>Meet Link</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingEvents.map(event => {
                    const linkedLeads = getLinkedLeads(event.google_event_id);
                    return (
                    <tr
                      key={event.google_event_id}
                      onClick={() => navigate(`/meetings/${event.google_event_id}`)}
                      style={{ transition: 'background 0.1s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f5f7fa'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#1a1a2e', maxWidth: 240 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {event.title}
                        </div>
                        {event.description && (
                          <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {event.description}
                          </div>
                        )}
                        {/* Linked leads */}
                        {linkedLeads.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                            {linkedLeads.map(lead => {
                              const sc = LEAD_STATUS_COLORS[lead.status] || { bg: '#e5e7ef', fg: '#8e8ea0' };
                              return (
                                <span
                                  key={lead.id}
                                  onClick={e => { e.stopPropagation(); navigate(`/leads?highlight=${lead.id}`); }}
                                  title={lead.email || ''}
                                  style={{
                                    fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 8,
                                    background: sc.bg, color: sc.fg, cursor: 'pointer',
                                    border: `1px solid ${sc.fg}33`,
                                  }}
                                >
                                  {lead.name || lead.email || 'Lead'}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        <ParticipantAvatars participants={event.participants || []} allLeads={leads} />
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDateTime(event.start_time)}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDuration(event.duration_minutes)}</td>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        {event.meet_link ? (
                          <button
                            onClick={() => window.open(event.meet_link, '_blank')}
                            className="btn-green"
                            style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                          >
                            <Video size={11} /> Join
                          </button>
                        ) : (
                          <span style={{ color: '#e5e7ef', fontSize: 16 }}>—</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setEditingEvent(event); setShowScheduleModal(true); }}
                            className="btn-ghost"
                            title="Edit"
                            style={{ padding: '5px 8px', display: 'flex', alignItems: 'center' }}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(event)}
                            className="btn-ghost"
                            title="Cancel meeting"
                            style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', color: '#ff5c5c' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )

        ) : (

          /* ── PAST TAB ── */
          pastEvents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8e8ea0' }}>
              <Calendar size={42} style={{ opacity: 0.25, marginBottom: 14 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No past meetings found</div>
              <div style={{ fontSize: 13 }}>Meetings from the last 30 days will appear here.</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 28 }}></th>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Participants</th>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Duration</th>
                    <th style={thStyle}>Recording</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pastEvents.map(event => {
                    const isExpanded = expandedPastId === event.google_event_id;
                    const linkedLeads = getLinkedLeads(event.google_event_id);
                    return (
                      <React.Fragment key={event.google_event_id}>
                        <tr
                          onClick={() => setExpandedPastId(isExpanded ? null : event.google_event_id)}
                          style={{ cursor: 'pointer', transition: 'background 0.1s', background: isExpanded ? '#ffffff' : 'transparent' }}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#ffffff'; }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ ...tdStyle, color: '#8e8ea0', width: 28 }}>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#1a1a2e', maxWidth: 200 }}>
                            {/* Title — click navigates to detail page, stops row expand */}
                            <div
                              onClick={e => { e.stopPropagation(); navigate(`/meetings/${event.google_event_id}`); }}
                              title="View meeting details"
                              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#4a6cf7'}
                              onMouseLeave={e => e.currentTarget.style.color = '#fff'}
                            >
                              {event.title}
                            </div>
                          </td>
                          <td style={tdStyle}>
                            <ParticipantAvatars participants={event.participants || []} allLeads={leads} />
                          </td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(event.start_time)}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDuration(event.duration_minutes)}</td>
                          <td style={tdStyle}>
                            <MeetingStatusBadge status={event.status} />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button
                                onClick={() => openLinkModal(event)}
                                className="btn-ghost"
                                title="Link to Lead"
                                style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                              >
                                <LinkIcon size={12} />
                                {linkedLeads.length > 0 ? `${linkedLeads.length} linked` : 'Link Lead'}
                              </button>
                              <button
                                onClick={() => navigate(`/meetings/${event.google_event_id}`)}
                                className="btn-ghost"
                                title="View details"
                                style={{ padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                              >
                                <ExternalLink size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>

                        {/* Expanded detail row */}
                        {isExpanded && (
                          <tr style={{ background: '#1a1d2e' }}>
                            <td colSpan={7} style={{ padding: '14px 20px 18px', borderBottom: '1px solid #e5e7ef' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

                                {/* Meeting info */}
                                <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 10, padding: '14px 16px' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Meeting Info</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 6 }}>{event.title}</div>
                                  {event.description && (
                                    <div style={{ fontSize: 12, color: '#8e8ea0', marginBottom: 8, lineHeight: 1.5 }}>{event.description}</div>
                                  )}
                                  <div style={{ fontSize: 11, color: '#8e8ea0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <div><span style={{ color: '#8e8ea0' }}>Start:</span> {formatDateTime(event.start_time)}</div>
                                    <div><span style={{ color: '#8e8ea0' }}>Duration:</span> {formatDuration(event.duration_minutes)}</div>
                                  </div>
                                  {event.participants?.length > 0 && (
                                    <div style={{ marginTop: 10 }}>
                                      <div style={{ fontSize: 11, color: '#8e8ea0', marginBottom: 5 }}>Participants</div>
                                      {event.participants.map((p, i) => (
                                        <div key={i} style={{ fontSize: 11, color: '#8e8ea0', padding: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length] + '30', border: `1px solid ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: AVATAR_COLORS[i % AVATAR_COLORS.length], flexShrink: 0 }}>
                                            {(p.name || p.email)[0].toUpperCase()}
                                          </div>
                                          <span className="private-value">{p.name !== p.email && p.name ? `${p.name} (${p.email})` : p.email}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {linkedLeads.length > 0 && (
                                    <div style={{ marginTop: 10, borderTop: '1px solid #e5e7ef', paddingTop: 8 }}>
                                      <div style={{ fontSize: 11, color: '#8e8ea0', marginBottom: 5 }}>Linked Leads</div>
                                      {linkedLeads.map(lead => (
                                        <div key={lead.id} className="private-value" style={{ fontSize: 11, color: '#4a6cf7', padding: '1px 0' }}>
                                          {lead.name || lead.email}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* View Full Details card */}
                                <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 10, padding: '20px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: 16, marginBottom: 4 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: event.status === 'summarized' ? 1 : 0.4 }}>
                                      <Sparkles size={18} color="#784bd1" />
                                      <span style={{ fontSize: 10, color: '#784bd1', fontWeight: 600 }}>AI Summary</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: event.status === 'recorded' || event.status === 'summarized' ? 1 : 0.4 }}>
                                      <Video size={18} color="#4a6cf7" />
                                      <span style={{ fontSize: 10, color: '#4a6cf7', fontWeight: 600 }}>Recording</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4a6cf7" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                      <span style={{ fontSize: 10, color: '#4a6cf7', fontWeight: 600 }}>Sidekick</span>
                                    </div>
                                  </div>
                                  <div style={{ fontSize: 12, color: '#8e8ea0', lineHeight: 1.6 }}>
                                    Generate AI summaries, find recordings, and chat with the Meeting Sidekick on the full details page.
                                  </div>
                                  <button
                                    onClick={() => navigate(`/meetings/${event.google_event_id}`)}
                                    className="btn-primary"
                                    style={{ fontSize: 12, padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6 }}
                                  >
                                    <ExternalLink size={12} /> View Full Details
                                  </button>
                                </div>

                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ── Link to Lead Modal ────────────────────────────────────────────────── */}
      {showLinkModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 8000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowLinkModal(false); }}
        >
          <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 12, width: 440, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <LinkIcon size={15} color="#4a6cf7" />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>Link to Lead</span>
              </div>
              <button onClick={() => setShowLinkModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}><X size={17} /></button>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7ef', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
                <input
                  style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 6, fontSize: 13, color: '#1a1a2e', background: '#f5f7fa', border: '1px solid #e5e7ef', outline: 'none', boxSizing: 'border-box' }}
                  placeholder="Search leads by name or email…"
                  value={leadSearch}
                  onChange={e => setLeadSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filteredLeads.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0', fontSize: 13 }}>No leads found</div>
              ) : filteredLeads.map(lead => (
                <div
                  key={lead.id}
                  onClick={() => handleLinkLead(lead)}
                  style={{ padding: '11px 16px', borderBottom: '1px solid #ffffff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#ffffff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{lead.name || '(no name)'}</div>
                    <div style={{ fontSize: 11, color: '#8e8ea0' }}>{lead.email || ''}</div>
                  </div>
                  {linkingLeadId === lead.id ? (
                    <Loader size={13} color="#4a6cf7" style={{ animation: 'spin 0.7s linear infinite' }} />
                  ) : (
                    <div style={{ fontSize: 11, color: '#4a6cf7' }}>Link →</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule / Edit Modal ─────────────────────────────────────────────── */}
      {showScheduleModal && (
        <ScheduleMeetingModal
          onClose={() => { setShowScheduleModal(false); setEditingEvent(null); }}
          onComplete={() => {
            loadUpcoming();
            showToast('Meeting scheduled successfully');
          }}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9000,
          background: '#ffffff', border: '1px solid #4a6cf7',
          color: '#8e8ea0', padding: '10px 20px', borderRadius: 8,
          fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={14} color="#4a6cf7" /> {toast}
        </div>
      )}
    </div>
  );
}
