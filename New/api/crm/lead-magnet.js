const { setCors, supaFetch, SUPABASE_URL } = require('../_lib/supabase.js');
const { syncContactToMailerlite } = require('../_lib/mailerlite.js');

// Public (no-auth) lead magnet endpoint — funnels CRM landing-page signups
// into MailerLite. MailerLite automations (triggered by group membership)
// handle the actual email delivery.
//
// POST { email, name?, phone?, tags?, source?, action? }
// - action omitted / 'signup' — upsert contact + sync to MailerLite
//     Every signup gets: "VTM - General List" + "BUILD" groups.
//     If `source` passed (e.g. 'instagram', 'tiktok'), also adds "Source: Instagram".
//     Any extra `tags` from the form also map to groups.
// - action 'add-phone' — patches the contact w/ phone, tag unlocked, re-syncs.

// Resolve the client that owns CRM-form signups.
// Override via VTM_EMAIL_CLIENT_ID; falls back to rayvaughnceo's client.
function resolveClientId() {
  return process.env.VTM_EMAIL_CLIENT_ID || '632a79e3-bdd1-4c80-9a64-583b64afcd2f';
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const phone = (body.phone || '').trim();
    const source = (body.source || '').trim() || null;   // e.g. 'instagram', 'tiktok', 'youtube'
    const action = body.action || 'signup';
    const extraTags = Array.isArray(body.tags) ? body.tags.filter(Boolean) : [];

    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

    const client_id = resolveClientId();

    // ── action: add-phone — patch existing contact w/ phone + unlock tag, re-sync ──
    if (action === 'add-phone') {
      if (!phone || phone.replace(/\D/g, '').length < 7) {
        return res.status(400).json({ error: 'Valid phone required' });
      }
      const existing = await supaFetch(`crm_email_contacts?email=eq.${encodeURIComponent(email)}&select=id,client_id,tags,name,source&limit=1`);
      if (!existing || !existing.length) return res.status(404).json({ error: 'Contact not found — submit email first' });
      const c = existing[0];
      const tags = Array.from(new Set([...(c.tags || []), 'video-unlocked', 'phone-given']));
      await supaFetch(`crm_email_contacts?id=eq.${c.id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ phone, tags }),
      });
      try {
        await syncContactToMailerlite({
          client_id: c.client_id,
          contact_id: c.id,
          email,
          name: c.name,
          tags,
          source: c.source || null,
        });
      } catch (e) { console.error('mailerlite sync (add-phone) failed:', e.message); }
      return res.json({ ok: true, unlocked: true, contact_id: c.id });
    }

    // ── action: signup — upsert contact, sync to MailerLite ──
    // Tags: always include 'BUILD' (CRM landing-page marker) + any form-supplied tags.
    const tagSet = new Set(['BUILD', ...extraTags]);
    const tags = Array.from(tagSet);

    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_email_contacts?on_conflict=client_id,email`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([{
          client_id,
          email,
          name: name || null,
          tags,
          source,
          status: 'active',
          signed_up_at: new Date().toISOString(),
        }]),
      }
    );
    if (!upsertRes.ok) {
      const t = await upsertRes.text();
      return res.status(500).json({ error: `Contact upsert failed: ${t}` });
    }
    const contactRows = await upsertRes.json();
    const contact = contactRows[0];
    if (!contact?.id) return res.status(500).json({ error: 'Contact upsert returned no id' });

    // Fire off to MailerLite — their automation takes it from here.
    let mlResult = null;
    try {
      mlResult = await syncContactToMailerlite({
        client_id,
        contact_id: contact.id,
        email,
        name: name || null,
        tags,
        source,
      });
    } catch (e) { console.error('mailerlite sync (signup) failed:', e.message); }

    return res.json({
      ok: true,
      contact_id: contact.id,
      synced: !!mlResult?.ok,
      groups: mlResult?.groups || [],
    });
  } catch (err) {
    console.error('lead-magnet error:', err);
    return res.status(500).json({ error: err.message });
  }
};
