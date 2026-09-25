const { setCors, requireCrmUser, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { pushUser } = require('../_lib/push.js');

// Internal team chat: direct messages and group chats between the people
// who use the CRM. Lives beside the customer inbox (iMessage) but never
// touches it. Tables: docs/sql/team-chat.sql.
//
//   GET  ?action=rooms                       -> { rooms: [{ id, kind, name, members:[{user_id,user_name,role}], unread, last_message_at, last_message_preview, last_sender_name }] }
//   GET  ?action=messages&room=<id>&after=<iso?> -> { messages: [{ id, sender_id, sender_name, body, created_at }] }
//   GET  ?action=people                      -> { people: [{ id, name, email }] }   (everyone with a login)
//   POST ?action=create   { kind:'dm'|'group', name?, member_ids:[uuid] }
//   POST ?action=send     { room, body }
//   POST ?action=rename   { room, name }
//   POST ?action=members  { room, add?:[uuid], remove?:[uuid] }
//   POST ?action=read     { room }
//   POST ?action=leave    { room }
const MIGRATION_MSG = 'Team chat needs its tables. Run docs/sql/team-chat.sql in Supabase.';
const needsMigration = (e) => /crm_chat_rooms|crm_chat_members|crm_chat_messages|does not exist|schema cache/i.test(String(e?.message || e || ''));
const nameOf = (u) => u?.user_metadata?.name || u?.user_metadata?.full_name || (u?.email || '').split('@')[0] || 'Someone';
const uuidRe = /^[0-9a-f-]{36}$/i;

// The team: admins, anyone with CRM access grants, and anyone on the roster.
// Client portal logins live in the same auth table and are left out.
async function listPeople() {
  const [r, grants, roster, tokens] = await Promise.all([
    fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }),
    supaFetch('crm_user_access?select=user_id').catch(() => []),
    supaFetch('crm_team_members?or=(status.is.null,status.eq.active)&select=user_id,email').catch(() => []),
    supaFetch('crm_push_tokens?select=user_id').catch(() => []),
  ]);
  const j = await r.json().catch(() => ({}));
  const ids = new Set([...(grants || []).map(g => g.user_id), ...(roster || []).map(m => m.user_id)].filter(Boolean));
  const emails = new Set((roster || []).map(m => String(m.email || '').toLowerCase()).filter(Boolean));
  const onApp = new Set((tokens || []).map(t => t.user_id).filter(Boolean));   // signed into the app, can get pushes
  const isAdmin = (u) => !!(u.user_metadata?.is_admin || u.app_metadata?.is_admin);
  return (Array.isArray(j?.users) ? j.users : [])
    .filter(u => u.email && (isAdmin(u) || ids.has(u.id) || emails.has(String(u.email).toLowerCase())))
    .map(u => ({ id: u.id, name: nameOf(u), email: u.email, is_admin: isAdmin(u), on_app: onApp.has(u.id) }))
    .sort((a, b) => Number(b.on_app) - Number(a.on_app) || a.name.localeCompare(b.name));
}

