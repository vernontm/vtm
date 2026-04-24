const { setCors, supaFetch } = require('../_lib/supabase.js');
const crypto = require('crypto');

// Resend webhook handler.
// Configure in Resend dashboard → Webhooks → Add endpoint:
//   URL: https://www.vernontm.com/api/crm/resend-webhook
//   Events: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
// Optional: set RESEND_WEBHOOK_SECRET env var to enable Svix signature verification.

function verifySvix(req, rawBody, secret) {
  if (!secret) return true;
  const id = req.headers['svix-id'];
  const ts = req.headers['svix-timestamp'];
  const sig = req.headers['svix-signature'];
  if (!id || !ts || !sig) return false;
  const payload = `${id}.${ts}.${rawBody}`;
  const secretBytes = Buffer.from(secret.split('_')[1] || secret, 'base64');
  const expected = crypto.createHmac('sha256', secretBytes).update(payload).digest('base64');
  return sig.split(' ').some(s => s.split(',')[1] === expected);
}

async function readRawBody(req) {
  if (req.body && typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.json({ ok: true, msg: 'Resend webhook endpoint ready' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rawBody = await readRawBody(req);
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (secret && !verifySvix(req, rawBody, secret)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    let event;
    try { event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody; }
    catch { return res.status(400).json({ error: 'Invalid JSON' }); }

    const type = event.type || '';
    const data = event.data || {};
    const emailId = data.email_id || data.id;
    const createdAt = event.created_at || new Date().toISOString();
    if (!emailId) return res.json({ ok: true, skipped: 'no email_id' });

    // Determine which field to update
    let sendUpdate = null;
    if (type === 'email.opened') sendUpdate = { opened_at: createdAt };
    else if (type === 'email.clicked') sendUpdate = { clicked_at: createdAt };
    else if (type === 'email.delivered') sendUpdate = { status: 'delivered', delivered_at: createdAt };
    else if (type === 'email.bounced') sendUpdate = { status: 'bounced', error: JSON.stringify(data.bounce || data.reason || 'bounced').slice(0, 500) };
    else if (type === 'email.complained') sendUpdate = { status: 'complained' };

    if (!sendUpdate) return res.json({ ok: true, skipped: `unhandled ${type}` });

    const results = { campaign_updated: 0, sequence_updated: 0 };

    // ── Update campaign send ──
    try {
      const sendRows = await supaFetch(`crm_email_sends?resend_id=eq.${emailId}&limit=1`);
      const send = sendRows?.[0];
      if (send) {
        // Only set opened_at if not already set (first-open semantics)
        const patch = { ...sendUpdate };
        if (patch.opened_at && send.opened_at) delete patch.opened_at;
        if (Object.keys(patch).length) {
          await supaFetch(`crm_email_sends?id=eq.${send.id}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          });
          results.campaign_updated++;

          // Increment campaign opened_count / clicked_count on first-time events
          if (type === 'email.opened' && !send.opened_at && send.campaign_id) {
            const camps = await supaFetch(`crm_email_campaigns?id=eq.${send.campaign_id}&select=opened_count`);
            const camp = camps?.[0];
            if (camp) {
              await supaFetch(`crm_email_campaigns?id=eq.${send.campaign_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ opened_count: (camp.opened_count || 0) + 1 }),
              });
            }
          } else if (type === 'email.clicked' && !send.clicked_at && send.campaign_id) {
            const camps = await supaFetch(`crm_email_campaigns?id=eq.${send.campaign_id}&select=clicked_count`);
            const camp = camps?.[0];
            if (camp) {
              await supaFetch(`crm_email_campaigns?id=eq.${send.campaign_id}`, {
                method: 'PATCH',
                body: JSON.stringify({ clicked_count: (camp.clicked_count || 0) + 1 }),
              });
            }
          }
        }
      }
    } catch (e) { console.error('campaign send update failed:', e.message); }

    // ── Update sequence send ──
    try {
      const seqRows = await supaFetch(`crm_email_sequence_sends?resend_id=eq.${emailId}&limit=1`);
      const seqSend = seqRows?.[0];
      if (seqSend) {
        const patch = { ...sendUpdate };
        if (patch.opened_at && seqSend.opened_at) delete patch.opened_at;
        if (patch.clicked_at && seqSend.clicked_at) delete patch.clicked_at;
        if (Object.keys(patch).length) {
          await supaFetch(`crm_email_sequence_sends?id=eq.${seqSend.id}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          });
          results.sequence_updated++;
        }
        // If bounced/complained, mark enrollment as unsubscribed so we don't keep sending
        if ((type === 'email.bounced' || type === 'email.complained') && seqSend.contact_id && seqSend.sequence_id) {
          await supaFetch(`crm_email_sequence_enrollments?sequence_id=eq.${seqSend.sequence_id}&contact_id=eq.${seqSend.contact_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'unsubscribed' }),
          });
        }
      }
    } catch (e) { console.error('sequence send update failed:', e.message); }

    // If bounced or complained, also mark the contact
    if (type === 'email.bounced' || type === 'email.complained') {
      try {
        const toEmail = Array.isArray(data.to) ? data.to[0] : data.to;
        if (toEmail) {
          await supaFetch(`crm_email_contacts?email=eq.${encodeURIComponent(toEmail.toLowerCase())}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: type === 'email.bounced' ? 'bounced' : 'unsubscribed' }),
          });
        }
      } catch (e) { console.error('contact status update failed:', e.message); }
    }

    return res.json({ ok: true, type, email_id: emailId, ...results });
  } catch (err) {
    console.error('Resend webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
