const { setCors, supaFetch } = require('./_lib/supabase.js');
const { normalizePhone } = require('./_lib/twilio.js');

// Public: a client opts in to SMS from Vernon Tech & Media on the vernontm.com
// consent page. Stores the opt-in with the verbatim consent language + metadata
// for TCPA records. No auth. Records are the consent evidence for A2P.
const DEFAULT_CONSENT =
  'I agree to receive account, project, and appointment text messages from Vernon Tech & Media. ' +
  'Recurring messages, up to about 6 per month. Msg & data rates may apply. Reply STOP to opt out, HELP for help.';

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const name = String(body.name || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().slice(0, 200);
    const phone = normalizePhone(body.phone);
    const consentText = String(body.consentText || '').slice(0, 1000) || DEFAULT_CONSENT;

    if (!phone) return res.status(400).json({ error: 'Please enter a valid mobile number.' });
    if (!body.consent) return res.status(400).json({ error: 'Please check the box to opt in.' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;
    const ua = String(req.headers['user-agent'] || '').slice(0, 300);

    await supaFetch('crm_sms_consent', {
      method: 'POST',
      body: JSON.stringify({
        name: name || null,
        phone,
        email: email || null,
        consent_text: consentText,
        source: String(body.source || 'sms-consent-page').slice(0, 60),
        ip,
        user_agent: ua,
      }),
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Could not save. Please try again.' });
  }
};
