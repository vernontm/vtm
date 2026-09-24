const { supaFetch } = require('../_lib/supabase.js');
const { normalizePhone, validateTwilioSignature } = require('../_lib/twilio.js');

// Twilio inbound SMS webhook for the VTM 281 number. Public (no CRM auth):
// authenticated by the X-Twilio-Signature header. Logs the reply to
// crm_sms_messages and threads it to a client when the number matches. STOP/HELP
// are handled automatically by the messaging service's advanced opt-out, so we
// only record the message here. Set as the messaging service inbound URL.
const PUBLIC_URL = process.env.SMS_WEBHOOK_URL || 'https://vernontm.com/api/crm/sms-webhook';

module.exports = async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, msg: 'VTM SMS webhook ready' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const params = req.body && typeof req.body === 'object' ? req.body : {};
  const signature = req.headers['x-twilio-signature'] || '';
  if (!validateTwilioSignature(signature, PUBLIC_URL, params)) {
    return res.status(403).send('forbidden');
  }

  try {
    const from = normalizePhone(params.From);
    const text = String(params.Body || '').trim().slice(0, 1000);
    if (from) {
      // Thread to a known client by matching the last 10 digits of their phone.
      let clientId = null;
      try {
        const digits = from.replace(/\D/g, '').slice(-10);
        const clients = await supaFetch('crm_clients?select=id,contact_phone&contact_phone=not.is.null');
        const hit = (clients || []).find(
          (c) => String(c.contact_phone || '').replace(/\D/g, '').slice(-10) === digits
        );
        clientId = hit?.id || null;
      } catch {}

      await supaFetch('crm_sms_messages', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          direction: 'in',
          phone: from,
          body: text,
          twilio_sid: params.MessageSid || params.SmsSid || null,
          status: 'received',
        }),
      });
    }
  } catch (e) {
    // Never fail the webhook (Twilio retries non-2xx); just drop on error.
  }

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
};
