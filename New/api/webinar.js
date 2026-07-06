const { setCors, supaFetch } = require('./_lib/supabase.js');
const { syncContactToMailerlite } = require('./_lib/mailerlite.js');

// Public (no-auth) webinar registration endpoint for /webinar.
//
// Flow on the page: visitor answers the survey, then submits name + email +
// phone. We:
//   1. Store the full survey in `webinar_registrations` (source of truth for
//      curating the sessions + the SMS send list Ray runs from Claude Code).
//   2. Upsert into `crm_email_contacts` (phone + tags) so they land in the CRM.
//   3. Sync to MailerLite — adds them to the "AI Workshop Registrants" group so
//      the confirmation + reminder automation fires. Also drops segment groups
//      (revenue / AI level) so Ray can slice the list.
//   4. Post the full record to the existing Zapier webhook so it can fan out to
//      a Google Sheet (the list the SMS session reads) and anything else.
//
// The Google Meet link is returned by this endpoint ONLY on a successful
// registration — it never appears in the page source, so it can't be shared
// without going through the survey.

// The VTM email-list client ("rayvaughnceo" in crm_content_clients — has the
// MailerLite key + sends from ray@vernontm.com). Override via env if it moves.
const VTM_EMAIL_CLIENT_ID = process.env.VTM_EMAIL_CLIENT_ID || '632a79e3-bdd1-4c80-9a64-583b64afcd2f';

// Reusable durable group name — keep it stable across future workshops so the
// same MailerLite automation keeps working.
const WORKSHOP_GROUP = 'AI Workshop Registrants';

// Meet link + details. Kept server-side so the link is gated behind the survey.
const WEBINAR = {
  url: process.env.WEBINAR_MEET_URL || 'https://meet.google.com/ddv-bern-gye',
  title: 'Advanced AI Workshop',
  when: 'Monday, July 6 · 7:00 PM CST',
};

const ZAPIER_WEBHOOK = process.env.WEBINAR_ZAPIER_WEBHOOK
  || 'https://hooks.zapier.com/hooks/catch/12135291/u7ub25s/';

function clean(v, max = 500) {
  return (typeof v === 'string' ? v : '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phoneRaw = clean(body.phone, 40);
    const phoneDigits = phoneRaw.replace(/\D/g, '');

    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
    if (phoneDigits.length < 7) return res.status(400).json({ error: 'Valid phone required' });

    const reg = {
      name,
      email,
      phone: phoneRaw,
      business: clean(body.business, 160),
      industry: clean(body.industry, 80),
      location: clean(body.location, 80),
      ai_level: clean(body.ai_level, 80),
      ai_use: clean(body.ai_use, 120),
      tech_level: clean(body.tech_level, 120),
      ai_goal: clean(body.ai_goal, 120),
      pain: clean(body.pain, 800),
      revenue: clean(body.revenue, 80),
      revenue_goal: clean(body.revenue_goal, 80),
      answers: body.answers && typeof body.answers === 'object' ? body.answers : null,
      source: clean(body.source, 60) || 'webinar-page',
      utm: body.utm && typeof body.utm === 'object' ? body.utm : null,
    };

    const results = { registration: null, contact: null, mailerlite: null, zapier: null };

    // 1. Store the full survey ─────────────────────────────────────────────
    try {
      const rows = await supaFetch('webinar_registrations', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(reg),
      });
      results.registration = rows?.[0]?.id ? 'saved' : 'error';
    } catch (e) {
      console.error('webinar_registrations insert failed:', e.message);
      results.registration = 'error';
    }

    // Segment tags → MailerLite groups (kept short so we don't spawn dozens).
    const tags = [WORKSHOP_GROUP, 'workshop-2026-07-06'];
    if (reg.revenue) tags.push(`Revenue: ${reg.revenue}`);
    if (reg.ai_level) tags.push(`AI Level: ${reg.ai_level}`);

    // 2. Upsert CRM contact (check-then-write, like lead-magnet) ────────────
    let contactId = null;
    try {
      const existing = await supaFetch(
        `crm_email_contacts?client_id=eq.${VTM_EMAIL_CLIENT_ID}&email=eq.${encodeURIComponent(email)}&select=id,tags&limit=1`
      ).catch(() => []);

      if (existing && existing.length) {
        contactId = existing[0].id;
        const merged = Array.from(new Set([...(existing[0].tags || []), ...tags]));
        await supaFetch(`crm_email_contacts?id=eq.${contactId}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            name: name || undefined,
            phone: phoneRaw || undefined,
            tags: merged,
            city: reg.location || undefined,
            source: reg.source,
            updated_at: new Date().toISOString(),
          }),
        });
        results.contact = 'updated';
      } else {
        const inserted = await supaFetch('crm_email_contacts', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify({
            client_id: VTM_EMAIL_CLIENT_ID,
            email,
            name,
            phone: phoneRaw,
            tags,
            city: reg.location || null,
            status: 'active',
            source: reg.source,
            signed_up_at: new Date().toISOString(),
          }),
        });
        contactId = inserted?.[0]?.id || null;
        results.contact = 'created';
      }
    } catch (e) {
      console.error('crm_email_contacts upsert failed:', e.message);
      results.contact = 'error';
    }

    // 3. MailerLite sync (fires the confirmation/reminder automation) ───────
    try {
      const ml = await syncContactToMailerlite({
        client_id: VTM_EMAIL_CLIENT_ID,
        contact_id: contactId,
        email,
        name,
        tags,
        source: reg.source,
      });
      results.mailerlite = ml.ok ? 'synced' : `error: ${(ml.errors || []).join('; ')}`;
    } catch (e) {
      console.error('MailerLite sync failed:', e.message);
      results.mailerlite = 'error';
    }

    // 4. Zapier fan-out (Google Sheet / SMS list) ──────────────────────────
    try {
      const summaryParts = [
        `${name}`,
        reg.business ? `(${reg.business})` : '',
        reg.location ? `from ${reg.location}` : '',
        reg.revenue ? `now ${reg.revenue}` : '',
        reg.revenue_goal ? `wants ${reg.revenue_goal}` : '',
        reg.ai_goal ? `wants AI for ${reg.ai_goal}` : '',
        reg.pain ? `pain: ${reg.pain}` : '',
      ].filter(Boolean);
      const zres = await fetch(ZAPIER_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'webinar-registration',
          webinar: WEBINAR.title,
          when: WEBINAR.when,
          ...reg,
          summary: summaryParts.join(' · '),
          timestamp: new Date().toISOString(),
        }),
      });
      results.zapier = zres.ok ? 'sent' : `error ${zres.status}`;
    } catch (e) {
      console.error('Zapier send failed:', e.message);
      results.zapier = 'error';
    }

    return res.status(200).json({
      success: true,
      meet: WEBINAR,
      results,
    });
  } catch (e) {
    console.error('webinar handler error:', e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
