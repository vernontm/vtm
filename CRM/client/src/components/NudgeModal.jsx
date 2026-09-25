import React, { useState, useEffect, useRef } from 'react';
import { X, Loader, Send, Clock, MessageSquare, Mail, AlertCircle, History } from 'lucide-react';
import { draftNudge, sendNudge } from '../api';
import { toast } from './Toast';
import { AUTOMATION_TITLES } from '../lib/templates';

// Nudge a client about something they owe us: an unpaid invoice, an unsigned
// agreement, a failed plan payment. Opened with { kind, id }; the server
// drafts the message from the matching Automations template and tells us
// which channels are usable. Sends go out by iMessage (queued for the bridge)
// and Gmail. Shapes: docs/engineer/role-homes-contracts.md.
//
//   <NudgeModal kind="invoice" id={inv.id} onClose={...} onSent={(reply, { scheduled }) => ...} />

const TZ = 'America/Chicago';

// Minutes to add to a UTC instant to get wall-clock time in `tz` at that instant.
function tzOffsetMinutes(tz, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t) => Number(parts.find(p => p.type === t)?.value || 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - date.getTime()) / 60000);
}

// ISO instant for 08:00 tomorrow in Central time, whatever zone the browser is in.
export function tomorrowAt8Central() {
  const today = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => Number(today.find(p => p.type === t)?.value || 0);
  // 08:00 on tomorrow's date, pretending the wall clock were UTC, then shift by
  // the zone offset at that moment (re-checked once for a DST edge).
  const wall = Date.UTC(get('year'), get('month') - 1, get('day') + 1, 8, 0, 0);
  let offset = tzOffsetMinutes(TZ, new Date(wall));
  let instant = new Date(wall - offset * 60000);
  const again = tzOffsetMinutes(TZ, instant);
  if (again !== offset) instant = new Date(wall - again * 60000);
  return instant.toISOString();
}

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
  return isNaN(d) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const fmtWhen = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const templateName = (key) => AUTOMATION_TITLES[key]?.title || (key ? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Message');

const KIND_LABEL = { invoice: 'Invoice', manual_invoice: 'Invoice', payment: 'Payment', agreement: 'Agreement', plan: 'Plan' };

const field = {
  width: '100%', padding: '9px 11px', borderRadius: 10, fontSize: 13.5, color: 'var(--text)',
  background: 'var(--surface-2)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'var(--font-display)',
};
const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' };

function ChannelToggle({ icon: Icon, label, to, available, checked, onChange, missing }) {
  return (
    <label
      title={available ? to : missing}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, flex: 1, minWidth: 0,
        border: `1px solid ${checked && available ? 'var(--orange)' : 'var(--border)'}`,
        background: checked && available ? 'rgba(37,99,235,0.08)' : 'var(--surface)',
        cursor: available ? 'pointer' : 'not-allowed', opacity: available ? 1 : 0.6,
      }}
    >
      <input type="checkbox" checked={!!checked && available} disabled={!available} onChange={e => onChange(e.target.checked)} style={{ margin: 0 }} />
      <Icon size={14} style={{ color: checked && available ? 'var(--orange)' : 'var(--muted)', flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {available ? to : missing}
        </span>
      </span>
    </label>
  );
}

export default function NudgeModal({ kind, id, onClose, onSent }) {
  const [draft, setDraft] = useState(null);       // reply from draftNudge
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState(true);
  const [email, setEmail] = useState(true);
  const [message, setMessage] = useState('');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState('');             // '' | 'now' | 'later'
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setLoading(true); setError(''); setDraft(null);
    draftNudge({ kind, id }).then(d => {
      if (!mounted.current) return;
      setDraft(d || {});
      setMessage(d?.message || '');
      setSubject(d?.email_subject || '');
      setText(!!d?.channels?.text?.available);
      setEmail(!!d?.channels?.email?.available);
    }).catch(e => { if (mounted.current) setError(e.message || 'Could not draft the nudge'); })
      .finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, [kind, id]);

  const target = draft?.target || {};
  const textCh = draft?.channels?.text || { available: false };
  const emailCh = draft?.channels?.email || { available: false };
  const channels = [text && textCh.available ? 'text' : null, email && emailCh.available ? 'email' : null].filter(Boolean);
  const history = Array.isArray(draft?.history) ? draft.history : [];

  const send = async (scheduled) => {
    if (busy) return;
    if (!channels.length) { setError('Pick at least one channel.'); return; }
    if (!message.trim()) { setError('Write a message first.'); return; }
    setError('');
    setBusy(scheduled ? 'later' : 'now');
    try {
      const payload = { kind, id, channels, message: message.trim() };
      if (channels.includes('email') && subject.trim()) payload.email_subject = subject.trim();
      if (scheduled) payload.schedule_at = tomorrowAt8Central();
      const reply = await sendNudge(payload);
      const via = channels.map(c => c === 'text' ? 'text' : 'email').join(' and ');
      toast('success', scheduled ? `Nudge scheduled for tomorrow 8 AM by ${via}` : `Nudge sent by ${via}`);
      onSent?.(reply, { scheduled, channels });
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not send the nudge');
      setBusy('');
    }
  };

  const targetBits = [
    target.client_name,
    target.label,
    target.amount != null ? money(target.amount) : null,
    target.due ? `due ${fmtDate(target.due)}` : null,
    target.days_late > 0 ? `${target.days_late} day${target.days_late === 1 ? '' : 's'} late` : null,
  ].filter(Boolean);

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Nudge {KIND_LABEL[kind] ? KIND_LABEL[kind].toLowerCase() : ''}</h2>
            {targetBits.length > 0 && (
              <div className="private-value" style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>{targetBits.join(' · ')}</div>
            )}
          </div>
          <button type="button" onClick={onClose} disabled={!!busy} className="btn-ghost" style={{ padding: 4, opacity: busy ? 0.5 : 1 }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: 13, padding: '24px 0' }}>
            <Loader size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Drafting the message…
          </div>
        ) : !draft ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#dc2626', fontSize: 13, padding: '8px 0' }}>
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error || 'Could not draft the nudge.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <span style={lbl}>Send by</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <ChannelToggle icon={MessageSquare} label="Text" to={textCh.to} available={!!textCh.available} checked={text} onChange={setText} missing="no number on file" />
                <ChannelToggle icon={Mail} label="Email" to={emailCh.to} available={!!emailCh.available} checked={email} onChange={setEmail} missing="no email on file" />
              </div>
            </div>

            <div>
              <span style={lbl}>{templateName(draft.template_key)}</span>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                style={{ ...field, resize: 'vertical', lineHeight: 1.5, minHeight: 110 }}
                placeholder="Write the message"
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Edit freely. This exact text goes out.</div>
            </div>

            {email && emailCh.available && (
              <div>
                <span style={lbl}>Email subject <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></span>
                <input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder={draft.email_subject || 'Subject line'} />
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#dc2626', fontSize: 13, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 8, padding: '8px 10px' }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={onClose} disabled={!!busy} className="btn-ghost">Cancel</button>
              <button type="button" onClick={() => send(true)} disabled={!!busy || !channels.length} className="btn-ghost" title="Queues it for 8 AM Central tomorrow">
                {busy === 'later' ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Clock size={13} />} Send tomorrow 8 AM
              </button>
              <button type="button" onClick={() => send(false)} disabled={!!busy || !channels.length} className="btn-primary" style={{ opacity: busy || !channels.length ? 0.6 : 1 }}>
                {busy === 'now' ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Send size={13} />} {busy === 'now' ? 'Sending…' : 'Send nudge'}
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <span style={{ ...lbl, display: 'inline-flex', alignItems: 'center', gap: 5 }}><History size={11} /> History</span>
              {history.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No nudges sent for this yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                  {history.map((h, i) => (
                    <div key={h.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: h.status === 'scheduled' ? '#f59e0b' : h.status === 'failed' ? '#ef4444' : '#22c55e' }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.status === 'scheduled' ? 'Scheduled' : h.status === 'failed' ? 'Failed' : 'Sent'}
                        {Array.isArray(h.channels) && h.channels.length ? ` by ${h.channels.join(' and ')}` : ''}
                        {h.by_name ? ` · ${h.by_name}` : ''}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', flexShrink: 0 }}>{fmtWhen(h.sent_at || h.scheduled_at || h.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
