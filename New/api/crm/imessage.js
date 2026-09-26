const { setCors, supaFetch, requireCrmUser } = require('../_lib/supabase.js');
const { pushUser, pushAdmins } = require('../_lib/push.js');

// iMessage inbox.
//
// The CRM runs in the cloud and cannot drive Messages.app, so it never sends an
// iMessage itself. Outbound texts are QUEUED here (status 'queued'), and the
// bridge running on the Mac signed into the business Apple ID
// (imessage-bridge/bridge.mjs) polls this endpoint, sends each one through
// Messages, reports back, and forwards inbound replies.
//
//   User actions (CRM login):     GET (threads / one thread), POST ?action=send,
//                                  POST ?action=star, ?action=archive, ?action=delete
//   Bridge actions (shared token): GET ?action=contacts, POST ?action=pending,
//                                  POST ?action=mark, POST ?action=inbound
//
// Rows live in crm_sms_messages with channel = 'imessage'. Bridge calls carry
// X-Bridge-Token, which must equal IMESSAGE_BRIDGE_TOKEN in the environment.
const BRIDGE_TOKEN = process.env.IMESSAGE_BRIDGE_TOKEN;
const CHANNEL = 'imessage';
const BRIDGE_ACTIONS = new Set(['contacts', 'pending', 'mark', 'inbound', 'upload-url']);
const { signedUpload, cleanAttachments } = require('../_lib/storage.js');
// What a text with only media reads as in previews and pushes.
const mediaLabel = (atts) => {
  const types = (atts || []).map(a => a.type);
  if (!types.length) return '';
  if (types.every(t => t === 'image')) return types.length === 1 ? 'Photo' : `${types.length} photos`;
  if (types.every(t => t === 'video')) return types.length === 1 ? 'Video' : `${types.length} videos`;
  if (types.every(t => t === 'audio')) return 'Voice memo';
  return 'Attachment';
};

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Loose US phone normalization to E.164; null when hopeless.
function normalizePhone(raw) {
  const d = String(raw || '').replace(/[^\d+]/g, '');
  if (/^\+1\d{10}$/.test(d)) return d;
  if (/^1\d{10}$/.test(d)) return `+${d}`;
  if (/^\d{10}$/.test(d)) return `+1${d}`;
  if (/^\+\d{8,15}$/.test(d)) return d;
  return null;
}

// The channel / imsg_guid columns are a one-time migration. Turn the raw
// PostgREST error into something a person can act on.
function needsMigration(e) {
  const m = String((e && e.message) || '');
  return /(channel|imsg_guid|attachments|starred|archived_at|deleted_at|crm_imessage_threads|crm_imessage_notes|crm_imessage_events|crm_imessage_reads)/i.test(m) && /(does not exist|schema cache|could not find|relation)/i.test(m);
}
const MIGRATION_MSG = 'The iMessage inbox needs its one-time database update. Run the SQL from imessage-bridge/README.md.';
// Starring, archiving and deleting are a later migration of their own.
const BATCH2_MSG = 'Starring, archiving and deleting conversations need one more database update. Run docs/sql/app-batch-2.sql in Supabase.';
const BATCH2_COLS = /(starred|archived_at|deleted_at)/i;
const migrationBody = (e) => ({
  error: BATCH2_COLS.test(String((e && e.message) || '')) ? BATCH2_MSG : MIGRATION_MSG,
  needs_migration: true,
});

const first = (x) => (Array.isArray(x) ? x[0] : x);

// Every read of the inbox skips soft-deleted messages. Before the migration
// that column does not exist, so the same query runs again without the filter
// and the inbox keeps working.
async function readMessages(query) {
  try {
    return (await supaFetch(`${query}${query.includes('?') ? '&' : '?'}deleted_at=is.null`)) || [];
  } catch (e) {
    if (!/deleted_at/i.test(String((e && e.message) || ''))) throw e;
    return (await supaFetch(query)) || [];
  }
}

// One row per conversation: who it is assigned to, plus star and archive
// state. Any of those columns can still be missing (each arrived in its own
// migration), so this degrades to whatever the table actually has.
async function readThreadRows() {
  try {
    return (await supaFetch('crm_imessage_threads?select=phone,assigned_to,assigned_to_name,starred,archived_at')) || [];
  } catch (_) {
    try {
      return (await supaFetch('crm_imessage_threads?select=phone,assigned_to,assigned_to_name')) || [];
    } catch (_) {
      return [];
    }
  }
}

