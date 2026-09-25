import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MessageSquare, Send, Search, Plus, X, ArrowLeft, UserPlus, Check, StickyNote, ChevronDown } from 'lucide-react';
import { toast } from '../components/Toast';
import {
  getImsgThreads, getImsgThread, sendImsg, getImsgDirectory, assignImsgThread,
  getImsgNotes, addImsgNote, getImsgEvents, markImsgRead, createClient, createContact, updateClient, setImsgKind, getAssignees,
} from '../api';
import { useClient } from '../context/ClientContext';

// Two-way iMessage inbox for the business number. Threads group by phone. Sends
// are queued and delivered by the bridge on the Mac signed into the business
// Apple ID (imessage-bridge/); it also forwards replies. Each conversation can
// be assigned to an employee (colored pill), tagged cold/warm/hot when it maps
// to a lead, and carries internal notes attributed to the employee who wrote them.

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const fmtPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  const ten = d.length === 11 && d[0] === '1' ? d.slice(1) : d;
  if (ten.length === 10) return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
  return p || '';
};
const fmtTime = (t) => {
  if (!t) return '';
  const d = new Date(t), now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
// Full date + time, for note stamps (the thread uses the shorter fmtTime).
const fmtDateTime = (t) => {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const STATUS_LABEL = { queued: 'queued', sending: 'sending', sent: 'sent', failed: 'failed' };
const KIND = {
  lead:    { label: 'Lead',    color: '#b45309' },
  client:  { label: 'Client',  color: '#15803d' },
  contact: { label: 'Contact', color: '#2563eb' },
};
// Lead temperature shown/settable on a conversation.
const TEMPS = [
  { key: 'cold', label: 'Cold', color: '#1d4ed8' },
  { key: 'warm', label: 'Warm', color: '#b45309' },
  { key: 'hot',  label: 'Hot',  color: '#b91c1c' },
];
const tempOf = (k) => TEMPS.find(t => t.key === k);

// A stable, distinct color per employee (same id always maps to the same hue).
const EMP_COLORS = ['#2563eb', '#7c3aed', '#c026d3', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#4f46e5'];
function colorForEmployee(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EMP_COLORS[h % EMP_COLORS.length];
}

function KindBadge({ kind }) {
  const k = KIND[kind]; if (!k) return null;
  return (
    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: k.color, background: `${k.color}18`, border: `1px solid ${k.color}40`, borderRadius: 999, padding: '1px 7px', flexShrink: 0 }}>{k.label}</span>
  );
}
function TempDot({ temp }) {
  const t = tempOf(temp); if (!t) return null;
  return <span title={`${t.label} lead`} style={{ width: 9, height: 9, borderRadius: '50%', background: t.color, flexShrink: 0, display: 'inline-block' }} />;
}
function AssigneePill({ assignedTo, name }) {
  if (!name) return null;
  const c = colorForEmployee(assignedTo || name);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, color: '#fff', background: c, borderRadius: 999, padding: '2px 8px', flexShrink: 0, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {firstName(name)}
    </span>
  );
}

