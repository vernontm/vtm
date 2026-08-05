// ─────────────────────────────────────────────────────────────────────────────
// VTM CRM — Model Context Protocol (MCP) server
//
// A single cloud endpoint that lets employees drive the CRM from Claude:
//   • read client / lead data and "where we left off" history
//   • send email as ray@vernontm.com (with a mandatory context review first)
//   • schedule one-off emails, and create / schedule MailerLite campaigns
//     and recurring automations
//
// Transport: stateless Streamable-HTTP (JSON-RPC 2.0 over a single POST). Every
// request/response tool answers with application/json — no SSE session needed.
//
// Auth: a per-employee personal access token (crm_mcp_tokens). Supplied either
// as `Authorization: Bearer <token>` (Claude Desktop / Claude Code) OR as a
// `?key=<token>` query param baked into the connector URL (claude.ai web).
//
// Safety rail — the send gate: send_email and schedule_email are TWO-PHASE. The
// first call never sends; it returns the recipient's recent activity ("where we
// left off") plus a signed confirm_token. The email only goes out on a second
// call that echoes the identical to/subject/body AND the token. The tool text
// instructs Claude to surface the context to the employee and get an explicit
// human OK before that second call.
// ─────────────────────────────────────────────────────────────────────────────
const crypto = require('crypto');
const { supaFetch, SERVICE_KEY, setCors } = require('./_lib/supabase.js');
const gmail = require('./_lib/gmail.js');
const emailSend = require('./_lib/email-send.js');