// Set a few columns on a conversation, creating the row when this is the
// first thing ever recorded about that number.
function patchThread(phone, patch) {
  return supaFetch('crm_imessage_threads?on_conflict=phone', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ phone, ...patch, updated_at: new Date().toISOString() }),
  });
}

// Thread a phone number to a client/lead by matching the last 10 digits.
async function clientIdFor(phone) {
  try {
    const digits = last10(phone);
    const clients = await supaFetch('crm_clients?select=id,contact_phone&contact_phone=not.is.null');
    return (clients || []).find((c) => last10(c.contact_phone) === digits)?.id || null;
  } catch {
    return null;
  }
}

const fmtUS = (p) => {
  const d = last10(p);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p || '');
};

// Push an inbound reply to whoever owns the conversation: the assigned employee
// only, or all admins when it is unassigned. Best-effort: a push must never
// break the inbound flow.
async function notifyInbound(phone, text) {
  try {
    const d10 = last10(phone);

    // Who is it assigned to? assigned_to is a roster id (crm_team_members.id) or
    // an auth user id (self-assign). Resolve to an auth user_id for push tokens.
    let assigneeUserId = null;
    try {
      const t = first(await supaFetch(`crm_imessage_threads?phone=eq.${encodeURIComponent(phone)}&select=assigned_to&limit=1`));
      if (t?.assigned_to) {
        const tm = first(await supaFetch(`crm_team_members?id=eq.${encodeURIComponent(t.assigned_to)}&select=user_id`));
        assigneeUserId = tm?.user_id || t.assigned_to;
      }
    } catch (_) {}

    // A friendly sender name for the notification title.
    let name = null;
    try {
      const [clients, contacts] = await Promise.all([
        supaFetch('crm_clients?select=business_name,owner_name,contact_phone&contact_phone=not.is.null'),
        supaFetch('crm_contacts?select=name,phone&phone=not.is.null'),
      ]);
      const c = (clients || []).find((x) => last10(x.contact_phone) === d10);
      const ct = (contacts || []).find((x) => last10(x.phone) === d10);
      name = c?.business_name || c?.owner_name || ct?.name || null;
    } catch (_) {}

    const payload = { title: name || fmtUS(phone), body: String(text || '').slice(0, 180), data: { type: 'imessage', phone } };
    let sent = 0;
    if (assigneeUserId) sent = await pushUser(assigneeUserId, payload);
    // No device for the assignee (not on the app yet, or a roster row that is
    // not linked to a login): admins get it instead, so a text is never silent.
    if (!sent) await pushAdmins(payload);
  } catch (_) { /* never break inbound on a push failure */ }
}

// ── Voice notes ──────────────────────────────────────────────────────────
// A voice note is an attachment with type 'audio'. The server transcribes it
// once with ElevenLabs (scribe_v1, the same key recordings.js uses) so the
// words are searchable and readable without anyone playing the clip. One
// attempt with tight timeouts, and any failure just means no transcript: a
// text is never lost over a transcription.
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const STT_BUDGET_MS = 8000;              // the whole job, download included
const STT_CALL_MS = 6000;                // any single call, so an inbound text
                                         // never outruns the function's limit
