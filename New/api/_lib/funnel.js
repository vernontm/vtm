// Shared helpers for the CRM funnel (opt-in, tripwire, OTO, decline, webhook).
// Contacts live in crm_email_contacts scoped to VTM's own email-list client,
// exactly like the public lead form (api/lead.js). We union tags rather than
// overwrite so a contact accumulates its funnel state over time.

const { supaFetch } = require('./supabase.js');

// VTM's own email list client ("Ray" client in crm_content_clients). Same id
// used by api/lead.js. Override with FUNNEL_CLIENT_ID if needed.
const FUNNEL_CLIENT_ID =
  process.env.FUNNEL_CLIENT_ID ||
  process.env.VTM_EMAIL_CLIENT_ID ||
  '27231196-0aac-45f6-ad3c-427bf09310ae';

const isEmail = (s) =>
  typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Upsert a contact and UNION the given tags onto whatever is already there.
// Returns { id, tags, created } or null on failure (callers treat as non-fatal).
async function tagContact({ email, name, addTags = [], source }) {
  const e = (email || '').toString().trim().toLowerCase();
  if (!isEmail(e)) return null;

  const existing = await supaFetch(
    `crm_email_contacts?client_id=eq.${FUNNEL_CLIENT_ID}&email=eq.${encodeURIComponent(e)}&select=id,tags`
  ).catch(() => null);

  if (existing && existing.length) {
    const merged = Array.from(new Set([...(existing[0].tags || []), ...addTags]));
    await supaFetch(`crm_email_contacts?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ tags: merged, status: 'active' }),
    }).catch(() => {});
    return { id: existing[0].id, tags: merged, created: false };
  }

  const created = await supaFetch('crm_email_contacts', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({
      client_id: FUNNEL_CLIENT_ID,
      email: e,
      name: name || '',
      tags: Array.from(new Set(addTags)),
      status: 'active',
      source: source || 'funnel',
      signed_up_at: new Date().toISOString(),
    }),
  }).catch(() => null);

  const row = Array.isArray(created) ? created[0] : created;
  return row ? { id: row.id, tags: row.tags || addTags, created: true } : null;
}

module.exports = { FUNNEL_CLIENT_ID, isEmail, tagContact };