const SECRET = process.env.MCP_SECRET || process.env.CRON_SECRET || SERVICE_KEY || 'vtm-mcp-dev';
const FROM_DISPLAY = 'ray@vernontm.com';
const PROTOCOL_DEFAULT = '2025-06-18';

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// ── Signed confirmation tokens (bind a confirmation to exact recipient+content)
function signConfirm(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyConfirm(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}

const fmtDate = (d) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('en-US', {
      timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(d); }
};

// ── Auth ─────────────────────────────────────────────────────────────────────
async function authenticate(req) {
  const hdr = req.headers['authorization'] || '';
  const bearer = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
  const q = req.query || {};
  const token = bearer || q.key || q.t || '';
  if (!token) return null;
  let rows;
  try { rows = await supaFetch(`crm_mcp_tokens?token_hash=eq.${sha256(token)}&active=eq.true&select=*`); }
  catch { return null; }
  const row = rows && rows[0];
  if (!row) return null;
  supaFetch(`crm_mcp_tokens?id=eq.${row.id}`, {
    method: 'PATCH', body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  }).catch(() => {});
  return row;
}
const hasScope = (emp, scope) => Array.isArray(emp.scopes) && emp.scopes.includes(scope);

// ── Client / activity helpers ────────────────────────────────────────────────
const esc = (s) => encodeURIComponent(String(s));

async function resolveClient({ client_id, email }) {
  try {
    if (client_id) {
      const r = await supaFetch(`crm_clients?id=eq.${esc(client_id)}&select=*`);
      return (r && r[0]) || null;
    }
    if (email) {
      const r = await supaFetch(`crm_clients?contact_email=eq.${esc(email)}&select=*&limit=1`);
      return (r && r[0]) || null;
    }
  } catch { /* fall through */ }
  return null;
}

async function buildBrief(client, email) {
  if (!client) {
    return `No CRM record found for ${email || 'this recipient'}. This looks like a NEW contact with no prior history on file. Confirm the address is correct and that this first outreach is intended.`;
  }
  let acts = [], scheduled = [];
  try {
    acts = await supaFetch(`crm_client_activity?client_id=eq.${esc(client.id)}&order=created_at.desc&limit=6&select=type,tag,title,body,author,direction,created_at`) || [];
  } catch {}
  try {
    scheduled = await supaFetch(`crm_email_queue?lead_id=eq.${esc(client.id)}&status=eq.scheduled&order=scheduled_for.asc&select=subject,scheduled_for,email_type`) || [];
  } catch {}

  const name = client.business_name || client.owner_name || '(unnamed)';
  const lines = [];
  lines.push(`Client: ${name}${client.owner_name && client.business_name ? ` (owner: ${client.owner_name})` : ''}`);
  lines.push(`Stage: ${client.stage || 'n/a'} · Temperature: ${client.lead_temperature || 'n/a'} · Follow-up: ${client.follow_up_status || 'none'}`);
  if (client.last_contact_at) {
    lines.push(`Last contact: ${fmtDate(client.last_contact_at)}${client.last_contact_channel ? ` via ${client.last_contact_channel}` : ''}${client.last_contact_summary ? ` — ${client.last_contact_summary}` : ''}`);
  }
  if (acts.length) {
    lines.push('');
    lines.push('Recent activity (newest first):');
    for (const a of acts) {
      const kind = a.type === 'email' ? 'Email' : (a.tag || a.type || 'Note');
      const who = a.author ? ` [${a.author}]` : '';
      const dir = a.direction ? ` (${a.direction})` : '';
      const title = a.title || (a.body ? a.body.slice(0, 90) : '(no detail)');
      lines.push(`  • ${fmtDate(a.created_at)}${who} ${kind}${dir}: ${title}`);
    }
  } else {
    lines.push('');
    lines.push('No activity logged yet for this contact.');
  }
  if (scheduled.length) {
    lines.push('');
    lines.push('Emails already scheduled to this contact:');
    for (const s of scheduled) lines.push(`  • ${fmtDate(s.scheduled_for)} — "${s.subject}" (${s.email_type || 'manual'})`);
  }
  return lines.join('\n');
}

async function logActivity(clientId, row) {
  try {
    await supaFetch('crm_client_activity', { method: 'POST', body: JSON.stringify({ client_id: clientId, ...row }) });
  } catch (e) { console.error('mcp logActivity', e.message); }
}

// ── MailerLite helpers (campaigns + automations) ─────────────────────────────
async function mlKey() {
  const cfg = await supaFetch(`crm_email_config?mailerlite_api_key=not.is.null&select=mailerlite_api_key,client_id&limit=1`);
  const key = cfg && cfg[0] && cfg[0].mailerlite_api_key;
  if (!key) throw new Error('No MailerLite API key is configured in the CRM.');
  return { key, clientId: cfg[0].client_id };
}
function mlFetch(key) {
  const H = { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  return (method, path, body) => fetch(`https://connect.mailerlite.com/api/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
}
function mdToEmailHtml(text, fromName) {
  const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out += e(text.slice(last, m.index));
    const label = m[1] && m[2] ? m[1] : m[3];
    const url = m[1] && m[2] ? m[2] : m[3];
    out += `<a href="${e(url)}" style="color:#2563eb;text-decoration:underline">${e(label)}</a>`;
    last = re.lastIndex;
  }
  if (last < text.length) out += e(text.slice(last));
  const inner = /<[a-z][\s\S]*>/i.test(text) ? text : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">${out.replace(/\r?\n/g, '<br>')}</div>`;
  return `${inner}<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888;margin-top:28px">You're receiving this because you subscribed to ${e(fromName || 'us')}.<br><a href="{$unsubscribe}" style="color:#888">Unsubscribe</a></p>`;
}

// ── Tool result shape ─────────────────────────────────────────────────────────
const textResult = (text) => ({ content: [{ type: 'text', text }] });
const jsonResult = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] });