export default function Inbox() {
  const { user } = useClient();
  const [threads, setThreads] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);       // active phone
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  // Header add-to-CRM panel (unknown number).
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState('lead');
  const [addName, setAddName] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  // Internal notes for the open conversation.
  const [notes, setNotes] = useState([]);
  const [events, setEvents] = useState([]); // handoff events
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const scrollRef = useRef(null);

  const byPhone = useMemo(() => {
    const m = {};
    for (const p of directory) m[last10(p.phone)] = p;
    return m;
  }, [directory]);
  const personFor = (phone) => byPhone[last10(phone)] || null;
  const displayName = (phone) => personFor(phone)?.name || fmtPhone(phone);
  const displayKind = (phone) => personFor(phone)?.kind || null;
  const displayTemp = (phone) => personFor(phone)?.temperature || null;
  const threadFor = (phone) => threads.find(t => last10(t.phone) === last10(phone));

  // Assignable people: the Employees roster plus the signed-in user (so you can
  // self-assign even when you are not on the roster).
  const assignOptions = useMemo(() => {
    const list = [...assignees];
    const meEmail = (user?.email || '').toLowerCase();
    const onRoster = list.some(a => (a.email || '').toLowerCase() === meEmail || a.id === user?.id);
    if (user?.id && !onRoster) {
      const label = user.name || (meEmail ? meEmail.split('@')[0].replace(/^./, c => c.toUpperCase()) : 'Me');
      list.unshift({ id: user.id, name: label, email: user.email });
    }
    return list;
  }, [assignees, user]);

  const loadThreads = async () => {
    try { setThreads(await getImsgThreads() || []); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  const loadDirectory = async () => { try { setDirectory(await getImsgDirectory() || []); } catch (_) {} };
  const loadAssignees = async () => {
    try { const r = await getAssignees(); setAssignees(Array.isArray(r) ? r : (r?.employees || [])); } catch (_) {}
  };
  const loadNotes = async (phone) => { try { setNotes(await getImsgNotes(phone) || []); } catch (_) {} };
  const loadEvents = async (phone) => { try { setEvents(await getImsgEvents(phone) || []); } catch (_) {} };
  useEffect(() => {
    loadThreads(); loadDirectory(); loadAssignees();
    const t = setInterval(loadThreads, 20000);
    return () => clearInterval(t);
  }, []);

  const openThread = async (phone) => {
    setActive(phone); setMessages([]); setNotes([]); setEvents([]);
    // Clear this thread's unread badge for me, optimistically then on the server.
    setThreads(ts => ts.map(t => last10(t.phone) === last10(phone) ? { ...t, unread: 0 } : t));
    markImsgRead(phone).catch(() => {});
    try { setMessages(await getImsgThread(phone) || []); } catch (e) { toast('error', e.message); }
    loadNotes(phone); loadEvents(phone);
  };
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try { setMessages(await getImsgThread(active) || []); } catch (_) {}
      getImsgEvents(active).then(r => setEvents(r || [])).catch(() => {});
      markImsgRead(active).catch(() => {}); // keep it read while you're looking at it
    }, 6000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);
  useEffect(() => { setAddOpen(false); setAddKind('lead'); setAddName(''); setNoteText(''); }, [active]);

  const doSend = async () => {
    const body = reply.trim();
    if (!body || !active) return;
    setSending(true);
    try {
      await sendImsg(active, body);
      setReply('');
      setMessages(await getImsgThread(active) || []);
      loadThreads();
    } catch (e) { toast('error', e.message); }
    finally { setSending(false); }
  };

  const addActivePerson = async () => {
    if (!active || !addKind) return;
    setAddBusy(true);
    try {
      const name = addName.trim() || fmtPhone(active);
      if (addKind === 'contact') await createContact({ name, phone: active });
      else await createClient({ business_name: name, contact_phone: active, stage: addKind === 'lead' ? 'lead' : 'onboarding' });
      await loadDirectory();
      setAddOpen(false); setAddName('');
      toast('success', `Added as ${addKind}.`);
    } catch (e) { toast('error', e.message); }
    finally { setAddBusy(false); }
  };

  const assignActive = async (emp) => {
    if (!active) return;
    const assigned_to = emp?.id || null;
    const assigned_to_name = emp?.name || null;
    setThreads(ts => {
      const exists = ts.some(t => last10(t.phone) === last10(active));
      const patched = ts.map(t => last10(t.phone) === last10(active) ? { ...t, assigned_to, assigned_to_name } : t);
      return exists ? patched : [{ phone: active, last: null, count: 0, assigned_to, assigned_to_name }, ...patched];
    });
    try { await assignImsgThread(active, assigned_to, assigned_to_name); loadEvents(active); }
    catch (e) { toast('error', e.message); loadThreads(); }
  };

  // cold/warm/hot updates the linked lead's temperature (naturally syncs both ways).
  const setTemperature = async (key) => {
    const p = personFor(active);
    if (!p?.id) return;
    setDirectory(dir => dir.map(x => x.id === p.id ? { ...x, temperature: key } : x));
    try { await updateClient(p.id, { lead_temperature: key }); }
    catch (e) { toast('error', e.message); loadDirectory(); }
  };

  const addNote = async () => {
    const body = noteText.trim();
    if (!body || !active) return;
    setNoteBusy(true);
    try { await addImsgNote(active, body); setNoteText(''); await loadNotes(active); }
    catch (e) { toast('error', e.message); }
    finally { setNoteBusy(false); }
  };

  // Switch a conversation's type. Lead<->client is in place; demoting a
  // lead/client to a contact removes the pipeline record, so confirm it first.
  const changeKind = async (target) => {
    if (!active) return;
    const cur = personFor(active)?.kind || null;
    if (target === cur) return;
    if (target === 'contact' && (cur === 'lead' || cur === 'client')) {
      if (!window.confirm('Make this just a contact? It removes the lead/client record and its pipeline data (stage, temperature). The conversation and its notes stay.')) return;
    }
    try {
      await setImsgKind(active, target);
      await loadDirectory();
      toast('success', `Now a ${target}.`);
    } catch (e) { toast('error', e.message); }
  };

  const afterCompose = async (phone) => {
    setComposing(false);
    await Promise.all([loadThreads(), loadDirectory()]);
    openThread(phone);
  };

  const visibleThreads = useMemo(() => {
    const list = (threads || []).slice().sort(
      (a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0)
    );
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(t =>
      displayName(t.phone).toLowerCase().includes(q) ||
      fmtPhone(t.phone).toLowerCase().includes(q) ||
      (t.assigned_to_name || '').toLowerCase().includes(q) ||
      (t.last?.body || '').toLowerCase().includes(q)
    );
  }, [threads, search, byPhone]);

  const activeThread = active ? threadFor(active) : null;
  const activePerson = active ? personFor(active) : null;
  const isUnknown = active ? !displayKind(active) : false;
  const canTemp = !!activePerson?.id && activePerson.kind !== 'contact';

  // Messages + handoffs, oldest first, for the chat pane.
  const timeline = useMemo(() => {
    const items = [
      ...messages.map(m => ({ t: 'msg', at: m.created_at, key: 'm' + m.id, m })),
      ...events.filter(e => e.type === 'handoff').map(e => ({ t: 'ho', at: e.created_at, key: 'e' + e.id, e })),
    ];
    items.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    return items;
  }, [messages, events]);
  // Notes + handoffs, newest first, for the Activity panel.
  const activityFeed = useMemo(() => {
    const items = [
      ...notes.map(n => ({ t: 'note', at: n.created_at, key: 'n' + n.id, n })),
      ...events.filter(e => e.type === 'handoff').map(e => ({ t: 'ho', at: e.created_at, key: 'e' + e.id, e })),
    ];
    items.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    return items;
  }, [notes, events]);

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-display)', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Inbox</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Text your clients over iMessage from your business number. Replies land here.
          </div>
        </div>
        <button className="btn-primary" onClick={() => setComposing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> New message
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14, marginTop: 12 }}>
        {/* Threads */}
        <div style={{ width: 320, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ position: 'relative', padding: 12, borderBottom: '1px solid var(--border)' }}>
            <Search size={15} style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input placeholder="Search conversations…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...INPUT, paddingLeft: 32 }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: 16 }}>Loading…</div>
            ) : visibleThreads.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13, padding: 20, textAlign: 'center' }}>No conversations yet.</div>
            ) : visibleThreads.map(t => {
              const unread = (t.unread || 0) > 0;
              return (
              <div key={t.phone} onClick={() => openThread(t.phone)}
                style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border)', background: last10(active) === last10(t.phone) ? 'var(--surface-2)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    {unread && <span style={{ minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 999, background: 'var(--orange)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{t.unread}</span>}
                    <TempDot temp={displayTemp(t.phone)} />
                    <span style={{ fontSize: 13.5, fontWeight: unread ? 800 : 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(t.phone)}</span>
                    <KindBadge kind={displayKind(t.phone)} />
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{fmtTime(t.last?.created_at)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <div style={{ flex: 1, fontSize: 12.5, color: unread ? 'var(--text)' : 'var(--muted)', fontWeight: unread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.last?.direction === 'out' ? 'You: ' : ''}{t.last?.body || ''}
                  </div>
                  <AssigneePill assignedTo={t.assigned_to} name={t.assigned_to_name} />
                </div>
              </div>
              );
            })}
          </div>
        </div>

        {/* Conversation */}
        <div style={{ flex: 1, minWidth: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!active ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <MessageSquare size={34} style={{ marginBottom: 12, opacity: 0.6 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Select a conversation</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Or start a new message.</div>
            </div>
          ) : (
            <>
              <div style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setActive(null)} className="inbox-back" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'none' }}><ArrowLeft size={18} /></button>
                  <TempDot temp={displayTemp(active)} />
                  <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{displayName(active)}</span>
                  {displayKind(active) && <KindMenu kind={displayKind(active)} onChange={changeKind} />}
                  {displayName(active) !== fmtPhone(active) && (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtPhone(active)}</span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AssignMenu assignees={assignOptions} current={activeThread} onAssign={assignActive} />
                    {isUnknown && (
                      <button onClick={() => { setAddOpen(o => !o); setAddKind('lead'); }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: addOpen ? 'var(--surface-2)' : 'var(--surface)', color: 'var(--text)' }}>
                        <UserPlus size={13} /> Add
                      </button>
                    )}
                  </div>
                </div>
                {addOpen && isUnknown && (
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Add {fmtPhone(active)} to your CRM:</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {['lead', 'client', 'contact'].map(k => {
                        const on = addKind === k;
                        return (
                          <button key={k} onClick={() => setAddKind(k)}
                            style={{ flex: 1, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize',
                              border: `1.5px solid ${on ? KIND[k].color : 'var(--border)'}`, background: on ? `${KIND[k].color}18` : 'var(--surface)', color: on ? KIND[k].color : 'var(--text)' }}>{k}</button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input style={INPUT} value={addName} autoFocus placeholder={addKind === 'contact' ? 'Contact name' : 'Business or person name'}
                        onChange={e => setAddName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addActivePerson(); }} />
                      <button className="btn-primary" onClick={addActivePerson} disabled={addBusy} style={{ flexShrink: 0 }}>{addBusy ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                )}
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {timeline.map(it => {
                  if (it.t === 'ho') {
                    const e = it.e;
                    return (
                      <div key={it.key} style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {e.from_name ? <>{firstName(e.from_name)} <span style={{ opacity: 0.6 }}>→</span></> : 'Assigned to'}
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: colorForEmployee(e.to_id || e.to_name), borderRadius: 999, padding: '2px 8px' }}>{firstName(e.to_name)}</span>
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      </div>
                    );
                  }
                  const m = it.m;
                  const out = m.direction === 'out';
                  const failed = out && m.status === 'failed';
                  return (
                    <div key={it.key} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
                      <div style={{
                        padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        background: out ? (failed ? '#b91c1c' : 'var(--orange)') : 'var(--surface-2)',
                        color: out ? '#fff' : 'var(--text)', border: out ? 'none' : '1px solid var(--border)',
                      }}>{m.body}</div>
                      <div style={{ fontSize: 10.5, color: failed ? '#b91c1c' : 'var(--muted)', marginTop: 3, textAlign: out ? 'right' : 'left' }}>
                        {fmtTime(m.created_at)}{out && m.status ? ` · ${STATUS_LABEL[m.status] || m.status}` : ''}{failed && m.error ? ` (${m.error})` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                <textarea value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }}
                  placeholder="Type a message…" rows={1} style={{ ...INPUT, resize: 'none', minHeight: 40, maxHeight: 120 }} />
                <button className="btn-primary" onClick={doSend} disabled={sending || !reply.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <Send size={14} /> {sending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Activity / notes */}
        {active && (
          <div style={{ width: 300, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <StickyNote size={15} style={{ color: 'var(--muted)' }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Activity</span>
            </div>

            {/* Lead temperature */}
            {canTemp ? (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Lead status</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {TEMPS.map(t => {
                    const on = displayTemp(active) === t.key;
                    return (
                      <button key={t.key} onClick={() => setTemperature(t.key)}
                        style={{ flex: 1, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 800,
                          border: `1.5px solid ${on ? t.color : 'var(--border)'}`, background: on ? t.color : 'var(--surface)', color: on ? '#fff' : 'var(--muted)' }}>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : isUnknown ? (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
                Add this number as a lead to set cold / warm / hot.
              </div>
            ) : null}

            {/* Add note */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>Internal note</div>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                placeholder="Note for the team (only they see this). Enter to save." rows={2}
                style={{ ...INPUT, resize: 'none', lineHeight: 1.45 }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button className="btn-primary" onClick={addNote} disabled={noteBusy || !noteText.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={13} /> {noteBusy ? 'Saving…' : 'Add note'}
                </button>
              </div>
            </div>

            {/* Notes list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activityFeed.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>No activity yet.</div>
              ) : activityFeed.map(it => it.t === 'ho' ? (
                <div key={it.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13, color: 'var(--text)' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: colorForEmployee(it.e.to_id || it.e.to_name), borderRadius: 999, padding: '2px 8px' }}>{firstName(it.e.to_name)}</span>
                    <span>{it.e.from_name ? `took over from ${firstName(it.e.from_name)}` : 'picked up the conversation'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{it.e.by_name ? `handed off by ${firstName(it.e.by_name)} · ` : ''}{fmtDateTime(it.e.created_at)}</div>
                </div>
              ) : (
                <div key={it.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{it.n.body}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: colorForEmployee(it.n.author_email || it.n.author_name), flexShrink: 0 }} />
                    <span style={{ fontWeight: 700 }}>{it.n.author_name || 'Someone'}</span>
                    <span>· {fmtDateTime(it.n.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {composing && (
        <Composer directory={directory} onClose={() => setComposing(false)} onSent={afterCompose} />
      )}
    </div>
  );
}

const INPUT = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5,
  fontFamily: 'var(--font-display)', boxSizing: 'border-box',
};
const LABEL = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };

// Type switcher for a conversation: the kind badge, clickable, to move a number
// between Lead / Client / Contact after the fact.
function KindMenu({ kind, onChange }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  const k = KIND[kind];
  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer',
          color: k ? k.color : 'var(--muted)', background: k ? `${k.color}18` : 'var(--surface)', border: `1px solid ${k ? k.color + '40' : 'var(--border)'}`, borderRadius: 999, padding: '2px 7px' }}>
        {k ? k.label : 'Set type'} <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, marginTop: 6, minWidth: 150, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.3)', padding: 6 }}>
          {['lead', 'client', 'contact'].map(t => (
            <div key={t} onClick={() => { setOpen(false); onChange(t); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: 'var(--text)', textTransform: 'capitalize' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: KIND[t].color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{t}</span>
              {kind === t && <Check size={14} style={{ color: 'var(--orange)' }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Assign-to-employee control: a colored pill that opens a small menu.
function AssignMenu({ assignees, current, onAssign }) {
  const [open, setOpen] = useState(false);
  const assignedTo = current?.assigned_to || null;
  const name = current?.assigned_to_name || null;
  const color = name ? colorForEmployee(assignedTo || name) : null;
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 800,
          border: color ? 'none' : '1px dashed var(--border)', background: color || 'transparent', color: color ? '#fff' : 'var(--muted)' }}>
        {name ? firstName(name) : 'Assign'}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, marginTop: 6, minWidth: 190, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.3)', padding: 6, maxHeight: 300, overflowY: 'auto' }}>
          {name && (
            <div onClick={() => { onAssign(null); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: 'var(--muted)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <X size={13} /> Unassign
            </div>
          )}
          {assignees.length === 0 && (
            <div style={{ padding: '8px 9px', fontSize: 12, color: 'var(--muted)' }}>No employees yet.</div>
          )}
          {assignees.map(a => {
            const on = assignedTo === a.id;
            return (
              <div key={a.id} onClick={() => { onAssign(a); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, color: 'var(--text)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: colorForEmployee(a.id), flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                {on && <Check size={14} style={{ color: 'var(--orange)' }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// New-message composer: pick a lead/client/contact from the directory, or type
// a raw number and add it (defaults to a new lead) before sending.
function Composer({ directory, onClose, onSent }) {
  const [pick, setPick] = useState('');
  const [selected, setSelected] = useState(null);
  const [addKind, setAddKind] = useState('lead');
  const [addName, setAddName] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const digits = pick.replace(/\D/g, '');
  const isNumber = digits.length >= 10;
  const exact = useMemo(() => directory.find(p => last10(p.phone) === last10(pick)), [directory, pick]);
  const matches = useMemo(() => {
    const q = pick.trim().toLowerCase();
    if (!q || selected) return [];
    return directory.filter(p => p.name.toLowerCase().includes(q) || last10(p.phone).includes(digits)).slice(0, 6);
  }, [directory, pick, selected, digits]);
  const showQuickAdd = isNumber && !selected && !exact;
  const clearSelected = (v) => { setSelected(null); setPick(v); };
  const targetPhone = selected ? selected.phone : (isNumber ? pick : null);

  const send = async () => {
    if (!targetPhone) { toast('error', 'Pick a person or enter a valid number.'); return; }
    if (!body.trim()) { toast('error', 'Enter a message.'); return; }
    setBusy(true);
    try {
      if (showQuickAdd && addKind) {
        const name = addName.trim() || fmtPhone(targetPhone);
        if (addKind === 'contact') await createContact({ name, phone: targetPhone });
        else await createClient({ business_name: name, contact_phone: targetPhone, stage: addKind === 'lead' ? 'lead' : 'onboarding' });
      }
      await sendImsg(targetPhone, body.trim());
      toast('success', 'Queued. Your Mac sends it in a few seconds.');
      onSent(targetPhone);
    } catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <div onClick={() => !busy && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 480, maxWidth: '94vw', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>New message</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <span style={LABEL}>To</span>
            {selected ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...INPUT, padding: '8px 10px' }}>
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{selected.name}</span>
                <KindBadge kind={selected.kind} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{fmtPhone(selected.phone)}</span>
                <button onClick={() => clearSelected('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={15} /></button>
              </div>
            ) : (
              <input style={INPUT} autoFocus value={pick} placeholder="Name or number…" onChange={e => clearSelected(e.target.value)} />
            )}
            {matches.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5, marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                {matches.map(p => (
                  <div key={p.kind + p.id} onClick={() => { setSelected(p); setPick(p.name); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{p.name}</span>
                    <KindBadge kind={p.kind} />
                    <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 'auto' }}>{fmtPhone(p.phone)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showQuickAdd && (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)', marginBottom: 8 }}>
                <UserPlus size={14} /> New number. It will be added as a:
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {['lead', 'client', 'contact'].map(k => {
                  const on = addKind === k;
                  return (
                    <button key={k} type="button" onClick={() => setAddKind(k)}
                      style={{ flex: 1, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize',
                        border: `1.5px solid ${on ? KIND[k].color : 'var(--border)'}`, background: on ? `${KIND[k].color}18` : 'var(--surface)', color: on ? KIND[k].color : 'var(--text)' }}>
                      {k}
                    </button>
                  );
                })}
              </div>
              <input style={INPUT} value={addName} placeholder={addKind === 'contact' ? 'Contact name' : 'Business or person name'}
                onChange={e => setAddName(e.target.value)} />
            </div>
          )}

          <div>
            <span style={LABEL}>Message</span>
            <textarea style={{ ...INPUT, minHeight: 110, resize: 'vertical', lineHeight: 1.5 }} value={body}
              placeholder="Your message. It sends as an iMessage from your business number." onChange={e => setBody(e.target.value)} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            Sends as a personal iMessage from your business number. Text people who expect to hear from you.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} disabled={busy}
            style={{ padding: '9px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button className="btn-primary" onClick={send} disabled={busy || !targetPhone || !body.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Send size={14} /> {busy ? 'Sending…' : (showQuickAdd ? 'Add & send' : 'Send')}
          </button>
        </div>
      </div>
    </div>
  );
}
