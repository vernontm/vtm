const { supaFetch } = require('./supabase.js');

// ─────────────────────────────────────────────────────────────
// MailerLite API wrapper
// Base URL: https://connect.mailerlite.com/api
// Auth: Bearer <api key>
// ─────────────────────────────────────────────────────────────

const ML_BASE = 'https://connect.mailerlite.com/api';

// Canonical group every CRM contact gets added to (name match in MailerLite)
const GENERAL_LIST_GROUP_NAME = 'VTM - General List';

async function ml(apiKey, path, { method = 'GET', body } = {}) {
  if (!apiKey) throw new Error('MailerLite API key missing');
  const res = await fetch(`${ML_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    // MailerLite returns { message, errors: { 'field.path': ['msg', ...] } }
    // on 422 — include the first couple of field errors so the cause is
    // obvious instead of hiding behind the generic top-level message.
    const fieldErrs = json?.errors && typeof json.errors === 'object'
      ? Object.entries(json.errors).slice(0, 3)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : v}`)
          .join(' | ')
      : '';
    const base = json?.message || json?.error || txt || res.statusText;
    const msg = fieldErrs ? `${base} [${fieldErrs}]` : base;
    const err = new Error(`MailerLite ${method} ${path} → ${res.status}: ${msg}`);
    err.status = res.status;
    err.body = json || txt;
    throw err;
  }
  return json;
}

// ───── Groups ─────

// Look up a group in the local cache (crm_mailerlite_groups) by tag.
// If not cached, search MailerLite for a group with that name; create if missing.
// Returns { group_id, group_name }.
async function getOrCreateGroup(apiKey, client_id, tag) {
  if (!tag) return null;
  // 1. cache lookup
  const cached = await supaFetch(
    `crm_mailerlite_groups?client_id=eq.${client_id}&tag=eq.${encodeURIComponent(tag)}&limit=1`
  ).catch(() => []);
  if (cached?.[0]?.group_id) return { group_id: cached[0].group_id, group_name: cached[0].group_name };

  // 2. search MailerLite by name
  const list = await ml(apiKey, `/groups?filter[name]=${encodeURIComponent(tag)}&limit=50`);
  let group = (list?.data || []).find(g => g.name?.toLowerCase() === tag.toLowerCase());

  // 3. create if missing
  if (!group) {
    const created = await ml(apiKey, '/groups', { method: 'POST', body: { name: tag } });
    group = created?.data;
  }
  if (!group?.id) throw new Error(`Failed to get/create MailerLite group for tag "${tag}"`);

  // 4. cache it
  await supaFetch('crm_mailerlite_groups', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      client_id,
      tag,
      group_id: String(group.id),
      group_name: group.name,
      synced_at: new Date().toISOString(),
    }]),
  }).catch(() => {});

  return { group_id: String(group.id), group_name: group.name };
}

// ───── Subscribers ─────

// Upsert a subscriber. MailerLite's POST /subscribers is upsert-by-email.
// Returns the subscriber object { id, email, ... }.
async function upsertSubscriber(apiKey, { email, name, fields = {}, status = 'active' }) {
  const body = {
    email: email.trim().toLowerCase(),
    status,
    fields: {
      ...(name ? { name } : {}),
      ...fields,
    },
  };
  const res = await ml(apiKey, '/subscribers', { method: 'POST', body });
  return res?.data;
}

async function addSubscriberToGroup(apiKey, subscriberId, groupId) {
  if (!subscriberId || !groupId) return;
  return ml(apiKey, `/subscribers/${subscriberId}/groups/${groupId}`, { method: 'POST' });
}

