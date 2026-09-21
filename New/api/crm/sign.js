const { setCors, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { sendEmail } = require('../_lib/gmail.js');
const { buildDepositReminder } = require('../_lib/deposit-reminders.js');
const { buildAgreementPdf } = require('../_lib/agreement-pdf.js');
const stripe = require('../_lib/stripe.js');
const { pushEvent } = require('../_lib/push.js');

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

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

// Build the concrete payment-schedule markdown for a chosen plan, to fill the
// {{PAYMENT_SCHEDULE}} placeholder in a custom agreement.
function scheduleMarkdown(plan, maintenance) {
  const lines = [`**Build total: ${money(plan.grand_total)}**`, ''];
  lines.push(`- **Deposit (due upon signing):** ${money(plan.deposit)}`);
  (plan.installments || []).forEach(i => lines.push(`- **${i.label || i.trigger || 'Payment'}:** ${money(i.amount)}`));
  if (plan.finance_charge) lines.push('', `_Includes ${money(plan.finance_charge)} financing charge._`);
  if (maintenance > 0) lines.push('', `**Maintenance & Support: ${money(maintenance)}/month**, beginning the month after the final build payment and continuing monthly.`);
  lines.push('', 'The deposit is charged upon signing. Remaining payments are billed automatically to the card on file per the schedule above. All payments are authorized by the Client\'s signature and recurring-billing consent.');
  return lines.join('\n');
}

// Turn a chosen plan into the payment rows we bill: the deposit first (labeled so
// the subscription logic excludes it), then the remaining installments.
function planToInstallments(plan) {
  const rows = [{ label: 'Deposit', amount: plan.deposit, trigger: 'Due upon signing', status: 'pending' }];
  (plan.installments || []).forEach(i => rows.push({ label: i.label || 'Payment', amount: i.amount, trigger: i.trigger || i.label, status: 'pending' }));
  return rows;
}

// Wrap paragraph strings (may contain <a> tags already) into a clean HTML email.
function emailHtml(paragraphs) {
  const body = (paragraphs || []).filter(Boolean)
    .map(p => `<p style="margin:0 0 14px;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d21">${p}</p>`).join('');
  return `<div style="max-width:520px;margin:0 auto;padding:10px 4px">${body}</div>`;
}

// A contractor agreement carries no client record: the signer lives in
// terms.signer instead. Everything downstream of signing that presumes a client
// (portal account, payment rows, deposit reminders, pipeline stage, Stripe)
// must be skipped for these, which is what the branch in POST does.
function isContractor(ag) {
  return !ag.client_id && !!(ag.terms && ag.terms.signer && ag.terms.signer.kind === 'contractor');
}

// Initials for the AI-consent acknowledgment. Only letters count, so a suffix
// or punctuation in the signer's name ("John Smith Jr.", "Ray Vernon (Test)")
// cannot leak a stray character into the initials.
const initialsOf = (n) => String(n || '')
  .split(/\s+/)
  .map(w => (w.match(/[A-Za-z]/) || [''])[0])
  .filter(Boolean)
  .join('')
  .toUpperCase()
  .slice(0, 4);

// A contractor agreement can carry its document by reference instead of storing
// 50KB of contract text in a database column, so the authoritative text lives in
// version control under _lib/contracts and is reviewable in a diff. The ref is
// strictly allowlisted, so it can never escape that directory.
function markdownFor(terms) {
  if (terms && terms.agreement_markdown) return terms.agreement_markdown;
  const ref = terms && terms.markdown_ref;
  if (typeof ref === 'string' && /^[a-z0-9-]+$/.test(ref)) {
    try { return require('../_lib/contracts/' + ref + '.js'); }
    catch (e) { console.error('contract ref not resolvable:', ref, e.message); }
  }
  return '';
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
  if (!stripe.configured()) return null;
  const terms = ag.terms || {};
  const planKey = terms.plan_key || null;
  // Only monthly plans (and fixed-mode agreements, which have no plan_key)
  // auto-bill their build installments. Pay-in-full / 50-50 have no recurring
  // build charges — their remainder (if any) is settled via the portal. But
  // maintenance still runs on EVERY plan, starting after the last build payment.
  const autoBuild = !planKey || planKey === '20_3' || planKey === '20_6';

  // Resolve the deal (custom agreements aren't always linked — fall back to the
  // client's most recent deal) for storing the Stripe customer/subscription ids.
  let dealId = ag.deal_id;
  if (!dealId) { const [d] = await supaFetch(`crm_deals?client_id=eq.${client.id}&order=created_at.desc&limit=1&select=id`); dealId = d && d.id; }
  if (!dealId) return null;
  const [deal] = await supaFetch(`crm_deals?id=eq.${dealId}&select=id,stripe_customer_id,stripe_subscription_id`);
  if (!deal || deal.stripe_subscription_id) return null; // already set up

  const installments = Array.isArray(terms.installments) ? terms.installments : [];
  const builds = autoBuild ? installments.filter(i => !/deposit/i.test(i.label || '')) : [];
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
  // Maintenance auto-starts (right after the build installments) ONLY for plans
  // with a scheduled build (monthly plans + fixed mode). Pay-in-full / 50-50 have
  // no anchor, so Ray starts their maintenance manually when the project ships.
  if (maint && autoBuild) phases.push({ items: [{ price: await mkPrice(maint, `${co} — maintenance`), quantity: 1 }] });
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
    const agreementMd = markdownFor(terms);
    const contractor = isContractor(ag) ? (terms.signer || {}) : null;

    // GET action=paid — Stripe success return: mark the deposit paid, then
    // hand off to the portal with a FRESH single-use link (minted here, used
    // immediately, never emailed → no scanner/expiry issues).
    if (req.method === 'GET' && req.query.action === 'paid') {
      if (contractor) return res.status(400).json({ error: 'Not applicable to a contractor agreement.' });
      const origin = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
      let dest = origin + '/client';
      try {
        const sid = req.query.session_id;
        if (sid) {
          const session = await stripe.retrieveSession(sid);
          if (session && session.payment_status === 'paid') {
            const pid = session.metadata && session.metadata.crm_payment_id;
            if (pid) await supaFetch(`crm_payments?id=eq.${pid}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), stripe_invoice_id: session.payment_intent || session.id }) }).catch(() => {});
            pushEvent('paid', { title: 'Payment received 💰', body: `${client?.business_name || 'A client'} paid their deposit`, data: { type: 'paid', client_id: client?.id } }).catch(() => {});
            // Deposit paid → this lead is now an active client.
            await supaFetch(`crm_clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ payment_received: true, initial_payment_at: new Date().toISOString(), stage: 'in_build' }) }).catch(() => {});
            await supaFetch('crm_client_alerts', { method: 'POST', body: JSON.stringify({ client_id: client.id, type: 'payment_received', message: `${client.business_name} paid their deposit` }) }).catch(() => {});
            await supaFetch('crm_client_activity', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ client_id: client.id, type: 'note', tag: 'Payment', title: ag.selected_plan?.label ? `Deposit paid, on the ${ag.selected_plan.label} plan` : 'Deposit paid', body: 'Client paid the deposit and onboarding has started.', author: 'System' }) }).catch(() => {});
            // Deposit paid → the project starts. Stamp the start date (= pay date)
            // on this client's projects that don't have one yet.
            try {
              const today = new Date().toISOString().slice(0, 10);
              const paidAt = new Date().toISOString();
              if (ag.deal_id) {
                await supaFetch(`crm_projects?deal_id=eq.${ag.deal_id}&start_date=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ start_date: today, paid_at: paidAt }) }).catch(() => {});
              }
              await supaFetch(`crm_projects?client_id=eq.${client.id}&start_date=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ start_date: today, paid_at: paidAt }) }).catch(() => {});
            } catch (e) { console.error('project start-date stamp failed:', e.message); }
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

    // POST action=choose-plan — the client picks a payment plan (custom mode).
    // Builds the concrete schedule into the agreement, so they can then sign.
    if (req.method === 'POST' && req.query.action === 'choose-plan') {
      if (contractor) return res.status(400).json({ error: 'Not applicable to a contractor agreement.' });
      if (ag.payment_mode !== 'custom') return res.status(400).json({ error: 'This agreement has a fixed plan.' });
      const planKey = req.body && req.body.plan_key;
      const plan = (ag.plan_options || []).find(p => p.key === planKey);
      if (!plan) return res.status(400).json({ error: 'Pick a valid plan.' });

      const maintAmt = Number(terms.maintenance) || 0;
      const schedMd = scheduleMarkdown(plan, maintAmt);
      let md = agreementMd || '';
      md = md.includes('{{PAYMENT_SCHEDULE}}')
        ? md.replace('{{PAYMENT_SCHEDULE}}', schedMd)
        : `${md}\n\n## Payment Schedule\n${schedMd}`;
      const installments = planToInstallments(plan);
      const monthly = maintAmt > 0 ? [{ item: 'Maintenance & Support', amount: maintAmt }] : [];
      const newTerms = { ...terms, agreement_markdown: md, installments, monthly, plan_key: plan.key };

      await supaFetch(`crm_agreements?id=eq.${ag.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ terms: newTerms, total_amount: plan.grand_total, selected_plan: plan, plan_selected_at: new Date().toISOString() }),
      });
      // Rebuild the payment schedule rows for the chosen plan.
      await supaFetch(`crm_payments?agreement_id=eq.${ag.id}`, { method: 'DELETE' }).catch(() => {});
      await supaFetch('crm_payments', { method: 'POST', body: JSON.stringify(installments.map(i => ({ client_id: client.id, agreement_id: ag.id, label: i.label, amount: i.amount, status: 'pending', due_condition: i.trigger, source: 'agreement' }))) }).catch(() => {});
      await supaFetch('crm_client_alerts', { method: 'POST', body: JSON.stringify({ client_id: client.id, type: 'plan_selected', message: `${client.business_name} chose the "${plan.label}" plan` }) }).catch(() => {});
      // Log the chosen plan to the timeline so Ray can see which plan they picked.
      {
        const fmt = n => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
        const inst = plan.installments || [];
        await supaFetch('crm_client_activity', {
          method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            client_id: client.id, type: 'note', tag: 'Payment',
            title: `Chose the ${plan.label} plan`,
            body: `Deposit ${fmt(plan.deposit)} today${inst.length ? `, then ${inst.length} x ${fmt(inst[0].amount)}` : ''}. Total ${fmt(plan.grand_total)}.`,
            author: 'System',
          }),
        }).catch(() => {});
      }

      return res.json({ ok: true, agreement_markdown: md, nda_markdown: terms.nda_markdown || '', total: plan.grand_total, installments });
    }

    // GET — load the documents for signing
    if (req.method === 'GET') {
      // Track the first time the client actually opens the signing page (not a
      // preview, and only once it's been sent). Ray sees this on the Send step.
      if (req.query.preview !== '1' && ag.sent_at && !ag.opened_at) {
        await supaFetch(`crm_agreements?id=eq.${ag.id}`, { method: 'PATCH', body: JSON.stringify({ opened_at: new Date().toISOString() }) }).catch(() => {});
      }
      // Custom plan not chosen yet → the page shows a recap + the plan chooser.
      if (ag.payment_mode === 'custom' && !ag.selected_plan) {
        // Strip the schedule placeholder from the recap-facing agreement text.
        const scope = (agreementMd || '').replace('{{PAYMENT_SCHEDULE}}', '_(you choose your plan below)_');
        return res.json({
          status: ag.signed_at ? 'signed' : 'sent',
          needs_plan: true,
          plan_options: ag.plan_options || [],
          maintenance: Number(terms.maintenance) || 0,
          recap: terms.recap || '',
          features: Array.isArray(terms.features) ? terms.features : [],
          build_total: Number(ag.total_amount) || 0,
          agreement_markdown: scope,
          business_name: client.business_name,
          owner_name: client.owner_name,
        });
      }
      return res.json({
        status: ag.signed_at ? 'signed' : 'sent',
        kind: contractor ? 'contractor' : 'client',
        doc_title: ag.title || '',
        requires_ai_consent: !!terms.requires_ai_consent,
        business_name: contractor ? '' : client.business_name,
        owner_name: contractor ? (contractor.name || '') : client.owner_name,
        agreement_markdown: agreementMd || '',
        nda_markdown: terms.nda_markdown || '',
        total: contractor ? null : ag.total_amount,
        installments: contractor ? [] : (terms.installments || []),
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
      // A clause that needs its own acknowledgment (the AI and synthetic media
      // section) cannot be signed around.
      if (terms.requires_ai_consent && !body.ai_consent) {
        return res.status(400).json({ error: 'Please acknowledge the AI and synthetic media section to continue.' });
      }

      const ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').toString().split(',')[0].trim();
      const ua = (req.headers['user-agent'] || '').toString().slice(0, 400);
      const nowIso = new Date().toISOString();
      const aSig = body.agreement_signature || { method: body.signature_method, value: body.signature_value, name: body.typed_name };
      const nSig = body.nda_signature || null;
      const signerName = (aSig && aSig.name) || body.typed_name || (contractor ? contractor.name : client.owner_name) || '';

      const newTerms = { ...terms, signatures: { agreement: aSig ? { ...aSig, at: nowIso } : null, nda: nSig ? { ...nSig, at: nowIso } : null, ip, user_agent: ua, ai_consent: terms.requires_ai_consent ? { at: nowIso, ip, initials: initialsOf(signerName) } : null } };

      // Generate the signed PDF server-side (deterministic) and store it.
      const signedDateLabel = new Date(nowIso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const signedTimeLabel = new Date(nowIso).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

      let fileUrl = ag.file_url || null;
      try {
        const pdfBytes = await buildAgreementPdf({
          agreementMarkdown: agreementMd,
          ndaMarkdown: terms.nda_markdown,
          ownerName: contractor ? (contractor.name || signerName) : client.owner_name,
          signerName,
          signatureMethod: aSig && aSig.method,
          signatureValue: aSig && aSig.value,
          ndaSignatureMethod: nSig && nSig.method,
          ndaSignatureValue: nSig && nSig.value,
          signedDateLabel,
          signedTimeLabel,
          signerIp: ip,
          documentId: ag.id,
          aiConsent: terms.requires_ai_consent ? { initials: initialsOf(signerName), at: signedTimeLabel, ip } : null,
        });
        // Contractor PDFs have no client folder to live under.
        const up = await uploadSignedPdf(contractor ? 'contractors' : client.id, ag.id, pdfBytes);
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

      // ── Contractor agreements finish here ────────────────────────────────
      // There is no client record, so none of the client pipeline below applies:
      // no stage change, no payment rows, no deposit reminder drip, no portal
      // account, no Stripe checkout, and no client alert. Signature, audit trail,
      // stored PDF, and both email copies still happen.
      if (contractor) {
        pushEvent('signed', {
          title: 'Contractor agreement signed 🎉',
          body: `${signerName || 'A contractor'} signed ${ag.title || 'their agreement'}`,
          data: { type: 'signed', agreement_id: ag.id },
        }).catch(() => {});

        const pdfLink = fileUrl ? await signedUrlFor(fileUrl).catch(() => null) : null;
        const first = (signerName || 'there').split(' ')[0];

        if (contractor.email) {
          const parts = [`Hi ${first},`, '', 'Thanks for signing your agreement with Vernon Tech & Media.'];
          if (pdfLink) parts.push('', `Your signed copy (PDF): ${pdfLink}`);
          parts.push('', 'Keep this for your records. We will be in touch about scheduling.', '', 'Ray', 'Vernon Tech & Media');
          const html = emailHtml([
            `Hi ${first},`,
            'Thanks for signing your agreement with Vernon Tech &amp; Media.',
            pdfLink ? `<a href="${pdfLink}" style="color:#2563eb;font-weight:600">View your signed copy (PDF)</a>` : '',
            'Keep this for your records. We will be in touch about scheduling.',
            'Ray<br>Vernon Tech &amp; Media',
          ]);
          try { await sendEmail({ to: contractor.email, subject: 'Your signed Vernon Tech & Media agreement', body: parts.join('\n'), html }); }
          catch (e) { console.error('contractor email failed:', e.message); }
        }

        try {
          await sendEmail({
            to: RAY_EMAIL,
            subject: `Signed: ${signerName}, ${ag.title || 'contractor agreement'}`,
            body: `${signerName} just signed ${ag.title || 'their contractor agreement'}.\n\nIP: ${ip}\nTime: ${nowIso}\n${pdfLink ? 'Signed copy: ' + pdfLink : '(PDF not generated)'}`,
            html: emailHtml([
              `<strong>${signerName}</strong> just signed ${ag.title || 'their contractor agreement'}.`,
              pdfLink ? `<a href="${pdfLink}" style="color:#2563eb;font-weight:600">View the signed copy (PDF)</a>` : '(PDF not generated)',
              `<span style="color:#6b7280;font-size:13px">IP ${ip} \u00b7 ${nowIso}</span>`,
            ]),
          });
        } catch (e) { console.error('ray email failed:', e.message); }

        return res.json({ ok: true, pdf: !!pdfLink });
      }

      pushEvent('signed', { title: 'Agreement signed 🎉', body: `${client?.business_name || signerName || 'A client'} just signed${ag.total_amount ? ` · $${Number(ag.total_amount).toLocaleString()}` : ''}`, data: { type: 'signed', client_id: client?.id } }).catch(() => {});

      // Signed → they're now a Client (Onboarding). Marks the deal Won, stops the
      // follow-up drip, and moves them off the Leads board into Clients. Paying
      // the deposit later advances them to In Progress.
      await supaFetch(`crm_clients?id=eq.${client.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ lead_temperature: 'won', follow_up_status: 'none', stage: 'onboarding' }),
      }).catch(() => {});

      // Schedule the first "pay your deposit" reminder for later the same day.
      // The cron will keep reminding every 2-3 days and stop once they pay.
      if (client.contact_email && ag.sign_token) {
        try {
          const { subject, body } = buildDepositReminder(client, ag.sign_token, 1);
          const remindAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString(); // +3h, same day
          await supaFetch('crm_email_queue', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              lead_id: client.id, lead_name: client.owner_name || '',
              to_email: client.contact_email, email_type: 'deposit_reminder', followup_seq: 1,
              subject, body, status: 'scheduled', scheduled_for: remindAt,
              approved_at: nowIso, auto_generated: true,
            }),
          });
        } catch (e) { console.error('deposit reminder enqueue failed:', e.message); }
      }

      // Save a copy of the signed agreement to the client's Documents. Use the
      // durable token-gated file endpoint (not an expiring signed URL) so the
      // link keeps working from the Documents tab indefinitely.
      if (fileUrl && ag.sign_token) {
        try {
          const base = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
          await supaFetch('crm_client_activity', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              client_id: client.id, type: 'note', tag: 'Agreement',
              title: 'Signed agreement',
              body: `${signerName || 'The client'} signed the service agreement.`,
              attachment_url: `${base}/api/crm/agreement-file?token=${ag.sign_token}`,
              attachment_name: 'Signed Agreement.pdf',
              author: 'System', created_at: nowIso,
            }),
          });
        } catch (e) { console.error('doc log failed:', e.message); }
      }

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
      // If the agreement carries an explicit payment_link in its terms (e.g. a
      // Stripe Payment Link that lives on a DIFFERENT Stripe account), send the
      // client straight there and skip creating a Checkout Session on the VTM
      // account. Note: payments made this way are not auto-reconciled by our
      // webhook, so the payment row stays pending until marked paid.
      let checkoutUrl = null;
      const customPayLink = (ag.terms && typeof ag.terms.payment_link === 'string' && /^https:\/\//.test(ag.terms.payment_link))
        ? ag.terms.payment_link : null;
      if (customPayLink) checkoutUrl = customPayLink;
      try {
        if (!customPayLink && stripe.configured()) {
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

      // Email Ray his copy (hyperlinked signed copy, plain-text fallback).
      try {
        await sendEmail({
          to: RAY_EMAIL,
          subject: `Signed: ${client.business_name}, service agreement`,
          body: `${client.business_name} (${signerName}) just signed the service agreement.\n\nIP: ${ip}\nTime: ${nowIso}\n${pdfLink ? 'Signed copy: ' + pdfLink : '(PDF not generated)'}`,
          html: emailHtml([
            `<strong>${client.business_name}</strong> (${signerName}) just signed the service agreement.`,
            pdfLink ? `<a href="${pdfLink}" style="color:#2563eb;font-weight:600">View the signed copy (PDF)</a>` : '(PDF not generated)',
            `<span style="color:#6b7280;font-size:13px">IP ${ip} · ${nowIso}</span>`,
          ]),
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
