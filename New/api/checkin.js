const { setCors, supaFetch } = require('./_lib/supabase.js');

// Public (no-auth) in-person event check-in endpoint for /meetup.
//
// Two-stage flow:
//   stage "checkin" — FIRST slide. Captures name + email + phone, logs an
//     `event_checkins` row (with the timestamp = when they showed up), and
//     looks the person up in our contact list (crm_email_contacts).
//       - Known contact  -> attendee_type 'existing', returns { known:true }.
//         The page shows the thank-you immediately; no survey.
//       - New person      -> attendee_type 'new', inserts them into the list,
//         returns { known:false } and the page runs the full survey.
//   stage "complete" — only for NEW people, after the survey. PATCHes the same
//     check-in row with the answers and marks survey_completed.
//
// Attendance (name/email/phone + date/time) is saved for EVERYONE at the
// checkin stage, whether they were already on the list or not.

const VTM_EMAIL_CLIENT_ID = process.env.VTM_EMAIL_CLIENT_ID || '632a79e3-bdd1-4c80-9a64-583b64afcd2f';

const DEFAULT_EVENT_NAME = 'Vernon Tech & Media Live Event';
const EVENT_SLUG = 'meetup';

function clean(v, max = 500) {
  return (typeof v === 'string' ? v : '').trim().slice(0, max);
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const stage = body.stage === 'complete' ? 'complete' : 'checkin';
    let checkinId = clean(body.checkin_id, 60) || null;

    const name = clean(body.name, 120);
    const email = clean(body.email, 200).toLowerCase();
    const phoneRaw = clean(body.phone, 40);
    const phoneDigits = phoneRaw.replace(/\D/g, '');
    const eventName = clean(body.event, 120) || DEFAULT_EVENT_NAME;
    const source = clean(body.source, 60) || 'meetup-page';

    const results = { checkin: null, contact: null };

    // ── stage "complete": attach the survey to an existing check-in row ─────
    if (stage === 'complete') {
      const full = {
        business: clean(body.business, 160),
        industry: clean(body.industry, 80),
        ai_level: clean(body.ai_level, 80),
        ai_use: clean(body.ai_use, 120),
        tech_level: clean(body.tech_level, 120),
        ai_goal: clean(body.ai_goal, 120),
        pain: clean(body.pain, 800),
        revenue: clean(body.revenue, 80),
        revenue_goal: clean(body.revenue_goal, 80),
        answers: body.answers && typeof body.answers === 'object' ? body.answers : null,
        survey_completed: true,
      };
      if (checkinId) {
        try {
          await supaFetch(`event_checkins?id=eq.${encodeURIComponent(checkinId)}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify(full),
          });
          results.checkin = 'survey-saved';
        } catch (e) {
          console.error('event_checkins survey patch failed:', e.message);
          results.checkin = 'error';
        }
      }
      // Enrich the contact with segment tags now that we know more.
      if (email) {
        try {
          const existing = await supaFetch(
            `crm_email_contacts?client_id=eq.${VTM_EMAIL_CLIENT_ID}&email=eq.${encodeURIComponent(email)}&select=id,tags&limit=1`
          ).catch(() => []);
          if (existing && existing.length) {
            const add = [];
            if (full.revenue) add.push(`Revenue: ${full.revenue}`);
            if (full.ai_level) add.push(`AI Level: ${full.ai_level}`);
            const merged = Array.from(new Set([...(existing[0].tags || []), ...add]));
            await supaFetch(`crm_email_contacts?id=eq.${existing[0].id}`, {
              method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
              body: JSON.stringify({ tags: merged, updated_at: new Date().toISOString() }),
            });
          }
        } catch (e) { /* non-fatal */ }
      }
      return res.status(200).json({ success: true, stage: 'complete', results });
    }

    // ── stage "checkin": validate contact, look them up, log attendance ────
    if (!name) return res.status(400).json({ error: 'Name required' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
    if (phoneDigits.length < 7) return res.status(400).json({ error: 'Valid phone required' });

    // Are they already on our list? Match by email, or by exact phone.
    let known = false;
    let contactId = null;
    let contactTags = [];
    try {
      const orFilter = `or=(email.eq.${encodeURIComponent(email)}${phoneRaw ? `,phone.eq.${encodeURIComponent(phoneRaw)}` : ''})`;
      const found = await supaFetch(
        `crm_email_contacts?client_id=eq.${VTM_EMAIL_CLIENT_ID}&${orFilter}&select=id,tags&limit=1`
      ).catch(() => []);
      if (found && found.length) {
        known = true;
        contactId = found[0].id;
        contactTags = found[0].tags || [];
      }
    } catch (e) {
      console.error('contact lookup failed:', e.message);
    }

    // Log the attendance row (saves who + when for everyone).
    try {
      const rows = await supaFetch('event_checkins', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          event_slug: EVENT_SLUG,
          event_name: eventName,
          name, email, phone: phoneRaw,
          attendee_type: known ? 'existing' : 'new',
          survey_completed: false,
          contact_id: contactId,
          source,
        }),
      });
      checkinId = rows?.[0]?.id || null;
      results.checkin = checkinId ? 'logged' : 'error';
    } catch (e) {
      console.error('event_checkins insert failed:', e.message);
      results.checkin = 'error';
    }

    // Upsert the contact: tag existing folks as attended; add new folks to the list.
    const attendedTags = ['in-person', 'meetup', `Attended: ${eventName}`];
    try {
      if (known && contactId) {
        const merged = Array.from(new Set([...contactTags, ...attendedTags]));
        await supaFetch(`crm_email_contacts?id=eq.${contactId}`, {
          method: 'PATCH', headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            name: name || undefined,
            phone: phoneRaw || undefined,
            tags: merged,
            updated_at: new Date().toISOString(),
          }),
        });
        results.contact = 'updated';
      } else {
        await supaFetch('crm_email_contacts', {
          method: 'POST', headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            client_id: VTM_EMAIL_CLIENT_ID,
            email, name, phone: phoneRaw,
            tags: attendedTags,
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

    return res.status(200).json({ success: true, stage: 'checkin', known, checkin_id: checkinId, results });
  } catch (e) {
    console.error('checkin handler error:', e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
