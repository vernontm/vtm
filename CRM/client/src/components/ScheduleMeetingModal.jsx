import React, { useState, useEffect, useRef } from 'react';
import { Calendar, X, Plus, Check, Loader, Video, Clock, Users, Search, Minimize2, MapPin, ArrowLeft } from 'lucide-react';
import { createMeeting, checkMeetingAvailability, getContacts, getLeads, getGmailContacts, getCommLog, getUpcomingMeetings } from '../api';
import { copyToClipboard } from '../lib/clipboard';

export default function ScheduleMeetingModal({ onClose, onComplete, onMinimize, initialTitle, initialAttendees, initialLeadName, pickType }) {
  // Normalise initial attendees — ensure email is lowercase
  const seedAttendees = (initialAttendees || []).map(a => ({ ...a, email: a.email?.trim().toLowerCase() })).filter(a => a.email);
  const [title, setTitle]                   = useState(initialTitle || '');
  const [date, setDate]                     = useState('');
  const [time, setTime]                     = useState('');
  const [duration, setDuration]             = useState(30);
  const [attendeeInput, setAttendeeInput]   = useState('');
  const [attendees, setAttendees]           = useState(seedAttendees);
  const [description, setDescription]       = useState('');
  const [addMeetLink, setAddMeetLink]       = useState(true);
  const [reminder, setReminder]             = useState(10);
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState('');
  const [success, setSuccess]               = useState(null);
  const [checkingAvail, setCheckingAvail]   = useState(false);
  const [availStatus, setAvailStatus]       = useState(null);
  const [copied, setCopied]                 = useState(false);

  // When to meet: 'available' lists the next open slots computed from the
  // synced calendar (meetings, OOO blocks, class, weekends all count as busy);
  // 'custom' is the manual date+time; 'instant' starts right now.
  const [timeMode, setTimeMode]             = useState('available');
  const [busyRows, setBusyRows]             = useState(null);   // null = not loaded yet
  const [slotsLoading, setSlotsLoading]     = useState(false);
  const [selectedSlot, setSelectedSlot]     = useState('');

  useEffect(() => {
    if (timeMode !== 'available' || busyRows !== null) return;
    setSlotsLoading(true);
    getUpcomingMeetings()
      .then(rows => setBusyRows((rows || []).filter(m => m.status !== 'cancelled')))
      .catch(() => setBusyRows([]))
      .finally(() => setSlotsLoading(false));
  }, [timeMode, busyRows]);

  // Next open slots: weekdays 9am to 6pm CT, 30-minute grid, must fit the full
  // duration without touching anything on the calendar, at least 45 min out.
  const slots = React.useMemo(() => {
    if (!busyRows) return [];
    const busy = busyRows.map(m => [new Date(m.start_time).getTime(), new Date(m.end_time || m.start_time).getTime()]);
    const out = [];
    const minStart = Date.now() + 45 * 60000;
    const day = new Date(); day.setHours(0, 0, 0, 0);
    for (let d = 0; d < 14 && out.length < 30; d++) {
      const dow = day.getDay();
      if (dow !== 0 && dow !== 6) {
        for (let mins = 9 * 60; mins + duration <= 18 * 60; mins += 30) {
          const s = day.getTime() + mins * 60000;
          const e = s + duration * 60000;
          if (s < minStart) continue;
          if (busy.some(([bs, be]) => s < be && e > bs)) continue;
          out.push(s);
          if (out.length >= 30) break;
        }
      }
      day.setDate(day.getDate() + 1);
    }
    return out;
  }, [busyRows, duration]);

  const fmtSlot = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT';

  function pickSlot(msStr) {
    setSelectedSlot(msStr);
    if (!msStr) return;
    const dt = new Date(Number(msStr));
    const p = (n) => String(n).padStart(2, '0');
    setDate(`${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`);
    setTime(`${p(dt.getHours())}:${p(dt.getMinutes())}`);
    setAvailStatus(null);
  }

  // Event-type flow: when opened via "New Event", first pick online vs in-person.
  const [step, setStep]                     = useState(pickType ? 'type' : 'form');   // 'type' | 'form'
  const [eventType, setEventType]           = useState('online');                     // 'online' | 'in_person'
  const [address, setAddress]               = useState('');
  const [addressResults, setAddressResults] = useState([]);
  const [addressOpen, setAddressOpen]       = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressBoxRef = useRef(null);
  const addressTimer = useRef(null);

  // Debounced address autocomplete (OpenStreetMap geocoder — keyless; swaps to
  // Google Places automatically if a VITE_GOOGLE_MAPS_KEY is ever configured).
  function onAddressInput(v) {
    setAddress(v); setAddressOpen(true);
    clearTimeout(addressTimer.current);
    if (v.trim().length < 3) { setAddressResults([]); return; }
    addressTimer.current = setTimeout(async () => {
      setAddressLoading(true);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0&countrycodes=us&q=${encodeURIComponent(v.trim())}`, { headers: { Accept: 'application/json' } });
        const j = await r.json();
        setAddressResults((j || []).map(x => x.display_name));
      } catch { setAddressResults([]); }
      finally { setAddressLoading(false); }
    }, 350);
  }
  useEffect(() => {
    const h = e => { if (addressBoxRef.current && !addressBoxRef.current.contains(e.target)) setAddressOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  // Contact search
  const [allContacts, setAllContacts]       = useState([]);
  const [contactResults, setContactResults] = useState([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const attendeeRef = useRef(null);

  // On mount: auto-fill title + description for pre-seeded attendee
  useEffect(() => {
    if (seedAttendees.length > 0) {
      const first = seedAttendees[0];
      const name = first.name || initialLeadName || first.email.split('@')[0];
      // Auto-fill title if not already set
      if (!title) setTitle(`VernonTM 30 Minute Call w/ ${name}`);
      // Auto-fill description from comm history
      if (first.email) autoFillDescription(first.email, name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load contacts on mount
  useEffect(() => {
    async function loadContacts() {
      const results = [];
      try { const c = await getContacts(); (c||[]).forEach(x => { if(x.email) results.push({name:x.name||'',email:x.email,_source:'contact'}); }); } catch{}
      try { const l = await getLeads(); (l||[]).forEach(x => { if(x.email) results.push({name:x.name||'',email:x.email,_source:'lead'}); }); } catch{}
      try { const gc = await getGmailContacts({pageSize:'100'}); (gc?.contacts||[]).forEach(x => { if(x.email) results.push({name:x.name||'',email:x.email,_source:'gmail',photo:x.photo}); }); } catch{}
      const seen = new Set();
      setAllContacts(results.filter(c => { const k=c.email.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; }));
    }
    loadContacts();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const h = e => { if(attendeeRef.current && !attendeeRef.current.contains(e.target)) setShowContactDropdown(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  // Filter contacts as user types
  useEffect(() => {
    if (!attendeeInput.trim()) { setContactResults(allContacts.slice(0,8)); return; }
    const q = attendeeInput.toLowerCase();
    setContactResults(allContacts.filter(c => (c.name||'').toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).slice(0,8));
  }, [attendeeInput, allContacts]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function buildStartISO() { if(!date||!time) return null; return new Date(`${date}T${time}:00`).toISOString(); }
  function buildEndISO(startISO) { if(!startISO) return null; return new Date(new Date(startISO).getTime()+duration*60000).toISOString(); }

  function addAttendee(email) {
    const e = (email || attendeeInput).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setError('Please enter a valid email.'); return; }
    if (attendees.some(a => a.email===e)) { setError('Already added.'); return; }
    const contact = allContacts.find(c => c.email.toLowerCase()===e);
    const name = contact?.name || e.split('@')[0];
    setAttendees(a => [...a, { email:e, name }]);
    setAttendeeInput('');
    setError('');
    setAvailStatus(null);
    setShowContactDropdown(false);

    // Auto-fill title with name
    if (attendees.length === 0 && !title) {
      setTitle(`VernonTM 30 Minute Call w/ ${name}`);
    } else if (attendees.length === 0 && title === `VernonTM 30 Minute Call w/ `) {
      setTitle(`VernonTM 30 Minute Call w/ ${name}`);
    }

    // Auto-fill description from communication history
    autoFillDescription(e, name);
  }

  async function autoFillDescription(email, name) {
    try {
      // Try to find lead by email and get comm log
      const leads = await getLeads();
      const lead = (leads||[]).find(l => l.email?.toLowerCase() === email);
      if (!lead) return;

      const log = await getCommLog(lead.id);
      if (!log || log.length === 0) return;

      // Build context from recent communications
      const recent = log.slice(0, 5);
      const context = recent.map(entry => {
        const date = new Date(entry.sent_at || entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${date}: ${entry.subject || 'Email'} - ${(entry.body || entry.snippet || '').slice(0, 100)}`;
      }).join('\n');

      if (context && !description) {
        setDescription(`Meeting with ${name}\n\nRecent conversation history:\n${context}\n\nAgenda:\n- `);
      }
    } catch {}
  }

  function removeAttendee(email) {
    setAttendees(a => a.filter(att => att.email !== email));
    setAvailStatus(null);
  }

  function selectContact(contact) {
    addAttendee(contact.email);
  }

  async function handleCheckAvailability() {
    const startISO = buildStartISO();
    if (!startISO) { setError('Set a date and time first.'); return; }
    if (attendees.length===0) { setError('Add at least one attendee.'); return; }
    const endISO = buildEndISO(startISO);
    setCheckingAvail(true); setError('');
    try { const r = await checkMeetingAvailability(attendees.map(a=>a.email),startISO,endISO); setAvailStatus(r); }
    catch(e) { setError(e.message); }
    finally { setCheckingAvail(false); }
  }

  async function handleSchedule() {
    if (!title.trim()) { setError('Meeting title is required.'); return; }
    if (eventType==='in_person' && !address.trim()) { setError('Add the address for this in-person meeting.'); return; }
    let startISO;
    if (timeMode === 'instant') {
      startISO = new Date(Math.ceil(Date.now() / 300000) * 300000).toISOString();   // next 5-min mark
    } else if (timeMode === 'available') {
      if (!selectedSlot) { setError('Pick one of the available times.'); return; }
      startISO = new Date(Number(selectedSlot)).toISOString();
    } else {
      if (!date||!time) { setError('Date and time are required.'); return; }
      startISO = buildStartISO();
    }
    const endISO = buildEndISO(startISO);
    setSaving(true); setError('');
    try {
      const result = await createMeeting({
        summary:title.trim(), start:startISO, end:endISO, attendees:attendees.map(a=>a.email),
        description:description.trim(), addMeetLink: eventType==='in_person' ? false : addMeetLink,
        reminderMinutes:reminder, location: eventType==='in_person' ? address.trim() : '',
      });
      setSuccess(result); if(onComplete) onComplete(result);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function copyMeetLink() {
    if (!success?.meet_link) return;
    await copyToClipboard(success.meet_link);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, background:'var(--surface-2)', border:'1px solid var(--border)', color:'var(--text)', outline:'none', boxSizing:'border-box' };
  const labelStyle = { fontSize:12, fontWeight:600, color:'var(--muted)', marginBottom:4, display:'block' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:8000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'var(--surface)', borderRadius:14, width:560, maxWidth:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,var(--orange),#2563eb)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Calendar size={16} color="#fff" />
            </div>
            <span style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>{step==='type' ? 'New Event' : eventType==='in_person' ? 'Schedule In-Person Meeting' : 'Schedule Meeting'}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            {onMinimize && (
              <button onClick={onMinimize} title="Minimize (keep working across pages)"
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:6, borderRadius:6 }}
                onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <Minimize2 size={16} />
              </button>
            )}
            <button onClick={onClose} title="Close" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:6, borderRadius:6 }}
              onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', padding:20, flex:1 }}>
          {success ? (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'#22c55e20', border:'2px solid #22c55e', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Check size={18} color="#22c55e" />
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'#22c55e' }}>Meeting Scheduled!</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{success.title}</div>
                </div>
              </div>
              <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.6 }}>
                <div><span style={{ color:'var(--muted)' }}>Start:</span> {new Date(success.start_time).toLocaleString()}</div>
                <div><span style={{ color:'var(--muted)' }}>Duration:</span> {duration}m</div>
                {success.participants?.length>0 && <div><span style={{ color:'var(--muted)' }}>Attendees:</span> {success.participants.map(p=>p.email).join(', ')}</div>}
              </div>
              {success.meet_link ? (
                <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  <Video size={14} color="var(--orange)" style={{ flexShrink:0 }} />
                  <span style={{ fontSize:12, color:'var(--orange)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{success.meet_link}</span>
                  <button onClick={copyMeetLink} style={{ flexShrink:0, padding:'4px 10px', borderRadius:5, border:'1px solid var(--orange)', background:'rgba(37,99,235,0.08)', color:'var(--orange)', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                    {copied?'Copied!':'Copy Link'}
                  </button>
                </div>
              ) : eventType==='in_person' && address.trim() ? (
                <div style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'flex-start', gap:10 }}>
                  <MapPin size={14} color="var(--orange)" style={{ flexShrink:0, marginTop:2 }} />
                  <span style={{ fontSize:12, color:'var(--text)', lineHeight:1.5 }}>{address.trim()}</span>
                </div>
              ) : <div style={{ fontSize:12, color:'var(--muted)' }}>No Meet link attached.</div>}
              <button onClick={onClose} style={{ alignSelf:'flex-end', padding:'8px 20px', borderRadius:8, background:'linear-gradient(135deg,var(--orange),#2563eb)', border:'none', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>Done</button>
            </div>
          ) : step === 'type' ? (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ fontSize:13.5, color:'var(--muted)' }}>What kind of event is this?</div>
              {[
                { k:'online', icon:<Video size={22} />, t:'Online meeting', d:'Video call with a Google Meet link added automatically.' },
                { k:'in_person', icon:<MapPin size={22} />, t:'In-person meeting', d:'Meet at a physical location. Pick the address with autocomplete.' },
              ].map(o => (
                <button key={o.k} onClick={() => { setEventType(o.k); setAddMeetLink(o.k==='online'); setStep('form'); }}
                  style={{ display:'flex', alignItems:'center', gap:14, textAlign:'left', padding:'18px 18px', borderRadius:12, cursor:'pointer',
                    border:'1.5px solid var(--border)', background:'var(--surface-2)', color:'var(--text)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor='var(--orange)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; }}>
                  <div style={{ width:44, height:44, borderRadius:11, background:'rgba(37,99,235,0.10)', color:'var(--orange)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{o.icon}</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:700 }}>{o.t}</div>
                    <div style={{ fontSize:12.5, color:'var(--muted)', marginTop:2 }}>{o.d}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 13px', fontSize:13, color:'#ef4444' }}>{error}</div>}

              {pickType && (
                <button onClick={() => setStep('type')} style={{ alignSelf:'flex-start', display:'flex', alignItems:'center', gap:5, background:'none', border:'none', cursor:'pointer', color:'var(--muted)', fontSize:12, fontWeight:600, padding:0 }}>
                  <ArrowLeft size={13} /> {eventType==='in_person' ? 'In-person meeting' : 'Online meeting'} · change type
                </button>
              )}

              {/* Title */}
              <div>
                <label style={labelStyle}>Meeting Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="VernonTM 30 Minute Call w/" style={inputStyle} autoFocus />
              </div>


              {/* When: Available slots / Custom time / Instant */}
              <div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
                  <div style={{ display:'inline-flex', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                    {[{ k:'available', l:'Available' }, { k:'custom', l:'Custom' }, { k:'instant', l:'⚡ Instant' }].map(o => (
                      <button key={o.k} onClick={() => { setTimeMode(o.k); setError(''); setAvailStatus(null); }}
                        style={{ padding:'7px 14px', fontSize:12.5, fontWeight:700, cursor:'pointer', border:'none',
                          background: timeMode===o.k ? 'var(--orange)' : 'var(--surface-2)',
                          color: timeMode===o.k ? '#fff' : 'var(--muted)' }}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns: timeMode==='custom' ? '1fr 1fr 1fr' : '2fr 1fr', gap:12 }}>
                  {timeMode==='available' && (
                    <div>
                      <label style={labelStyle}>Available times (CT)</label>
                      <select value={selectedSlot} onChange={e => pickSlot(e.target.value)} style={inputStyle}>
                        <option value="">{slotsLoading ? 'Finding open times…' : slots.length ? 'Choose a time…' : 'No open slots in the next 2 weeks'}</option>
                        {slots.map(s => <option key={s} value={String(s)}>{fmtSlot(s)}</option>)}
                      </select>
                    </div>
                  )}
                  {timeMode==='custom' && (
                    <>
                      <div>
                        <label style={labelStyle}>Date *</label>
                        <input type="date" value={date} onChange={e => { setDate(e.target.value); setAvailStatus(null); }} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Time *</label>
                        <input type="time" value={time} onChange={e => { setTime(e.target.value); setAvailStatus(null); }} style={inputStyle} />
                      </div>
                    </>
                  )}
                  {timeMode==='instant' && (
                    <div>
                      <label style={labelStyle}>Starts now (CT)</label>
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', borderRadius:8, border:'1px solid rgba(37,99,235,0.3)', background:'rgba(37,99,235,0.06)', fontSize:13, fontWeight:600, color:'var(--orange)' }}>
                        ⚡ Meeting starts now
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={labelStyle}>Length</label>
                    <select value={duration} onChange={e => { setDuration(Number(e.target.value)); setAvailStatus(null); setSelectedSlot(''); }} style={inputStyle}>
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>1 hour</option>
                      <option value={90}>1.5 hours</option>
                    </select>
                  </div>
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, background:'#eff5ff', border:'1px solid rgba(37,99,235,0.25)', marginTop:10 }}>
                  <Clock size={13} color="var(--orange)" style={{ flexShrink:0 }} />
                  <span style={{ fontSize:12, color:'#1e40af', fontWeight:500 }}>
                    {timeMode==='available' && 'These times come straight from your calendar: meetings, class, and out-of-office blocks are already excluded. Weekdays 9 AM to 6 PM Central.'}
                    {timeMode==='custom' && 'Books the exact time you pick (Central Time). Make sure the slot is actually free.'}
                    {timeMode==='instant' && `Creates the meeting right now${eventType!=='in_person' ? ' and generates the Meet link immediately, so you can start the call this minute' : ''}.`}
                  </span>
                </div>
              </div>

              {/* Attendees with contact search */}
              <div ref={attendeeRef}>
                <label style={{ ...labelStyle, display:'flex', alignItems:'center', gap:6 }}>
                  <Users size={13} color="#8e8ea0" /> Attendees
                </label>
                <div style={{ position:'relative' }}>
                  <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                    <div style={{ flex:1, position:'relative' }}>
                      <input value={attendeeInput}
                        onChange={e => { setAttendeeInput(e.target.value); setShowContactDropdown(true); }}
                        onFocus={() => setShowContactDropdown(true)}
                        onKeyDown={e => { if(e.key==='Enter') { e.preventDefault(); addAttendee(); } }}
                        placeholder="Search contacts or type email..."
                        style={inputStyle} />
                      {showContactDropdown && contactResults.length>0 && (
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:4, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:100, maxHeight:220, overflow:'auto' }}>
                          {contactResults.filter(c => !attendees.some(a=>a.email===c.email.toLowerCase())).slice(0,6).map((c,i) => (
                            <div key={c.email+i} onClick={() => selectContact(c)}
                              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', borderBottom:i<5?'1px solid #f0f2f8':'none' }}
                              onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}>
                              <div style={{ width:26, height:26, borderRadius:'50%', background:c._source==='lead'?'#f5a623':c._source==='gmail'?'#22c55e':'var(--orange)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                {(c.name||c.email)[0].toUpperCase()}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name||c.email}</div>
                                <div style={{ fontSize:10, color:'var(--muted)' }}>{c.email}</div>
                              </div>
                              <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, fontWeight:600, background:c._source==='lead'?'#f5a62310':c._source==='gmail'?'#22c55e10':'rgba(37,99,235,0.08)', color:c._source==='lead'?'#f5a623':c._source==='gmail'?'#22c55e':'var(--orange)' }}>
                                {c._source==='lead'?'Lead':c._source==='gmail'?'Gmail':'CRM'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => addAttendee()} style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'0 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer', fontSize:12, fontWeight:500 }}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {attendees.length>0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {attendees.map(att => (
                        <div key={att.email} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 8px 4px 6px', borderRadius:20, background:'rgba(37,99,235,0.08)', border:'1px solid var(--orange)30' }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:'var(--orange)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {(att.name||att.email)[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize:11, color:'var(--text)', fontWeight:500 }}>{att.name||att.email}</span>
                          <button onClick={() => removeAttendee(att.email)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', display:'flex', padding:'0 0 0 2px' }}><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {attendees.length>0 && (
                    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                      <button onClick={handleCheckAvailability} disabled={checkingAvail||!date||!time}
                        style={{ fontSize:11, padding:'5px 12px', display:'flex', alignItems:'center', gap:5, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', cursor:'pointer', fontWeight:500 }}>
                        {checkingAvail ? <Loader size={11} style={{ animation:'spin 0.7s linear infinite' }} /> : <Clock size={11} />}
                        Check Availability
                      </button>
                      {availStatus && (
                        <span style={{ fontSize:11, color:availStatus.allFree?'#22c55e':'#2563eb', fontWeight:600 }}>
                          {availStatus.allFree ? '✓ All free' : `✗ ${availStatus.busy.length} conflict${availStatus.busy.length>1?'s':''}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Private notes / agenda — internal to the CRM, NOT synced to Google Calendar. */}
              <div>
                <label style={labelStyle}>Private notes / agenda 🔒</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What you want to remember about this call, agenda points, questions to ask… (only visible to you inside the CRM)" rows={4}
                  style={{ ...inputStyle, resize:'vertical', minHeight:80, lineHeight:1.6 }} />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                  This won't be sent to attendees or added to the Google Calendar event — it stays private to the CRM.
                </div>
              </div>

              {/* Reminder + Meet link */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={labelStyle}>Reminder</label>
                  <select value={reminder} onChange={e => setReminder(Number(e.target.value))} style={inputStyle}>
                    <option value={10}>10 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                  </select>
                </div>
                {eventType==='in_person' ? (
                <div ref={addressBoxRef}>
                  <label style={{ ...labelStyle, display:'flex', alignItems:'center', gap:6 }}><MapPin size={13} color="#8e8ea0" /> Location *</label>
                  <div style={{ position:'relative' }}>
                    <input value={address} onChange={e => onAddressInput(e.target.value)} onFocus={() => address.trim().length>=3 && setAddressOpen(true)}
                      placeholder="Start typing the address…" style={inputStyle} />
                    {addressOpen && (addressLoading || addressResults.length>0) && (
                      <div style={{ position:'absolute', bottom:'100%', left:0, right:0, marginBottom:4, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.18)', zIndex:110, maxHeight:220, overflow:'auto' }}>
                        {addressLoading && <div style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:8 }}><Loader size={12} style={{ animation:'spin 0.7s linear infinite' }} /> Searching…</div>}
                        {!addressLoading && addressResults.map((a,i) => (
                          <div key={i} onClick={() => { setAddress(a); setAddressOpen(false); }}
                            style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'9px 14px', cursor:'pointer', fontSize:12.5, color:'var(--text)', borderBottom:i<addressResults.length-1?'1px solid var(--border)':'none', lineHeight:1.4 }}
                            onMouseEnter={e => e.currentTarget.style.background='var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background='var(--surface)'}>
                            <MapPin size={13} style={{ flexShrink:0, marginTop:2, color:'var(--orange)' }} /> {a}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                ) : (
                <div>
                  <label style={labelStyle}>Google Meet Link</label>
                  <div onClick={() => setAddMeetLink(v=>!v)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:`1px solid ${addMeetLink?'rgba(37,99,235,0.2)':'#e5e7ef'}`, background:addMeetLink?'rgba(37,99,235,0.05)':'transparent', cursor:'pointer' }}>
                    <div style={{ width:32, height:18, borderRadius:9, background:addMeetLink?'var(--orange)':'#d0d0d8', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:3, left:addMeetLink?15:3, width:12, height:12, borderRadius:'50%', background:'var(--surface)', transition:'left 0.18s' }} />
                    </div>
                    <Video size={13} color={addMeetLink?'var(--orange)':'#8e8ea0'} />
                    <span style={{ fontSize:12, color:addMeetLink?'var(--orange)':'#8e8ea0' }}>
                      {addMeetLink?'Will be added':'No Meet link'}
                    </span>
                  </div>
                </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && step !== 'type' && (
          <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end', gap:10, flexShrink:0 }}>
            <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--muted)', fontSize:13, fontWeight:500, cursor:'pointer' }}>Cancel</button>
            <button onClick={handleSchedule} disabled={saving}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 20px', borderRadius:8, background:'linear-gradient(135deg,var(--orange),#2563eb)', border:'none', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? <Loader size={14} style={{ animation:'spin 0.7s linear infinite' }} /> : <Calendar size={14} />}
              {saving ? 'Scheduling…' : timeMode==='instant' ? (eventType==='in_person' ? 'Start now' : 'Start now + create Meet') : 'Schedule Meeting'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
