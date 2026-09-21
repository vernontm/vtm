import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Users, Search, RefreshCw, Mail, AlertCircle, Send, X, AlertTriangle,
  Repeat, Clock, Plus, Pencil, Trash2, ChevronLeft, BarChart2, Link2, Paperclip,
  PlayCircle, GraduationCap,
} from 'lucide-react';
import { useClient } from '../context/ClientContext';
import { toast } from '../components/Toast';
import Drawer from '../components/Drawer';
import {
  getMailerliteGroups, getMailerliteSubscribers,
  getCampaignDefaults, sendMailerliteCampaign, deleteMailerliteCampaign, rescheduleMailerliteCampaign,
  createMailerliteGroup, updateMailerliteSubscriber, uploadFile,
  getEmailAutomations, createEmailAutomation, updateEmailAutomation, deleteEmailAutomation,
} from '../api';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmtHour = (h) => new Date(2000, 0, 1, h || 0).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });

// Marketing > Contacts = the live MailerLite audience for the current workspace
// (groups on the left, subscribers on the right). This is the marketing list,
// distinct from Leads (the sales pipeline).

const STATUS = {
  active:       { label: 'Active',       color: '#16a34a' },
  unsubscribed: { label: 'Unsubscribed', color: '#8a8a8a' },
  unconfirmed:  { label: 'Unconfirmed',  color: '#f5a623' },
  bounced:      { label: 'Bounced',      color: '#dc2626' },
  junk:         { label: 'Junk',         color: '#dc2626' },
};
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return '—'; } };

const rail = (active) => ({
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
  fontFamily: 'var(--font-display)', fontWeight: active ? 700 : 500,
  background: active ? 'rgba(37,99,235,0.10)' : 'transparent',
  color: active ? 'var(--text)' : 'var(--muted)',
  borderLeft: `3px solid ${active ? 'var(--orange)' : 'transparent'}`,
});

// Shared "insert link / upload file" control for the message composers. Uploads
// to Supabase and inserts a [text](url) markdown link at the cursor, which the
// send path turns into a real hyperlink with custom clickable text.
const LINK_TUTORIAL_URL = 'https://ssllepovajmohdhvhzsa.supabase.co/storage/v1/object/public/blog-media/tutorials/email-blast-attach-links.mp4';
const LINK_TUTORIAL_KEY = 'vtm.crm.linkTutorialSeen';

function LinkInserter({ body, setBody, bodyRef, field }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tut, setTut] = useState(false);          // tutorial modal open
  const [dontShow, setDontShow] = useState(false); // "don't show again" checkbox

  // Clicking the button shows the tutorial first (unless they opted out), then
  // the insert form. "Got it" advances to the form.
  const openInserter = () => {
    if (open) { setOpen(false); return; }
    let seen = false;
    try { seen = localStorage.getItem(LINK_TUTORIAL_KEY) === '1'; } catch {}
    if (seen) setOpen(true); else setTut(true);
  };
  const gotIt = () => {
    if (dontShow) { try { localStorage.setItem(LINK_TUTORIAL_KEY, '1'); } catch {} }
    setTut(false); setOpen(true);
  };
  const insertAtCursor = (snippet) => {
    const ta = bodyRef?.current;
    // Functional update so we always splice into the LATEST body (never a stale
    // closure). When the textarea has no caret (0/0 because the user was typing
    // in the popover fields, so it was never focused), append to the end instead
    // of jamming the link before their text where it can be lost.
    setBody(prev => {
      const cur = prev ?? '';
      let start = ta && typeof ta.selectionStart === 'number' ? ta.selectionStart : cur.length;
      let end   = ta && typeof ta.selectionEnd === 'number' ? ta.selectionEnd : cur.length;
      if (start === 0 && end === 0 && cur.length) { start = end = cur.length; }
      const pad = start > 0 && !/\s$/.test(cur.slice(0, start)) ? ' ' : '';
      const ins = pad + snippet;
      const next = cur.slice(0, start) + ins + cur.slice(end);
      const p = start + ins.length;
      requestAnimationFrame(() => { if (ta) { ta.focus(); try { ta.setSelectionRange(p, p); } catch {} } });
      return next;
    });
  };
  const onPick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    setUploading(true);
    try { const { url: u } = await uploadFile(f); setUrl(u); if (!text.trim()) setText(f.name.replace(/\.[^.]+$/, '')); }
    catch (err) { toast('error', err.message || 'Upload failed'); }
    finally { setUploading(false); }
  };
  const insert = () => {
    const u = url.trim(); if (!u) return;
    const label = text.trim() || u;
    insertAtCursor(`[${label}](${u})`);
    setOpen(false); setUrl(''); setText('');
    toast('success', `Link "${label}" added to your message.`);
  };
  return (
    <>
      <button type="button" onClick={openInserter}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: open ? 'var(--surface-3)' : 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: 'var(--orange)', fontSize: 12, fontWeight: 700 }}>
        <Link2 size={13} /> Insert link / file
      </button>

      {tut && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 760, maxWidth: '94vw', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.5)', fontFamily: 'var(--font-display)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <GraduationCap size={17} style={{ color: 'var(--orange)' }} />
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>How to attach a link or file</span>
              <button type="button" onClick={() => setTut(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>A quick walkthrough. Watch it, then hit “Got it” to add your link.</div>
              <video src={LINK_TUTORIAL_URL} controls autoPlay playsInline style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: '60vh', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} /> Don’t show this again
              </label>
              <button type="button" className="btn-primary" onClick={gotIt} style={{ marginLeft: 'auto' }}>Got it</button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, margin: '6px 0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" onClick={() => setTut(true)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--orange)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0 }}>
            <PlayCircle size={13} /> Watch tutorial
          </button>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Link text (what people click, e.g. Download the guide)" style={{ ...field }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="Paste a URL, or upload a file →" style={{ ...field, flex: 1 }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', cursor: uploading ? 'default' : 'pointer', color: 'var(--text)', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
              <Paperclip size={13} /> {uploading ? 'Uploading…' : 'Upload file'}
              <input type="file" hidden disabled={uploading} onChange={onPick} />
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="btn-primary" disabled={!url.trim()} onClick={insert} style={{ padding: '7px 14px', fontSize: 12.5 }}>Insert link</button>
            <button type="button" onClick={() => { setOpen(false); setUrl(''); setText(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12.5 }}>Cancel</button>
            {url.trim() && <span style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {url}</span>}
          </div>
        </div>
      )}
    </>
  );
}

