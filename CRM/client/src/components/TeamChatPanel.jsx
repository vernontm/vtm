import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Users, ArrowLeft, UserPlus, X, LogOut, Sparkles } from 'lucide-react';
import Drawer from './Drawer';
import { toast } from './Toast';
import {
  getChatMessages, sendChat, markChatRead, renameChat, changeChatMembers, leaveChat, getChatPeople,
  askAssistant, proposeActions,
} from '../api';

// One internal chat room: a direct message or a group. Mine on the right in
// the brand color, theirs on the left with the sender's name. New messages
// arrive on a 5 second poll that only asks for what is newer than the last
// one we have. The people control renames a group, adds and removes
// teammates, and leaves the chat.

const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const EMP_COLORS = ['#2563eb', '#7c3aed', '#c026d3', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#4f46e5'];
function colorFor(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EMP_COLORS[h % EMP_COLORS.length];
}
const clock = (t) => {
  const d = new Date(t);
  return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};
// Today, Yesterday, then the weekday and date.
function dayLabel(t) {
  const d = new Date(t);
  if (isNaN(d)) return '';
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export default function TeamChatPanel({ room, me, onRoomsChanged, onClose, onTextClient }) {
  const roomId = room?.id || null;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  // Assistant drafting for this room: suggested replies, a free instruction
  // box, and any customer the chat implies we should text.
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftNote, setDraftNote] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const [actions, setActions] = useState([]);
  const [actionsBusy, setActionsBusy] = useState(false);
  const draftHistory = useRef([]);
  const scrollRef = useRef(null);
  const lastAt = useRef(null);

  const members = room?.members || [];
  const others = useMemo(() => members.filter(m => m.user_id !== me?.id), [members, me?.id]);
  const isGroup = room?.kind === 'group' || members.length > 2;
  const title = isGroup
    ? (room?.name || others.map(m => firstName(m.user_name)).join(', ') || 'Group chat')
    : (others[0]?.user_name || room?.name || 'Chat');
  const subtitle = isGroup
    ? members.map(m => m.user_id === me?.id ? 'You' : firstName(m.user_name)).join(', ')
    : 'Direct message';
  const myRole = members.find(m => m.user_id === me?.id)?.role;
  const canManage = myRole === 'admin' || !!me?.is_admin;

  const load = useCallback(async (incremental) => {
    if (!roomId) return;
    try {
      const r = await getChatMessages(roomId, incremental ? lastAt.current : null);
      const rows = r?.messages || [];
      if (incremental) {
        if (rows.length) {
          setMessages(prev => {
            const have = new Set(prev.map(m => m.id));
            return [...prev, ...rows.filter(m => !have.has(m.id))];
          });
        }
      } else setMessages(rows);
      if (rows.length) {
        lastAt.current = rows[rows.length - 1].created_at;
        markChatRead(roomId).catch(() => {});
      }
    } catch (_) { /* a dropped poll is not worth a toast */ }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let live = true;
    lastAt.current = null;
    setMessages([]); setInput(''); setLoading(true); setPeopleOpen(false);
    (async () => { await load(false); if (live) setLoading(false); })();
    markChatRead(roomId).catch(() => {});
    const t = setInterval(() => load(true), 5000);
    return () => { live = false; clearInterval(t); };
  }, [roomId, load]);

  useEffect(() => { setNameDraft(room?.name || ''); }, [room?.id, room?.name]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !roomId) return;
    setSending(true);
    try {
      await sendChat(roomId, text);
      setInput('');
      await load(true);
      onRoomsChanged && onRoomsChanged();
    } catch (e) { toast('error', e.message); }
    finally { setSending(false); }
  };

  // What the assistant reads: who is in the room and the last 15 messages.
  // Same context the app builds, so both give the same quality of draft.
  const contextPrompt = () => {
    const who = (room?.members || []).map(m => m.user_name).filter(Boolean).join(', ');
    const recent = messages.slice(-15);
    const cut = Math.max(0, recent.length - 4);
    const thread = recent.map((m, i) => {
      const mine = m.sender_id === me?.id;
      const stamp = new Date(m.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      return `${i === cut ? '[most recent from here]\n' : ''}${stamp} ${mine ? `${m.sender_name} (me)` : m.sender_name}: ${m.body}`;
    }).join('\n') || '(no messages yet)';
    const myName = firstName(me?.user_metadata?.name || me?.email) || 'a team member';
    return [
      `This is an INTERNAL team chat between employees of Vernon Tech & Media${title ? ` ("${title}")` : ''}, not a customer conversation. People in it: ${who || 'the team'}. I am ${myName}. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
      `The chat, oldest to newest (the most recent messages matter most):\n${thread}`,
      'Customers mentioned here are in the CRM; look them up with search_people when you need their details. Never invent names, prices or dates.',
    ].join('\n\n');
  };

  const parseDrafts = (text) => String(text || '').split(/\n+/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|option\s*\d+:?)\s*/i, '').replace(/^["“]+|["”]+$/g, '').trim())
    .filter(l => l.length >= 4).slice(0, 4);
  const wantsDraft = (t) => /\b(draft|write|reply|respond|say|message|shorter|longer|warmer|friendlier|formal|casual|rewrite|summar|recap|answer)\b/i.test(t);

  const runDraft = async (instruction, initial = false) => {
    if (draftBusy) return;
    setDraftBusy(true); setDraftNote('');
    try {
      const prompt = initial
        ? `${contextPrompt()}\n\n${instruction}`
        : `${contextPrompt()}\n\nInstruction from me: ${instruction}\n${wantsDraft(instruction) ? 'Reply with ONLY the message text I should send in this team chat (or up to three options, one per line). No numbering, no quotes, no preamble.' : 'Answer briefly and plainly.'}`;
      const r = await askAssistant(prompt, draftHistory.current);
      const answer = String(r?.answer || '').trim();
      draftHistory.current = [...draftHistory.current, { role: 'user', content: instruction }, { role: 'assistant', content: answer }].slice(-10);
      if (initial || wantsDraft(instruction)) {
        const opts = parseDrafts(answer);
        if (opts.length) setDrafts(opts); else setDraftNote(answer || 'No draft came back.');
      } else setDraftNote(answer || 'No answer.');
    } catch (e) { setDraftNote(`Could not reach the assistant: ${e.message}`); }
    finally { setDraftBusy(false); }
  };

  // Does this chat imply reaching out to a customer? Those come back as
  // text_client actions, each with the customer and a ready message.
  const detectActions = async () => {
    if (actionsBusy) return;
    setActionsBusy(true);
    try {
      const r = await proposeActions(contextPrompt());
      setActions((r?.actions || []).filter(a => a.type === 'text_client'));
    } catch (_) { /* suggestions are a bonus, never an error */ }
    finally { setActionsBusy(false); }
  };

  const openDrafts = () => {
    setDraftOpen(true);
    if (!actionsBusy) detectActions();
    if (!drafts.length && !draftBusy) {
      runDraft('Write three short replies I could send next in this team chat: one that answers or moves the conversation forward, one that assigns or confirms a next step, and one short and casual. Each one to two sentences, natural, no sign-off. Reply with exactly three options, one per line, no numbering, no quotes, nothing else.', true);
    }
  };
  const useDraft = (text) => {
    setInput(prev => (prev.trim() ? `${prev.trim()} ${text}` : text));
    setDraftOpen(false);
  };
  const sendDraftInstruction = () => {
    const t = draftInput.trim();
    if (!t) return;
    setDraftInput('');
    runDraft(t);
  };
  const useAction = (a) => {
    if (!a.phone) { toast('error', `No number on file for ${a.client_name || 'this customer'}. Add their phone to the record first.`); return; }
    setDraftOpen(false);
    if (onTextClient) onTextClient({ phone: a.phone, message: a.message, client_name: a.client_name });
    else toast('info', 'Open their conversation from the Clients tab to send this.');
  };
  const DRAFT_CHIPS = [
    ['Recap', 'Summarize what this chat decided, in three bullet points at most.'],
    ['Next steps', 'List the next steps this chat implies, who owns each, one line each.'],
    ['Shorter', 'Make it shorter.'],
    ['Warmer', 'Make it warmer and more personal.'],
  ];

  const openPeople = () => {
    setPeopleOpen(true);
    if (!people.length) getChatPeople().then(r => setPeople(r?.people || [])).catch(() => {});
  };
  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === room?.name) return;
    setBusy(true);
    try { await renameChat(roomId, name); await (onRoomsChanged && onRoomsChanged()); toast('success', 'Renamed.'); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };
  const addPerson = async (p) => {
    setBusy(true);
    try { await changeChatMembers(roomId, [p.id], []); await (onRoomsChanged && onRoomsChanged()); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };
  const removePerson = async (m) => {
    if (!window.confirm(`Remove ${firstName(m.user_name)}? They stop seeing this chat.`)) return;
    setBusy(true);
    try { await changeChatMembers(roomId, [], [m.user_id]); await (onRoomsChanged && onRoomsChanged()); }
    catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };
  const leave = async () => {
    if (!window.confirm('Leave this chat? Whoever made it can add you back.')) return;
    setBusy(true);
    try {
      await leaveChat(roomId);
      setPeopleOpen(false);
      await (onRoomsChanged && onRoomsChanged());
      onClose && onClose();
    } catch (e) { toast('error', e.message); }
    finally { setBusy(false); }
  };

  const notIn = people.filter(p => p.id !== me?.id && !members.some(m => m.user_id === p.id));
  const canAdd = notIn.filter(p => p.on_app);
  const offApp = notIn.filter(p => !p.on_app);

  // Messages with a day divider wherever the date changes.
  const rows = useMemo(() => {
    const out = [];
    let day = null;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const label = dayLabel(m.created_at);
      if (label && label !== day) { out.push({ t: 'day', key: `d${label}${i}`, label }); day = label; }
      const prev = messages[i - 1];
      const mine = m.sender_id === me?.id;
      const showName = !mine && (!prev || prev.sender_id !== m.sender_id || dayLabel(prev.created_at) !== label);
      out.push({ t: 'msg', key: `m${m.id}`, m, mine, showName });
    }
    return out;
  }, [messages, me?.id]);

  if (!room) return null;

  return (
    <>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} className="inbox-back" title="Back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'none' }}><ArrowLeft size={18} /></button>
        <button onClick={openPeople} title="Chat details"
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
        </button>
        <button onClick={openPeople} title="People in this chat"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', flexShrink: 0 }}>
          <Users size={14} /> {members.length}
        </button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '30px 0' }}>
            Say hello. Everyone in this chat gets a notification.
          </div>
        ) : rows.map(it => it.t === 'day' ? (
          <div key={it.key} style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 2px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{it.label}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        ) : (
          <div key={it.key} style={{ alignSelf: it.mine ? 'flex-end' : 'flex-start', maxWidth: '76%' }}>
            {it.showName && (
              <div style={{ fontSize: 11, fontWeight: 800, color: colorFor(it.m.sender_id || it.m.sender_name), marginBottom: 3, marginLeft: 3 }}>
                {firstName(it.m.sender_name) || 'Teammate'}
              </div>
            )}
            <div style={{
              padding: '9px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: it.mine ? 'var(--orange)' : 'var(--surface-2)',
              color: it.mine ? '#fff' : 'var(--text)', border: it.mine ? 'none' : '1px solid var(--border)',
            }}>{it.m.body}</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3, textAlign: it.mine ? 'right' : 'left' }}>{clock(it.m.created_at)}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'flex', gap: 8 }}>
        <button onClick={openDrafts} title="Draft with the assistant" aria-label="Draft with the assistant"
          style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: '#7c5cff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Sparkles size={16} />
        </button>
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message the team…" rows={1} style={{ ...INPUT, resize: 'none', minHeight: 40, maxHeight: 120 }} />
        <button className="btn-primary" onClick={send} disabled={sending || !input.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Send size={14} /> {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

      <Drawer open={draftOpen} onClose={() => setDraftOpen(false)} width={460}
        title="Assistant" subtitle={title ? `Drafting for ${title}` : 'Drafting for this chat'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {actions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Smart actions</div>
              {actions.map((a, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>Text {firstName(a.client_name) || 'the customer'}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{a.message}</div>
                  <button className="btn-primary" onClick={() => useAction(a)} style={{ alignSelf: 'flex-start' }}>
                    {a.phone ? 'Open their chat with this draft' : 'No number on file'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {draftBusy && !drafts.length ? 'Writing some replies' : 'Tap one to put it in the box'}
            </div>
            {drafts.map((d, i) => (
              <button key={i} onClick={() => useDraft(d)}
                style={{ textAlign: 'left', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', background: 'var(--card)', cursor: 'pointer', fontSize: 13.5, lineHeight: 1.45, color: 'var(--text)' }}>
                {d}
              </button>
            ))}
            {!drafts.length && !draftBusy && !draftNote && (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Nothing to suggest yet. Ask for something below.</div>
            )}
            {draftNote && <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{draftNote}</div>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DRAFT_CHIPS.map(([label, instruction]) => (
              <button key={label} onClick={() => runDraft(instruction)} disabled={draftBusy}
                style={{ border: '1px solid var(--border)', borderRadius: 999, padding: '6px 12px', background: 'var(--card)', cursor: draftBusy ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', opacity: draftBusy ? 0.5 : 1 }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input value={draftInput} onChange={e => setDraftInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendDraftInstruction(); }}
              placeholder="Tell the assistant what to write" style={INPUT} />
            <button className="btn-primary" onClick={sendDraftInstruction} disabled={draftBusy || !draftInput.trim()} style={{ flexShrink: 0 }}>
              {draftBusy ? 'Working' : 'Ask'}
            </button>
          </div>
        </div>
      </Drawer>

      <Drawer open={peopleOpen} onClose={() => setPeopleOpen(false)} width={420}
        title={isGroup ? 'Group chat' : 'Direct message'} subtitle={title}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {isGroup && (
            <div>
              <span style={LABEL}>Name</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} placeholder="Group name"
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); }} style={INPUT} />
                <button className="btn-primary" onClick={saveName} disabled={busy || !nameDraft.trim() || nameDraft.trim() === room?.name} style={{ flexShrink: 0 }}>Save</button>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Anyone in the chat can rename it.</div>
            </div>
          )}

          <div>
            <span style={LABEL}>{isGroup ? `In this chat · ${members.length}` : 'People'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {members.map(m => (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: colorFor(m.user_id || m.user_name), color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(firstName(m.user_name)[0] || '?').toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.user_id === me?.id ? `${m.user_name} (you)` : m.user_name}
                  </span>
                  {m.role === 'admin' && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Owner</span>}
                  {canManage && isGroup && m.user_id !== me?.id && (
                    <button onClick={() => removePerson(m)} disabled={busy} title={`Remove ${firstName(m.user_name)}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex', flexShrink: 0 }}>
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canManage && isGroup && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Only you and admins can change who is in here.</div>}
          </div>

          <div>
            <span style={LABEL}>{isGroup ? 'Add teammates' : 'Add someone to turn this into a group'}</span>
            {people.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading the team…</div>
            ) : canAdd.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>Everyone on the app is already here.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {canAdd.map(p => (
                  <button key={p.id} onClick={() => addPerson(p)} disabled={busy}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                    <UserPlus size={13} /> {p.name}
                  </button>
                ))}
              </div>
            )}
            {offApp.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                Not on the app yet: {offApp.map(p => firstName(p.name)).join(', ')}. They can join once they sign in on their phone.
              </div>
            )}
          </div>

          <button onClick={leave} disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--red)' }}>
            <LogOut size={14} /> Leave this chat
          </button>
        </div>
      </Drawer>
    </>
  );
}

const INPUT = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5,
  fontFamily: 'var(--font-display)', boxSizing: 'border-box',
};
const LABEL = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7, display: 'block' };
