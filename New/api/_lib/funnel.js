// Shared helpers for the CRM funnel (opt-in, tripwire, OTO, decline, webhook).
// Contacts live in crm_email_contacts scoped to VTM's own email-list client,
// and are mirrored into MailerLite groups so the email automations can fire.

const { supaFetch } = require('./supabase.js');
const { syncContactToMailerlite } = require('./mailerlite.js');

// VTM's real email-list client ("rayvaughnceo" — the one with MailerLite
// configured + the live subscriber list). Override with FUNNEL_CLIENT_ID.
const FUNNEL_CLIENT_ID =
  process.env.FUNNEL_CLIENT_ID ||
  '632a79e3-bdd1-4c80-9a64-583b64afcd2f';

// Maps the internal crm_email_contacts tags to clean, human-readable MailerLite
// GROUP names. Each group is what a MailerLite automation triggers on
// ("when a subscriber joins this group"). Tags not listed here don't create a
// group (they stay internal-only).
const ML_GROUP_FOR_TAG = {
  'funnel:crm-lead':    'CRM Lead',
  'declined:tripwire':  'CRM Decliner',
  'buyer:crm-build':    'CRM Build Buyer',
  'bump:context-file':  'CRM Context Buyer',
  'buyer:crm-lab':      'CRM Lab Member',
};

const isEmail = (s) =>
  typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Upsert a contact, UNION the given tags, and mirror into the matching
// MailerLite groups so automations trigger. Non-fatal on any failure.
async function tagContact({ email, name, addTags = [], source }) {
  const e = (email || '').toString().trim().toLowerCase();
  if (!isEmail(e)) return null;

  const existing = await supaFetch(
    `crm_email_contacts?client_id=eq.${FUNNEL_CLIENT_ID}&email=eq.${encodeURIComponent(e)}&select=id,tags`
  ).catch(() => null);

  let contactId, mergedTags;
  if (existing && existing.length) {
    contactId = existing[0].id;
    mergedTags = Array.from(new Set([...(existing[0].tags || []), ...addTags]));
    await supaFetch(`crm_email_contacts?id=eq.${contactId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ tags: mergedTags, status: 'active' }),
    }).catch(() => {});
  } else {
    mergedTags = Array.from(new Set(addTags));
    const created = await supaFetch('crm_email_contacts', {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({
        client_id: FUNNEL_CLIENT_ID,
        email: e,
        name: name || '',
        tags: mergedTags,
        status: 'active',
        source: source || 'funnel',
        signed_up_at: new Date().toISOString(),
      }),
    }).catch(() => null);
    const row = Array.isArray(created) ? created[0] : created;
    contactId = row ? row.id : null;
  }

  // Mirror into MailerLite groups for the tags we just added (clean names).
  // Awaited because serverless kills un-awaited promises after the response.
  const mlGroups = addTags.map((t) => ML_GROUP_FOR_TAG[t]).filter(Boolean);
  if (mlGroups.length) {
    await syncContactToMailerlite({
      client_id: FUNNEL_CLIENT_ID,
      contact_id: contactId,
      email: e,
      name: name || '',
      tags: mlGroups,
      source: source || null,
    }).catch(() => {});
  }

  return { id: contactId, tags: mergedTags, created: !(existing && existing.length) };
}

module.exports = { FUNNEL_CLIENT_ID, isEmail, tagContact };
