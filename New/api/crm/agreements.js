const crypto = require('crypto');
const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { sendEmail } = require('../_lib/gmail.js');

// Read a client's agreements + payment schedule, and mint short-lived signed
// URLs to view the stored (private) signed PDF.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { client_id, id, action } = req.query;

  try {
    if (req.method === 'GET') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const agreements = await supaFetch(`crm_agreements?client_id=eq.${client_id}&order=created_at.desc`);
      const payments = await supaFetch(`crm_payments?client_id=eq.${client_id}&order=created_at.asc`);
      return res.json({ agreements: agreements || [], payments: payments || [] });
    }

    // POST action=send -> mint a signing link, email + text it to the client
    if (req.method === 'POST' && action === 'send') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const rows = await supaFetch(`crm_agreements?id=eq.${id}&select=*,client:crm_clients(id,business_name,owner_name,contact_email,contact_phone)`);
      const ag = rows && rows[0];
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      const client = ag.client || {};
      if (!client.contact_email) return res.status(400).json({ error: 'Client has no email — add one on the client first.' });

      const signToken = ag.sign_token || crypto.randomUUID();
      await supaFetch(`crm_agreements?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sign_token: signToken, status: 'sent', sent_at: new Date().toISOString() }),
      });
      const link = `https://vernontm.com/sign?token=${signToken}`;
      const first = (client.owner_name || 'there').split(' ')[0];

      try {
        await sendEmail({
          to: client.contact_email,
          subject: 'Your Vernon Tech & Media agreement — ready to sign',
          body: `Hi ${first},\n\nYour service agreement with Vernon Tech & Media is ready. You can review and sign it here (no account needed):\n${link}\n\nOnce you sign, we'll get your project moving right away.\n\nThank you,\nRay\nVernon Tech & Media`,
        });
      } catch (e) { console.error('send email failed:', e.message); }

      if (client.contact_phone) {
        await supaFetch('crm_sms_queue', {
          method: 'POST',
          body: JSON.stringify({ client_id: client.id, phone: client.contact_phone, kind: 'sign_request',
            body: `Hi ${first}, your Vernon Tech & Media agreement is ready to sign: ${link}` }),
        }).catch(() => {});
      }
      return res.json({ ok: true, link });
    }

    // POST action=file -> signed URL for the stored PDF (file_url = "bucket/path")
    if (req.method === 'POST' && action === 'file') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const rows = await supaFetch(`crm_agreements?id=eq.${id}&select=file_url`);
      const fileUrl = rows && rows[0] && rows[0].file_url;
      if (!fileUrl) return res.status(404).json({ error: 'No file on this agreement' });
      const slash = fileUrl.indexOf('/');
      const bucket = fileUrl.slice(0, slash);
      const path = fileUrl.slice(slash + 1);
      const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
        method: 'POST',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 300 }),
      });
      if (!signRes.ok) throw new Error(`sign failed: ${await signRes.text()}`);
      const { signedURL } = await signRes.json();
      return res.json({ url: `${SUPABASE_URL}/storage/v1${signedURL}` });
    }

    // PATCH a payment's status (mark paid / pending)
    if (req.method === 'PATCH' && action === 'payment') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const status = (req.body && req.body.status) === 'paid' ? 'paid' : 'pending';
      const rows = await supaFetch(`crm_payments?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, paid_at: status === 'paid' ? new Date().toISOString() : null }),
      });
      return res.json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('agreements error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