// ───── High-level: sync a CRM contact to MailerLite ─────
// Upserts subscriber, ensures they're in VTM - General List + a group per tag
// (plus Source:X if source passed). Caches groups. Writes subscriber id back
// to crm_email_contacts. Swallows errors so caller never breaks on ML outage.
async function syncContactToMailerlite({ client_id, contact_id, email, name, tags = [], source = null }) {
  const result = { ok: false, subscriber_id: null, groups: [], errors: [] };
  try {
    // Load API key
    const cfgRows = await supaFetch(`crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key`);
    const apiKey = cfgRows?.[0]?.mailerlite_api_key;
    if (!apiKey) { result.errors.push('no mailerlite_api_key configured for client'); return result; }

    // 1. upsert subscriber
    const sub = await upsertSubscriber(apiKey, { email, name });
    result.subscriber_id = sub?.id ? String(sub.id) : null;
    if (!result.subscriber_id) { result.errors.push('subscriber upsert returned no id'); return result; }

    // 2. collect group list to add to
    const groupTags = new Set([GENERAL_LIST_GROUP_NAME, ...tags.filter(Boolean)]);
    if (source) groupTags.add(`Source: ${source}`);

    for (const tag of groupTags) {
      try {
        const g = await getOrCreateGroup(apiKey, client_id, tag);
        if (g?.group_id) {
          await addSubscriberToGroup(apiKey, result.subscriber_id, g.group_id);
          result.groups.push(tag);
        }
      } catch (e) {
        result.errors.push(`group "${tag}": ${e.message}`);
      }
    }

    // 3. write subscriber id back to our contact row
    if (contact_id) {
      await supaFetch(`crm_email_contacts?id=eq.${contact_id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          mailerlite_subscriber_id: result.subscriber_id,
          mailerlite_synced_at: new Date().toISOString(),
          ...(source ? { source } : {}),
        }),
      }).catch(() => {});
    }

    result.ok = true;
  } catch (e) {
    result.errors.push(e.message);
  }
  return result;
}

// ───── Campaigns ─────

// Create a MailerLite campaign. type='regular'. Returns the full campaign object.
// NOTE: MailerLite's validator returns a misleading "emails.0 field must be an
// array" error whenever emails[0] fails any sub-field validation (missing
// subject/from/from_name/content). We sanitize everything here so the request
// never trips that guardrail, and we tack language_id on because some accounts
// require it.
// Our composer uses Mustache-style {{name}} merge tags. MailerLite's tag
// syntax is {$name} and their validator flags {{ }} in subjects as
// "forbidden characters". Translate before sending so the rest of the app
// can stay on the {{...}} convention.
function convertMergeTags(s) {
  if (s == null) return s;
  return String(s).replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (_, key) => {
    // first_name → name (MailerLite has no first_name field by default)
    const map = { first_name: 'name', firstname: 'name' };
    return `{$${map[key.toLowerCase()] || key}}`;
  });
}

// MailerLite's subject/name validator rejects "forbidden characters" (a 422
// with no useful detail). Empirically the things it bans: HTML angle brackets,
// ASCII control chars (incl. newlines/tabs), null bytes, zero-width /
// invisible unicode that comes along with copy-pasted rich-text, and the
// Mustache {{...}} syntax. Smart quotes, em dashes, and emoji are fine.
function sanitizeMlText(s, maxLen = 255) {
  if (s == null) return '';
  let out = convertMergeTags(s);
  // Strip HTML angle brackets entirely (subjects are plain text).
  out = out.replace(/[<>]/g, '');
  // Strip ASCII controls (0x00–0x1F and 0x7F) — newlines, tabs, etc.
  out = out.replace(/[\x00-\x1F\x7F]/g, ' ');
  // Strip zero-width / invisible unicode (BOM, ZWSP, ZWNJ, ZWJ, word joiner).
  out = out.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '');
  // Collapse runs of whitespace and trim.
  out = out.replace(/\s+/g, ' ').trim();
  if (out.length > maxLen) out = out.slice(0, maxLen).trim();
  return out;
}

// Campaign `name` is MailerLite's internal label (admin-only). Their
// validator rejects ANY merge-tag syntax there ({{x}} or {$x}), so we
// strip the patterns out instead of translating them.
function sanitizeMlCampaignName(s) {
  if (s == null) return '';
  let out = String(s)
    .replace(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_.]*\s*\}\}/g, '')
    .replace(/\{\$[a-zA-Z_][a-zA-Z0-9_.]*\}/g, '');
  return sanitizeMlText(out, 100); // ML caps name at 100ish; be safe
}

async function createCampaign(apiKey, { name, subject, from, from_name, html, preview_text, groupIds = [] }) {
  const safeSubject = sanitizeMlText(subject || name) || 'Untitled';
  const safeFrom = (from || '').toString().trim();
  const safeFromName = sanitizeMlText(from_name);
  // HTML body keeps tags/structure, but we still translate {{name}} → {$name}
  // so MailerLite actually personalizes the rendered email.
  const safeHtml = convertMergeTags((html || '').toString());
  if (!safeFrom) throw new Error('MailerLite: from_email missing on client config');
  if (!safeFromName) throw new Error('MailerLite: from_name missing on client config');
  if (!safeHtml.trim()) throw new Error('MailerLite: campaign body is empty');

  // Per MailerLite Connect API docs (developers.mailerlite.com/docs/campaigns.html)
  // emails[*] required: subject, from_name, from. Optional: reply_to, content
  // (HTML, Advanced plan). preview_text is NOT a documented sub-field — the
  // validator rejects unknown keys silently and reports "emails.0 must be an
  // array", which is why we strip it here.
  const emailEntry = {
    subject: safeSubject,
    from_name: safeFromName,
    from: safeFrom,
    content: safeHtml,
  };

  // Build the internal label: prefer explicit name, fall back to subject
  // with merge tags stripped, then "Untitled".
  const labelSource = name || subject || 'Untitled';
  const body = {
    name: sanitizeMlCampaignName(labelSource) || 'Untitled',
    language_id: 1,
    type: 'regular',
    emails: [emailEntry],
  };
  const groupsArr = (groupIds || []).filter(Boolean).map(String);
  if (groupsArr.length) body.groups = groupsArr;

  try {
    const res = await ml(apiKey, '/campaigns', { method: 'POST', body });
    return res?.data;
  } catch (e) {
    // Surface the request shape on failure so we can diagnose schema drift.
    // (preview_text was removed; if this still fires the cause is elsewhere —
    // typically an unverified `from` address or content rejected by plan.)
    console.error('MailerLite createCampaign payload:', JSON.stringify({
      ...body,
      emails: body.emails.map(e => ({ ...e, content: `[${(e.content || '').length} chars]` })),
    }));
    if (e.body) console.error('MailerLite createCampaign response body:', JSON.stringify(e.body));
    throw e;
  }
}

async function updateCampaign(apiKey, campaignId, patch) {
  // Mirror createCampaign's sanitization so updates don't trip the same
  // "Input contains forbidden characters" 422 on name / subject / from_name.
  const safe = { ...(patch || {}) };
  if (safe.name != null) safe.name = sanitizeMlCampaignName(safe.name);
  if (Array.isArray(safe.emails)) {
    safe.emails = safe.emails.map(e => {
      const out = { ...e };
      if (out.subject != null)   out.subject   = sanitizeMlText(out.subject);
      if (out.from_name != null) out.from_name = sanitizeMlText(out.from_name);
      if (out.content != null)   out.content   = convertMergeTags(out.content);
      return out;
    });
  }
  const res = await ml(apiKey, `/campaigns/${campaignId}`, { method: 'PUT', body: safe });
  return res?.data;
}

// MailerLite assigns each timezone an integer id (id 1 is NOT UTC — it's
// usually around UTC-11 in their list). We have to look up the real UTC
// id once per process and cache it; otherwise scheduled sends fire at the
// wrong time or, if the resulting moment is in the past, MailerLite
// silently parks the campaign in Drafts instead of Scheduled.
let _utcTimezoneId = null;
async function resolveUtcTimezoneId(apiKey) {
  if (_utcTimezoneId) return _utcTimezoneId;
  try {
    const res = await ml(apiKey, '/timezones');
    const list = Array.isArray(res?.data) ? res.data : [];
    // Match in order of preference: exact "UTC" name, code "UTC", offset 0
    // with a UTC-ish name, then Etc/UTC.
    const pick =
      list.find(t => /^utc$/i.test(t.name) || /^utc$/i.test(t.code))
      || list.find(t => /\(utc[+-]?00:?00\)/i.test(t.title || t.name || ''))
      || list.find(t => (t.offset === 0 || t.offset === '0') && /utc|coordinated/i.test(t.name || ''))
      || list.find(t => /etc\/utc/i.test(t.name || ''));
    if (pick?.id) _utcTimezoneId = pick.id;
  } catch (e) {
    console.error('MailerLite timezones lookup failed:', e.message);
  }
  return _utcTimezoneId;
}

// Schedule a campaign. `scheduledAt` is a Date or ISO string (UTC).
// If omitted, schedules for "instant" (MailerLite's immediate send).
async function scheduleCampaign(apiKey, campaignId, scheduledAt) {
  if (!scheduledAt) {
    const res = await ml(apiKey, `/campaigns/${campaignId}/schedule`, {
      method: 'POST',
      body: { delivery: 'instant' },
    });
    return res?.data;
  }
  const d = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (isNaN(d.getTime())) throw new Error(`Invalid scheduled_at: ${scheduledAt}`);
  if (d.getTime() <= Date.now() + 60 * 1000) {
    // MailerLite rejects past times and silently parks "too soon" times in
    // Drafts. Surface this as a real error rather than a silent miss.
    throw new Error(`scheduled_at must be at least 1 min in the future (got ${d.toISOString()})`);
  }

  // Year/month/day/hours/minutes — taken from UTC parts so they pair with the
  // UTC timezone id below.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const schedule = {
    date: `${yyyy}-${mm}-${dd}`,
    hours: String(d.getUTCHours()).padStart(2, '0'),
    minutes: String(d.getUTCMinutes()).padStart(2, '0'),
  };
  const utcId = await resolveUtcTimezoneId(apiKey);
  if (utcId) schedule.timezone_id = utcId;
  // If we can't resolve UTC, omit timezone_id — MailerLite falls back to the
  // account's default timezone. The send time will be wrong relative to UTC,
  // but at least the campaign appears as Scheduled instead of vanishing.

  const body = { delivery: 'scheduled', schedule };
  try {
    const res = await ml(apiKey, `/campaigns/${campaignId}/schedule`, { method: 'POST', body });
    return res?.data;
  } catch (e) {
    console.error('MailerLite schedule payload:', JSON.stringify(body));
    if (e.body) console.error('MailerLite schedule response body:', JSON.stringify(e.body));
    throw e;
  }
}

async function cancelCampaign(apiKey, campaignId) {
  const res = await ml(apiKey, `/campaigns/${campaignId}/cancel`, { method: 'POST' });
  return res?.data;
}

async function deleteCampaign(apiKey, campaignId) {
  return ml(apiKey, `/campaigns/${campaignId}`, { method: 'DELETE' });
}

// Subscriber activity for a sent campaign (opens/clicks/unsubs/bounces).
// Returns { opens_count, clicks_count, unsubscribes_count, bounces_count, ... } + activity array.
async function getCampaignActivity(apiKey, campaignId) {
  // Top-level stats live on the campaign object itself
  const summary = await ml(apiKey, `/campaigns/${campaignId}`);
  const activity = await ml(apiKey, `/campaigns/${campaignId}/reports/subscriber-activity?limit=500`);
  return { summary: summary?.data, activity: activity?.data || [] };
}

// ───── Account check (used by "Test connection" button in UI) ─────
async function getAccount(apiKey) {
  return ml(apiKey, '/account');
}

// ───── Subscriber listing (used for per-contact stats) ─────
// Pulls every subscriber the API key can see. Each subscriber object
// includes aggregate fields (opens_count, clicks_count, etc.) — that's
// what powers the SENT / OPENED columns on the Contacts table.
//
// MailerLite Connect uses cursor pagination; max page size is 1000.
async function listAllSubscribers(apiKey) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 100; i++) { // safety cap = 100k subs
    const path = `/subscribers?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const r = await ml(apiKey, path);
    const data = r?.data || [];
    out.push(...data);
    cursor = r?.meta?.next_cursor || null;
    if (!cursor || data.length === 0) break;
  }
  return out;
}

// 5-minute in-process cache so a Contacts page reload doesn't slam ML.
const _statsCache = new Map(); // client_id → { at, byEmail, bySubId }
const STATS_TTL_MS = 5 * 60 * 1000;

async function getContactStatsFromMailerlite(apiKey, client_id) {
  const cached = _statsCache.get(client_id);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached;
  const subs = await listAllSubscribers(apiKey);
  const byEmail = new Map();
  const bySubId = new Map();
  for (const s of subs) {
    const stat = {
      sent:    Number(s.sent ?? s.total ?? 0),
      opened:  Number(s.opens_count ?? s.opens ?? 0),
      clicked: Number(s.clicks_count ?? s.clicks ?? 0),
      failed:  s.status === 'bounced' ? 1 : 0,
    };
    if (s.email) byEmail.set(String(s.email).toLowerCase(), stat);
    if (s.id)    bySubId.set(String(s.id), stat);
  }
  const entry = { at: Date.now(), byEmail, bySubId };
  _statsCache.set(client_id, entry);
  return entry;
}

module.exports = {
  ml,
  GENERAL_LIST_GROUP_NAME,
  getOrCreateGroup,
  upsertSubscriber,
  addSubscriberToGroup,
  syncContactToMailerlite,
  createCampaign,
  updateCampaign,
  scheduleCampaign,
  cancelCampaign,
  deleteCampaign,
  getCampaignActivity,
  getAccount,
  listAllSubscribers,
  getContactStatsFromMailerlite,
};