const STT_MAX_BYTES = 20 * 1024 * 1024;  // bigger than this, skip it
const STT_MAX_CLIPS = 2;                 // more audio than this in one text stays untranscribed

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// A multipart body with no dependency, the same shape recordings.js builds.
function buildMultipart(fields, file) {
  const boundary = '----VTMBoundary' + Date.now() + Math.random().toString(36).slice(2);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
    file.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  );
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// Pull the clip back out of storage and hand it to ElevenLabs. Throws on
// anything that goes wrong; the caller reads that as "no transcript".
async function speechToText(att, deadline) {
  const left = () => Math.max(500, Math.min(STT_CALL_MS, deadline - Date.now()));
  const dl = await fetchWithTimeout(att.url, {}, left());
  if (!dl.ok) throw new Error(`download ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  if (!buf.length) throw new Error('empty audio');
  if (buf.length > STT_MAX_BYTES) throw new Error(`audio too large (${buf.length} bytes)`);
  const { body, contentType } = buildMultipart(
    { model_id: 'scribe_v1' },
    { name: 'file', filename: att.name || 'voice-note.m4a', mimeType: att.mime || 'audio/m4a', buffer: buf }
  );
  const res = await fetchWithTimeout(STT_URL, {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': contentType },
    body,
  }, left());
  if (!res.ok) throw new Error(`speech to text ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return await res.json();
}

// cleanAttachments() keeps only what the app renders, so a voice note's two
// extra fields are merged back on here from what the caller sent.
function withVoiceFields(raw, cleaned) {
  const byUrl = new Map();
  for (const a of Array.isArray(raw) ? raw : []) {
    const u = String((a && a.url) || '').slice(0, 600);
    if (u && !byUrl.has(u)) byUrl.set(u, a);
  }
  return cleaned.map((a) => {
    const src = byUrl.get(a.url) || {};
    const out = { ...a };
    const ms = Number(src.duration_ms);
    if (Number.isFinite(ms) && ms > 0) out.duration_ms = Math.round(ms);
    const t = typeof src.transcript === 'string' ? src.transcript.trim() : '';
    if (t) out.transcript = t.slice(0, 5000);
    return out;
  });
}

// The attachments as they go into the row: cleaned, voice note fields kept,
// audio transcribed. Never throws.
async function prepareAttachments(raw, cleaned) {
  const atts = withVoiceFields(raw, cleaned || cleanAttachments(raw));
  if (!ELEVENLABS_API_KEY || !atts.length) return atts;
  const deadline = Date.now() + STT_BUDGET_MS;
  let tried = 0;
  for (const a of atts) {
    if (a.type !== 'audio' || a.transcript) continue;
    if (tried >= STT_MAX_CLIPS || deadline - Date.now() < 1500) break;
    tried++;
    try {
      const data = await speechToText(a, deadline);
      const text = String((data && data.text) || '').trim();
      if (text) a.transcript = text.slice(0, 5000);
      if (!a.duration_ms) {
        // scribe_v1 timestamps every word, so the last one is the length.
        const words = Array.isArray(data && data.words) ? data.words : [];
        const end = words.length ? Number(words[words.length - 1].end) : 0;
        if (Number.isFinite(end) && end > 0) a.duration_ms = Math.round(end * 1000);
      }
    } catch (err) {
      console.error('voice note transcription failed:', (err && err.message) || err);
    }
  }
  return atts;
}

// A transcribed voice note reads better than "Voice memo" in a push.
const firstTranscript = (atts) => (atts || []).find((a) => a.type === 'audio' && a.transcript)?.transcript || '';

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = String(req.query.action || '');

  // ── Bridge (machine) actions ────────────────────────────────────────────
  if (BRIDGE_ACTIONS.has(action)) {
    if (!BRIDGE_TOKEN) return res.status(503).json({ error: 'bridge_not_configured' });
    const given = req.headers['x-bridge-token'];
    if (!given || given !== BRIDGE_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

    try {
      // Numbers the bridge is allowed to forward inbound from: every client and
      // lead with a phone on file. Anything else is personal and stays on the Mac.
      if (action === 'contacts' && req.method === 'GET') {
        // Known contacts = every client/lead with a phone, plus anyone the CRM
        // has already texted, so a reply to a CRM-sent message always lands
        // even before that person is saved as a lead.
        const [clients, texted] = await Promise.all([
          supaFetch('crm_clients?select=contact_phone&contact_phone=not.is.null'),
          readMessages(`crm_sms_messages?channel=eq.${CHANNEL}&direction=eq.out&select=phone&limit=1000`),
        ]);
        // Numbers we have a conversation record for stay on the list even
        // when every message in it was deleted, so a deleted conversation
        // still comes back if that person writes again.
        let known = [];
        try { known = ((await supaFetch('crm_imessage_threads?select=phone')) || []).map((r) => r.phone); } catch (_) {}
        const numbers = [...new Set([
          ...(clients || []).map((r) => last10(r.contact_phone)),
          ...(texted || []).map((r) => last10(r.phone)),
          ...known.map((p) => last10(p)),
        ].filter((n) => n.length === 10))];
        return res.json({ numbers });
      }

      // Hand queued outbound rows to the bridge, claiming each one so a restart
      // or a second poll cannot send the same text twice.
      if (action === 'pending' && req.method === 'POST') {
        const rows = await readMessages(
          `crm_sms_messages?channel=eq.${CHANNEL}&direction=eq.out&status=eq.queued&order=created_at.asc&limit=20`
        );
        const claimed = [];
        for (const r of rows) {
          const upd = await supaFetch(`crm_sms_messages?id=eq.${r.id}&status=eq.queued`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({ status: 'sending' }),
          });
          const row = first(upd);
          if (row) claimed.push(row);
        }
        return res.json({ messages: claimed });
      }

      // Bridge reports the outcome of a send.
      if (action === 'mark' && req.method === 'POST') {
        const { id, status, error } = req.body || {};
        if (!id || !status) return res.status(400).json({ error: 'id and status required' });
        const patch = { status: String(status).slice(0, 40) };
        if (error) patch.error = String(error).slice(0, 300);
        const upd = await supaFetch(`crm_sms_messages?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(patch),
        });
        return res.json(first(upd) || { ok: true });
      }

      // The bridge asks where to put a photo or video it read from Messages.
      if (action === 'upload-url' && req.method === 'POST') {
        const { name } = req.body || {};
        return res.json(await signedUpload('imessage/in', name));
      }

      // Bridge forwards a reply it read from Messages.
      if (action === 'inbound' && req.method === 'POST') {
        const { from, body, guid, ts } = req.body || {};
        const phone = normalizePhone(from);
        if (!phone) return res.status(400).json({ error: 'from required' });
        let attachments = cleanAttachments((req.body || {}).attachments);
        const text = String(body || '').trim().slice(0, 2000);
        if (!text && !attachments.length) return res.status(400).json({ error: 'body required' });

        // Idempotent on the Messages guid so a bridge restart never double-posts.
        if (guid) {
          const dup = await supaFetch(
            `crm_sms_messages?imsg_guid=eq.${encodeURIComponent(guid)}&select=id&limit=1`
          );
          if (first(dup)) return res.json({ ok: true, duplicate: true });
        }

        // A voice note gets its transcript before the row is written.
        attachments = await prepareAttachments((req.body || {}).attachments, attachments);

        const when = ts ? new Date(Number(ts)) : new Date();
        const row = {
          client_id: await clientIdFor(phone),
          direction: 'in',
          channel: CHANNEL,
          phone,
          body: text,
          status: 'received',
          imsg_guid: guid ? String(guid).slice(0, 120) : null,
          created_at: (isNaN(when) ? new Date() : when).toISOString(),
        };
        if (attachments.length) row.attachments = attachments;
        const saved = await supaFetch('crm_sms_messages', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(row),
        });
        // A reply brings an archived conversation back: you put it away, they
        // wrote again. Best effort, a missing column never breaks inbound.
        try { await patchThread(phone, { archived_at: null }); } catch (_) {}
        // Alert the conversation's assignee (or admins if unassigned).
        await notifyInbound(phone, text || firstTranscript(attachments) || mediaLabel(attachments));
        return res.status(201).json(first(saved) || row);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
      if (needsMigration(e)) return res.status(503).json(migrationBody(e));
      return res.status(500).json({ error: e.message || 'Server error' });
    }
  }

  // ── User actions ────────────────────────────────────────────────────────
  // Any signed-in CRM user, the same access model as the leads/clients
  // endpoint. This is VTM's own texting, so it is deliberately NOT scoped by
  // the selected workspace: that id lives in crm_content_clients and is not a
  // crm_clients id, which is what crm_sms_messages.client_id references. We
  // resolve WHO is calling so internal notes can be attributed to them.
  const me = await requireCrmUser(req);
  if (!me) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // People you can text: leads + clients (crm_clients) and contacts
    // (crm_contacts), each with a phone, tagged by kind. Powers the To picker.
    if (req.method === 'GET' && action === 'directory') {
      const [clients, contacts] = await Promise.all([
        supaFetch('crm_clients?select=id,business_name,owner_name,contact_phone,stage,lead_temperature&contact_phone=not.is.null&or=(record_type.is.null,record_type.eq.client)'),
        supaFetch('crm_contacts?select=id,name,phone,company&phone=not.is.null'),
      ]);
      const people = [];
      const seen = new Set();
      const add = (p) => { const k = last10(p.phone); if (k.length < 10 || seen.has(k)) return; seen.add(k); people.push(p); };
      for (const c of clients || []) {
        const phone = normalizePhone(c.contact_phone);
        if (phone) add({ id: c.id, kind: c.stage === 'lead' ? 'lead' : 'client', name: c.business_name || c.owner_name || phone, subtitle: (c.business_name && c.owner_name) ? c.owner_name : '', phone, temperature: c.lead_temperature || null });
      }
      for (const c of contacts || []) {
        const phone = normalizePhone(c.phone);
        if (phone) add({ id: c.id, kind: 'contact', name: c.name || phone, subtitle: c.company || '', phone });
      }
      people.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return res.json(people);
    }

    // Internal notes on a conversation (kept per phone, attributed to the
    // employee who wrote them). Separate from the message thread.
    if (req.method === 'GET' && action === 'notes') {
      const phone = normalizePhone(req.query.phone);
      if (!phone) return res.json([]);
      const rows = await supaFetch(`crm_imessage_notes?phone=eq.${encodeURIComponent(phone)}&order=created_at.desc`);
      return res.json(rows || []);
    }

    // Handoff events for a conversation (who took it over, when, by whom).
    if (req.method === 'GET' && action === 'events') {
      const phone = normalizePhone(req.query.phone);
      if (!phone) return res.json([]);
      const rows = await supaFetch(`crm_imessage_events?phone=eq.${encodeURIComponent(phone)}&order=created_at.asc`);
      return res.json(rows || []);
    }

    if (req.method === 'GET') {
      // ?phone= returns one thread (chronological); otherwise thread summaries.
      const phone = req.query.phone ? normalizePhone(req.query.phone) : null;
      if (phone) {
        const rows = await readMessages(
          `crm_sms_messages?channel=eq.${CHANNEL}&phone=eq.${encodeURIComponent(phone)}&order=created_at.asc`
        );
        return res.json(rows);
      }
      const rows = await readMessages(
        `crm_sms_messages?channel=eq.${CHANNEL}&order=created_at.desc&limit=1000`
      );

      // This user's per-conversation last-read markers. If the table is not
      // migrated yet, skip unread entirely so nothing floods as unread.
      const lastRead = {};
      let readsOk = false;
      try {
        const reads = await supaFetch(`crm_imessage_reads?user_id=eq.${me.id}&select=phone,last_read_at`);
        for (const r of reads || []) lastRead[r.phone] = r.last_read_at;
        readsOk = true;
      } catch (_) { readsOk = false; }

      // Collapse to one thread per phone: latest message, count, and unread
      // (inbound messages newer than this user's last read of that thread).
      const threads = {};
      for (const m of rows || []) {
        if (!threads[m.phone]) threads[m.phone] = { phone: m.phone, last: m, count: 0, unread: 0, client_id: m.client_id };
        threads[m.phone].count++;
        if (readsOk && m.direction === 'in' && (!lastRead[m.phone] || m.created_at > lastRead[m.phone])) {
          threads[m.phone].unread++;
        }
      }
      const list = Object.values(threads);
      // Merge in each thread's employee assignment plus its star and archive
      // state (best effort: those are later migrations; without them a thread
      // is simply unassigned, unstarred and not archived).
      const byPhone = {};
      for (const a of await readThreadRows()) byPhone[a.phone] = a;
      for (const t of list) {
        const a = byPhone[t.phone];
        t.starred = !!(a && a.starred);
        t.archived = !!(a && a.archived_at);
        if (a) { t.assigned_to = a.assigned_to; t.assigned_to_name = a.assigned_to_name; }
      }
      // The inbox leaves archived conversations out; ?archived=1 is the
      // archived shelf, which is only them. Each is a list the caller can
      // render as it comes.
      const shelf = String(req.query.archived || '') === '1';
      return res.json(list.filter((t) => (shelf ? t.archived : !t.archived)));
    }

    // Queue an outbound iMessage. The Mac bridge picks it up within seconds.
    // No campaign prefix or opt-out line: this is a personal 1:1 conversation
    // from the business number, not A2P traffic.
    // Where the app puts a photo or video before sending it.
    if (req.method === 'POST' && action === 'upload-url') {
      const { name } = req.body || {};
      return res.json(await signedUpload('imessage/out', name));
    }

    if (req.method === 'POST' && action === 'send') {
      const to = normalizePhone((req.body || {}).phone);
      const body = String((req.body || {}).body || '').trim().slice(0, 2000);
      const attachments = cleanAttachments((req.body || {}).attachments);
      if (!to) return res.status(400).json({ error: 'Valid phone required.' });
      if (!body && !attachments.length) return res.status(400).json({ error: 'Message body required.' });

      // Thread to a lead/client by phone; unknown numbers simply have no link.
      const row = {
        client_id: (req.body || {}).client_id || (await clientIdFor(to)) || null,
        direction: 'out',
        channel: CHANNEL,
        phone: to,
        body,
        status: 'queued',
      };
      // A voice note recorded in the app is transcribed before it is queued.
      const prepared = await prepareAttachments((req.body || {}).attachments, attachments);
      if (prepared.length) row.attachments = prepared;
      const saved = await supaFetch('crm_sms_messages', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      return res.status(201).json(first(saved) || row);
    }

    // Change what a conversation's number is: lead, client, or contact.
    // Leads and clients are the same crm_clients row (distinguished by stage),
    // so lead<->client is an in-place stage change. Contact is a separate
    // crm_contacts row, so promoting a contact creates the client record and
    // demoting a lead/client to a contact removes it (detaching its messages
    // first so the foreign key does not block the delete).
    if (req.method === 'POST' && action === 'set-kind') {
      const phone = normalizePhone((req.body || {}).phone);
      const kind = String((req.body || {}).kind || '');
      if (!phone) return res.status(400).json({ error: 'phone required' });
      if (!['lead', 'client', 'contact'].includes(kind)) return res.status(400).json({ error: 'bad kind' });
      const d10 = last10(phone);
      const [clients, contacts] = await Promise.all([
        supaFetch('crm_clients?contact_phone=not.is.null&select=id,business_name,owner_name,stage,contact_phone'),
        supaFetch('crm_contacts?phone=not.is.null&select=id,name,phone'),
      ]);
      const clientRow = (clients || []).find((c) => last10(c.contact_phone) === d10);
      const contactRow = (contacts || []).find((c) => last10(c.phone) === d10);
      const nameGuess = clientRow?.business_name || clientRow?.owner_name || contactRow?.name || phone;

      // A name may travel with the change. Without one a converted record
      // keeps the phone number as its name and reads as blank in the client
      // list, which is exactly how a real conversion got missed once.
      const clean = (v) => String(v == null ? '' : v).trim().slice(0, 120);
      const business = clean((req.body || {}).business_name);
      const owner = clean((req.body || {}).owner_name);
      // A name that is just the phone number is a placeholder, not a name.
      const placeholder = (v) => !v || last10(v) === d10;

      if (kind === 'lead' || kind === 'client') {
        const stage = kind === 'lead' ? 'lead' : 'onboarding';
        if (clientRow) {
          const patch = { stage, updated_at: new Date().toISOString() };
          if (business) patch.business_name = business;
          else if (placeholder(clientRow.business_name) && owner) patch.business_name = owner;
          if (owner) patch.owner_name = owner;
          await supaFetch(`crm_clients?id=eq.${clientRow.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
          return res.json({ ok: true, kind, id: clientRow.id, business_name: patch.business_name || clientRow.business_name, owner_name: patch.owner_name || clientRow.owner_name, needs_name: placeholder(patch.business_name || clientRow.business_name) });
        }
        const row = { business_name: business || owner || nameGuess, owner_name: owner || '', contact_phone: phone, stage };
        const saved = first(await supaFetch('crm_clients', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }));
        return res.json({ ok: true, kind, id: saved?.id || null, business_name: row.business_name, owner_name: row.owner_name, needs_name: placeholder(row.business_name) });
      }

      // kind === 'contact'
      if (!contactRow) {
        let wsId = null;
        try { wsId = first(await supaFetch('crm_content_clients?select=id&order=business_name.asc&limit=1'))?.id || null; } catch (_) {}
        await supaFetch('crm_contacts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name: nameGuess, phone, client_id: wsId }) });
      }
      if (clientRow) {
        // Detach this thread's messages, then remove the lead/client record.
        await supaFetch(`crm_sms_messages?client_id=eq.${clientRow.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ client_id: null }) });
        await supaFetch(`crm_clients?id=eq.${clientRow.id}`, { method: 'DELETE' });
      }
      return res.json({ ok: true, kind });
    }

    // Assign (or unassign) a conversation to an employee. Keyed by phone so it
    // survives across the messages in the thread.
    if (req.method === 'POST' && action === 'assign') {
      const phone = normalizePhone((req.body || {}).phone);
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const assigned_to = (req.body || {}).assigned_to || null;
      const assigned_to_name = (req.body || {}).assigned_to_name || null;

      // Read the current assignment first, so a real change is recorded as a handoff.
      let prev = null;
      try { prev = first(await supaFetch(`crm_imessage_threads?phone=eq.${encodeURIComponent(phone)}&select=assigned_to,assigned_to_name&limit=1`)); } catch (_) {}

      const saved = await supaFetch('crm_imessage_threads?on_conflict=phone', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({ phone, assigned_to, assigned_to_name, updated_at: new Date().toISOString() }),
      });

      // Log a handoff when the conversation moves to a (different) person.
      // Best effort: if the events table is not migrated yet, the assignment
      // still succeeds.
      if (assigned_to && assigned_to !== (prev?.assigned_to || null)) {
        let by_name = me.email ? me.email.split('@')[0] : null;
        try {
          const tm = first(await supaFetch(`crm_team_members?email=eq.${encodeURIComponent((me.email || '').toLowerCase())}&select=name&limit=1`));
          if (tm?.name) by_name = tm.name;
        } catch (_) {}
        try {
          await supaFetch('crm_imessage_events', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              phone, type: 'handoff',
              from_name: prev?.assigned_to_name || null,
              to_id: assigned_to, to_name: assigned_to_name,
              by_email: me.email || null, by_name,
              created_at: new Date().toISOString(),
            }),
          });
        } catch (_) { /* events table not migrated yet */ }
      }
      return res.json(first(saved) || { ok: true });
    }

    // Mark a conversation read up to now for the current user (clears unread).
    if (req.method === 'POST' && action === 'read') {
      const phone = normalizePhone((req.body || {}).phone);
      if (!phone) return res.status(400).json({ error: 'phone required' });
      await supaFetch('crm_imessage_reads?on_conflict=user_id,phone', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: me.id, phone, last_read_at: new Date().toISOString() }),
      });
      return res.json({ ok: true });
    }

    // Star a conversation. Keyed by phone like every other thread flag.
    if (req.method === 'POST' && action === 'star') {
      const phone = normalizePhone((req.body || {}).phone);
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const starred = !!(req.body || {}).starred;
      await patchThread(phone, { starred });
      return res.json({ ok: true, starred });
    }

    // Archive a conversation, or bring it back. An inbound reply un-archives
    // it on its own, so an archived thread returns if the person writes again.
    if (req.method === 'POST' && action === 'archive') {
      const phone = normalizePhone((req.body || {}).phone);
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const archived = !!(req.body || {}).archived;
      await patchThread(phone, { archived_at: archived ? new Date().toISOString() : null });
      return res.json({ ok: true, archived });
    }

    // Delete a conversation. Soft: the messages are stamped deleted_at and
    // filtered out of every read, the thread is archived, and nothing ever
    // leaves the table.
    if (req.method === 'POST' && action === 'delete') {
      const phone = normalizePhone((req.body || {}).phone);
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const now = new Date().toISOString();
      // Messages first: without the column this throws before the thread is
      // touched, so a 503 never leaves a half deleted conversation behind.
      await supaFetch(`crm_sms_messages?channel=eq.${CHANNEL}&phone=eq.${encodeURIComponent(phone)}&deleted_at=is.null`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ deleted_at: now }),
      });
      await patchThread(phone, { archived_at: now });
      return res.json({ ok: true });
    }

    // Add an internal note to a conversation, attributed to the current user.
    if (req.method === 'POST' && action === 'note') {
      const phone = normalizePhone((req.body || {}).phone);
      const body = String((req.body || {}).body || '').trim().slice(0, 4000);
      if (!phone) return res.status(400).json({ error: 'phone required' });
      if (!body) return res.status(400).json({ error: 'note body required' });
      // Prefer the employee's roster name; fall back to their email local part.
      let author_name = me.email ? me.email.split('@')[0] : null;
      try {
        const tm = await supaFetch(`crm_team_members?email=eq.${encodeURIComponent((me.email || '').toLowerCase())}&select=name&limit=1`);
        if (first(tm)?.name) author_name = first(tm).name;
      } catch (_) {}
      const saved = await supaFetch('crm_imessage_notes', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ phone, body, author_email: me.email || null, author_name, created_at: new Date().toISOString() }),
      });
      return res.status(201).json(first(saved));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (needsMigration(e)) return res.status(503).json(migrationBody(e));
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
