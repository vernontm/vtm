// Shared Twilio helper for the VTM CRM SMS feature. Uses the platform account
// (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) and sends through the VTM Client
// Messaging service (TWILIO_MESSAGING_SERVICE_SID) so traffic rides the approved
// A2P campaign. No SDK dependency: plain REST via fetch.
const crypto = require('crypto');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER; // fallback if no service SID

function twilioConfigured() {
  return !!(ACCOUNT_SID && AUTH_TOKEN && (MESSAGING_SERVICE_SID || FROM_NUMBER));
}

// Loose US phone normalization to E.164; returns null when hopeless.
function normalizePhone(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (/^\+1\d{10}$/.test(digits)) return digits;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  return null;
}

async function sendSms(to, body) {
  if (!twilioConfigured()) return { ok: false, error: 'twilio_not_configured' };
  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
  const form = new URLSearchParams({ To: to, Body: body });
  if (MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', MESSAGING_SERVICE_SID);
  else form.set('From', FROM_NUMBER);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.message || `twilio_${res.status}`, code: data.code };
  return { ok: true, sid: data.sid, status: data.status };
}

// Validate the X-Twilio-Signature header. `url` is the exact public URL Twilio
// was configured to call; `params` are the POSTed form fields (parsed). Twilio
// signs HMAC-SHA1 over url + each sorted key concatenated with its value.
function validateTwilioSignature(signature, url, params) {
  if (!AUTH_TOKEN || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', AUTH_TOKEN).update(Buffer.from(data, 'utf-8')).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = { twilioConfigured, normalizePhone, sendSms, validateTwilioSignature, MESSAGING_SERVICE_SID };
