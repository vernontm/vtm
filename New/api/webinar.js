const { setCors, supaFetch } = require('./_lib/supabase.js');

// Public (no-auth) webinar registration endpoint for /webinar.
//
// Two-stage flow so we keep the lead even if someone abandons the survey:
//   stage "contact"  — the FIRST slide. Captures name + email + phone, inserts a
//                      `webinar_registrations` row with status 'partial', upserts
//                      the CRM contact, and returns { registration_id }. No link.
//   stage "complete" — after the survey. PATCHes that same row (by registration_id)
//                      with the full answers + status 'complete', fires Zapier, and
//                      returns the gated Google Meet link.
//
// Confirmation + reminder emails/texts go out from ray@vernontm.com via the
// outreach sender (campaigns webinar-confirm / webinar-reminder + send-webinar-sms),
// which read `webinar_registrations` and only message status 'complete' rows.
//
// The Meet link is returned ONLY on a completed registration, so it never
// appears in the page source and cannot be shared without finishing the survey.

// The VTM email-list client ("rayvaughnceo" — sends from ray@vernontm.com).
const VTM_EMAIL_CLIENT_ID = process.env.VTM_EMAIL_CLIENT_ID || '632a79e3-bdd1-4c80-9a64-583b64afcd2f';

// Durable tag on every registrant's CRM contact, stable across future workshops.
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

    const stage = body.stage === 'contact' ? 'contact' : 'complete';
    let regId = clean(body.registration_id, 60) || null;

    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phoneRaw = clean(body.phone, 40);
    const phoneDigits = phoneRaw.replace(/\D/g, '');

    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
    if (phoneDigits.length < 7) return res.status(400).json({ error: 'Valid phone required' });

    const source = clean(body.source, 60) || 'webinar-page';
    const utm = body.utm && typeof body.utm === 'object' ? body.utm : null;

    // Full survey payload (only meaningful on the "complete" stage).
    const full = {
      name, email, phone: phoneRaw,
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
      source, utm, status: 'complete',
    };

    const results = { registration: null, contact: null, zapier: null };

    // ── 1. Save / update the registration row ──────────────────────────────
    if (stage === 'contact') {
      try {
        const rows = await supaFetch('webinar_registrations', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify({ name, email, phone: phoneRaw, status: 'partial', source, utm }),
        });
        regId = rows?.[0]?.id || null;
        results.registration = regId ? 'partial-saved' : 'error';
      } catch (e) {
        console.error('webinar_registrations partial insert failed:', e.message);
        results.registration = 'error';
      }
    } else if (regId) {
      try {
        await supaFetch(`webinar_registrations?id=eq.${encodeURIComponent(regId)}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify(full),
        });
        results.registration = 'completed';
      } catch (e) {
        console.error('webinar_registrations complete patch failed:', e.message);
        results.registration = 'error';
      }
    } else {
      // Complete with no partial id (e.g. the first save failed) — insert fresh.
      try {
        const rows = await supaFetch('webinar_registrations', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(full),
        });
        regId = rows?.[0]?.id || null;
        results.registration = regId ? 'saved' : 'error';
      } catch (e) {
        console.error('webinar_registrations insert failed:', e.message);
        results.registration = 'error';
      }
    }

    // ── 2. Upsert CRM contact (both stages — we have email + phone) ─────────
    const tags = [WORKSHOP_GROUP, 'workshop-2026-07-06'];
    if (stage === 'contact') tags.push('partial-registration');
    if (full.revenue) tags.push(`Revenue: ${full.revenue}`);
    if (full.ai_level) tags.push(`AI Level: ${full.ai_level}`);
    try {
      const existing = await supaFetch(
        `crm_email_contacts?client_id=eq.${VTM_EMAIL_CLIENT_ID}&email=eq.${encodeURIComponent(email)}&select=id,tags&limit=1`
      ).catch(() => []);

      if (existing && existing.length) {
        const merged = Array.from(new Set([...(existing[0].tags || []), ...tags]));
        await supaFetch(`crm_email_contacts?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            name: name || undefined,
            phone: phoneRaw || undefined,
            tags: merged,
            source,
            updated_at: new Date().toISOString(),
          }),
        });
        results.contact = 'updated';
      } else {
        await supaFetch('crm_email_contacts', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            client_id: VTM_EMAIL_CLIENT_ID,
            email, name, phone: phoneRaw, tags,
            status: 'active', source,
            signed_up_at: new Date().toISOString(),
          }),
        });
        results.contact = 'created';
      }
    } catch (e) {
      console.error('crm_email_contacts upsert failed:', e.message);
      results.contact = 'error';
    }

    // ── Partial stage stops here: no link, no Zapier. ──────────────────────
    if (stage === 'contact') {
      return res.status(200).json({ success: true, stage: 'contact', registration_id: regId, results });
    }

    // ── 3. On COMPLETE: Zapier fan-out + return the gated link ─────────────
    try {
      const summaryParts = [
        `${name}`,
        full.business ? `(${full.business})` : '',
        full.revenue ? `now ${full.revenue}` : '',
        full.revenue_goal ? `wants ${full.revenue_goal}` : '',
        full.ai_goal ? `wants AI for ${full.ai_goal}` : '',
        full.pain ? `pain: ${full.pain}` : '',
      ].filter(Boolean);
      const zres = await fetch(ZAPIER_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'webinar-registration',
          webinar: WEBINAR.title,
          when: WEBINAR.when,
          ...full,
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
      stage: 'complete',
      registration_id: regId,
      meet: WEBINAR,
      results,
    });
  } catch (e) {
    console.error('webinar handler error:', e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
