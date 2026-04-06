import React, { useState } from 'react';
import { Calendar, X, Plus, Check, Loader, Video, Clock, Users } from 'lucide-react';
import { createMeeting, checkMeetingAvailability } from '../api';

const CHIP_COLORS = ['#ff9b26', '#ff9b26', '#fdab3d', '#784bd1', '#ff5c5c', '#00d1d1'];

export default function ScheduleMeetingModal({ onClose, onComplete }) {
  const [title, setTitle]             = useState('');
  const [date, setDate]               = useState('');
  const [time, setTime]               = useState('');
  const [duration, setDuration]       = useState(30);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendees, setAttendees]     = useState([]);
  const [description, setDescription] = useState('');
  const [addMeetLink, setAddMeetLink] = useState(true);
  const [reminder, setReminder]       = useState(10);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(null);
  const [checkingAvail, setCheckingAvail] = useState(false);
  const [availStatus, setAvailStatus] = useState(null);
  const [copied, setCopied]           = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function buildStartISO() {
    if (!date || !time) return null;
    return new Date(`${date}T${time}:00`).toISOString();
  }
  function buildEndISO(startISO) {
    if (!startISO) return null;
    return new Date(new Date(startISO).getTime() + duration * 60000).toISOString();
  }

  function addAttendee() {
    const email = attendeeInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (attendees.includes(email)) {
      setError('That email is already added.');
      return;
    }
    setAttendees(a => [...a, email]);
    setAttendeeInput('');
    setError('');
    setAvailStatus(null);
  }

  function removeAttendee(email) {
    setAttendees(a => a.filter(e => e !== email));
    setAvailStatus(null);
  }

  async function handleCheckAvailability() {
    const startISO = buildStartISO();
    if (!startISO) { setError('Set a date and time first.'); return; }
    if (attendees.length === 0) { setError('Add at least one attendee to check availability.'); return; }
    const endISO = buildEndISO(startISO);
    setCheckingAvail(true);
    setError('');
    try {
      const result = await checkMeetingAvailability(attendees, startISO, endISO);
      setAvailStatus(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setCheckingAvail(false);
    }
  }

  async function handleSchedule() {
    if (!title.trim()) { setError('Meeting title is required.'); return; }
    if (!date || !time) { setError('Date and time are required.'); return; }
    const startISO = buildStartISO();
    const endISO   = buildEndISO(startISO);
    setSaving(true); setError('');
    try {
      const result = await createMeeting({
        summary:         title.trim(),
        start:           startISO,
        end:             endISO,
        attendees,
        description:     description.trim(),
        addMeetLink,
        reminderMinutes: reminder,
      });
      setSuccess(result);
      if (onComplete) onComplete(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyMeetLink() {
    if (!success?.meet_link) return;
    await navigator.clipboard.writeText(success.meet_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 8000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#161614', border: '1px solid #252523', borderRadius: 12, width: 580, maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #252523', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Calendar size={18} color="#ff9b26" />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#e8e6df' }}>Schedule Meeting</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', display: 'flex', alignItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>

          {/* Success state */}
          {success ? (
            <div style={{ background: '#0d2e1f', border: '1px solid #ff9b2650', borderRadius: 10, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ff9b2620', border: '2px solid #ff9b26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={18} color="#ff9b26" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#ff9b26' }}>Meeting Scheduled!</div>
                  <div style={{ fontSize: 12, color: '#a8d5b5' }}>{success.title}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#7a7870', lineHeight: 1.6 }}>
                <div><span style={{ color: '#4a4845' }}>Start:</span> {new Date(success.start_time).toLocaleString()}</div>
                <div><span style={{ color: '#4a4845' }}>Duration:</span> {duration}m</div>
                {success.participants?.length > 0 && (
                  <div><span style={{ color: '#4a4845' }}>Attendees:</span> {success.participants.map(p => p.email).join(', ')}</div>
                )}
              </div>
              {success.meet_link ? (
                <div style={{ background: '#111328', border: '1px solid #252523', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Video size={14} color="#ff9b26" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#ff9b26', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {success.meet_link}
                  </span>
                  <button
                    onClick={copyMeetLink}
                    style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 5, border: '1px solid #ff9b26', background: '#ff9b2620', color: '#ff9b26', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#4a4845' }}>No Meet link attached.</div>
              )}
              <button onClick={onClose} className="btn-primary" style={{ alignSelf: 'flex-end', padding: '8px 20px' }}>
                Done
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Error */}
              {error && (
                <div style={{ background: '#ff5c5c20', border: '1px solid #ff5c5c50', borderRadius: 7, padding: '9px 13px', fontSize: 13, color: '#ff5c5c' }}>
                  {error}
                </div>
              )}

              {/* Title */}
              <div className="form-group">
                <label className="form-label">Meeting Title *</label>
                <input
                  className="form-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Discovery Call with John"
                  autoFocus
                />
              </div>

              {/* Date + Time + Duration row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input className="form-input" type="date" value={date} onChange={e => { setDate(e.target.value); setAvailStatus(null); }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Time *</label>
                  <input className="form-input" type="time" value={time} onChange={e => { setTime(e.target.value); setAvailStatus(null); }} />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration</label>
                  <select className="form-select" value={duration} onChange={e => { setDuration(Number(e.target.value)); setAvailStatus(null); }}>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                  </select>
                </div>
              </div>

              {/* Attendees */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={13} color="#4a4845" /> Attendees
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    value={attendeeInput}
                    onChange={e => setAttendeeInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
                    placeholder="attendee@email.com"
                  />
                  <button onClick={addAttendee} className="btn-ghost" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px' }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
                {attendees.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {attendees.map((email, i) => {
                      const color = CHIP_COLORS[i % CHIP_COLORS.length];
                      return (
                        <div key={email} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px 3px 6px', borderRadius: 20, background: color + '20', border: `1px solid ${color}50` }}>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', background: color + '33', border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color, flexShrink: 0 }}>
                            {email[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize: 11, color: '#7a7870' }}>{email}</span>
                          <button onClick={() => removeAttendee(email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4a4845', display: 'flex', alignItems: 'center', padding: '0 0 0 2px' }}>
                            <X size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Availability check */}
                {attendees.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={handleCheckAvailability}
                      disabled={checkingAvail || !date || !time}
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                    >
                      {checkingAvail ? <Loader size={11} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Clock size={11} />}
                      Find Available Time
                    </button>
                    {availStatus && (
                      <span style={{ fontSize: 11, color: availStatus.allFree ? '#ff9b26' : '#ff5c5c', fontWeight: 600 }}>
                        {availStatus.allFree
                          ? '✓ All attendees are free'
                          : `✗ ${availStatus.busy.length} conflict${availStatus.busy.length > 1 ? 's' : ''}: ${availStatus.busy.map(b => b.email).join(', ')}`
                        }
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">Description / Agenda</label>
                <textarea
                  className="form-input"
                  style={{ resize: 'vertical', minHeight: 72 }}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional agenda or notes..."
                  rows={3}
                />
              </div>

              {/* Reminder + Meet link row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Reminder</label>
                  <select className="form-select" value={reminder} onChange={e => setReminder(Number(e.target.value))}>
                    <option value={10}>10 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Google Meet Link</label>
                  <div
                    onClick={() => setAddMeetLink(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 7, border: `1px solid ${addMeetLink ? '#ff9b2650' : '#252523'}`, background: addMeetLink ? '#ff9b2610' : 'transparent', cursor: 'pointer' }}
                  >
                    <div style={{ width: 32, height: 18, borderRadius: 9, background: addMeetLink ? '#ff9b26' : '#252523', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                      <div style={{ position: 'absolute', top: 3, left: addMeetLink ? 15 : 3, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.18s' }} />
                    </div>
                    <Video size={13} color={addMeetLink ? '#ff9b26' : '#4a4845'} />
                    <span style={{ fontSize: 12, color: addMeetLink ? '#ff9b26' : '#4a4845' }}>
                      {addMeetLink ? 'Will be added' : 'No Meet link'}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer (only shown before success) */}
        {!success && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid #252523', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
            <button onClick={onClose} className="btn-ghost" style={{ padding: '8px 16px' }}>Cancel</button>
            <button
              onClick={handleSchedule}
              disabled={saving}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? <Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Calendar size={14} />}
              {saving ? 'Scheduling…' : 'Schedule Meeting'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
