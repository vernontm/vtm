import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Video, Sparkles, Users, FileText,
  Send, Loader, Check, X, Link as LinkIcon,
  ChevronRight, MessageSquare, Trash2, Search, ExternalLink,
  AlertCircle,
} from 'lucide-react';
import {
  getMeetingDetail, saveMeetingNotes, findMeetingRecording,
  summarizeMeeting, askMeetingSidekick, clearMeetingChat,
  getLeads, createMeetingLeadLink,
} from '../api';

// ── Constants ────────────────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4a6cf7', '#4a6cf7', '#fdab3d', '#784bd1', '#ff5c5c', '#00d1d1'];

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(new Date(iso));
  } catch { return iso; }
}

function formatDuration(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function StatusBadge({ status }) {
  const map = {
    summarized:   { color: '#4a6cf7', label: 'Summarized' },
    processing:   { color: '#fdab3d', label: 'Processing…' },
    recorded:     { color: '#4a6cf7', label: 'Recording Found' },
    no_recording: { color: '#8e8ea0', label: 'No Recording' },
  };
  const s = map[status] || { color: '#8e8ea0', label: 'Pending' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: s.color + '22', color: s.color, border: `1px solid ${s.color}44`,
    }}>
      {s.label}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MeetingDetail() {
  const { eventId }  = useParams();
  const navigate     = useNavigate();

  const [meeting,      setMeeting]      = useState(null);
  const [summary,      setSummary]      = useState(null);
  const [chat,         setChat]         = useState([]);
  const [linkedLeads,  setLinkedLeads]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [activeTab,    setActiveTab]    = useState('overview');

  // Notes
  const [notes,       setNotes]       = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved,  setNotesSaved]  = useState(false);

  // Recording
  const [findingRecording, setFindingRecording] = useState(false);

  // Summarize
  const [summarizing, setSummarizing] = useState(false);

  // Sidekick chat
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]); // conversation context for API
  const chatEndRef = useRef(null);

  // Link to Lead modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [allLeads,      setAllLeads]      = useState([]);
  const [leadSearch,    setLeadSearch]    = useState('');
  const [linkingLeadId, setLinkingLeadId] = useState('');

  // Toast
  const [toast, setToast] = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async () => {
    try {
      const data = await getMeetingDetail(eventId);
      setMeeting(data.meeting);
      setSummary(data.summary);
      setChat(data.chat || []);
      setLinkedLeads(data.linkedLeads || []);
      setNotes(data.meeting.notes || '');
      // Build conversation context from saved chat history
      const hist = (data.chat || []).map(m => ({ role: m.role, content: m.content }));
      setChatHistory(hist);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadDetail();
    getLeads().then(setAllLeads).catch(() => {});
  }, [loadDetail]);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  // ── Save notes ────────────────────────────────────────────────────────────
  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      await saveMeetingNotes(eventId, notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch (e) {
      showToast('Error saving notes: ' + e.message);
    } finally {
      setSavingNotes(false);
    }
  }

  // ── Find recording ────────────────────────────────────────────────────────
  async function handleFindRecording() {
    setFindingRecording(true);
    try {
      const result = await findMeetingRecording(eventId);
      if (result.found) {
        setMeeting(prev => ({
          ...prev,
          drive_recording_url: result.recording.previewUrl,
          drive_web_view_url:  result.recording.webViewLink,
          status: 'recorded',
        }));
        showToast('✓ Recording found!');
      } else {
        showToast('No recording found in your Drive folder');
      }
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setFindingRecording(false);
    }
  }

  // ── Summarize ─────────────────────────────────────────────────────────────
  async function handleSummarize() {
    setSummarizing(true);
    setMeeting(prev => ({ ...prev, status: 'processing' }));
    try {
      const result = await summarizeMeeting(eventId);
      setSummary(result);
      setMeeting(prev => ({ ...prev, status: 'summarized' }));
      showToast('✓ AI summary generated!');
    } catch (e) {
      setMeeting(prev => ({ ...prev, status: 'no_recording' }));
      showToast('Error generating summary: ' + e.message);
    } finally {
      setSummarizing(false);
    }
  }

  // ── Sidekick chat ──────────────────────────────────────────────────────────
  async function handleSendChat(e) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || chatLoading) return;

    const userMsg = { id: Date.now() + '_u', role: 'user', content: q };
    setChat(prev => [...prev, userMsg]);
    setChatHistory(prev => [...prev, { role: 'user', content: q }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await askMeetingSidekick(eventId, q, chatHistory);
      const assistantMsg = { id: Date.now() + '_a', role: 'assistant', content: res.answer };
      setChat(prev => [...prev, assistantMsg]);
      setChatHistory(prev => [...prev, { role: 'assistant', content: res.answer }]);
    } catch (e2) {
      const errMsg = { id: Date.now() + '_e', role: 'assistant', content: '⚠ Error: ' + e2.message };
      setChat(prev => [...prev, errMsg]);
    } finally {
      setChatLoading(false);
    }
  }

  async function handleClearChat() {
    if (!window.confirm('Clear all Sidekick chat history for this meeting?')) return;
    try {
      await clearMeetingChat(eventId);
      setChat([]);
      setChatHistory([]);
      showToast('Chat history cleared');
    } catch (e) {
      showToast('Error: ' + e.message);
    }
  }

  // ── Link to Lead ──────────────────────────────────────────────────────────
  async function handleLinkLead(lead) {
    if (!meeting) return;
    setLinkingLeadId(lead.id);
    try {
      await createMeetingLeadLink({
        meeting_id:      meeting.google_event_id,
        google_event_id: meeting.google_event_id,
        lead_id:         lead.id,
      });
      setLinkedLeads(prev => [...prev, lead]);
      setShowLinkModal(false);
      showToast(`✓ Linked to ${lead.name || lead.email}`);
    } catch (e) {
      showToast('Error: ' + e.message);
    } finally {
      setLinkingLeadId('');
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const tabStyle = (tab) => {
    const active = activeTab === tab;
    return {
      padding: '10px 16px', cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? '#fff' : '#8e8ea0', background: 'none', border: 'none',
      borderBottom: `2px solid ${active ? '#4a6cf7' : 'transparent'}`,
      transition: 'color 0.15s, border-color 0.15s',
      display: 'flex', alignItems: 'center', gap: 6,
    };
  };

  const filteredLeads = allLeads.filter(l => {
    const q = leadSearch.toLowerCase();
    return (l.name || '').toLowerCase().includes(q) || (l.email || '').toLowerCase().includes(q);
  });

  const recordingUrl = meeting?.drive_recording_url || null;
  const webViewUrl   = meeting?.drive_web_view_url  || null;

  // ── Loading / Error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, background: '#f5f7fa', color: '#8e8ea0', gap: 12 }}>
        <Loader size={20} style={{ animation: 'spin 0.7s linear infinite' }} />
        Loading meeting details…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 32, background: '#f5f7fa', minHeight: '100%' }}>
        <button
          onClick={() => navigate('/meetings')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 20, padding: 0 }}
        >
          <ArrowLeft size={15} /> Back to Meetings
        </button>
        <div style={{ background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 10, padding: '16px 20px', color: '#ff5c5c', display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle size={16} /> {error}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#8e8ea0' }}>
          Tip: First <Link to="/meetings" style={{ color: '#4a6cf7' }}>sync the meeting</Link> from the Meetings page, then click its title to view details.
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, minHeight: '100%', background: '#f5f7fa' }}>

      {/* ── Back + Header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => navigate('/meetings')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 14, padding: 0 }}
        >
          <ArrowLeft size={14} /> Back to Meetings
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 21, fontWeight: 800, color: '#1a1a2e', margin: 0 }}>{meeting?.title}</h1>
              <StatusBadge status={meeting?.status} />
            </div>
            <div style={{ fontSize: 12, color: '#8e8ea0', marginTop: 5, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Calendar size={12} /> {formatDateTime(meeting?.start_time)}
              </span>
              <span>⏱ {formatDuration(meeting?.duration_minutes)}</span>
              {meeting?.participants?.length > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Users size={12} /> {meeting.participants.length} participant{meeting.participants.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => { setShowLinkModal(true); setLeadSearch(''); }}
              className="btn-ghost"
              style={{ fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <LinkIcon size={13} />
              {linkedLeads.length > 0 ? `${linkedLeads.length} Lead${linkedLeads.length !== 1 ? 's' : ''}` : 'Link Lead'}
            </button>
            {!recordingUrl && (
              <button
                onClick={handleFindRecording}
                disabled={findingRecording}
                className="btn-ghost"
                style={{ fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                {findingRecording
                  ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} />
                  : <Video size={13} />}
                {findingRecording ? 'Searching…' : 'Find Recording'}
              </button>
            )}
            <button
              onClick={handleSummarize}
              disabled={summarizing}
              className="btn-primary"
              style={{ fontSize: 12, padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {summarizing
                ? <><Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Summarizing…</>
                : <><Sparkles size={13} /> {summary ? 'Re-summarize' : 'Generate Summary'}</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body: Left tabs + Right Sidekick ──────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT PANEL ─────────────────────────────────────────────────── */}
        <div>
          {/* Tab bar */}
          <div style={{
            background: '#ffffff', border: '1px solid #e5e7ef',
            borderRadius: '12px 12px 0 0', borderBottom: 'none', display: 'flex',
          }}>
            <button style={tabStyle('overview')} onClick={() => setActiveTab('overview')}>
              <Sparkles size={13} /> Overview
            </button>
            <button style={tabStyle('participants')} onClick={() => setActiveTab('participants')}>
              <Users size={13} /> Participants
            </button>
            <button style={tabStyle('notes')} onClick={() => setActiveTab('notes')}>
              <FileText size={13} /> Notes
            </button>
          </div>

          {/* Tab content */}
          <div style={{
            background: '#ffffff', border: '1px solid #e5e7ef',
            borderTop: 'none', borderRadius: '0 0 12px 12px',
            padding: 20, minHeight: 400,
          }}>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Recording section */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Video size={12} /> Recording
                  </div>
                  {recordingUrl ? (
                    <div style={{ background: '#f5f7fa', border: '1px solid #e5e7ef', borderRadius: 10, overflow: 'hidden' }}>
                      <iframe
                        src={recordingUrl}
                        title="Meeting Recording"
                        style={{ width: '100%', height: 300, border: 'none', display: 'block' }}
                        allow="autoplay"
                      />
                      {webViewUrl && (
                        <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #e5e7ef' }}>
                          <span style={{ fontSize: 11, color: '#8e8ea0' }}>Recording from Google Drive</span>
                          <a
                            href={webViewUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11, color: '#4a6cf7', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                          >
                            Open in Drive <ExternalLink size={10} />
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 10, padding: '28px 20px', textAlign: 'center' }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e5e7ef', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <Video size={22} color="#8e8ea0" />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#8e8ea0', marginBottom: 6 }}>No Recording Found</div>
                      <div style={{ fontSize: 11, color: '#e5e7ef', marginBottom: 14 }}>
                        Search your Drive folder for a recording of this meeting
                      </div>
                      <button
                        onClick={handleFindRecording}
                        disabled={findingRecording}
                        className="btn-ghost"
                        style={{ fontSize: 12, padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        {findingRecording
                          ? <Loader size={12} style={{ animation: 'spin 0.7s linear infinite' }} />
                          : <Video size={12} />}
                        {findingRecording ? 'Searching Drive…' : 'Find Recording'}
                      </button>
                    </div>
                  )}
                </div>

                {/* AI Summary section */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#784bd1', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={12} /> AI Summary
                  </div>
                  {summarizing ? (
                    <div style={{ background: '#ffffff', border: '1px solid #784bd140', borderRadius: 10, padding: 28, textAlign: 'center' }}>
                      <Loader size={24} color="#784bd1" style={{ animation: 'spin 0.7s linear infinite', marginBottom: 12 }} />
                      <div style={{ fontSize: 13, color: '#784bd1', fontWeight: 600 }}>Generating AI Summary…</div>
                      <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 5 }}>This may take a few seconds</div>
                    </div>
                  ) : summary ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                      {/* Summary title + general summary */}
                      <div style={{ background: '#ffffff', border: '1px solid #784bd130', borderRadius: 10, padding: '16px 18px' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>
                          {summary.summary_title || meeting?.title}
                        </div>
                        <div style={{ fontSize: 13, color: '#8e8ea0', lineHeight: 1.7 }}>
                          {summary.general_summary}
                        </div>
                      </div>

                      {/* Topics */}
                      {summary.topics?.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                            Topics Discussed
                          </div>
                          {summary.topics.map((topic, i) => (
                            <div key={i} style={{ background: '#1a1d2e', border: '1px solid #e5e7ef', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 7 }}>{topic.title}</div>
                              {topic.bullets?.map((b, bi) => (
                                <div key={bi} style={{ fontSize: 12, color: '#8e8ea0', display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start' }}>
                                  <span style={{ color: '#784bd1', flexShrink: 0, marginTop: 1 }}>•</span>
                                  <span>{b}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action Items + Key Decisions */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        {summary.action_items?.length > 0 && (
                          <div style={{ background: '#1a1d2e', border: '1px solid #4a6cf730', borderRadius: 8, padding: '12px 14px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#4a6cf7', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                              Action Items
                            </div>
                            {summary.action_items.map((item, i) => (
                              <div key={i} style={{ fontSize: 12, color: '#8e8ea0', display: 'flex', gap: 7, marginBottom: 6, alignItems: 'flex-start' }}>
                                <Check size={11} color="#4a6cf7" style={{ marginTop: 2, flexShrink: 0 }} />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {summary.key_decisions?.length > 0 && (
                          <div style={{ background: '#1a1d2e', border: '1px solid #4a6cf730', borderRadius: 8, padding: '12px 14px' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#4a6cf7', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                              Key Decisions
                            </div>
                            {summary.key_decisions.map((item, i) => (
                              <div key={i} style={{ fontSize: 12, color: '#8e8ea0', display: 'flex', gap: 7, marginBottom: 6, alignItems: 'flex-start' }}>
                                <ChevronRight size={11} color="#4a6cf7" style={{ marginTop: 2, flexShrink: 0 }} />
                                <span>{item}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Follow-up suggestion */}
                      {summary.follow_up_suggested && (
                        <div style={{ background: '#fdab3d10', border: '1px solid #fdab3d30', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <span style={{ fontSize: 11, color: '#fdab3d', fontWeight: 700, flexShrink: 0 }}>Follow-up:</span>
                          <span style={{ fontSize: 12, color: '#8e8ea0' }}>{summary.follow_up_suggested}</span>
                        </div>
                      )}

                      {/* Meta footer */}
                      <div style={{ fontSize: 10, color: '#e5e7ef', textAlign: 'right' }}>
                        Generated {summary.generated_at ? new Date(summary.generated_at).toLocaleDateString() : ''} · {summary.model_used || ''}
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: '#ffffff', border: '1px solid #784bd130', borderRadius: 10, padding: '30px 20px', textAlign: 'center' }}>
                      <Sparkles size={30} color="#784bd1" style={{ marginBottom: 12, opacity: 0.55 }} />
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#784bd1', marginBottom: 7 }}>No Summary Yet</div>
                      <div style={{ fontSize: 12, color: '#8e8ea0', marginBottom: 16, lineHeight: 1.65 }}>
                        Generate an AI summary to get meeting highlights,<br />action items, and key decisions
                      </div>
                      <button
                        onClick={handleSummarize}
                        className="btn-primary"
                        style={{ fontSize: 12, padding: '8px 18px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Sparkles size={13} /> Generate Summary
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── PARTICIPANTS TAB ── */}
            {activeTab === 'participants' && (
              <div>
                {meeting?.participants?.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {meeting.participants.map((p, i) => {
                      const color   = AVATAR_COLORS[i % AVATAR_COLORS.length];
                      const initial = (p.name || p.email || '?')[0].toUpperCase();
                      const linkedLead = linkedLeads.find(l => l.email === p.email);
                      return (
                        <div key={i} style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                            background: color + '22', border: `2px solid ${color}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 14, fontWeight: 700, color,
                          }}>
                            {initial}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="private-value" style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>
                              {p.name && p.name !== p.email ? p.name : p.email}
                            </div>
                            {p.name && p.name !== p.email && (
                              <div className="private-value" style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>{p.email}</div>
                            )}
                          </div>
                          {linkedLead && (
                            <span className="private-value" style={{ fontSize: 11, background: '#4a6cf718', color: '#4a6cf7', padding: '2px 8px', borderRadius: 8, border: '1px solid #4a6cf740' }}>
                              {linkedLead.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8e8ea0' }}>
                    <Users size={32} style={{ opacity: 0.2, marginBottom: 10 }} />
                    <div style={{ fontSize: 14, fontWeight: 600 }}>No participants listed</div>
                  </div>
                )}

                {/* Linked CRM Leads */}
                {linkedLeads.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                      Linked CRM Leads
                    </div>
                    {linkedLeads.map(lead => (
                      <Link
                        key={lead.id}
                        to={`/leads?search=${encodeURIComponent(lead.name || lead.email || '')}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '10px 14px', background: '#1a1d2e', border: '1px solid #e5e7ef', borderRadius: 8, marginBottom: 6 }}
                      >
                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#4a6cf722', border: '1px solid #4a6cf7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#4a6cf7', flexShrink: 0 }}>
                          {(lead.name || lead.email || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#4a6cf7' }}>{lead.name || '(no name)'}</div>
                          <div style={{ fontSize: 11, color: '#8e8ea0' }}>{lead.email || lead.company || ''}</div>
                        </div>
                        <ChevronRight size={14} color="#e5e7ef" style={{ marginLeft: 'auto' }} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── NOTES TAB ── */}
            {activeTab === 'notes' && (
              <div>
                <div style={{ fontSize: 11, color: '#8e8ea0', marginBottom: 10 }}>
                  Private notes for this meeting — saved locally, not synced to Google Calendar.
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add meeting notes, follow-up reminders, or anything relevant…"
                  style={{
                    width: '100%', minHeight: 280, padding: '12px 14px', boxSizing: 'border-box',
                    background: '#f5f7fa', border: '1px solid #e5e7ef', borderRadius: 8,
                    color: '#1a1a2e', fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit',
                    resize: 'vertical', outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = '#4a6cf7'}
                  onBlur={e  => e.target.style.borderColor = '#e5e7ef'}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    {savingNotes ? (
                      <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} />
                    ) : notesSaved ? (
                      <Check size={13} />
                    ) : null}
                    {notesSaved ? 'Saved!' : savingNotes ? 'Saving…' : 'Save Notes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL: Sidekick Chat ──────────────────────────────────── */}
        <div style={{
          background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 12,
          display: 'flex', flexDirection: 'column',
          height: 'calc(100vh - 210px)', maxHeight: 700,
          position: 'sticky', top: 24,
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <MessageSquare size={15} color="#784bd1" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>Meeting Sidekick</span>
              <span style={{ fontSize: 10, background: '#784bd118', color: '#784bd1', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>AI</span>
            </div>
            {chat.length > 0 && (
              <button
                onClick={handleClearChat}
                title="Clear chat history"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', display: 'flex', padding: 4 }}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {chat.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 10px', color: '#8e8ea0' }}>
                <MessageSquare size={28} style={{ opacity: 0.2, marginBottom: 10 }} />
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ask me about this meeting</div>
                <div style={{ fontSize: 11, color: '#8e8ea0', lineHeight: 1.65 }}>
                  I can help with action items, decisions, follow-ups, or anything from the meeting.
                </div>
                {/* Suggested questions */}
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    'What were the main action items?',
                    'What decisions were made?',
                    'Who should I follow up with?',
                  ].map(q => (
                    <button
                      key={q}
                      onClick={() => setChatInput(q)}
                      style={{
                        background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 7,
                        padding: '8px 10px', fontSize: 11, color: '#8e8ea0', cursor: 'pointer',
                        textAlign: 'left', transition: 'border-color 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#4a6cf7'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7ef'}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chat.map((msg, i) => (
                <div key={msg.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '88%', padding: '8px 12px',
                    borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
                    background: msg.role === 'user' ? '#4a6cf7' : '#ffffff',
                    fontSize: 12, color: '#1a1a2e', lineHeight: 1.65, whiteSpace: 'pre-wrap',
                  }}>
                    {msg.content}
                  </div>
                  <div style={{ fontSize: 10, color: '#8e8ea0', marginTop: 2 }}>
                    {msg.role === 'user' ? 'You' : 'Sidekick'}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#8e8ea0', fontSize: 12 }}>
                <Loader size={12} style={{ animation: 'spin 0.7s linear infinite' }} /> Thinking…
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSendChat} style={{ padding: '10px 12px', borderTop: '1px solid #e5e7ef', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about this meeting…"
                disabled={chatLoading}
                style={{
                  flex: 1, background: '#f5f7fa', border: '1px solid #e5e7ef', borderRadius: 8,
                  padding: '8px 12px', fontSize: 12, color: '#1a1a2e', outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = '#4a6cf7'}
                onBlur={e  => e.target.style.borderColor = '#e5e7ef'}
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || chatLoading}
                style={{
                  background: chatInput.trim() && !chatLoading ? '#4a6cf7' : '#ffffff',
                  border: 'none', borderRadius: 8, padding: '8px 12px',
                  cursor: chatInput.trim() && !chatLoading ? 'pointer' : 'default',
                  color: '#1a1a2e', display: 'flex', alignItems: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Link to Lead Modal ─────────────────────────────────────────────── */}
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
              <button onClick={() => setShowLinkModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}>
                <X size={17} />
              </button>
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
              ) : filteredLeads.map(lead => {
                const alreadyLinked = linkedLeads.some(l => l.id === lead.id);
                return (
                  <div
                    key={lead.id}
                    onClick={() => !alreadyLinked && handleLinkLead(lead)}
                    style={{ padding: '11px 16px', borderBottom: '1px solid #ffffff', cursor: alreadyLinked ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'background 0.1s', opacity: alreadyLinked ? 0.6 : 1 }}
                    onMouseEnter={e => { if (!alreadyLinked) e.currentTarget.style.background = '#ffffff'; }}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{lead.name || '(no name)'}</div>
                      <div style={{ fontSize: 11, color: '#8e8ea0' }}>{lead.email || ''}</div>
                    </div>
                    {linkingLeadId === lead.id ? (
                      <Loader size={13} color="#4a6cf7" style={{ animation: 'spin 0.7s linear infinite' }} />
                    ) : alreadyLinked ? (
                      <span style={{ fontSize: 11, color: '#4a6cf7', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={11} /> Linked</span>
                    ) : (
                      <span style={{ fontSize: 11, color: '#4a6cf7' }}>Link →</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
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

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
