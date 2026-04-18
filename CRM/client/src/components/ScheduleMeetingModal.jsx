import React, { useState, useEffect, useRef } from 'react';
import { Calendar, X, Plus, Check, Loader, Video, Clock, Users, Search } from 'lucide-react';
import { createMeeting, checkMeetingAvailability, getContacts, getLeads, getGmailContacts, getCommLog } from '../api';
import { copyToClipboard } from '../lib/clipboard';

export default function ScheduleMeetingModal({ onClose, onComplete, initialTitle, initialAttendees, initialLeadName }) {
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
    if (!date||!time) { setError('Date and time are required.'); return; }
    const startISO = buildStartISO(); const endISO = buildEndISO(startISO);
    setSaving(true); setError('');
    try {
      const result = await createMeeting({ summary:title.trim(), start:startISO, end:endISO, attendees:attendees.map(a=>a.email), description:description.trim(), addMeetLink, reminderMinutes:reminder });
      setSuccess(result); if(onComplete) onComplete(result);
    } catch(e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function copyMeetLink() {
    if (!success?.meet_link) return;
    await copyToClipboard(success.meet_link);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, fontSize:13, background:'#f5f7fa', border:'1px solid #e5e7ef', color:'#1a1a2e', outline:'none', boxSizing:'border-box' };
  const labelStyle = { fontSize:12, fontWeight:600, color:'#8e8ea0', marginBottom:4, display:'block' };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:8000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:'#fff', borderRadius:14, width:560, maxWidth:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #e5e7ef', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,#4a6cf7,#6e8efb)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Calendar size={16} color="#fff" />
            </div>
            <span style={{ fontSize:16, fontWeight:700, color:'#1a1a2e' }}>Schedule Meeting</span>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#8e8ea0', display:'flex' }}><X size={18} /></button>
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
                  <div style={{ fontSize:12, color:'#8e8ea0' }}>{success.title}</div>
                </div>
              </div>
              <div style={{ fontSize:13, color:'#1a1a2e', lineHeight:1.6 }}>
                <div><span style={{ color:'#8e8ea0' }}>Start:</span> {new Date(success.start_time).toLocaleString()}</div>
                <div><span style={{ color:'#8e8ea0' }}>Duration:</span> {duration}m</div>
                {success.participants?.length>0 && <div><span style={{ color:'#8e8ea0' }}>Attendees:</span> {success.participants.map(p=>p.email).join(', ')}</div>}
              </div>
              {success.meet_link ? (
                <div style={{ background:'#f5f7fa', border:'1px solid #e5e7ef', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  <Video size={14} color="#4a6cf7" style={{ flexShrink:0 }} />
                  <span style={{ fontSize:12, color:'#4a6cf7', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{success.meet_link}</span>
                  <button onClick={copyMeetLink} style={{ flexShrink:0, padding:'4px 10px', borderRadius:5, border:'1px solid #4a6cf7', background:'#4a6cf710', color:'#4a6cf7', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                    {copied?'Copied!':'Copy Link'}
                  </button>
                </div>
              ) : <div style={{ fontSize:12, color:'#8e8ea0' }}>No Meet link attached.</div>}
              <button onClick={onClose} style={{ alignSelf:'flex-end', padding:'8px 20px', borderRadius:8, background:'linear-gradient(135deg,#4a6cf7,#6e8efb)', border:'none', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>Done</button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 13px', fontSize:13, color:'#ef4444' }}>{error}</div>}

              {/* Title */}
              <div>
                <label style={labelStyle}>Meeting Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="VernonTM 30 Minute Call w/" style={inputStyle} autoFocus />
              </div>

              {/* Date + Time + Duration */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input type="date" value={date} onChange={e => { setDate(e.target.value); setAvailStatus(null); }} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Time *</label>
                  <input type="time" value={time} onChange={e => { setTime(e.target.value); setAvailStatus(null); }} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Duration</label>
                  <select value={duration} onChange={e => { setDuration(Number(e.target.value)); setAvailStatus(null); }} style={inputStyle}>
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                  </select>
                </div>
              </div>

              {/* CST timezone warning */}
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, background:'#fef3c7', border:'1px solid #fde68a' }}>
                <Clock size={13} color="#d97706" style={{ flexShrink:0 }} />
                <span style={{ fontSize:12, color:'#92400e', fontWeight:500 }}>
                  All calls are scheduled in <strong>Central Standard Time (CST)</strong>. Make sure the time above reflects CST.
                </span>
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
                        <div style={{ position:'absolute', top:'100%', left:0, right:0, marginTop:4, background:'#fff', border:'1px solid #e5e7ef', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:100, maxHeight:220, overflow:'auto' }}>
                          {contactResults.filter(c => !attendees.some(a=>a.email===c.email.toLowerCase())).slice(0,6).map((c,i) => (
                            <div key={c.email+i} onClick={() => selectContact(c)}
                              style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', cursor:'pointer', borderBottom:i<5?'1px solid #f0f2f8':'none' }}
                              onMouseEnter={e => e.currentTarget.style.background='#f8f9fc'} onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                              <div style={{ width:26, height:26, borderRadius:'50%', background:c._source==='lead'?'#f5a623':c._source==='gmail'?'#22c55e':'#4a6cf7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                {(c.name||c.email)[0].toUpperCase()}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:'#1a1a2e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name||c.email}</div>
                                <div style={{ fontSize:10, color:'#8e8ea0' }}>{c.email}</div>
                              </div>
                              <span style={{ fontSize:9, padding:'2px 5px', borderRadius:4, fontWeight:600, background:c._source==='lead'?'#f5a62310':c._source==='gmail'?'#22c55e10':'#4a6cf710', color:c._source==='lead'?'#f5a623':c._source==='gmail'?'#22c55e':'#4a6cf7' }}>
                                {c._source==='lead'?'Lead':c._source==='gmail'?'Gmail':'CRM'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => addAttendee()} style={{ flexShrink:0, display:'flex', alignItems:'center', gap:4, padding:'0 14px', borderRadius:8, border:'1px solid #e5e7ef', background:'#fff', color:'#8e8ea0', cursor:'pointer', fontSize:12, fontWeight:500 }}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {attendees.length>0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                      {attendees.map(att => (
                        <div key={att.email} style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 8px 4px 6px', borderRadius:20, background:'#4a6cf710', border:'1px solid #4a6cf730' }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:'#4a6cf7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {(att.name||att.email)[0].toUpperCase()}
                          </div>
                          <span style={{ fontSize:11, color:'#1a1a2e', fontWeight:500 }}>{att.name||att.email}</span>
                          <button onClick={() => removeAttendee(att.email)} style={{ background:'none', border:'none', cursor:'pointer', color:'#8e8ea0', display:'flex', padding:'0 0 0 2px' }}><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {attendees.length>0 && (
                    <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                      <button onClick={handleCheckAvailability} disabled={checkingAvail||!date||!time}
                        style={{ fontSize:11, padding:'5px 12px', display:'flex', alignItems:'center', gap:5, borderRadius:6, border:'1px solid #e5e7ef', background:'#fff', color:'#8e8ea0', cursor:'pointer', fontWeight:500 }}>
                        {checkingAvail ? <Loader size={11} style={{ animation:'spin 0.7s linear infinite' }} /> : <Clock size={11} />}
                        Check Availability
                      </button>
                      {availStatus && (
                        <span style={{ fontSize:11, color:availStatus.allFree?'#22c55e':'#ef4444', fontWeight:600 }}>
                          {availStatus.allFree ? '✓ All free' : `✗ ${availStatus.busy.length} conflict${availStatus.busy.length>1?'s':''}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={labelStyle}>Description / Agenda</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Agenda or notes..." rows={4}
                  style={{ ...inputStyle, resize:'vertical', minHeight:80, lineHeight:1.6 }} />
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
                <div>
                  <label style={labelStyle}>Google Meet Link</label>
                  <div onClick={() => setAddMeetLink(v=>!v)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:`1px solid ${addMeetLink?'#4a6cf730':'#e5e7ef'}`, background:addMeetLink?'#4a6cf708':'transparent', cursor:'pointer' }}>
                    <div style={{ width:32, height:18, borderRadius:9, background:addMeetLink?'#4a6cf7':'#d0d0d8', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                      <div style={{ position:'absolute', top:3, left:addMeetLink?15:3, width:12, height:12, borderRadius:'50%', background:'#fff', transition:'left 0.18s' }} />
                    </div>
                    <Video size={13} color={addMeetLink?'#4a6cf7':'#8e8ea0'} />
                    <span style={{ fontSize:12, color:addMeetLink?'#4a6cf7':'#8e8ea0' }}>
                      {addMeetLink?'Will be added':'No Meet link'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div style={{ padding:'14px 20px', borderTop:'1px solid #e5e7ef', display:'flex', justifyContent:'flex-end', gap:10, flexShrink:0 }}>
            <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e5e7ef', background:'#fff', color:'#8e8ea0', fontSize:13, fontWeight:500, cursor:'pointer' }}>Cancel</button>
            <button onClick={handleSchedule} disabled={saving}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 20px', borderRadius:8, background:'linear-gradient(135deg,#4a6cf7,#6e8efb)', border:'none', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? <Loader size={14} style={{ animation:'spin 0.7s linear infinite' }} /> : <Calendar size={14} />}
              {saving ? 'Scheduling…' : 'Schedule Meeting'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
