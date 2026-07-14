import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Search, RefreshCw, Mail, AlertCircle, Send, X, AlertTriangle,
  Repeat, Clock, Plus, Pencil, Trash2, ChevronLeft,
} from 'lucide-react';
import { useClient } from '../context/ClientContext';
import { toast } from '../components/Toast';
import {
  getMailerliteGroups, getMailerliteSubscribers,
  getCampaignDefaults, sendMailerliteCampaign,
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

// ── Email blast composer (MailerLite regular campaign) ──────────────────────
const DRAFT_KEY = 'vtm.crm.blastDraft';
const loadDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; } };
const fmtWhen = (d) => { if (!d) return ''; try { return new Date(d.replace(' ', 'T') + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };

function ComposeBlast({ clientId, groups, initialGroupId, onClose }) {
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
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ groupId, subject, fromName, fromEmail, body }));
    setSavedNote(true);
    const t = setTimeout(() => setSavedNote(false), 1200);
    return () => clearTimeout(t);
  }, [groupId, subject, fromName, fromEmail, body]);

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

  const group = groups.find(g => String(g.id) === String(groupId));
  const count = group ? (group.total || group.active || 0) : 0;

  const canProceed = group && canCompose && testedOk;

  async function send() {
    setStep('sending');
    try {
      await sendMailerliteCampaign({
        client_id: clientId, group_id: groupId,
        subject: subject.trim(), from_name: fromName.trim(), from_email: fromEmail.trim(), body,
      });
      toast('success', `Blast sent to ${group?.name || 'the group'} (${count.toLocaleString()} contacts).`);
      localStorage.removeItem(DRAFT_KEY);
      onClose();
    } catch (e) {
      toast('error', e.message || 'Failed to send');
      setStep('compose');
    }
  }

  const field = { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font-display)' };
  const label = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
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
                This will email <b>{count.toLocaleString()}</b> contact{count !== 1 ? 's' : ''} in <b>{group?.name}</b> right now, from <b>{fromEmail}</b>.
                <div style={{ marginTop: 8, color: 'var(--muted)' }}>Subject: “{subject}”</div>
                <div style={{ marginTop: 6, color: 'var(--muted)' }}>Sending a blast can’t be undone. Continue?</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="btn-ghost" onClick={() => setStep('compose')}>Back</button>
              <button className="btn-primary" onClick={send} style={{ background: '#dc2626', borderColor: '#dc2626' }}>
                <Send size={13} /> Send to {count.toLocaleString()}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={label}>Send to group</label>
                <select value={groupId} onChange={e => setGroupId(e.target.value)} style={field}>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({(g.total || g.active || 0).toLocaleString()})</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={label}>From name</label><input value={fromName} onChange={e => setFromName(e.target.value)} style={field} placeholder="Vernon Tech & Media" /></div>
                <div><label style={label}>From email</label><input value={fromEmail} onChange={e => setFromEmail(e.target.value)} style={field} placeholder="you@domain.com" /></div>
              </div>
              <div><label style={label}>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder="Subject line" /></div>
              <div>
                <label style={label}>Message</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={9} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} placeholder={'Hello, everyone.\n\nWrite your message here…'} />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Plain text is fine — an unsubscribe link is added automatically. Your draft is saved as you type.</div>
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
                <button className="btn-primary" disabled={!canProceed || step === 'sending'} title={!testedOk ? 'Send a test email first' : ''} onClick={() => setStep('confirm')}>
                  <Send size={13} /> Review &amp; send
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div><label style={lbl}>From name</label><input value={fromName} onChange={e => setFromName(e.target.value)} style={field} /></div>
        <div><label style={lbl}>From email</label><input value={fromEmail} onChange={e => setFromEmail(e.target.value)} style={field} /></div>
      </div>
      <div><label style={lbl}>Subject</label><input value={subject} onChange={e => setSubject(e.target.value)} style={field} placeholder="Subject line" /></div>
      <div><label style={lbl}>Message</label><textarea value={body} onChange={e => setBody(e.target.value)} rows={7} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} placeholder={'Hello, everyone.\n\nThis goes out automatically each week…'} />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Central time. Plain text is fine — an unsubscribe link is added automatically.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}><Repeat size={13} /> {saving ? 'Saving…' : (initial?.id ? 'Save changes' : 'Create automation')}</button>
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
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

export default function Contacts() {
  const { selectedClient, isAdmin } = useClient();
  const clientId = selectedClient?.id;
  const [composeOpen, setComposeOpen] = useState(false);
  const [automationsOpen, setAutomationsOpen] = useState(false);

  const [groups, setGroups]         = useState([]);
  const [activeGroup, setActiveGroup] = useState(null); // null = all contacts
  const [subs, setSubs]             = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [error, setError]           = useState('');

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

  const filtered = useMemo(() =>
    subs.filter(s => !search ||
      (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.name || '').toLowerCase().includes(search.toLowerCase())),
    [subs, search]
  );

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
        />
      )}

      {automationsOpen && (
        <AutomationsPanel
          clientId={clientId}
          groups={groups}
          onClose={() => setAutomationsOpen(false)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, padding: 20, alignItems: 'start' }}>
        {/* Groups rail */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Groups</div>
          <button onClick={() => setActiveGroup(null)} style={rail(activeGroup === null)}>
            <Users size={14} /> <span style={{ flex: 1, textAlign: 'left' }}>All contacts</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{total.toLocaleString()}</span>
          </button>
          {groups.map(g => (
            <button key={g.id} onClick={() => setActiveGroup(g.id)} style={rail(activeGroup === g.id)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
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
                    <th style={{ minWidth: 140 }}>Groups</th>
                    <th style={{ minWidth: 96 }}>Status</th>
                    <th style={{ minWidth: 100 }}>Subscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No contacts{search ? ' match your search' : ''}.</td></tr>
                  ) : filtered.map(s => {
                    const st = STATUS[s.status] || { label: s.status || '—', color: '#8a8a8a' };
                    return (
                      <tr key={s.id}>
                        <td className="private-value" style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Mail size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                            <span className="private-value" style={{ color: 'var(--muted)' }}>{s.email}</span>
                          </div>
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
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(s.subscribed_at)}</td>
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