// ── Tool registry ─────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_clients',
    scope: 'read',
    description: 'List clients and leads in the CRM. Filter by kind (lead/client/all), stage, or a text query on name/company. Returns a compact list with ids you can pass to other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['lead', 'client', 'all'], description: 'lead = still in the pipeline, client = signed. Default all.' },
        stage: { type: 'string', description: 'Optional exact stage filter, e.g. "lead", "onboarding".' },
        query: { type: 'string', description: 'Optional text to match against business or owner name.' },
        limit: { type: 'number', description: 'Max rows (default 50).' },
      },
    },
  },
  {
    name: 'get_client',
    scope: 'read',
    description: 'Get one client/lead in full, including their recent activity history and any scheduled emails. Use before contacting someone to see where things stand.',
    inputSchema: { type: 'object', properties: { client_id: { type: 'string' } }, required: ['client_id'] },
  },
  {
    name: 'search_contacts',
    scope: 'read',
    description: 'Search clients/leads by name, business name, or email address. Returns matches with their ids and contact email.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  },
  {
    name: 'get_recent_activity',
    scope: 'read',
    description: 'Get the "where we left off" brief for a contact — their stage, last contact, recent notes/emails, and any scheduled messages. Pass a client_id or an email address.',
    inputSchema: { type: 'object', properties: { client_id: { type: 'string' }, email: { type: 'string' } } },
  },
  {
    name: 'send_email',
    scope: 'send',
    description: 'Send an email as ray@vernontm.com. TWO-STEP AND MANDATORY: Call it first WITHOUT confirm_token — it does NOT send; it returns the recipient\'s recent history ("where we left off") and a confirm_token. You MUST show that history to the user in plain language and get their explicit go-ahead. Only then call again with the SAME to/subject/body plus the confirm_token to actually send. Body supports markdown links [text](url).',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address.' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'Plain text; markdown links [text](url) become clickable.' },
        client_id: { type: 'string', description: 'Optional — the CRM client/lead id, if known, to attach the activity log.' },
        confirm_token: { type: 'string', description: 'Only on the second (confirmed) call. Must be the token from the first call.' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'schedule_email',
    scope: 'schedule',
    description: 'Schedule a one-off email to go out later as ray@vernontm.com. Same two-step gate as send_email: first call (no confirm_token) returns the contact\'s recent history + a token; confirm with the user, then call again with the token to queue it.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
        send_at: { type: 'string', description: 'ISO 8601 datetime for when to send, e.g. 2026-08-01T13:00:00Z. Must be in the future.' },
        client_id: { type: 'string' },
        confirm_token: { type: 'string' },
      },
      required: ['to', 'subject', 'body', 'send_at'],
    },
  },
  {
    name: 'list_scheduled_emails',
    scope: 'schedule',
    description: 'List emails currently scheduled (not yet sent). Optionally filter by client_id.',
    inputSchema: { type: 'object', properties: { client_id: { type: 'string' } } },
  },
  {
    name: 'cancel_scheduled_email',
    scope: 'schedule',
    description: 'Cancel a scheduled email by its queue id (from list_scheduled_emails).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'list_email_groups',
    scope: 'campaigns',
    description: 'List the MailerLite audience groups (with subscriber counts) you can send campaigns to.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_email_campaign',
    scope: 'campaigns',
    description: 'Create a MailerLite email campaign (blast) to a group. Sends immediately or at a scheduled time. SAFETY: without confirm:true it only previews the recipient count and does not send. Body supports markdown links.',
    inputSchema: {
      type: 'object',
      properties: {
        group_id: { type: 'string', description: 'MailerLite group id, or "all" for every group.' },
        subject: { type: 'string' },
        from_name: { type: 'string' },
        from_email: { type: 'string' },
        body: { type: 'string' },
        schedule_at: { type: 'string', description: 'Optional ISO 8601 time to send. Omit to send on confirm.' },
        confirm: { type: 'boolean', description: 'Must be true to actually create+send. Without it you get a preview only.' },
      },
      required: ['group_id', 'subject', 'from_email', 'body'],
    },
  },
  {
    name: 'list_automations',
    scope: 'campaigns',
    description: 'List the recurring weekly email automations configured in the CRM.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_automation',
    scope: 'campaigns',
    description: 'Create a recurring weekly email automation that sends to a MailerLite group every week on a given weekday and hour. Requires confirm:true to activate.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        group_id: { type: 'string' },
        subject: { type: 'string' },
        from_name: { type: 'string' },
        from_email: { type: 'string' },
        body: { type: 'string' },
        weekday: { type: 'number', description: '0=Sunday … 6=Saturday.' },
        send_hour: { type: 'number', description: 'Hour of day 0-23 in the timezone (default America/Chicago).' },
        timezone: { type: 'string', description: 'IANA timezone, default America/Chicago.' },
        confirm: { type: 'boolean' },
      },
      required: ['name', 'group_id', 'subject', 'from_email', 'body', 'weekday', 'send_hour'],
    },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────
