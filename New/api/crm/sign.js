const { setCors, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { sendEmail } = require('../_lib/gmail.js');
const { buildAgreementPdf } = require('../_lib/agreement-pdf.js');
const stripe = require('../_lib/stripe.js');

// Frictionless, token-based e-signature. No login required to sign (protects
// conversion). On finish we record both signatures + IP + timestamp, store the
// signed PDF on the client's file, email a copy to the client and Ray, then
// auto-provision a real client account and email a set-password link.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_HOME = 'https://vernontm.com/client';
const RAY_EMAIL = 'ray@vernontm.com';
const BUCKET = 'client-agreements';

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

// Mint a one-time set-password/login link. Each call is a fresh OTP.
async function recoveryLink(email, redirectTo) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ type: 'recovery', email, options: { redirect_to: redirectTo } }),
  });
  const d = await res.json().catch(() => ({}));
  return { link: d.action_link || (d.properties && d.properties.action_link) || null, userId: d.user_id || d.id || (d.user && d.user.id) || null };
}

// Ensure the client has an auth account and is linked to it. Returns a FRESH
// link intended for the in-browser redirect only (never emailed, so an email
// security scanner can't pre-consume its one-time token).
async function ensureAccount(client, redirectTo) {
  const email = client.contact_email;
  if (!email) return { userId: null, redirectLink: null };
  let userId = client.portal_user_id;
  if (!userId) {
    const cRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: adminHeaders,
      body: JSON.stringify({ email, email_confirm: true, user_metadata: { is_client: true, client_id: client.id, business_name: client.business_name } }),
    });
    if (cRes.ok) { const u = await cRes.json(); userId = u.id; }
  }
  const r = await recoveryLink(email, redirectTo); // resolves userId for existing accounts too
  if (!userId) userId = r.userId;
  if (userId && userId !== client.portal_user_id) {
    await supaFetch(`crm_clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ portal_user_id: userId }) }).catch(() => {});
  }
  return { userId, redirectLink: r.link };
}

async function uploadSignedPdf(clientId, agreementId, bytes) {
  try {
    const buf = Buffer.from(bytes);
    const path = `${clientId}/signed-agreement-${agreementId}.pdf`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
      body: buf,
    });
    if (!res.ok) { console.error('pdf upload failed:', await res.text()); return null; }
    return `${BUCKET}/${path}`;
  } catch (e) { console.error('pdf upload error:', e.message); return null; }
}

async function signedUrlFor(fileUrl, expiresIn = 604800) {
  const i = fileUrl.indexOf('/');
  const bucket = fileUrl.slice(0, i), path = fileUrl.slice(i + 1);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST', headers: adminHeaders, body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
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

    // GET action=paid — Stripe success return: mark the deposit paid, then
    // hand off to the portal with a FRESH single-use link (minted here, used
    // immediately, never emailed → no scanner/expiry issues).
    if (req.method === 'GET' && req.query.action === 'paid') {
      const origin = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
      let dest = origin + '/client';
      try {
        const sid = req.query.session_id;
        if (sid) {
          const session = await stripe.retrieveSession(sid);
          if (session && session.payment_status === 'paid') {
            const pid = session.metadata && session.metadata.crm_payment_id;
            if (pid) await supaFetch(`crm_payments?id=eq.${pid}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), stripe_invoice_id: session.payment_intent || session.id }) }).catch(() => {});
            // Deposit paid → this lead is now an active client.
            await supaFetch(`crm_clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ payment_received: true, initial_payment_at: new Date().toISOString(), stage: 'in_build' }) }).catch(() => {});
            await supaFetch('crm_client_alerts', { method: 'POST', body: JSON.stringify({ client_id: client.id, type: 'payment_received', message: `${client.business_name} paid their deposit` }) }).catch(() => {});
          }
        }
        if (client.contact_email) {
          const r = await recoveryLink(client.contact_email, origin + '/client');
          if (r.link) dest = r.link;
        }
      } catch (e) { console.error('paid handler:', e.message); }
      res.setHeader('Location', dest);
      return res.status(302).end();
    }

    // GET — load the documents for signing
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

    // POST — capture signatures, store PDF, email copies, provision account
    if (req.method === 'POST') {
      if (ag.signed_at) return res.json({ ok: true, already: true });
      // Only an agreement the admin has actually sent can be signed. This blocks
      // a preview token (minted before sending) from ever finalizing a signature.
      if (ag.status !== 'sent') return res.status(400).json({ error: 'This agreement is not open for signing yet.' });
      const body = req.body || {};
      if (!body.consent) return res.status(400).json({ error: 'Consent required' });

      const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').toString().split(',')[0].trim();
      const ua = (req.headers['user-agent'] || '').toString().slice(0, 400);
      const nowIso = new Date().toISOString();
      const aSig = body.agreement_signature || { method: body.signature_method, value: body.signature_value, name: body.typed_name };
      const nSig = body.nda_signature || null;
      const signerName = (aSig && aSig.name) || body.typed_name || client.owner_name || '';

      const newTerms = { ...terms, signatures: { agreement: aSig ? { ...aSig, at: nowIso } : null, nda: nSig ? { ...nSig, at: nowIso } : null, ip, user_agent: ua } };

      // Generate the signed PDF server-side (deterministic) and store it.
      let fileUrl = ag.file_url || null;
      try {
        const pdfBytes = await buildAgreementPdf({
          agreementMarkdown: terms.agreement_markdown,
          ndaMarkdown: terms.nda_markdown,
          ownerName: client.owner_name,
          signerName,
          signatureMethod: aSig && aSig.method,
          signatureValue: aSig && aSig.value,
          ndaSignatureMethod: nSig && nSig.method,
          ndaSignatureValue: nSig && nSig.value,
          signedDateLabel: new Date(nowIso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
          signedTimeLabel: new Date(nowIso).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
          signerIp: ip,
          documentId: ag.id,
        });
        const up = await uploadSignedPdf(client.id, ag.id, pdfBytes);
        if (up) fileUrl = up;
      } catch (e) { console.error('pdf build failed:', e.message); }

      await supaFetch(`crm_agreements?id=eq.${ag.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'signed', signed_at: nowIso, signed_date: nowIso.slice(0, 10),
          signer_name: signerName, signer_ip: ip, signer_user_agent: ua,
          signature_method: (aSig && aSig.method) || 'type',
          signature_value: (aSig && aSig.value) ? String(aSig.value).slice(0, 300000) : '',
          terms: newTerms,
          file_url: fileUrl,
        }),
      });

      // Copy of the signed agreement (link) for client + Ray.
      let pdfLink = null;
      if (fileUrl) pdfLink = await signedUrlFor(fileUrl).catch(() => null);

      // Provision the account. Build redirect_to from the domain the client
      // actually signed on (handles www vs non-www).
      const origin = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
      const redirectTo = origin + '/client';
      const { redirectLink } = await ensureAccount(client, redirectTo); // single recovery link (portal fallback)
      const first = (signerName || 'there').split(' ')[0];

      // First pending payment → Stripe Checkout for the deposit.
      let checkoutUrl = null;
      try {
        if (process.env.STRIPE_SECRET_KEY) {
          const pays = await supaFetch(`crm_payments?agreement_id=eq.${ag.id}&status=eq.pending&order=created_at.asc&limit=1`);
          const dep = pays && pays[0];
          if (dep && Number(dep.amount) > 0) {
            const session = await stripe.createCheckoutSession({
              mode: 'payment',
              customer_email: client.contact_email || undefined,
              line_items: [{ price_data: { currency: 'usd', product_data: { name: `${dep.label} — ${client.business_name}` }, unit_amount: Math.round(Number(dep.amount) * 100) }, quantity: 1 }],
              success_url: `${origin}/api/crm/sign?action=paid&token=${token}&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${origin}/client`,
              metadata: { crm_payment_id: dep.id, client_id: client.id, agreement_id: ag.id },
              payment_intent_data: { metadata: { crm_payment_id: dep.id, client_id: client.id } },
            });
            checkoutUrl = session.url;
          }
        }
      } catch (e) { console.error('checkout create failed:', e.message); }

      // Email the client their signed copy + portal pointer (NO one-time link —
      // email scanners pre-consume them; portal setup happens in-browser).
      if (client.contact_email) {
        const parts = [`Hi ${first},`, '', 'Thanks for signing your agreement with Vernon Tech & Media.'];
        if (pdfLink) parts.push('', `Your signed copy (PDF): ${pdfLink}`);
        parts.push('', `Your client portal: ${origin}/client`);
        parts.push('', 'Talk soon,', 'Ray', 'Vernon Tech & Media');
        try { await sendEmail({ to: client.contact_email, subject: 'Your signed Vernon Tech & Media agreement', body: parts.join('\n') }); }
        catch (e) { console.error('client email failed:', e.message); }
      }

      // Email Ray his copy.
      try {
        await sendEmail({
          to: RAY_EMAIL,
          subject: `Signed: ${client.business_name} — service agreement`,
          body: `${client.business_name} (${signerName}) just signed the service agreement.\n\nIP: ${ip}\nTime: ${nowIso}\n${pdfLink ? 'Signed copy: ' + pdfLink : '(PDF not generated)'}`,
        });
      } catch (e) { console.error('ray email failed:', e.message); }

      // Alert Ray in the CRM.
      await supaFetch('crm_client_alerts', {
        method: 'POST',
        body: JSON.stringify({ client_id: client.id, type: 'agreement_signed', message: `${client.business_name} signed the agreement` }),
      }).catch(() => {});

      return res.json({ ok: true, checkoutUrl, portalUrl: redirectLink || null, pdf: !!pdfLink });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('sign error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
