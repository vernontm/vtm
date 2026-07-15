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

// Wrap paragraph strings (may contain <a> tags already) into a clean HTML email.
function emailHtml(paragraphs) {
  const body = (paragraphs || []).filter(Boolean)
    .map(p => `<p style="margin:0 0 14px;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d21">${p}</p>`).join('');
  return `<div style="max-width:520px;margin:0 auto;padding:10px 4px">${body}</div>`;
}

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

// After the deposit is paid, set up the recurring plan on the SAME saved card:
// a Stripe subscription schedule that bills the build installments monthly, a
// one-month free gap, then the ongoing maintenance. Fully guarded + idempotent
// (keyed on the deal's stripe_subscription_id) so it never breaks signing.
async function setupPlanSubscription(ag, client, session) {
  if (!stripe.configured() || !ag.deal_id) return null;
  const [deal] = await supaFetch(`crm_deals?id=eq.${ag.deal_id}&select=id,stripe_customer_id,stripe_subscription_id`);
  if (!deal || deal.stripe_subscription_id) return null; // already set up

  const terms = ag.terms || {};
  const installments = Array.isArray(terms.installments) ? terms.installments : [];
  const builds = installments.filter(i => !/deposit/i.test(i.label || ''));
  const buildAmt = builds.length ? Math.round(Number(builds[0].amount) * 100) : 0;
  const buildCount = builds.length;
  const maint = (Array.isArray(terms.monthly) && terms.monthly[0]) ? Math.round(Number(terms.monthly[0].amount) * 100) : 0;
  if (!buildAmt && !maint) return null;

  // Customer + saved card (from the deposit checkout).
  let customerId = deal.stripe_customer_id || (session && session.customer) || null;
  let pmId = null;
  if (session && session.payment_intent) {
    const pi = await stripe.call('GET', `/payment_intents/${session.payment_intent}`);
    pmId = pi.payment_method; if (!customerId) customerId = pi.customer;
  }
  if (!customerId) return null;
  if (pmId) await stripe.call('POST', `/customers/${customerId}`, { invoice_settings: { default_payment_method: pmId } }).catch(() => {});

  const mkPrice = async (amount, name) => {
    const product = await stripe.call('POST', '/products', { name });
    const price = await stripe.call('POST', '/prices', { product: product.id, currency: 'usd', unit_amount: amount, recurring: { interval: 'month' } });
    return price.id;
  };
  const co = client.business_name || 'Client';
  const phases = [];
  if (buildAmt && buildCount) phases.push({ items: [{ price: await mkPrice(buildAmt, `${co} — build plan`), quantity: 1 }], iterations: buildCount });
  // Maintenance begins right after the build installments finish (no gap month).
  if (maint) phases.push({ items: [{ price: await mkPrice(maint, `${co} — maintenance`), quantity: 1 }] });
  if (!phases.length) return null;

  const startTs = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // first build charge ~1 month after the deposit
  const sched = await stripe.call('POST', '/subscription_schedules', {
    customer: customerId,
    start_date: startTs,
    end_behavior: 'release',
    phases,
    metadata: { client_id: client.id, agreement_id: ag.id, deal_id: deal.id },
  });
  await supaFetch(`crm_deals?id=eq.${deal.id}`, { method: 'PATCH', body: JSON.stringify({ stripe_subscription_id: sched.subscription || sched.id }) }).catch(() => {});
  return sched.id;
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
            // Deposit's card is now saved → set up the recurring plan on it.
            try { await setupPlanSubscription(ag, client, session); } catch (e) { console.error('plan setup failed:', e.message); }
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
      // Track the first time the client actually opens the signing page (not a
      // preview, and only once it's been sent). Ray sees this on the Send step.
      if (req.query.preview !== '1' && ag.sent_at && !ag.opened_at) {
        await supaFetch(`crm_agreements?id=eq.${ag.id}`, { method: 'PATCH', body: JSON.stringify({ opened_at: new Date().toISOString() }) }).catch(() => {});
      }
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
        if (stripe.configured()) {
          const pays = await supaFetch(`crm_payments?agreement_id=eq.${ag.id}&status=eq.pending&order=created_at.asc&limit=1`);
          const dep = pays && pays[0];
          if (dep && Number(dep.amount) > 0) {
            // Ensure a Stripe customer so the deposit card can be reused for the
            // recurring plan (saved via setup_future_usage below).
            let customerId = null;
            try {
              const [dl] = ag.deal_id ? await supaFetch(`crm_deals?id=eq.${ag.deal_id}&select=stripe_customer_id`) : [];
              customerId = dl && dl.stripe_customer_id;
              if (!customerId) {
                const cust = await stripe.call('POST', '/customers', { email: client.contact_email || undefined, name: client.business_name || undefined, metadata: { client_id: client.id, agreement_id: ag.id } });
                customerId = cust.id;
                if (ag.deal_id) await supaFetch(`crm_deals?id=eq.${ag.deal_id}`, { method: 'PATCH', body: JSON.stringify({ stripe_customer_id: customerId }) }).catch(() => {});
              }
            } catch (e) { console.error('customer ensure failed:', e.message); }

            const session = await stripe.createCheckoutSession({
              mode: 'payment',
              customer: customerId || undefined,
              customer_email: customerId ? undefined : (client.contact_email || undefined),
              line_items: [{ price_data: { currency: 'usd', product_data: { name: `${dep.label} — ${client.business_name}` }, unit_amount: Math.round(Number(dep.amount) * 100) }, quantity: 1 }],
              success_url: `${origin}/api/crm/sign?action=paid&token=${token}&session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${origin}/client`,
              metadata: { crm_payment_id: dep.id, client_id: client.id, agreement_id: ag.id },
              payment_intent_data: { setup_future_usage: 'off_session', metadata: { crm_payment_id: dep.id, client_id: client.id } },
            });
            checkoutUrl = session.url;
          }
        }
      } catch (e) { console.error('checkout create failed:', e.message); }

      // Email the client their signed copy + portal pointer (NO one-time link —
      // email scanners pre-consume them; portal setup happens in-browser).
      if (client.contact_email) {
        const portalUrl = `${origin}/client`;
        // Plain-text fallback (full URLs) + a hyperlinked HTML version.
        const parts = [`Hi ${first},`, '', 'Thanks for signing your agreement with Vernon Tech & Media.'];
        if (pdfLink) parts.push('', `Your signed copy (PDF): ${pdfLink}`);
        parts.push('', `Your client portal: ${portalUrl}`, '', 'Talk soon,', 'Ray', 'Vernon Tech & Media');
        const html = emailHtml([
          `Hi ${first},`,
          'Thanks for signing your agreement with Vernon Tech &amp; Media.',
          pdfLink ? `<a href="${pdfLink}" style="color:#2563eb;font-weight:600">View your signed copy (PDF)</a>` : '',
          `<a href="${portalUrl}" style="color:#2563eb;font-weight:600">Go to your client portal</a>`,
          'Talk soon,<br>Ray<br>Vernon Tech &amp; Media',
        ]);
        try { await sendEmail({ to: client.contact_email, subject: 'Your signed Vernon Tech & Media agreement', body: parts.join('\n'), html }); }
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
