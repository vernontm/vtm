import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, PenLine, Search, Loader, RefreshCw, MessageSquare, Send, Zap } from 'lucide-react';
import { getLeads, createQueueItem, updateQueueItem, syncLeadGmail, generateSingleEmail, getGmailLabels } from '../api';

const SEGMENT_COLORS = { hot: '#fdab3d', warm: '#ff9b26', cold: '#4a4845' };
const EMAIL_TYPE_OPTIONS = [
  ['cold_outreach',  'Cold Outreach'],
  ['follow_up',      'Follow-Up'],
  ['re_engagement',  'Re-Engagement'],
  ['value_add',      'Value Add'],
  ['soft_pitch',     'Soft Pitch'],
  ['check_in',       'Check-In'],
];

export default function ComposeModal({ onClose, onComplete }) {
  // ── Leads data ─────────────────────────────────────────────────────────────
  const [leads, setLeads]               = useState([]);

  // ── "To" field state ───────────────────────────────────────────────────────
  const [toInput, setToInput]           = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const [showSuggestions, setShowSugg]  = useState(false);
  const toRef                           = useRef(null);

  // ── Gmail sync state ───────────────────────────────────────────────────────
  const [syncing, setSyncing]           = useState(false);
  const [syncResult, setSyncResult]     = useState(null);
  const [syncError, setSyncError]       = useState('');

  // ── Per-card context inputs ────────────────────────────────────────────────
  const [sentContext, setSentContext]   = useState('');
  const [replyContext, setReplyContext] = useState('');

  // ── AI generation state ────────────────────────────────────────────────────
  const [generatingFor, setGeneratingFor] = useState(''); // 'sent' | 'reply' | ''
  const [generatedItemId, setGeneratedItemId] = useState(null); // existing queue item to update

  // ── Email fields ───────────────────────────────────────────────────────────
  const [emailType, setEmailType]       = useState('cold_outreach');
  const [subject, setSubject]           = useState('');
  const [body, setBody]                 = useState('');
  const [context, setContext]           = useState('');

  // ── Labels ─────────────────────────────────────────────────────────────────
  const [labelDefs, setLabelDefs]       = useState([]);
  const [selectedLabels, setSelectedLabels] = useState(['Leads']);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  // ── Load leads + label defs on mount ──────────────────────────────────────
  useEffect(() => {
    getLeads().then(setLeads).catch(() => {});
    getGmailLabels().then(l => setLabelDefs(l || [])).catch(() => {});
  }, []);

  // ── Close suggestions on outside click ────────────────────────────────────
  useEffect(() => {
    if (!showSuggestions) return;
    const handler = (e) => {
      if (toRef.current && !toRef.current.contains(e.target)) {
        setShowSugg(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSuggestions]);

  // ── Filtered lead suggestions ──────────────────────────────────────────────
  const suggestions = useMemo(() => {
    if (!toInput.trim() || selectedLead) return [];
    const q = toInput.toLowerCase();
    return leads.filter(l =>
      (l.full_name || '').toLowerCase().includes(q) ||
      (l.email     || '').toLowerCase().includes(q)
    ).slice(0, 8);
  }, [leads, toInput, selectedLead]);

  // ── Lead selection helpers ─────────────────────────────────────────────────
  function pickLead(lead) {
    setSelectedLead(lead);
    setToInput('');
    setShowSugg(false);
    setSyncResult(null);
    setSyncError('');
    setSentContext('');
    setReplyContext('');
    setGeneratedItemId(null);
  }

  function clearLead() {
    setSelectedLead(null);
    setToInput('');
    setSyncResult(null);
    setSyncError('');
    setSentContext('');
    setReplyContext('');
    setGeneratedItemId(null);
  }

  // ── Gmail sync ─────────────────────────────────────────────────────────────
  async function handleSync() {
    if (!selectedLead) return;
    const lead = selectedLead; // capture before async — prevents stale closure if user changes lead mid-flight
    setSyncing(true);
    setSyncError('');
    setSyncResult(null);
    try {
      const result = await syncLeadGmail(lead.id);
      // Only apply result if user hasn't switched leads
      if (selectedLead?.id === lead.id) setSyncResult(result);
    } catch (e) {
      if (selectedLead?.id === lead.id)
        setSyncError(e.message || 'Gmail sync failed. Check that Gmail is connected in Settings.');
    } finally {
      setSyncing(false);
    }
  }

  // ── AI: generate email from a Gmail card ──────────────────────────────────
  // Calls the generate endpoint with focus='sent' or 'reply', populates the
  // subject/body fields, and tracks the created queue item so Save updates it
  // instead of creating a duplicate.
  async function handleCreateEmail(source) {
    if (!selectedLead) return;
    const extra = source === 'sent' ? sentContext : replyContext;
    setGeneratingFor(source);
    setError('');
    try {
      const newItem = await generateSingleEmail(selectedLead.id, source, extra || undefined);
      // Populate compose fields from the generated email
      setSubject(newItem.subject_lines?.[0] || '');
      setBody(newItem.body || '');
      setEmailType(newItem.email_type || 'follow_up');
      // Track the item so Save updates it rather than creating a fresh duplicate
      setGeneratedItemId(newItem.id);
    } catch (e) {
      setError(e.message || 'Generation failed. Check your Anthropic API key.');
    } finally {
      setGeneratingFor('');
    }
  }

  // ── Recipient email ────────────────────────────────────────────────────────
  const recipientEmail = selectedLead?.email || toInput.trim();

  // ── Save to queue ──────────────────────────────────────────────────────────
  // If we already have a generated item, update it in place.
  // Otherwise create a fresh queue item.
  async function handleSave() {
    if (!recipientEmail) return setError('Please select a lead or type an email address.');
    if (!subject.trim()) return setError('Subject is required.');
    if (!body.trim())    return setError('Body is required.');

    setSaving(true);
    setError('');
    try {
      if (generatedItemId) {
        // Update the AI-created item with any edits the user made
        await updateQueueItem(generatedItemId, {
          subject_lines:          [subject.trim()],
          selected_subject_index: 0,
          body:                   body.trim(),
          email_type:             emailType,
          reasoning:              context.trim() || '',
          labels:                 selectedLabels,
          status:                 'draft',
        });
      } else {
        // Manually composed — create a new queue item
        await createQueueItem({
          lead_id:                    selectedLead?.id || null,
          lead_name:                  selectedLead?.full_name || recipientEmail,
          lead_email:                 recipientEmail,
          lead_segment:               selectedLead?.lead_segment || 'cold',
          email_type:                 emailType,
          subject_lines:              [subject.trim()],
          selected_subject_index:     0,
          body:                       body.trim(),
          reasoning:                  context.trim() || '',
          confidence_score:           100,
          personalization_hooks_used: [],
          suggested_next_action:      '',
          labels:                     selectedLabels,
          status:                     'draft',
        });
      }
      onComplete?.();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to save email.');
    } finally {
      setSaving(false);
    }
  }

  // ── Shared button style helper ─────────────────────────────────────────────
  function genBtnStyle(source, accentColor, borderColor) {
    const busy = generatingFor === source;
    return {
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
      cursor: busy ? 'not-allowed' : 'pointer',
      background: busy ? '#e8ecf4' : accentColor + '18',
      border: `1px solid ${borderColor}`,
      color: accentColor,
      opacity: generatingFor && generatingFor !== source ? 0.5 : 1,
      transition: 'opacity 0.15s',
      whiteSpace: 'nowrap',
    };
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 8000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: 620, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px', borderBottom: '1px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PenLine size={16} color="#ff9b26" />
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Compose Email</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── To field ─────────────────────────────────────────────────────── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
              To
            </label>

            {selectedLead ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 6,
                background: 'var(--bg)', border: '1px solid var(--border)',
              }}>
                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13, flex: 1 }}>{selectedLead.full_name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{selectedLead.email}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, textTransform: 'uppercase',
                  color:       SEGMENT_COLORS[selectedLead.lead_segment] || SEGMENT_COLORS.cold,
                  background: (SEGMENT_COLORS[selectedLead.lead_segment] || SEGMENT_COLORS.cold) + '20',
                }}>{selectedLead.lead_segment || 'cold'}</span>
                <button onClick={clearLead} title="Change recipient" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', padding: 2, borderRadius: 4 }}>
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div style={{ position: 'relative' }} ref={toRef}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} color="#4a4845" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    autoFocus
                    placeholder="Search leads by name/email, or type any address…"
                    value={toInput}
                    onChange={e => { setToInput(e.target.value); setShowSugg(true); }}
                    onFocus={() => { if (toInput.trim()) setShowSugg(true); }}
                    style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, marginTop: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', overflow: 'auto', maxHeight: 240 }}>
                    {suggestions.map(l => (
                      <div key={l.id} onMouseDown={() => pickLead(l)}
                        style={{ padding: '9px 12px', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#e8ecf4'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1 }}>{l.full_name}</span>
                        <span style={{ color: 'var(--muted)' }}>{l.email}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, textTransform: 'uppercase', color: SEGMENT_COLORS[l.lead_segment] || SEGMENT_COLORS.cold, background: (SEGMENT_COLORS[l.lead_segment] || SEGMENT_COLORS.cold) + '20' }}>{l.lead_segment || 'cold'}</span>
                      </div>
                    ))}
                    {toInput.includes('@') && (
                      <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>
                        Or press Tab / click outside to send to <strong style={{ color: 'var(--muted)' }}>{toInput}</strong> directly
                      </div>
                    )}
                  </div>
                )}
                {!showSuggestions && toInput.includes('@') && toInput.includes('.') && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                    Sending to: <span style={{ color: '#ff9b26', fontWeight: 600 }}>{toInput}</span> (custom address — not linked to a lead)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Gmail History (only when lead is selected) ─────────────────── */}
          {selectedLead && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Gmail History</span>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer', background: '#e8ecf4', border: '1px solid var(--border)', color: '#ff9b26', opacity: syncing ? 0.7 : 1 }}
                >
                  <RefreshCw size={11} style={{ animation: syncing ? 'spin 0.7s linear infinite' : 'none' }} />
                  {syncing ? 'Syncing…' : 'Sync Gmail'}
                </button>
              </div>

              {syncError && <div style={{ fontSize: 11, color: '#ff5c5c', marginTop: 8 }}>{syncError}</div>}

              {!syncResult && !syncing && !syncError && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
                  Click Sync Gmail to check sent/reply history for this lead.
                </div>
              )}

              {syncResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>

                  {/* ── Last Sent card ─────────────────────────────────────── */}
                  {syncResult.hasSent ? (
                    <div style={{ background: '#141e36', border: '1px solid #1e3a5f', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#ff9b26', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                        📤 Last Sent to Lead
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 2 }}>
                        {syncResult.last_sent_subject || '(no subject)'}
                      </div>
                      {syncResult.last_sent_at && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>
                          {new Date(syncResult.last_sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                      {syncResult.last_sent_preview && (
                        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, borderTop: '1px solid #1e3a5f', paddingTop: 6, marginTop: 4, marginBottom: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {syncResult.last_sent_preview.slice(0, 300)}{syncResult.last_sent_preview.length > 300 ? '…' : ''}
                        </div>
                      )}

                      {/* Context + Create Email */}
                      <div style={{ borderTop: '1px solid #1e3a5f', paddingTop: 8, marginTop: 4 }}>
                        <textarea
                          value={sentContext}
                          onChange={e => setSentContext(e.target.value)}
                          placeholder="Additional context for this follow-up… (optional)"
                          rows={2}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 5, fontSize: 11, color: 'var(--muted)', background: '#0f1830', border: '1px solid #1e3a5f', outline: 'none', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
                        />
                        <button
                          onClick={() => handleCreateEmail('sent')}
                          disabled={!!generatingFor}
                          style={genBtnStyle('sent', '#ff9b26', '#1e3a5f')}
                        >
                          {generatingFor === 'sent'
                            ? <Loader size={11} style={{ animation: 'spin 0.7s linear infinite' }} />
                            : <Zap size={11} />}
                          {generatingFor === 'sent' ? 'Generating…' : 'Create Email from This'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', background: '#141e36', borderRadius: 6, padding: '8px 10px' }}>
                      📤 No outbound emails found for this lead.
                    </div>
                  )}

                  {/* ── Last Reply card ────────────────────────────────────── */}
                  {syncResult.hasReply ? (
                    <div style={{ background: '#142018', border: '1px solid #1e4028', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#ff9b26', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          💬 Their Last Reply
                        </div>
                        {syncResult.thread_message_count && (
                          <span style={{ fontSize: 9, color: 'var(--muted)', background: '#1e4028', padding: '1px 5px', borderRadius: 4 }}>
                            {syncResult.thread_message_count} msg thread
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 2 }}>
                        {syncResult.last_reply_subject || '(no subject)'}
                      </div>
                      {syncResult.last_reply_at && (
                        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>
                          {new Date(syncResult.last_reply_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                      {syncResult.last_reply_summary && (
                        <div style={{ fontSize: 11, color: '#a0c4a0', lineHeight: 1.5, borderTop: '1px solid #1e4028', paddingTop: 6, marginTop: 4, marginBottom: 10 }}>
                          {syncResult.last_reply_summary}
                        </div>
                      )}

                      {/* Context + Create Email */}
                      <div style={{ borderTop: '1px solid #1e4028', paddingTop: 8, marginTop: 4 }}>
                        <textarea
                          value={replyContext}
                          onChange={e => setReplyContext(e.target.value)}
                          placeholder="Additional context for this reply… (optional)"
                          rows={2}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 5, fontSize: 11, color: 'var(--muted)', background: '#0f1a12', border: '1px solid #1e4028', outline: 'none', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
                        />
                        <button
                          onClick={() => handleCreateEmail('reply')}
                          disabled={!!generatingFor}
                          style={genBtnStyle('reply', '#ff9b26', '#1e4028')}
                        >
                          {generatingFor === 'reply'
                            ? <Loader size={11} style={{ animation: 'spin 0.7s linear infinite' }} />
                            : <Zap size={11} />}
                          {generatingFor === 'reply' ? 'Generating…' : 'Create Email from This'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', background: '#142018', borderRadius: 6, padding: '8px 10px' }}>
                      💬 No replies found from this lead.
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* ── AI-populated indicator ────────────────────────────────────────── */}
          {generatedItemId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 6, background: '#0f2318', border: '1px solid #1e4028', fontSize: 11, color: '#ff9b26' }}>
              <Zap size={11} />
              AI-generated — edit the subject and body below, then save.
            </div>
          )}

          {/* ── Email type ───────────────────────────────────────────────────── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
              Email Type
            </label>
            <select
              value={emailType}
              onChange={e => setEmailType(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13, color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer', outline: 'none' }}
            >
              {EMAIL_TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* ── Labels ───────────────────────────────────────────────────────── */}
          {labelDefs.length > 0 && (
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
                Labels
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {labelDefs.map(l => {
                  const on = selectedLabels.includes(l.name);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setSelectedLabels(prev => on ? prev.filter(x => x !== l.name) : [...prev, l.name])}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', transition: 'all 0.15s',
                        background: on ? (l.color || 'var(--orange)') + '22' : '#f5f7fa',
                        border: `1.5px solid ${on ? (l.color || 'var(--orange)') : '#e5e7ef'}`,
                        color: on ? (l.color || 'var(--orange)') : '#4a4845',
                      }}
                    >
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: l.color || 'var(--orange)', flexShrink: 0 }} />
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Subject ──────────────────────────────────────────────────────── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
              Subject
            </label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Write your subject line…"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 13, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* ── Body ─────────────────────────────────────────────────────────── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
              Body
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your email… or use Create Email above to AI-generate it."
              rows={10}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 6, fontSize: 13, color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', outline: 'none', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* ── Global context / notes ────────────────────────────────────────── */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <MessageSquare size={13} color="#4a4845" />
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Additional Context
              </label>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5 }}>
              Notes or instructions saved alongside the email for reference.
            </div>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="e.g. They mentioned interest in TikTok automation. Keep it under 150 words…"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 12, color: 'var(--muted)', background: 'var(--bg)', border: '1px solid var(--border)', outline: 'none', resize: 'vertical', lineHeight: 1.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* ── Error ────────────────────────────────────────────────────────── */}
          {error && (
            <div style={{ fontSize: 12, color: '#ff5c5c', background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {/* ── Actions ──────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: 'none', border: '1px solid var(--border)', color: 'var(--muted)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', background: '#ff9b26', border: 'none', color: 'var(--text)', opacity: saving ? 0.7 : 1 }}
            >
              {saving
                ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} />
                : <Send size={13} />}
              Save to Queue
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