async function callTool(name, args, emp) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  if (!hasScope(emp, tool.scope)) throw new Error(`Your access token does not include the "${tool.scope}" scope needed for ${name}.`);
  args = args || {};

  switch (name) {
    case 'list_clients': {
      const kind = args.kind || 'all';
      let q = `crm_clients?select=id,business_name,owner_name,contact_email,stage,lead_temperature,follow_up_status,potential_value,potential_value_type&order=updated_at.desc&limit=${Math.min(Number(args.limit) || 50, 200)}`;
      if (kind === 'lead') q += `&stage=eq.lead`;
      else if (kind === 'client') q += `&stage=neq.lead`;
      if (args.stage) q += `&stage=eq.${esc(args.stage)}`;
      if (args.query) q += `&or=(business_name.ilike.*${esc(args.query)}*,owner_name.ilike.*${esc(args.query)}*)`;
      const rows = await supaFetch(q) || [];
      return jsonResult(rows);
    }
    case 'get_client': {
      const client = await resolveClient({ client_id: args.client_id });
      if (!client) throw new Error('No client found with that id.');
      const brief = await buildBrief(client, client.contact_email);
      return textResult(`${brief}\n\nRaw fields: ${JSON.stringify({
        id: client.id, business_name: client.business_name, owner_name: client.owner_name,
        contact_email: client.contact_email, contact_phone: client.contact_phone,
        stage: client.stage, potential_value: client.potential_value, potential_value_type: client.potential_value_type,
      })}`);
    }
    case 'search_contacts': {
      const query = String(args.query || '').trim();
      if (!query) throw new Error('query is required.');
      const rows = await supaFetch(`crm_clients?select=id,business_name,owner_name,contact_email,stage&or=(business_name.ilike.*${esc(query)}*,owner_name.ilike.*${esc(query)}*,contact_email.ilike.*${esc(query)}*)&limit=25`) || [];
      return jsonResult(rows);
    }
    case 'get_recent_activity': {
      const client = await resolveClient({ client_id: args.client_id, email: args.email });
      return textResult(await buildBrief(client, args.email));
    }

    case 'send_email': {
      const { to, subject, body, client_id, confirm_token } = args;
      if (!to || !subject || !body) throw new Error('to, subject, and body are all required.');
      const client = await resolveClient({ client_id, email: to });
      const contentHash = sha256(`${subject}\n${body}`);

      if (confirm_token) {
        const p = verifyConfirm(confirm_token);
        if (!p || p.act !== 'send' || p.to !== to || p.h !== contentHash) {
          throw new Error('Confirmation token is invalid or does not match this exact email. Re-run send_email WITHOUT a token to review the context and get a fresh token.');
        }
        if (Date.now() > p.exp) throw new Error('Confirmation expired (tokens last 30 minutes). Re-run send_email without a token to review context again.');
        const html = emailSend.bodyToHtml(body);
        const plain = emailSend.stripMarkdownLinks(body);
        await gmail.sendEmail({ to, subject: emailSend.stripDashes(subject), body: plain, html });
        if (client) {
          await logActivity(client.id, {
            type: 'email', tag: 'Email', direction: 'outbound',
            title: `Email sent: ${emailSend.stripDashes(subject)}`,
            body: body.slice(0, 800), author: emp.employee_name,
          });
          await supaFetch(`crm_clients?id=eq.${esc(client.id)}`, {
            method: 'PATCH', body: JSON.stringify({
              last_contact_at: new Date().toISOString(), last_contact_channel: 'email',
              last_contact_summary: `Email: ${emailSend.stripDashes(subject)}`, updated_at: new Date().toISOString(),
            }),
          }).catch(() => {});
        }
        return textResult(`✅ Sent to ${to} as ${FROM_DISPLAY}.\nSubject: ${emailSend.stripDashes(subject)}\n${client ? `Logged to ${client.business_name || client.owner_name}'s activity by ${emp.employee_name}.` : 'No CRM record matched this address, so nothing was logged.'}`);
      }

      const brief = await buildBrief(client, to);
      const token = signConfirm({ act: 'send', to, h: contentHash, exp: Date.now() + 30 * 60 * 1000, by: emp.id });
      return textResult([
        `🛑 NOT SENT YET — review with the user before sending.`,
        ``,
        `About to email ${to}${client ? ` (${client.business_name || client.owner_name})` : ''} as ${FROM_DISPLAY}.`,
        ``,
        `=== WHERE WE LEFT OFF WITH THIS CONTACT ===`,
        brief,
        ``,
        `=== THE EMAIL ===`,
        `Subject: ${subject}`,
        ``,
        body,
        ``,
        `=== NEXT STEP (required) ===`,
        `Summarize the "where we left off" context above for the user in plain language, then ask them to confirm they want to send. Only after they say yes, call send_email again with the identical to / subject / body and confirm_token: "${token}". Do not change the email in between or the token will be rejected.`,
      ].join('\n'));
    }

    case 'schedule_email': {
      const { to, subject, body, send_at, client_id, confirm_token } = args;
      if (!to || !subject || !body || !send_at) throw new Error('to, subject, body, and send_at are all required.');
      const when = new Date(send_at);
      if (isNaN(when.getTime())) throw new Error('send_at is not a valid ISO 8601 datetime.');
      if (when.getTime() < Date.now() + 60_000) throw new Error('send_at must be at least a minute in the future.');
      const client = await resolveClient({ client_id, email: to });
      const contentHash = sha256(`${subject}\n${body}\n${when.toISOString()}`);

      if (confirm_token) {
        const p = verifyConfirm(confirm_token);
        if (!p || p.act !== 'schedule' || p.to !== to || p.h !== contentHash) {
          throw new Error('Confirmation token invalid or does not match. Re-run schedule_email without a token to review context and get a fresh one.');
        }
        if (Date.now() > p.exp) throw new Error('Confirmation expired. Re-run schedule_email without a token.');
        const rows = await supaFetch('crm_email_queue', {
          method: 'POST', body: JSON.stringify({
            to_email: to, lead_email: to, lead_id: client ? client.id : null,
            lead_name: client ? (client.business_name || client.owner_name) : null,
            subject: emailSend.stripDashes(subject), body: emailSend.stripDashes(body),
            status: 'scheduled', scheduled_for: when.toISOString(), email_type: 'manual', auto_generated: false,
          }),
        });
        const qid = (rows && rows[0] && rows[0].id) || null;
        if (client) await logActivity(client.id, {
          type: 'note', tag: 'Email', title: `Email scheduled for ${fmtDate(when)}`,
          body: `Subject: ${emailSend.stripDashes(subject)}`, author: emp.employee_name,
        });
        return textResult(`✅ Scheduled for ${fmtDate(when)} to ${to} as ${FROM_DISPLAY}.${qid ? ` Queue id: ${qid}` : ''}`);
      }

      const brief = await buildBrief(client, to);
      const token = signConfirm({ act: 'schedule', to, h: contentHash, exp: Date.now() + 30 * 60 * 1000, by: emp.id });
      return textResult([
        `🛑 NOT SCHEDULED YET — review with the user first.`,
        ``,
        `About to schedule an email to ${to}${client ? ` (${client.business_name || client.owner_name})` : ''} for ${fmtDate(when)} as ${FROM_DISPLAY}.`,
        ``,
        `=== WHERE WE LEFT OFF WITH THIS CONTACT ===`,
        brief,
        ``,
        `=== THE EMAIL ===`,
        `Subject: ${subject}`,
        ``,
        body,
        ``,
        `=== NEXT STEP (required) ===`,
        `Share the context above with the user and get their OK, then call schedule_email again with identical fields plus confirm_token: "${token}".`,
      ].join('\n'));
    }

    case 'list_scheduled_emails': {
      let q = `crm_email_queue?status=eq.scheduled&order=scheduled_for.asc&select=id,to_email,lead_name,subject,scheduled_for,email_type&limit=100`;
      if (args.client_id) q += `&lead_id=eq.${esc(args.client_id)}`;
      const rows = await supaFetch(q) || [];
      return jsonResult(rows.map(r => ({ ...r, scheduled_for_readable: fmtDate(r.scheduled_for) })));
    }
    case 'cancel_scheduled_email': {
      if (!args.id) throw new Error('id is required.');
      await supaFetch(`crm_email_queue?id=eq.${esc(args.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
      });
      return textResult(`✅ Cancelled scheduled email ${args.id}.`);
    }

    case 'list_email_groups': {
      const { key } = await mlKey();
      const ml = mlFetch(key);
      const j = await (await ml('GET', 'groups?limit=100')).json();
      const groups = (j.data || []).map(g => ({ id: g.id, name: g.name, subscribers: g.active_count ?? g.total ?? 0 }));
      return jsonResult(groups);
    }

    case 'create_email_campaign': {
      const { group_id, subject, from_name, from_email, body, schedule_at, confirm } = args;
      if (!group_id || !subject || !from_email || !body) throw new Error('group_id, subject, from_email, and body are required.');
      const { key } = await mlKey();
      const ml = mlFetch(key);
      const allGroups = (await (await ml('GET', 'groups?limit=500')).json()).data || [];
      let targetGroups, label, count = 0;
      if (group_id === 'all') {
        targetGroups = allGroups.filter(g => g.name !== 'CRM · Test Send').map(g => String(g.id));
        label = 'All groups';
        count = allGroups.reduce((s, g) => s + (g.active_count || g.total || 0), 0);
      } else {
        const g = allGroups.find(x => String(x.id) === String(group_id));
        if (!g) throw new Error(`Group ${group_id} not found. Use list_email_groups.`);
        targetGroups = [String(group_id)]; label = g.name; count = g.active_count || g.total || 0;
      }
      if (!confirm) {
        return textResult(`Preview only — nothing sent. This campaign "${subject}" would go to ${label} (~${count} contacts)${schedule_at ? ` at ${fmtDate(schedule_at)}` : ' immediately'}. Confirm with the user, then call create_email_campaign again with confirm: true.`);
      }
      const content = mdToEmailHtml(body, from_name || 'Vernon Tech & Media');
      const createRes = await ml('POST', 'campaigns', {
        name: `MCP: ${subject}`.slice(0, 120), type: 'regular', groups: targetGroups,
        emails: [{ subject, from_name: from_name || 'Vernon Tech & Media', from: from_email, content }],
      });
      const cj = await createRes.json();
      if (!createRes.ok || !cj?.data?.id) throw new Error(`MailerLite could not create the campaign: ${cj?.message || createRes.status}`);
      const cid = cj.data.id;
      let schedBody;
      if (schedule_at) {
        const d = new Date(schedule_at);
        if (isNaN(d.getTime())) throw new Error('schedule_at is not a valid datetime.');
        schedBody = { delivery: 'scheduled', schedule: { date: d.toISOString().slice(0, 10), hours: String(d.getUTCHours()).padStart(2, '0'), minutes: String(d.getUTCMinutes()).padStart(2, '0'), timezone_id: 116 } };
      } else {
        schedBody = { delivery: 'instant' };
      }
      const sres = await ml('POST', `campaigns/${cid}/schedule`, schedBody);
      if (!sres.ok) { const sj = await sres.json().catch(() => ({})); throw new Error(`Created but could not schedule: ${sj?.message || sres.status}`); }
      return textResult(`✅ Campaign "${subject}" created for ${label} (~${count} contacts) — ${schedule_at ? `scheduled for ${fmtDate(schedule_at)}` : 'sending now'}. Campaign id: ${cid}.`);
    }

    case 'list_automations': {
      const rows = await supaFetch(`crm_email_automations?select=id,name,group_id,subject,weekday,send_hour,timezone,active,last_sent_at&order=created_at.desc`) || [];
      return jsonResult(rows);
    }
    case 'create_automation': {
      const { name: an, group_id, subject, from_name, from_email, body, weekday, send_hour, timezone, confirm } = args;
      if (!an || !group_id || !subject || !from_email || !body || weekday == null || send_hour == null) throw new Error('name, group_id, subject, from_email, body, weekday, and send_hour are required.');
      if (!confirm) return textResult(`Preview only. This will create a recurring automation "${an}" sending to group ${group_id} every ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday] || weekday} at ${send_hour}:00 (${timezone || 'America/Chicago'}). Confirm with the user, then call again with confirm: true.`);
      const { clientId } = await mlKey();
      const rows = await supaFetch('crm_email_automations', {
        method: 'POST', body: JSON.stringify({
          client_id: clientId, name: an, group_id: String(group_id), subject,
          from_name: from_name || 'Vernon Tech & Media', from_email, body,
          cadence: 'weekly', weekday: Number(weekday), send_hour: Number(send_hour),
          timezone: timezone || 'America/Chicago', active: true, created_by: emp.employee_name,
        }),
      });
      const id = (rows && rows[0] && rows[0].id) || null;
      return textResult(`✅ Automation "${an}" created and active.${id ? ` Id: ${id}` : ''} It will send weekly on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][weekday]} at ${send_hour}:00 ${timezone || 'America/Chicago'}.`);
    }

    default:
      throw new Error(`Tool ${name} is not implemented.`);
  }
}

// ── JSON-RPC handling ─────────────────────────────────────────────────────────
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function handleRpc(msg, emp, clientProtocol) {
  const { id, method, params } = msg || {};
  // Notifications (no id) get no response.
  if (id === undefined || id === null) {
    return null;
  }
  try {
    if (method === 'initialize') {
      return rpcResult(id, {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_DEFAULT,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'VTM CRM', version: '1.0.0' },
        instructions: 'Read client context before contacting anyone. send_email and schedule_email are two-step: the first call returns the contact\'s recent history and a confirm_token — review it with the user, then call again with the token to actually send.',
      });
    }
    if (method === 'ping') return rpcResult(id, {});
    if (method === 'tools/list') return rpcResult(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    if (method === 'tools/call') {
      const toolName = params && params.name;
      const toolArgs = (params && params.arguments) || {};
      try {
        const result = await callTool(toolName, toolArgs, emp);
        return rpcResult(id, result);
      } catch (e) {
        // Tool errors surface inside the result (isError) so the model can react.
        return rpcResult(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true });
      }
    }
    // resources / prompts not supported
    if (method === 'resources/list') return rpcResult(id, { resources: [] });
    if (method === 'prompts/list') return rpcResult(id, { prompts: [] });
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e) {
    return rpcError(id, -32603, e.message || 'Internal error');
  }
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, mcp-protocol-version, mcp-session-id');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Simple health check / discovery for a plain GET.
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, server: 'VTM CRM MCP', transport: 'streamable-http', hint: 'POST JSON-RPC 2.0 here. Authenticate with a Bearer token or ?key=.' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const emp = await authenticate(req);
  if (!emp) {
    res.setHeader('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized. Provide a valid CRM MCP access token via Authorization: Bearer or ?key=.' } });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });

  try {
    if (Array.isArray(body)) {
      const out = [];
      for (const m of body) { const r = await handleRpc(m, emp); if (r) out.push(r); }
      return res.status(200).json(out);
    }
    const result = await handleRpc(body, emp);
    if (result === null) return res.status(202).end();   // notification, no content
    return res.status(200).json(result);
  } catch (e) {
    console.error('mcp handler error', e);
    return res.status(200).json({ jsonrpc: '2.0', id: (body && body.id) || null, error: { code: -32603, message: e.message || 'Internal error' } });
  }
};
