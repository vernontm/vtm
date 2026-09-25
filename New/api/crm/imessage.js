const { setCors, supaFetch, requireCrmUser } = require('../_lib/supabase.js');

// iMessage inbox.
//
// The CRM runs in the cloud and cannot drive Messages.app, so it never sends an
// iMessage itself. Outbound texts are QUEUED here (status 'queued'), and the
// bridge running on the Mac signed into the business Apple ID
// (imessage-bridge/bridge.mjs) polls this endpoint, sends each one through
// Messages, reports back, and forwards inbound replies.
//
//   User actions (CRM login):     GET (threads / one thread), POST ?action=send
//   Bridge actions (shared token): GET ?action=contacts, POST ?action=pending,
//                                  POST ?action=mark, POST ?action=inbound
//
// Rows live in crm_sms_messages with channel = 'imessage'. Bridge calls carry
// X-Bridge-Token, which must equal IMESSAGE_BRIDGE_TOKEN in the environment.
const BRIDGE_TOKEN = process.env.IMESSAGE_BRIDGE_TOKEN;
const CHANNEL = 'imessage';
const BRIDGE_ACTIONS = new Set(['contacts', 'pending', 'mark', 'inbound']);

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
  return /(channel|imsg_guid|crm_imessage_threads|crm_imessage_notes)/i.test(m) && /(does not exist|schema cache|could not find|relation)/i.test(m);
}
const MIGRATION_MSG = 'The iMessage inbox needs its one-time database update. Run the SQL from imessage-bridge/README.md.';

const first = (x) => (Array.isArray(x) ? x[0] : x);

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
          supaFetch(`crm_sms_messages?channel=eq.${CHANNEL}&direction=eq.out&select=phone&limit=1000`),
        ]);
        const numbers = [...new Set([
          ...(clients || []).map((r) => last10(r.contact_phone)),
          ...(texted || []).map((r) => last10(r.phone)),
        ].filter((n) => n.length === 10))];
        return res.json({ numbers });
      }

      // Hand queued outbound rows to the bridge, claiming each one so a restart
      // or a second poll cannot send the same text twice.
      if (action === 'pending' && req.method === 'POST') {
        const rows = (await supaFetch(
          `crm_sms_messages?channel=eq.${CHANNEL}&direction=eq.out&status=eq.queued&order=created_at.asc&limit=20`
        )) || [];
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

      // Bridge forwards a reply it read from Messages.
      if (action === 'inbound' && req.method === 'POST') {
        const { from, body, guid, ts } = req.body || {};
        const phone = normalizePhone(from);
        if (!phone) return res.status(400).json({ error: 'from required' });
        const text = String(body || '').trim().slice(0, 2000);
        if (!text) return res.status(400).json({ error: 'body required' });

        // Idempotent on the Messages guid so a bridge restart never double-posts.
        if (guid) {
          const dup = await supaFetch(
            `crm_sms_messages?imsg_guid=eq.${encodeURIComponent(guid)}&select=id&limit=1`
          );
          if (first(dup)) return res.json({ ok: true, duplicate: true });
        }

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
        const saved = await supaFetch('crm_sms_messages', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(row),
        });
        return res.status(201).json(first(saved) || row);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
      if (needsMigration(e)) return res.status(503).json({ error: MIGRATION_MSG });
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

    if (req.method === 'GET') {
      // ?phone= returns one thread (chronological); otherwise thread summaries.
      const phone = req.query.phone ? normalizePhone(req.query.phone) : null;
      if (phone) {
        const rows = await supaFetch(
          `crm_sms_messages?channel=eq.${CHANNEL}&phone=eq.${encodeURIComponent(phone)}&order=created_at.asc`
        );
        return res.json(rows || []);
      }
      const rows = await supaFetch(
        `crm_sms_messages?channel=eq.${CHANNEL}&order=created_at.desc&limit=1000`
      );
      // Collapse to one thread per phone: latest message + count.
      const threads = {};
      for (const m of rows || []) {
        if (!threads[m.phone]) threads[m.phone] = { phone: m.phone, last: m, count: 0, client_id: m.client_id };
        threads[m.phone].count++;
      }
      const list = Object.values(threads);
      // Merge in each thread's employee assignment (best effort: the assignment
      // table is a later migration; without it, threads are simply unassigned).
      try {
        const asg = (await supaFetch('crm_imessage_threads?select=phone,assigned_to,assigned_to_name')) || [];
        const byPhone = {};
        for (const a of asg) byPhone[a.phone] = a;
        for (const t of list) {
          const a = byPhone[t.phone];
          if (a) { t.assigned_to = a.assigned_to; t.assigned_to_name = a.assigned_to_name; }
        }
      } catch (_) { /* assignment table not migrated yet */ }
      return res.json(list);
    }

    // Queue an outbound iMessage. The Mac bridge picks it up within seconds.
    // No campaign prefix or opt-out line: this is a personal 1:1 conversation
    // from the business number, not A2P traffic.
    if (req.method === 'POST' && action === 'send') {
      const to = normalizePhone((req.body || {}).phone);
      const body = String((req.body || {}).body || '').trim().slice(0, 2000);
      if (!to) return res.status(400).json({ error: 'Valid phone required.' });
      if (!body) return res.status(400).json({ error: 'Message body required.' });

      // Thread to a lead/client by phone; unknown numbers simply have no link.
      const row = {
        client_id: (req.body || {}).client_id || (await clientIdFor(to)) || null,
        direction: 'out',
        channel: CHANNEL,
        phone: to,
        body,
        status: 'queued',
      };
      const saved = await supaFetch('crm_sms_messages', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      return res.status(201).json(first(saved) || row);
    }

    // Assign (or unassign) a conversation to an employee. Keyed by phone so it
    // survives across the messages in the thread.
    if (req.method === 'POST' && action === 'assign') {
      const phone = normalizePhone((req.body || {}).phone);
      if (!phone) return res.status(400).json({ error: 'phone required' });
      const saved = await supaFetch('crm_imessage_threads?on_conflict=phone', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          phone,
          assigned_to: (req.body || {}).assigned_to || null,
          assigned_to_name: (req.body || {}).assigned_to_name || null,
          updated_at: new Date().toISOString(),
        }),
      });
      return res.json(first(saved) || { ok: true });
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
    if (needsMigration(e)) return res.status(503).json({ error: MIGRATION_MSG });
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
