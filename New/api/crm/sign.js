const { setCors, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { sendEmail } = require('../_lib/gmail.js');

// Frictionless, token-based e-signature. No login required to sign (protects
// conversion). AFTER signing we auto-provision a real client account and email
// a set-password link so ongoing portal access moves to a proper login.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_HOME = 'https://vernontm.com/client';

const adminHeaders = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function agreementForToken(token) {
  if (!token || !UUID_RE.test(token)) return null;
  const rows = await supaFetch(`crm_agreements?sign_token=eq.${token}&select=*,client:crm_clients(id,business_name,owner_name,contact_email,contact_phone,portal_user_id)`);
  return rows && rows[0] ? rows[0] : null;
}

async function provisionAccount(client) {
  const email = client.contact_email;
  if (!email) return { link: null, note: 'no email on file' };
  let userId = client.portal_user_id;

  if (!userId) {
    const cRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({
        email, email_confirm: true,
        user_metadata: { is_client: true, client_id: client.id, business_name: client.business_name },
      }),
    });
    if (cRes.ok) {
      const u = await cRes.json();
      userId = u.id;
      await supaFetch(`crm_clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ portal_user_id: userId }) });
    }
    // If create failed (user already exists), the recovery link below still works by email.
  }

  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ type: 'recovery', email, options: { redirect_to: CLIENT_HOME } }),
  });
  const data = await linkRes.json().catch(() => ({}));
  return { userId, link: data.action_link || data?.properties?.action_link || null };
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token } = req.query;

  try {
    const ag = await agreementForToken(token);
    if (!ag) return res.status(404).json({ error: 'Agreement not found' });
    const client = ag.client || {};
    const terms = ag.terms || {};

    // GET — load the document for signing
    if (req.method === 'GET') {
      return res.json({
        status: ag.signed_at ? 'signed' : 'sent',
        business_name: client.business_name,
        owner_name: client.owner_name,
        agreement_markdown: terms.agreement_markdown || '',
        nda_markdown: terms.nda_markdown || '',
        total: ag.total_amount,
        installments: terms.installments || [],
        signed_at: ag.signed_at,
        signer_name: ag.signer_name,
      });
    }

    // POST — capture signature, then provision the client's account
    if (req.method === 'POST') {
      if (ag.signed_at) return res.json({ ok: true, already: true });
      const body = req.body || {};
      const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').toString().split(',')[0].trim();
      const ua = (req.headers['user-agent'] || '').toString().slice(0, 400);
      const signerName = (body.typed_name || client.owner_name || '').toString().slice(0, 200);
      const method = body.signature_method === 'draw' ? 'draw' : 'type';

      await supaFetch(`crm_agreements?id=eq.${ag.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'signed', signed_at: new Date().toISOString(),
          signer_name: signerName, signer_ip: ip, signer_user_agent: ua,
          signature_method: method, signature_value: (body.signature_value || '').toString().slice(0, 200000),
          signed_date: new Date().toISOString().slice(0, 10),
        }),
      });

      // Provision the real account + set-password link
      const { link } = await provisionAccount(client);

      // Email the login link (via connected Gmail)
      if (link && client.contact_email) {
        const first = (client.owner_name || 'there').split(' ')[0];
        try {
          await sendEmail({
            to: client.contact_email,
            subject: 'Your Vernon Tech & Media client portal',
            body: `Hi ${first},\n\nThanks for signing — you're officially set up with Vernon Tech & Media.\n\nSet your password and log in to your client portal here:\n${link}\n\nInside you'll see everything we need from you and the status of your projects.\n\nTalk soon,\nRay\nVernon Tech & Media`,
          });
        } catch (e) { console.error('account email failed:', e.message); }
      }

      // Queue the text (iMessage path delivers it)
      if (link && client.contact_phone) {
        const first = (client.owner_name || 'there').split(' ')[0];
        await supaFetch('crm_sms_queue', {
          method: 'POST',
          body: JSON.stringify({
            client_id: client.id, phone: client.contact_phone, kind: 'portal_invite',
            body: `Hi ${first}, thanks for signing with Vernon Tech & Media! Set your password and log into your portal here: ${link}`,
          }),
        }).catch(() => {});
      }

      // Alert Ray
      await supaFetch('crm_client_alerts', {
        method: 'POST',
        body: JSON.stringify({ client_id: client.id, type: 'agreement_signed', message: `${client.business_name} signed the agreement` }),
      }).catch(() => {});

      return res.json({ ok: true, account: !!link });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('sign error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