// ── Email blast composer (MailerLite regular campaign) ──────────────────────
const DRAFT_KEY = 'vtm.crm.blastDraft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } };
const fmtWhen = (d) => { if (!d) return ''; try { return new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

function ComposeBlast({ clientId, groups, initialGroupId, onClose, onSent }) {
  const draft = loadDraft();
  const [step, setStep]         = useState('compose');   // compose | confirm | sending
  const [groupId, setGroupId]   = useState(draft.groupId || initialGroupId || groups[0]?.id || '');
  const [subject, setSubject]   = useState(draft.subject || '');
  const [fromName, setFromName] = useState(draft.fromName || '');
  const [fromEmail, setFromEmail] = useState(draft.fromEmail || '');
  const [body, setBody]         = useState(draft.body || '');
  const [testEmail, setTestEmail] = useState(draft.fromEmail || '');
  const [testing, setTesting]   = useState(false);
  const [recent, setRecent]     = useState([]);
  const [savedNote, setSavedNote] = useState(false);
  // Scheduling: 'now' sends immediately, 'later' waits for scheduledAt.
  const [sendMode, setSendMode] = useState(draft.sendMode || 'now'); // 'now' | 'later'
  const [scheduledAt, setScheduledAt] = useState(draft.scheduledAt || '');

  const bodyRef = useRef(null);

  useEffect(() => {
    getCampaignDefaults(clientId)
      .then(d => {
        // Only fall back to config defaults when the draft didn't already have them.
        if (!draft.fromName)  setFromName(d.from_name || '');
        if (!draft.fromEmail) { setFromEmail(d.from_email || ''); setTestEmail(d.from_email || ''); }
        setRecent(d.recent || []);
      })
      .catch(() => {});
  }, [clientId]);

  // Persist the draft as they type so closing the composer never loses work.
  useEffect(() => {
    const empty = !subject.trim() && !body.trim();
    if (empty) { localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ groupId, subject, fromName, fromEmail, body, sendMode, scheduledAt }));
    setSavedNote(true);
    const t = setTimeout(() => setSavedNote(false), 1200);
    return () => clearTimeout(t);
  }, [groupId, subject, fromName, fromEmail, body, sendMode, scheduledAt]);

  const canCompose = subject.trim() && fromEmail.trim() && body.trim();

  // Guardrail: "Review & send" only unlocks after a test of the CURRENT content.
  // A signature of the message (sender + subject + body) — if any of it changes
  // after a test, the signature no longer matches and a fresh test is required.
  const contentSig = JSON.stringify({ n: fromName.trim(), e: fromEmail.trim(), s: subject.trim(), b: body });
  const [testedSig, setTestedSig] = useState(null);
  const testedOk = testedSig !== null && testedSig === contentSig;
  const testedStale = testedSig !== null && testedSig !== contentSig;

  async function sendTest() {
    if (!testEmail.trim()) { toast('error', 'Enter a test email address'); return; }
    const sig = contentSig;
    setTesting(true);
    try {
      await sendMailerliteCampaign({
        client_id: clientId, subject: subject.trim(),
        from_name: fromName.trim(), from_email: fromEmail.trim(), body,
        test_email: testEmail.trim(),
      });
      setTestedSig(sig);   // this exact content is now cleared to send
      toast('success', `Test sent to ${testEmail.trim()}. Review it, then you can send to the group.`);
    } catch (e) {
      toast('error', e.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  const sendAll = groupId === 'all';
  const group = groups.find(g => String(g.id) === String(groupId));
  // "All" count is a best-effort sum (may over-count subscribers in multiple
  // groups; MailerLite dedupes at send time so the real send is <= this).
  const allCount = groups.reduce((s, g) => s + (g.total || g.active || 0), 0);
  const count = sendAll ? allCount : (group ? (group.total || group.active || 0) : 0);
  const groupLabel = sendAll ? 'All contacts (every group)' : (group?.name || 'the group');

  const canProceed = (group || sendAll) && canCompose && testedOk;

  // Convert the datetime-local value ("YYYY-MM-DDTHH:mm") to a UTC ISO string.
  const scheduledISO = sendMode === 'later' && scheduledAt ? new Date(scheduledAt).toISOString() : null;
  const scheduleValid = sendMode === 'now' || (scheduledISO && new Date(scheduledISO).getTime() > Date.now() + 60_000);

  async function send() {
    setStep('sending');
    try {
      const res = await sendMailerliteCampaign({
        client_id: clientId, group_id: groupId,
        subject: subject.trim(), from_name: fromName.trim(), from_email: fromEmail.trim(), body,
        scheduled_at: scheduledISO,
      });
      if (res?.scheduled) {
        toast('success', `Scheduled for ${new Date(res.scheduled_at).toLocaleString()} — will send to ${groupLabel} (${count.toLocaleString()} contacts).`);
      } else {
        toast('success', `Blast sent to ${groupLabel} (${count.toLocaleString()} contacts).`);
      }
      localStorage.removeItem(DRAFT_KEY);
      onSent?.();
      onClose();
    } catch (e) {
      toast('error', e.message || 'Failed to send');
      setStep('compose');
    }
  }

  const field = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-display)' };
  const label = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 560, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Send size={16} style={{ color: 'var(--orange)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Email blast</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {savedNote && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Draft saved</span>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
          </div>
        </div>

        {step === 'confirm' ? (
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', gap: 12, background: 'rgba(245,166,35,0.10)', border: '1px solid rgba(245,166,35,0.35)', borderRadius: 10, padding: 16 }}>
              <AlertTriangle size={20} style={{ color: '#f5a623', flexShrink: 0 }} />
              <div style={{ fontSize: 13.5, color: 'var(--text)', lineHeight: 1.5 }}>
                {sendMode === 'later' && scheduledISO ? (
                  <>This will email <b>{count.toLocaleString()}</b> contact{count !== 1 ? 's' : ''} in <b>{groupLabel}</b> on <b>{new Date(scheduledISO).toLocaleString()}</b>, from <b>{fromEmail}</b>.</>
                ) : (
                  <>This will email <b>{count.toLocaleString()}</b> contact{count !== 1 ? 's' : ''} in <b>{groupLabel}</b> right now, from <b>{fromEmail}</b>.</>
                )}
                <div style={{ marginTop: 8, color: 'var(--muted)' }}>Subject: “{subject}”</div>
                <div style={{ marginTop: 6, color: 'var(--muted)' }}>{sendMode === 'later' ? 'You can cancel a scheduled blast from the Campaigns tab before it goes out.' : 'Sending a blast can\'t be undone.'} Continue?</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setStep('compose')}>Back</button>
              <button className="btn-primary" onClick={send} style={{ background: sendMode === 'later' ? 'var(--orange)' : '#dc2626', borderColor: sendMode === 'later' ? 'var(--orange)' : '#dc2626' }}>
                <Send size={13} /> {sendMode === 'later' ? 'Schedule' : 'Send to ' + count.toLocaleString()}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={label}>Send to group</label>
                <select value={groupId} onChange={e => setGroupId(e.target.value)} style={field}>
                  <option value="all">📢 All contacts — every group ({allCount.toLocaleString()})</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({(g.total || g.active || 0).toLocaleString()})</option>)}
                </select>
              </div>
              <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={label}>From name</label><input value={fromName} onChange={e => setFromName(e.target.value)} style={field} placeholder="Vernon Tech & Media" /></div>
                <div><label style={label}>From email</label><input value={fromEmail} onChange={e => setFromEmail(e.target.value)} style={field} placeholder="you@domain.com" /></div>
              </div>
              <div><label style={label}>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder="Subject line" /></div>
              {/* Send timing */}
              <div>
                <label style={label}>When to send</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: sendMode === 'later' ? 8 : 0 }}>
                  {[
                    { k: 'now',   label: 'Send now'      },
                    { k: 'later', label: 'Schedule for…' },
                  ].map(o => {
                    const on = sendMode === o.k;
                    return (
                      <button key={o.k} type="button" onClick={() => setSendMode(o.k)}
                        style={{ flex: 1, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                          border: `1.5px solid ${on ? 'var(--orange)' : 'var(--border)'}`,
                          background: on ? 'rgba(255,155,38,0.12)' : 'var(--surface-2)',
                          color: on ? 'var(--orange)' : 'var(--muted)' }}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                {sendMode === 'later' && (
                  <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
                    min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
                    style={{ ...field, marginTop: 4 }} />
                )}
              </div>
              <div>
                <label style={label}>Message</label>
                <div style={{ margin: '5px 0 7px' }}>
                  <LinkInserter body={body} setBody={setBody} bodyRef={bodyRef} field={field} />
                </div>
                <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={9} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} placeholder={'Hello, everyone.\n\nWrite your message here…'} />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Plain text is fine. Links show as <code>[your text](link)</code> and become clickable in the email. An unsubscribe link is added automatically.</div>
              </div>

              {recent.length > 0 && (
                <div>
                  <div style={label}>Recent blasts</div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                    {recent.map((r, i) => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{fmtWhen(r.date)}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, fontSize: 11, color: 'var(--muted)' }}>
                          <div><b style={{ color: 'var(--text)' }}>{(r.recipients || 0).toLocaleString()}</b> sent</div>
                          <div>{(r.opens || 0).toLocaleString()} opens</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Test-first row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Test to</span>
              <input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="you@domain.com"
                style={{ flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', color: 'var(--text)', fontSize: 12.5, fontFamily: 'var(--font-display)' }} />
              <button className="btn-ghost" disabled={!canCompose || testing} onClick={sendTest} style={{ whiteSpace: 'nowrap' }}>
                <Send size={12} /> {testing ? 'Sending…' : 'Send test'}
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                {testedOk ? (
                  <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ Test sent — cleared to send</span>
                ) : testedStale ? (
                  <span style={{ color: '#dc2626', fontWeight: 600 }}>Message changed — send a new test</span>
                ) : (
                  <span style={{ color: 'var(--muted)' }}>Send a test first to unlock sending</span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn-primary" disabled={!canProceed || !scheduleValid || step === 'sending'}
                  title={!testedOk ? 'Send a test email first' : (!scheduleValid ? 'Pick a valid future time' : '')}
                  onClick={() => setStep('confirm')}>
                  <Send size={13} /> {sendMode === 'later' ? 'Review & schedule' : 'Review & send'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Recurring automation form ────────────────────────────────────────────────
function AutomationForm({ clientId, groups, initial, onCancel, onSaved }) {
  const [name, setName]         = useState(initial?.name || '');
  const [groupId, setGroupId]   = useState(initial?.group_id || groups[0]?.id || '');
  const [weekday, setWeekday]   = useState(initial?.weekday ?? 3);   // Wed
  const [sendHour, setSendHour] = useState(initial?.send_hour ?? 9);
  const [subject, setSubject]   = useState(initial?.subject || '');
  const [fromName, setFromName] = useState(initial?.from_name || '');
  const [fromEmail, setFromEmail] = useState(initial?.from_email || '');
  const [body, setBody]         = useState(initial?.body || '');
  const [saving, setSaving]     = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (!initial) getCampaignDefaults(clientId).then(d => { setFromName(d.from_name || ''); setFromEmail(d.from_email || ''); }).catch(() => {});
  }, [clientId]);

  const save = async () => {
    if (!name.trim() || !groupId || !subject.trim() || !fromEmail.trim() || !body.trim()) { toast('error', 'Fill in name, group, subject, from email, and message'); return; }
    setSaving(true);
    const payload = { client_id: clientId, name: name.trim(), group_id: groupId, subject: subject.trim(), from_name: fromName.trim(), from_email: fromEmail.trim(), body, weekday: Number(weekday), send_hour: Number(sendHour) };
    try { if (initial?.id) await updateEmailAutomation(initial.id, payload); else await createEmailAutomation(payload); onSaved(); }
    catch (e) { toast('error', e.message); setSaving(false); }
  };

  const field = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-display)' };
  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <button className="btn-ghost" onClick={onCancel} style={{ alignSelf: 'flex-start' }}><ChevronLeft size={14} /> Back</button>
      <div><label style={lbl}>Automation name</label><input value={name} onChange={e => setName(e.target.value)} style={field} placeholder="e.g. Wednesday Meetup Reminder" /></div>
      <div><label style={lbl}>Send to group</label>
        <select value={groupId} onChange={e => setGroupId(e.target.value)} style={field}>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({(g.total || g.active || 0).toLocaleString()})</option>)}
        </select>
      </div>
      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={lbl}>Every</label>
          <select value={weekday} onChange={e => setWeekday(Number(e.target.value))} style={field}>
            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <div><label style={lbl}>At</label>
          <select value={sendHour} onChange={e => setSendHour(Number(e.target.value))} style={field}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
          </select>
        </div>
      </div>
      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={lbl}>From name</label><input value={fromName} onChange={e => setFromName(e.target.value)} style={field} /></div>
        <div><label style={lbl}>From email</label><input value={fromEmail} onChange={e => setFromEmail(e.target.value)} style={field} /></div>
      </div>
      <div><label style={lbl}>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder="Subject line" /></div>
      <div><label style={lbl}>Message</label>
        <div style={{ margin: '0 0 7px' }}><LinkInserter body={body} setBody={setBody} bodyRef={bodyRef} field={field} /></div>
        <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)} rows={7} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} placeholder={'Hello, everyone.\n\nThis goes out automatically each week…'} />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Central time. Plain text is fine. Links show as <code>[your text](link)</code> and become clickable. An unsubscribe link is added automatically.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}><Repeat size={13} /> {saving ? 'Saving…' : (initial?.id ? 'Save changes' : 'Create automation')}</button>
      </div>
    </div>
  );
}

// ── Campaigns panel (sent / drafts / scheduled) ──────────────────────────────
function CampaignsPanel({ clientId, onClose, onCreate }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('sent'); // sent | scheduled | drafts

  const [busyId, setBusyId] = useState(null);
  const [rescheduleId, setRescheduleId] = useState(null);
  const [newWhen, setNewWhen] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getCampaignDefaults(clientId);
      setItems(Array.isArray(d.campaigns) ? d.campaigns : []);
    } catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (c) => {
    const label = c.status === 'draft' ? 'delete this draft' : 'cancel and delete this scheduled campaign';
    if (!window.confirm(`Are you sure you want to ${label}? This can't be undone.`)) return;
    setBusyId(c.id);
    try {
      await deleteMailerliteCampaign(clientId, c.id);
      setItems(prev => prev.filter(x => x.id !== c.id));
      toast('success', c.status === 'draft' ? 'Draft deleted.' : 'Scheduled campaign cancelled and deleted.');
    } catch (e) { toast('error', e.message || 'Delete failed'); }
    finally { setBusyId(null); }
  };

  const handleReschedule = async (c) => {
    if (!newWhen) { toast('error', 'Pick a new time first.'); return; }
    setBusyId(c.id);
    try {
      const res = await rescheduleMailerliteCampaign({ client_id: clientId, campaign_id: c.id, scheduled_at: new Date(newWhen).toISOString() });
      toast('success', `Rescheduled for ${new Date(res.scheduled_at).toLocaleString()}.`);
      setRescheduleId(null); setNewWhen('');
      await load();
    } catch (e) { toast('error', e.message || 'Reschedule failed'); }
    finally { setBusyId(null); }
  };

  const groups = useMemo(() => {
    const sent      = items.filter(c => c.status === 'sent');
    const scheduled = items.filter(c => ['ready', 'queued', 'scheduled'].includes(c.status));
    const drafts    = items.filter(c => c.status === 'draft');
    return { sent, scheduled, drafts };
  }, [items]);

  const list = groups[tab] || [];

  const tabs = [
    { k: 'sent',      label: 'Sent',      count: groups.sent.length },
    { k: 'scheduled', label: 'Outbox',    count: groups.scheduled.length },
    { k: 'drafts',    label: 'Drafts',    count: groups.drafts.length },
  ];

  const rowDate = (c) => c.status === 'sent' ? (c.sent_at || c.date) : (c.scheduled_for || c.date);
  const rowDateLabel = (c) => c.status === 'sent' ? `Sent ${fmtWhen(rowDate(c))}` : (c.status === 'draft' ? `Drafted ${fmtWhen(rowDate(c))}` : `Scheduled ${fmtWhen(rowDate(c))}`);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 820, maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart2 size={16} style={{ color: 'var(--orange)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Campaigns</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn-primary" onClick={() => { onClose(); onCreate?.(); }} style={{ background: '#16a34a', borderColor: '#16a34a' }}>
              <Plus size={13} /> Create campaign
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--border)' }}>
          {tabs.map(t => {
            const on = tab === t.k;
            return (
              <button key={t.k} onClick={() => setTab(t.k)}
                style={{ padding: '10px 14px', background: 'none', border: 'none', borderBottom: `2px solid ${on ? '#16a34a' : 'transparent'}`,
                  color: on ? 'var(--text)' : 'var(--muted)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6 }}>
                {t.label} <span style={{ padding: '1px 7px', fontSize: 10.5, background: on ? '#16a34a' : 'var(--surface-2)', color: on ? '#fff' : 'var(--muted)', borderRadius: 999, fontWeight: 700 }}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ color: 'var(--muted)', padding: 24 }}>Loading…</div>
          ) : list.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13.5, textAlign: 'center', padding: '40px 24px' }}>
              {tab === 'sent'      ? 'No sent campaigns yet. Blasts you send from Contacts will show up here.'
              : tab === 'scheduled' ? 'No scheduled campaigns waiting to go out.'
              :                       'No drafts. Anything you started but haven\'t sent will show up here.'}
            </div>
          ) : (
            <div>
              {list.map((c, i) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'stretch', gap: 16, padding: '16px 20px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  {/* Preview thumbnail */}
                  <div style={{ width: 82, height: 82, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mail size={22} style={{ color: 'var(--muted)' }} />
                  </div>
                  {/* Meta */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6 }}>
                    <div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.subject}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Regular · {rowDateLabel(c)}
                      </div>
                    </div>
                  </div>
                  {/* Stats */}
                  {c.status === 'sent' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(64px, auto))', gap: 18, alignItems: 'center', flexShrink: 0 }}>
                      {[
                        { label: 'Recipients', color: 'var(--muted)',  value: c.recipients.toLocaleString() },
                        { label: 'Opened',     color: '#16a34a',        value: (c.open_rate || 0) + '%' },
                        { label: 'Clicked',    color: '#2563eb',        value: (c.click_rate || 0) + '%' },
                        { label: 'CTOR',       color: '#7c3aed',        value: (c.ctor || 0) + '%' },
                      ].map((s) => (
                        <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 3, borderLeft: `2px solid ${s.color}`, paddingLeft: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {rescheduleId === c.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="datetime-local" value={newWhen} onChange={e => setNewWhen(e.target.value)}
                            min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)}
                            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }} />
                          <button className="btn-primary" disabled={busyId === c.id} onClick={() => handleReschedule(c)} style={{ padding: '6px 12px', fontSize: 12 }}>
                            {busyId === c.id ? '…' : 'Save'}
                          </button>
                          <button className="btn-ghost" onClick={() => { setRescheduleId(null); setNewWhen(''); }} style={{ padding: '6px 10px', fontSize: 12 }}>Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                            background: c.status === 'draft' ? 'var(--surface-2)' : 'rgba(255,155,38,0.15)',
                            color: c.status === 'draft' ? 'var(--muted)' : 'var(--orange)',
                            border: `1px solid ${c.status === 'draft' ? 'var(--border)' : 'rgba(255,155,38,0.35)'}` }}>
                            {c.status === 'draft' ? 'Draft' : 'Scheduled'}
                          </span>
                          {c.status !== 'draft' && (
                            <button className="btn-ghost" title="Reschedule" disabled={busyId === c.id}
                              onClick={() => { setRescheduleId(c.id); setNewWhen(c.scheduled_for ? new Date(c.scheduled_for).toISOString().slice(0, 16) : ''); }}
                              style={{ padding: '6px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              <Clock size={13} /> Reschedule
                            </button>
                          )}
                          <button className="btn-ghost" title={c.status === 'draft' ? 'Delete draft' : 'Cancel & delete'} disabled={busyId === c.id}
                            onClick={() => handleDelete(c)}
                            style={{ padding: '6px 10px', fontSize: 12, color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <Trash2 size={13} /> {c.status === 'draft' ? 'Delete' : 'Cancel'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Automations manager (list + form) ────────────────────────────────────────
function AutomationsPanel({ clientId, groups, onClose }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState('list'); // 'list' | 'new' | automation (edit)

  const load = useCallback(async () => {
    try { setItems(await getEmailAutomations(clientId)); } catch (e) { toast('error', e.message); } finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (a) => {
    setItems(prev => prev.map(x => x.id === a.id ? { ...x, active: !x.active } : x));
    try { await updateEmailAutomation(a.id, { active: !a.active }); } catch (e) { toast('error', e.message); load(); }
  };
  const del = async (a) => {
    if (!window.confirm(`Delete automation "${a.name}"?`)) return;
    setItems(prev => prev.filter(x => x.id !== a.id));
    try { await deleteEmailAutomation(a.id); } catch (e) { toast('error', e.message); load(); }
  };
  const groupName = (id) => groups.find(g => String(g.id) === String(id))?.name || 'group';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, width: 580, maxWidth: '94vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-display)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Repeat size={16} style={{ color: 'var(--orange)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Email automations</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}><X size={16} /></button>
        </div>

        {view === 'list' ? (
          <div style={{ padding: 16, overflowY: 'auto' }}>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Recurring blasts that send themselves on a weekly schedule — like your Wednesday meetup reminder or Monday webinar email.
            </div>
            {loading ? <div style={{ color: 'var(--muted)' }}>Loading…</div> : items.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10, padding: 22, textAlign: 'center', marginBottom: 14 }}>No automations yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {items.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, opacity: a.active ? 1 : 0.6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{a.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <Clock size={11} /> Every {WEEKDAYS[a.weekday]} at {fmtHour(a.send_hour)} → {groupName(a.group_id)}
                        {a.last_sent_at && <span>· last sent {new Date(a.last_sent_at).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <button onClick={() => toggle(a)} title={a.active ? 'Pause' : 'Resume'}
                      style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: `1px solid ${a.active ? 'rgba(22,163,74,0.4)' : 'var(--border)'}`, background: a.active ? 'rgba(22,163,74,0.12)' : 'var(--surface)', color: a.active ? '#16a34a' : 'var(--muted)' }}>
                      {a.active ? 'Active' : 'Paused'}
                    </button>
                    <button className="btn-ghost" style={{ padding: '5px 7px' }} onClick={() => setView(a)} title="Edit"><Pencil size={13} /></button>
                    <button className="btn-ghost" style={{ padding: '5px 7px', color: '#ff5c5c' }} onClick={() => del(a)} title="Delete"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-primary" onClick={() => setView('new')}><Plus size={14} /> New automation</button>
          </div>
        ) : (
          <AutomationForm clientId={clientId} groups={groups} initial={view === 'new' ? null : view}
            onCancel={() => setView('list')} onSaved={() => { setView('list'); load(); }} />
        )}
      </div>
    </div>
  );
}

// ── Contact edit drawer ─────────────────────────────────────────────────────
function ContactEditDrawer({ clientId, contact, onClose, onSaved }) {
  const [name, setName]       = useState(contact.name || '');
  const [email, setEmail]     = useState(contact.email || '');
  const [phone, setPhone]     = useState(contact.phone || '');
  const [company, setCompany] = useState(contact.company || '');
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    if (!email.trim()) { toast('error', 'Email is required.'); return; }
    setSaving(true);
    try {
      const { subscriber } = await updateMailerliteSubscriber({
        client_id: clientId, subscriber_id: contact.id,
        email: email.trim(), name: name.trim(), phone: phone.trim(), company: company.trim(),
      });
      toast('success', 'Contact updated.');
      onSaved({ id: contact.id, ...subscriber });
    } catch (e) { toast('error', e.message || 'Update failed'); }
    finally { setSaving(false); }
  };

  const lbl = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' };
  const fld = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', color: 'var(--text)', fontSize: 14 };

  return (
    <Drawer open onClose={onClose} title="Edit contact" subtitle={contact.email}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      }>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div><label style={lbl}>Name</label><input value={name} onChange={e => setName(e.target.value)} style={fld} placeholder="Full name" /></div>
        <div><label style={lbl}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={fld} placeholder="you@email.com" /></div>
        <div><label style={lbl}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={fld} placeholder="(555) 555-5555" /></div>
        <div><label style={lbl}>Company</label><input value={company} onChange={e => setCompany(e.target.value)} style={fld} placeholder="Company / business" /></div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 4 }}>
          Changes sync to MailerLite immediately. Status: <b style={{ color: 'var(--text)' }}>{contact.status || 'active'}</b>.
          {(contact.groups || []).length > 0 && <> · In {contact.groups.length} group{contact.groups.length !== 1 ? 's' : ''}.</>}
        </div>
      </div>
    </Drawer>
  );
}

export default function Contacts() {
  const { selectedClient, isAdmin } = useClient();
  const clientId = selectedClient?.id;
  const [composeOpen, setComposeOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);
  const [campaignsOpen, setCampaignsOpen] = useState(false);
  const [campaignsRefreshKey, setCampaignsRefreshKey] = useState(0);

  const [groups, setGroups]         = useState([]);
  const [activeGroup, setActiveGroup] = useState(null); // null = all contacts
  const [subs, setSubs]             = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [error, setError]           = useState('');
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editContact, setEditContact] = useState(null);

  const handleCreateGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setCreatingGroup(true);
    try {
      const { group } = await createMailerliteGroup(clientId, name);
      setGroups(prev => [...prev, group].sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setNewGroupOpen(false); setNewGroupName('');
      toast('success', `Group "${name}" created.`);
    } catch (e) { toast('error', e.message || 'Could not create group'); }
    finally { setCreatingGroup(false); }
  };

  const loadGroups = useCallback(async () => {
    if (!clientId) return;
    try { const r = await getMailerliteGroups(clientId); setGroups(r.groups || []); } catch { /* surfaced via subs error */ }
  }, [clientId]);

  const loadSubs = useCallback(async (groupId) => {
    if (!clientId) return;
    setLoading(true); setError('');
    try { const r = await getMailerliteSubscribers(clientId, groupId); setSubs(r.subscribers || []); setTotal(r.total || 0); }
    catch (e) { setError(e.message || 'Failed to load contacts'); setSubs([]); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { setActiveGroup(null); loadGroups(); }, [clientId, loadGroups]);
  useEffect(() => { loadSubs(activeGroup); }, [activeGroup, loadSubs]);

  const refresh = async () => { setRefreshing(true); await Promise.all([loadGroups(), loadSubs(activeGroup)]); setRefreshing(false); };

  // Per-column filters
  const [colFilters, setColFilters] = useState({ name: '', email: '', phone: '', group: '', status: '' });
  const setCol = (k, v) => setColFilters(f => ({ ...f, [k]: v }));
  const clearCols = () => setColFilters({ name: '', email: '', phone: '', group: '', status: '' });
  const [sortDir, setSortDir] = useState('desc'); // subscribed sort

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nq = colFilters.name.trim().toLowerCase();
    const eq = colFilters.email.trim().toLowerCase();
    const pq = colFilters.phone.trim().replace(/\D/g, '');
    const gq = colFilters.group.trim().toLowerCase();
    const sq = colFilters.status.trim().toLowerCase();

    let out = subs.filter(s => {
      if (q && !((s.email || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q))) return false;
      if (nq && !(s.name || '').toLowerCase().includes(nq)) return false;
      if (eq && !(s.email || '').toLowerCase().includes(eq)) return false;
      if (pq && !((s.phone || '').replace(/\D/g, '').includes(pq))) return false;
      if (gq && !(s.groups || []).some(g => (g || '').toLowerCase().includes(gq))) return false;
      if (sq && (s.status || '').toLowerCase() !== sq) return false;
      return true;
    });

    out = out.slice().sort((a, b) => {
      const da = new Date(a.subscribed_at || 0).getTime();
      const db = new Date(b.subscribed_at || 0).getTime();
      return sortDir === 'asc' ? da - db : db - da;
    });
    return out;
  }, [subs, search, colFilters, sortDir]);

  const uniqueGroups = useMemo(() => {
    const set = new Set();
    subs.forEach(s => (s.groups || []).forEach(g => g && set.add(g)));
    return Array.from(set).sort();
  }, [subs]);
  const hasColFilters = Object.values(colFilters).some(v => v);

  if (!clientId) {
    return <div style={{ padding: 40, color: 'var(--muted)', fontSize: 14 }}>Pick a workspace up top to see its marketing contacts.</div>;
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {activeGroup ? `${filtered.length} in group` : `${total.toLocaleString()} contacts`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn-ghost" onClick={refresh} disabled={refreshing}>
            <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
          </button>
          {isAdmin && groups.length > 0 && (
            <>
              <button className="btn-ghost" onClick={() => setCampaignsOpen(true)}>
                <BarChart2 size={13} /> Campaigns
              </button>
              <button className="btn-ghost" onClick={() => setAutomationsOpen(true)}>
                <Repeat size={13} /> Automations
              </button>
              <button className="btn-primary" onClick={() => setComposeOpen(true)}>
                <Send size={13} /> Send Email
              </button>
            </>
          )}
        </div>
      </div>

      {composeOpen && (
        <ComposeBlast
          clientId={clientId}
          groups={groups}
          initialGroupId={activeGroup}
          onClose={() => setComposeOpen(false)}
          onSent={() => setCampaignsRefreshKey(k => k + 1)}
        />
      )}

      {automationsOpen && (
        <AutomationsPanel
          clientId={clientId}
          groups={groups}
          onClose={() => setAutomationsOpen(false)}
        />
      )}

      {campaignsOpen && (
        <CampaignsPanel
          key={campaignsRefreshKey}
          clientId={clientId}
          onClose={() => setCampaignsOpen(false)}
          onCreate={() => setComposeOpen(true)}
        />
      )}

      {editContact && (
        <ContactEditDrawer
          clientId={clientId}
          contact={editContact}
          onClose={() => setEditContact(null)}
          onSaved={(updated) => {
            setSubs(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x));
            setEditContact(null);
          }}
        />
      )}

      <div className="rgrid" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, padding: 20, alignItems: 'start' }}>
        {/* Groups rail */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ flex: 1, fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Groups</span>
            {isAdmin && (
              <button onClick={() => { setNewGroupOpen(o => !o); setNewGroupName(''); }} title="Create a group"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer', color: 'var(--orange)', display: 'flex', padding: 4 }}>
                <Plus size={14} />
              </button>
            )}
          </div>
          {newGroupOpen && (
            <div style={{ display: 'flex', gap: 6, padding: '10px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateGroup()}
                placeholder="New group name…"
                style={{ flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 9px', color: 'var(--text)', fontSize: 12.5 }} />
              <button className="btn-primary" disabled={creatingGroup || !newGroupName.trim()} onClick={handleCreateGroup} style={{ padding: '6px 11px', fontSize: 12 }}>
                {creatingGroup ? '…' : 'Add'}
              </button>
            </div>
          )}
          <button onClick={() => setActiveGroup(null)} style={rail(activeGroup === null)}>
            <Users size={14} /> <span style={{ flex: 1, textAlign: 'left' }}>All contacts</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{total.toLocaleString()}</span>
          </button>
          {groups.map(g => (
            <button key={g.id} onClick={() => setActiveGroup(g.id)} style={rail(activeGroup === g.id)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} />
              <span className="pii-name" style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(g.total || 0).toLocaleString()}</span>
            </button>
          ))}
          {groups.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>No groups yet.</div>}
        </div>

        {/* Subscribers */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {error ? (
            <div style={{ padding: '28px 24px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 13 }}>
              <AlertCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              <span>{/No MailerLite/i.test(error) ? 'This workspace has no MailerLite connected. Add its API key in Settings to see marketing contacts.' : error}</span>
            </div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 230px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table className="compact-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Name</th>
                    <th style={{ minWidth: 200 }}>Email</th>
                    <th style={{ minWidth: 130 }}>Phone</th>
                    <th style={{ minWidth: 140 }}>Groups</th>
                    <th style={{ minWidth: 96 }}>Status</th>
                    <th style={{ minWidth: 100, cursor: 'pointer', userSelect: 'none' }} onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} title="Sort by subscribed date">
                      Subscribed {sortDir === 'asc' ? '↑' : '↓'}
                    </th>
                  </tr>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    {(() => {
                      const inp = { width: '100%', fontSize: 11.5, padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', outline: 'none' };
                      return (
                        <>
                          <th style={{ padding: '6px 8px' }}><input value={colFilters.name}   onChange={e => setCol('name', e.target.value)}   placeholder="Filter…" style={inp} /></th>
                          <th style={{ padding: '6px 8px' }}><input value={colFilters.email}  onChange={e => setCol('email', e.target.value)}  placeholder="Filter…" style={inp} /></th>
                          <th style={{ padding: '6px 8px' }}><input value={colFilters.phone}  onChange={e => setCol('phone', e.target.value)}  placeholder="Filter…" style={inp} inputMode="tel" /></th>
                          <th style={{ padding: '6px 8px' }}>
                            <select value={colFilters.group} onChange={e => setCol('group', e.target.value)} style={inp}>
                              <option value="">All groups</option>
                              {uniqueGroups.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </th>
                          <th style={{ padding: '6px 8px' }}>
                            <select value={colFilters.status} onChange={e => setCol('status', e.target.value)} style={inp}>
                              <option value="">All</option>
                              <option value="active">Active</option>
                              <option value="unsubscribed">Unsubscribed</option>
                              <option value="unconfirmed">Unconfirmed</option>
                              <option value="bounced">Bounced</option>
                              <option value="junk">Junk</option>
                            </select>
                          </th>
                          <th style={{ padding: '6px 8px' }}>
                            {hasColFilters ? (
                              <button onClick={clearCols} style={{ fontSize: 10.5, padding: '4px 8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--orange)', cursor: 'pointer', width: '100%', fontWeight: 600 }}>Clear filters</button>
                            ) : (
                              <span style={{ fontSize: 10.5, color: 'var(--muted)', paddingLeft: 4 }}>&nbsp;</span>
                            )}
                          </th>
                        </>
                      );
                    })()}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No contacts{search ? ' match your search' : ''}.</td></tr>
                  ) : filtered.map(s => {
                    const st = STATUS[s.status] || { label: s.status || '—', color: '#8a8a8a' };
                    return (
                      <tr key={s.id} className="hover-reveal" onClick={() => isAdmin && setEditContact(s)} style={{ cursor: isAdmin ? 'pointer' : 'default' }}>
                        <td className="private-value" style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Mail size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                            <span className="private-value" style={{ color: 'var(--muted)' }}>{s.email}</span>
                          </div>
                        </td>
                        <td>
                          {s.phone ? (
                            <a href={`tel:${s.phone}`} className="private-value" style={{ color: 'var(--muted)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}>{s.phone}</a>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                          )}
                        </td>
                        <td>
                          {(s.groups || []).length === 0 ? (
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {s.groups.map(g => {
                                const isGeneral = /general/i.test(g);
                                return (
                                  <span key={g} style={{
                                    fontSize: 10.5, fontWeight: 600, borderRadius: 999, padding: '1px 8px', whiteSpace: 'nowrap',
                                    color: isGeneral ? 'var(--muted)' : 'var(--orange)',
                                    background: isGeneral ? 'var(--surface-2)' : 'rgba(37,99,235,0.10)',
                                    border: `1px solid ${isGeneral ? 'var(--border)' : 'rgba(37,99,235,0.30)'}`,
                                  }}>{g}</span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}40`, borderRadius: 999, padding: '1px 8px' }}>{st.label}</span>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                            <span>{fmtDate(s.subscribed_at)}</span>
                            {isAdmin && (
                              <span className="row-actions"><Pencil size={13} style={{ color: 'var(--orange)' }} /></span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
