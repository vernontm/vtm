import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Users, ArrowLeft, UserPlus, X, LogOut } from 'lucide-react';
import Drawer from './Drawer';
import { toast } from './Toast';
import {
  getChatMessages, sendChat, markChatRead, renameChat, changeChatMembers, leaveChat, getChatPeople,
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

export default function TeamChatPanel({ room, me, onRoomsChanged, onClose }) {
  const roomId = room?.id || null;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);
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
        <textarea value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message the team…" rows={1} style={{ ...INPUT, resize: 'none', minHeight: 40, maxHeight: 120 }} />
        <button className="btn-primary" onClick={send} disabled={sending || !input.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Send size={14} /> {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

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