async function membership(roomId, userId) {
  const [m] = await supaFetch(`crm_chat_members?room_id=eq.${roomId}&user_id=eq.${userId}&select=*`) || [];
  return m || null;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const action = req.query.action;
  const me = user.id;
  const myName = nameOf(user);
  const body = req.body || {};

  try {
    if (req.method === 'GET' && action === 'people') {
      return res.json({ people: await listPeople() });
    }

    if (req.method === 'GET' && action === 'rooms') {
      const mine = await supaFetch(`crm_chat_members?user_id=eq.${me}&select=room_id,last_read_at`) || [];
      if (!mine.length) return res.json({ rooms: [] });
      const ids = mine.map(m => m.room_id);
      const inList = `(${ids.join(',')})`;
      const [rooms, members] = await Promise.all([
        supaFetch(`crm_chat_rooms?id=in.${inList}&order=last_message_at.desc.nullslast,created_at.desc`) || [],
        supaFetch(`crm_chat_members?room_id=in.${inList}&select=room_id,user_id,user_name,role`) || [],
      ]);
      const readAt = Object.fromEntries(mine.map(m => [m.room_id, m.last_read_at]));
      // Unread = messages from others after my last read, per room.
      const unread = {};
      await Promise.all(rooms.map(async r => {
        const since = readAt[r.id] || '1970-01-01T00:00:00Z';
        const rows = await supaFetch(`crm_chat_messages?room_id=eq.${r.id}&created_at=gt.${encodeURIComponent(since)}&sender_id=neq.${me}&select=id&limit=50`) || [];
        unread[r.id] = rows.length;
      }));
      return res.json({
        rooms: rooms.map(r => ({ ...r, members: members.filter(m => m.room_id === r.id).map(({ user_id, user_name, role }) => ({ user_id, user_name, role })), unread: unread[r.id] || 0 })),
      });
    }

    if (req.method === 'GET' && action === 'messages') {
      const room = String(req.query.room || '');
      if (!uuidRe.test(room)) return res.status(400).json({ error: 'room required' });
      if (!(await membership(room, me))) return res.status(403).json({ error: 'Not in this chat' });
      const after = req.query.after ? `&created_at=gt.${encodeURIComponent(String(req.query.after))}` : '';
      const rows = await supaFetch(`crm_chat_messages?room_id=eq.${room}${after}&order=created_at.asc&limit=200&select=id,sender_id,sender_name,body,created_at`) || [];
      return res.json({ messages: rows });
    }

    if (req.method === 'POST' && action === 'create') {
      const kind = body.kind === 'dm' ? 'dm' : 'group';
      const others = [...new Set((body.member_ids || []).filter(id => uuidRe.test(String(id)) && id !== me))];
      if (!others.length) return res.status(400).json({ error: 'Pick at least one person' });
      const people = await listPeople();
      const nameFor = (id) => people.find(p => p.id === id)?.name || 'Teammate';
      if (kind === 'dm' && others.length === 1) {
        // One direct chat per pair: reuse it if it exists.
        const mine = await supaFetch(`crm_chat_members?user_id=eq.${me}&select=room_id`) || [];
        if (mine.length) {
          const theirs = await supaFetch(`crm_chat_members?user_id=eq.${others[0]}&room_id=in.(${mine.map(m => m.room_id).join(',')})&select=room_id`) || [];
          if (theirs.length) {
            const dms = await supaFetch(`crm_chat_rooms?id=in.(${theirs.map(t => t.room_id).join(',')})&kind=eq.dm&select=id&limit=1`) || [];
            if (dms[0]) return res.json({ room: dms[0].id, existing: true });
          }
        }
      }
      const name = kind === 'group' ? String(body.name || '').trim().slice(0, 80) || [myName, ...others.map(nameFor)].map(n => n.split(/\s+/)[0]).join(', ') : null;
      const [room] = await supaFetch('crm_chat_rooms', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ kind: others.length > 1 ? 'group' : kind, name: others.length > 1 && !name ? 'Group chat' : name, created_by: me, created_by_name: myName }),
      });
      const rows = [{ room_id: room.id, user_id: me, user_name: myName, role: 'admin', last_read_at: new Date().toISOString() }, ...others.map(id => ({ room_id: room.id, user_id: id, user_name: nameFor(id), role: 'member' }))];
      await supaFetch('crm_chat_members', { method: 'POST', body: JSON.stringify(rows) });
      for (const id of others) pushUser(id, { title: room.kind === 'dm' || !room.name ? myName : room.name, body: `${myName} started a chat with you`, data: { type: 'chat', room: room.id } }).catch(() => {});
      return res.status(201).json({ room: room.id, existing: false });
    }

    if (req.method === 'POST' && action === 'send') {
      const room = String(body.room || '');
      const text = String(body.body || '').trim().slice(0, 4000);
      if (!uuidRe.test(room)) return res.status(400).json({ error: 'room required' });
      if (!text) return res.status(400).json({ error: 'Message required' });
      if (!(await membership(room, me))) return res.status(403).json({ error: 'Not in this chat' });
      const [msg] = await supaFetch('crm_chat_messages', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ room_id: room, sender_id: me, sender_name: myName, body: text }),
      });
      const now = new Date().toISOString();
      await supaFetch(`crm_chat_rooms?id=eq.${room}`, { method: 'PATCH', body: JSON.stringify({ last_message_at: now, last_message_preview: text.slice(0, 140), last_sender_name: myName, updated_at: now }) });
      await supaFetch(`crm_chat_members?room_id=eq.${room}&user_id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ last_read_at: now }) });
      const [info] = await supaFetch(`crm_chat_rooms?id=eq.${room}&select=kind,name`) || [];
      const members = await supaFetch(`crm_chat_members?room_id=eq.${room}&select=user_id`) || [];
      const title = info?.kind === 'group' && info?.name ? `${info.name} · ${myName}` : myName;
      for (const m of members) if (m.user_id !== me) pushUser(m.user_id, { title, body: text.slice(0, 180), data: { type: 'chat', room } }).catch(() => {});
      return res.status(201).json(msg);
    }

    if (req.method === 'POST' && action === 'rename') {
      const room = String(body.room || '');
      const name = String(body.name || '').trim().slice(0, 80);
      if (!uuidRe.test(room) || !name) return res.status(400).json({ error: 'room and name required' });
      if (!(await membership(room, me))) return res.status(403).json({ error: 'Not in this chat' });
      await supaFetch(`crm_chat_rooms?id=eq.${room}`, { method: 'PATCH', body: JSON.stringify({ name, kind: 'group', updated_at: new Date().toISOString() }) });
      return res.json({ ok: true });
    }

    if (req.method === 'POST' && action === 'members') {
      const room = String(body.room || '');
      if (!uuidRe.test(room)) return res.status(400).json({ error: 'room required' });
      const mem = await membership(room, me);
      if (!mem) return res.status(403).json({ error: 'Not in this chat' });
      if (mem.role !== 'admin' && !user.is_admin) return res.status(403).json({ error: 'Only the person who made this chat (or an admin) can change who is in it.' });
      const people = await listPeople();
      const add = [...new Set((body.add || []).filter(id => uuidRe.test(String(id))))];
      const remove = [...new Set((body.remove || []).filter(id => uuidRe.test(String(id)) && id !== me))];
      if (add.length) {
        const existing = await supaFetch(`crm_chat_members?room_id=eq.${room}&select=user_id`) || [];
        const have = new Set(existing.map(e => e.user_id));
        const rows = add.filter(id => !have.has(id)).map(id => ({ room_id: room, user_id: id, user_name: people.find(p => p.id === id)?.name || 'Teammate', role: 'member' }));
        if (rows.length) await supaFetch('crm_chat_members', { method: 'POST', body: JSON.stringify(rows) });
        await supaFetch(`crm_chat_rooms?id=eq.${room}`, { method: 'PATCH', body: JSON.stringify({ kind: 'group', updated_at: new Date().toISOString() }) });
        const [info] = await supaFetch(`crm_chat_rooms?id=eq.${room}&select=name`) || [];
        for (const r of rows) pushUser(r.user_id, { title: info?.name || 'Group chat', body: `${myName} added you`, data: { type: 'chat', room } }).catch(() => {});
      }
      if (remove.length) await supaFetch(`crm_chat_members?room_id=eq.${room}&user_id=in.(${remove.join(',')})`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    if (req.method === 'POST' && action === 'read') {
      const room = String(body.room || '');
      if (!uuidRe.test(room)) return res.status(400).json({ error: 'room required' });
      await supaFetch(`crm_chat_members?room_id=eq.${room}&user_id=eq.${me}`, { method: 'PATCH', body: JSON.stringify({ last_read_at: new Date().toISOString() }) });
      return res.json({ ok: true });
    }

    if (req.method === 'POST' && action === 'leave') {
      const room = String(body.room || '');
      if (!uuidRe.test(room)) return res.status(400).json({ error: 'room required' });
      await supaFetch(`crm_chat_members?room_id=eq.${room}&user_id=eq.${me}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Unknown action' });
  } catch (err) {
    if (needsMigration(err)) {
      if (req.method === 'GET') return res.json({ rooms: [], messages: [], people: [], needs_migration: true });
      return res.status(503).json({ error: MIGRATION_MSG });
    }
    console.error('chat error:', err);
    return res.status(500).json({ error: err.message });
  }
};
