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
async function createCampaign(apiKey, { name, subject, from, from_name, html, preview_text, groupIds = [] }) {
  const safeSubject = (subject || name || 'Untitled').toString().trim() || 'Untitled';
  const safeFrom = (from || '').toString().trim();
  const safeFromName = (from_name || '').toString().trim();
  const safeHtml = (html || '').toString();
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

  const body = {
    name: (name || safeSubject).toString().trim() || 'Untitled',
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
  const res = await ml(apiKey, `/campaigns/${campaignId}`, { method: 'PUT', body: patch });
  return res?.data;
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
  const body = {
    delivery: 'scheduled',
    schedule: {
      date: d.toISOString().slice(0, 10),             // YYYY-MM-DD
      hours: String(d.getUTCHours()).padStart(2, '0'),
      minutes: String(d.getUTCMinutes()).padStart(2, '0'),
      timezone_id: 1,                                  // UTC
    },
  };
  const res = await ml(apiKey, `/campaigns/${campaignId}/schedule`, { method: 'POST', body });
  return res?.data;
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
};
