const crypto = require('crypto');
const { setCors, requireCrmUser, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const { sendEmail } = require('../_lib/gmail.js');
const { normalizePhone } = require('../_lib/followups.js');
const { logNudge } = require('../_lib/nudges.js');
const stripe = require('../_lib/stripe.js');

// Read a client's agreements + payment schedule, and mint short-lived signed
// URLs to view the stored (private) signed PDF.
const SIGN_BASE = 'https://vernontm.com/sign?token=';

// Where sign.js stores the generated signed PDF. A copy signed on paper or in
// another tool lands in the same private bucket, so file_url keeps its
// "bucket/path" shape and action=file can mint a short-lived link for it.
const SIGNED_BUCKET = 'client-agreements';
const MAX_SIGNED_BYTES = 25 * 1024 * 1024;
const safeFileName = (n) => String(n || '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'signed-copy';
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Save an AI draft (agreement-ai.js generate output) as the client's agreement
// row, the same way agreement-ai.js approve does: a stale placeholder row
// (an empty custom-mode one left over from toggling the payment-plan option)
// is reused instead of duplicated. Returns the agreement id.
async function persistDraft(clientId, draft) {
  const payload = {
    client_id: clientId,
    title: 'Service Agreement: Vernon Tech & Media',
    total_amount: draft.total || null,
    status: 'approved',
    payment_mode: 'fixed',
    plan_options: null,
    terms: {
      summary: draft.summary || null,
      installments: Array.isArray(draft.installments) ? draft.installments : [],
      monthly: Array.isArray(draft.monthly) ? draft.monthly : [],
      agreement_markdown: draft.agreement_markdown || '',
      nda_markdown: draft.nda_markdown || '',
    },
  };
  const priorRows = await supaFetch(`crm_agreements?client_id=eq.${clientId}&status=neq.signed&order=created_at.desc&limit=1&select=id,terms`).catch(() => []);
  const prior = priorRows && priorRows[0];
  if (prior && !(prior.terms && prior.terms.agreement_markdown)) {
    await supaFetch(`crm_agreements?id=eq.${prior.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    await supaFetch(`crm_payments?agreement_id=eq.${prior.id}`, { method: 'DELETE' }).catch(() => {});
    return prior.id;
  }
  const rows = await supaFetch('crm_agreements', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
  return rows[0].id;
}

// Sending the link moves the lead to the "Contract Sent" column (unless already signed).
async function markContractSent(ag, clientId) {
  if (ag.status === 'signed' || !clientId) return;
  await supaFetch(`crm_clients?id=eq.${clientId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ lead_temperature: 'contract_sent', follow_up_status: 'contract_sent' }) }).catch(() => {});
}

// The money side of locking an agreement in: the payment schedule from its
// installments and a linked Deal on the pipeline. Both idempotent, so calling
// it twice never duplicates either. Shared by action=approve and
// action=upload-signed, so a paper signature builds the same schedule a
// signature taken on the platform does. Returns the deal id.
async function buildSchedule(ag) {
  const terms = ag.terms || {};
  const existing = await supaFetch(`crm_payments?agreement_id=eq.${ag.id}&select=id`);
  if ((!existing || !existing.length) && Array.isArray(terms.installments) && terms.installments.length) {
    const rows = terms.installments.map(i => ({
      client_id: ag.client_id,
      agreement_id: ag.id,
      label: i.label || null,
      amount: Number(i.amount) || 0,
      status: i.status === 'paid' ? 'paid' : 'pending',
      due_condition: i.trigger || null,
      source: 'agreement',
    }));
    await supaFetch('crm_payments', { method: 'POST', body: JSON.stringify(rows) });
  }

  let dealId = ag.deal_id || null;
  if (!dealId) {
    const monthly = Array.isArray(terms.monthly) && terms.monthly[0] ? terms.monthly[0] : null;
    const [deal] = await supaFetch('crm_deals', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        client_id: ag.client_id,
        name: ag.title || 'Service Agreement',
        value: Number(ag.total_amount) || null,
        stage: 'Proposal',
        payment_status: 'unpaid',
        amount_paid: 0,
        agreement_id: ag.id,
        notes: monthly ? `Recurring: $${monthly.amount}/mo, ${monthly.item || ''}`.trim().replace(/,$/, '') : null,
      }),
    });
    dealId = deal && deal.id;
    if (dealId) await supaFetch(`crm_agreements?id=eq.${ag.id}`, { method: 'PATCH', body: JSON.stringify({ deal_id: dealId }) });
  }
  return dealId;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { client_id, id, action } = req.query;

  try {
    if (req.method === 'GET') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const agreements = await supaFetch(`crm_agreements?client_id=eq.${client_id}&order=created_at.desc`);
      const payments = await supaFetch(`crm_payments?client_id=eq.${client_id}&order=created_at.asc`);
      return res.json({ agreements: agreements || [], payments: payments || [] });
    }

    // POST action=preview-token -> mint (or reuse) a sign token WITHOUT sending
    // or emailing, so the admin can open the real /sign screen in preview mode.
    if (req.method === 'POST' && action === 'preview-token') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const [ag] = await supaFetch(`crm_agreements?id=eq.${id}&select=id,sign_token`);
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      let token = ag.sign_token;
      if (!token) {
        token = crypto.randomUUID();
        await supaFetch(`crm_agreements?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ sign_token: token }) });
      }
      return res.json({ token });
    }

    // POST action=set-plans -> save the menu of payment plans offered to the
    // client (they pick one in the portal, which builds the real schedule).
    if (req.method === 'POST' && action === 'set-plans') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const { plan_options } = req.body || {};
      await supaFetch(`crm_agreements?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ plan_options: plan_options || [] }) });
      return res.json({ ok: true });
    }

    // POST action=custom-setup -> create/update a custom-payment-plan agreement
    // that holds the offered plans. The client picks one in the portal, which
    // then builds the real schedule + finalizes the document to sign.
    if (req.method === 'POST' && action === 'custom-setup') {
      const { client_id, total, maintenance, plan_options, agreement_markdown, nda_markdown, recap, features } = req.body || {};
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const existing = await supaFetch(`crm_agreements?client_id=eq.${client_id}&order=created_at.desc&limit=1&select=id,terms`);
      const row = existing && existing[0];
      const terms = {
        ...(row?.terms || {}),
        maintenance: Number(maintenance) || 0,
        recap: recap || (row?.terms?.recap) || '',
        features: Array.isArray(features) ? features : (row?.terms?.features || []),
        agreement_markdown: agreement_markdown || (row?.terms?.agreement_markdown) || '',
        nda_markdown: nda_markdown || (row?.terms?.nda_markdown) || '',
      };
      const patch = { total_amount: total || null, payment_mode: 'custom', plan_options: plan_options || [], selected_plan: null, terms };
      if (row) {
        // Reselecting plans clears any previously built schedule so the client re-picks.
        await supaFetch(`crm_payments?agreement_id=eq.${row.id}`, { method: 'DELETE' }).catch(() => {});
        await supaFetch(`crm_agreements?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        return res.json({ ok: true, agreement_id: row.id });
      }
      const created = await supaFetch('crm_agreements', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ client_id, title: 'Service Agreement: Vernon Tech & Media', status: 'draft', ...patch }),
      });
      return res.json({ ok: true, agreement_id: created[0]?.id });
    }

    // POST action=approve -> lock the draft in: create the payment schedule
    // from the agreement's installments and a linked Deal, so it shows on the
    // pipeline. Idempotent: it will not duplicate payments or the deal.
    // Takes ?id= (an existing row) or a body of { client_id, draft } (the
    // generate output), in which case the row is saved first (persistDraft)
    // and locked in the same call.
    if (req.method === 'POST' && action === 'approve') {
      const body = req.body || {};
      let agId = id || body.id || null;
      if (!agId && body.client_id && body.draft && typeof body.draft === 'object') agId = await persistDraft(body.client_id, body.draft);
      if (!agId) return res.status(400).json({ error: 'id required (or client_id and draft)' });
      const [ag] = await supaFetch(`crm_agreements?id=eq.${agId}&select=*`);
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      if (ag.status === 'signed') return res.json({ ok: true, alreadySigned: true, deal_id: ag.deal_id, agreement_id: agId });

      // 1) mark approved
      await supaFetch(`crm_agreements?id=eq.${agId}`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) });

      // 2) payment schedule from installments + 3) the linked Deal
      const dealId = await buildSchedule(ag);

      return res.json({ ok: true, status: 'approved', deal_id: dealId, agreement_id: agId });
    }

    // POST action=mark-sent -> make the agreement signable (status=sent, mint the
    // sign token) WITHOUT emailing, used when the personalized proposal email is
    // the delivery vehicle and already carries the sign link.
    if (req.method === 'POST' && action === 'mark-sent') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const [ag] = await supaFetch(`crm_agreements?id=eq.${id}&select=id,client_id,sign_token,status,sent_at`);
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      const signToken = ag.sign_token || crypto.randomUUID();
      const patch = { sign_token: signToken };
      if (ag.status !== 'signed') patch.status = 'sent';
      if (!ag.sent_at) patch.sent_at = new Date().toISOString();
      await supaFetch(`crm_agreements?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await markContractSent(ag, ag.client_id);
      return res.json({ ok: true, sign_token: signToken, link: `${SIGN_BASE}${signToken}` });
    }

    // POST action=start-maintenance -> begin the recurring maintenance subscription
    // on the client's saved card (used for pay-in-full / 50-50 plans, where there's
    // no build schedule to trail: Ray clicks this when the project is delivered).
    if (req.method === 'POST' && action === 'start-maintenance') {
      if (!id) return res.status(400).json({ error: 'id required' });
      if (!stripe.configured()) return res.status(500).json({ error: 'Stripe is not configured.' });
      const rows = await supaFetch(`crm_agreements?id=eq.${id}&select=*,client:crm_clients(id,business_name)`);
      const ag = rows && rows[0];
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      const maint = Number(ag.terms && ag.terms.maintenance) || 0;
      if (!maint) return res.status(400).json({ error: 'No maintenance fee on this agreement.' });
      if (ag.maintenance_subscription_id) return res.status(400).json({ error: 'Maintenance is already active.' });

      // Find the client's Stripe customer (from the deposit checkout) + a saved card.
      let dealId = ag.deal_id;
      if (!dealId) { const [d] = await supaFetch(`crm_deals?client_id=eq.${ag.client_id}&order=created_at.desc&limit=1&select=id`); dealId = d && d.id; }
      const [deal] = dealId ? await supaFetch(`crm_deals?id=eq.${dealId}&select=id,stripe_customer_id`) : [];
      const customerId = deal && deal.stripe_customer_id;
      if (!customerId) return res.status(400).json({ error: 'No card on file yet: the client must complete their deposit first.' });
      const pms = await stripe.call('GET', `/payment_methods?customer=${customerId}&type=card`).catch(() => null);
      const pmId = pms && pms.data && pms.data[0] && pms.data[0].id;

      const co = (ag.client && ag.client.business_name) || 'Client';
      const product = await stripe.call('POST', '/products', { name: `${co} maintenance` });
      const price = await stripe.call('POST', '/prices', { product: product.id, currency: 'usd', unit_amount: Math.round(maint * 100), recurring: { interval: 'month' } });
      const sub = await stripe.call('POST', '/subscriptions', {
        customer: customerId,
        items: [{ price: price.id }],
        ...(pmId ? { default_payment_method: pmId } : {}),
        metadata: { client_id: ag.client_id, agreement_id: ag.id, kind: 'maintenance' },
      });
      await supaFetch(`crm_agreements?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ maintenance_subscription_id: sub.id, maintenance_started_at: new Date().toISOString() }) });
      return res.json({ ok: true, subscription_id: sub.id });
    }

    // POST action=send -> mint a signing link, email + text it to the client
    if (req.method === 'POST' && action === 'send') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const rows = await supaFetch(`crm_agreements?id=eq.${id}&select=*,client:crm_clients(id,business_name,owner_name,contact_email,contact_phone)`);
      const ag = rows && rows[0];
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      const client = ag.client || {};
      if (!client.contact_email) return res.status(400).json({ error: 'Client has no email: add one on the client first.' });

      const signToken = ag.sign_token || crypto.randomUUID();
      await supaFetch(`crm_agreements?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sign_token: signToken, status: 'sent', sent_at: new Date().toISOString() }),
      });
      await markContractSent(ag, client.id || ag.client_id);
      const link = `${SIGN_BASE}${signToken}`;
      const first = (client.owner_name || 'there').split(' ')[0];

      try {
        await sendEmail({
          to: client.contact_email,
          subject: 'Your Vernon Tech & Media agreement, ready to sign',
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

    // POST action=text-sign-link -> queue an iMessage with the sign link to the
    // client's phone (the Mac bridge delivers it, same queue as nudges). Mints
    // the token and marks the agreement sent the way action=send does, minus
    // the email. Reply { ok, phone, link }.
    if (req.method === 'POST' && action === 'text-sign-link') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const rows = await supaFetch(`crm_agreements?id=eq.${id}&select=*,client:crm_clients(id,business_name,owner_name,contact_email,contact_phone)`);
      const ag = rows && rows[0];
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      const client = ag.client || {};
      const phone = normalizePhone(client.contact_phone);
      if (!phone) return res.status(400).json({ error: 'Client has no phone number: add one on the client first.' });
      if (ag.status === 'signed') return res.status(400).json({ error: 'This agreement is already signed.' });

      const signToken = ag.sign_token || crypto.randomUUID();
      await supaFetch(`crm_agreements?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sign_token: signToken, status: 'sent', sent_at: ag.sent_at || new Date().toISOString() }),
      });
      await markContractSent(ag, client.id || ag.client_id);
      const link = `${SIGN_BASE}${signToken}`;
      const first = (client.owner_name || 'there').split(' ')[0];
      const body = `Hi ${first}, your Vernon Tech & Media agreement is ready to sign: ${link}`;
      await supaFetch('crm_sms_messages', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ client_id: client.id || ag.client_id || null, direction: 'out', channel: 'imessage', phone, body, status: 'queued' }),
      });
      // Best effort: show it in the agreement's nudge history (needs crm_nudges).
      await logNudge({
        kind: 'agreement', target_id: ag.id, client_id: client.id || ag.client_id || null, channels: ['text'], message: body,
        sent_by: user.id, sent_by_name: (user.email || '').split('@')[0] || 'CRM', status: 'sent', sent_at: new Date().toISOString(),
      }).catch(() => {});
      return res.json({ ok: true, phone, link });
    }

    // POST action=signed-upload-url -> a signed spot in the private
    // client-agreements bucket for a copy the client signed on paper or in
    // another tool. Same two-step shape imessage.js uses for media: the phone
    // PUTs the bytes straight to storage, then calls action=upload-signed with
    // the file_url this returns. Nothing about the agreement changes yet.
    if (req.method === 'POST' && action === 'signed-upload-url') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const [ag] = await supaFetch(`crm_agreements?id=eq.${id}&select=id,client_id`);
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      const { name, size } = req.body || {};
      if (Number(size) > MAX_SIGNED_BYTES) return res.status(413).json({ error: 'File too large (max 25MB)' });

      // Contractor agreements carry no client, so they file under /contractors
      // exactly the way sign.js stores their generated PDF.
      const folder = ag.client_id || 'contractors';
      const path = `${folder}/uploaded-${ag.id}-${Date.now()}-${safeFileName(name)}`;
      const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${SIGNED_BUCKET}/${path}`, {
        method: 'POST',
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',   // storage rejects an empty body when the content type is JSON
      });
      if (!signRes.ok) return res.status(500).json({ error: `Could not sign upload: ${(await signRes.text()).slice(0, 200)}` });
      const signed = await signRes.json();
      const rel = signed.url || signed.signedURL || '';
      return res.json({
        ok: true,
        uploadUrl: rel.startsWith('http') ? rel : `${SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`,
        path,
        file_url: `${SIGNED_BUCKET}/${path}`,
      });
    }

    // POST action=upload-signed -> attach that uploaded copy and mark the
    // agreement genuinely signed, on the date Ray picked. It writes the same
    // fields sign.js writes (status, signed_at, signed_date, signer_name,
    // signature_method, file_url), so the money tiles, the activity feed and
    // the held-up detector all read it as signed. An agreement that was never
    // sent works too: there is no status gate, and a sign token is minted so
    // the pay link keeps working. Body:
    //   { file_url, name, mime, size, signed_on: 'YYYY-MM-DD', signer_name, note }
    if (req.method === 'POST' && action === 'upload-signed') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const body = req.body || {};
      const fileUrl = String(body.file_url || '').trim();
      if (!fileUrl.startsWith(`${SIGNED_BUCKET}/`) || fileUrl.includes('..')) {
        return res.status(400).json({ error: 'file_url required: upload the copy with action=signed-upload-url first.' });
      }
      const [ag] = await supaFetch(`crm_agreements?id=eq.${id}&select=*`);
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });

      const [cl] = ag.client_id
        ? (await supaFetch(`crm_clients?id=eq.${ag.client_id}&select=id,stage,owner_name,business_name`).catch(() => [])) || []
        : [];
      const nowIso = new Date().toISOString();
      const uploadedBy = user.email || 'CRM';
      const note = String(body.note || '').trim().slice(0, 500)
        || 'Signed outside the platform. A signed copy was uploaded from the app.';
      const record = {
        at: nowIso,                                  // when the copy was uploaded
        by: uploadedBy,                              // who uploaded it
        by_user_id: user.id || null,
        note,
        file_url: fileUrl,
        file_name: String(body.name || '').slice(0, 160) || null,
        mime: String(body.mime || '').slice(0, 80) || null,
        size: Number(body.size) || 0,
      };

      // Already signed on the platform: keep that signature and its audit
      // trail intact, just attach the copy Ray uploaded.
      if (ag.status === 'signed' || ag.signed_at) {
        await supaFetch(`crm_agreements?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ file_url: fileUrl, terms: { ...(ag.terms || {}), signed_outside: { ...record, signed_on: ag.signed_date || (ag.signed_at || nowIso).slice(0, 10) } } }),
        });
        return res.json({ ok: true, already_signed: true, agreement_id: ag.id, file_url: fileUrl });
      }

      // Noon UTC on the day Ray picked, so the date never reads a day early in
      // Central time the way a bare midnight timestamp does.
      const signedOn = isYmd(body.signed_on) ? body.signed_on : nowIso.slice(0, 10);
      const signedAt = new Date(`${signedOn}T12:00:00Z`).toISOString();
      const signerName = String(body.signer_name || '').trim().slice(0, 160)
        || (cl && (cl.owner_name || cl.business_name))
        || ((ag.terms && ag.terms.signer && ag.terms.signer.name) || '')
        || 'Client';
      const signToken = ag.sign_token || crypto.randomUUID();

      await supaFetch(`crm_agreements?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'signed',
          signed_at: signedAt,
          signed_date: signedOn,
          signer_name: signerName,
          signature_method: 'upload',
          file_url: fileUrl,
          sign_token: signToken,
          terms: { ...(ag.terms || {}), signed_outside: { ...record, signed_on: signedOn } },
        }),
      });

      // Signed is signed: move the lead off the follow-up drip. Stage only
      // advances a lead, so a client already in build or live is left alone.
      if (cl && cl.id) {
        const patch = { lead_temperature: 'won', follow_up_status: 'none' };
        if (!cl.stage || cl.stage === 'lead') patch.stage = 'onboarding';
        await supaFetch(`crm_clients?id=eq.${cl.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }).catch(() => {});
      }

      // Build the schedule and the deal the way approve does, so the money
      // tiles have something to show. Best effort: never lose the signature
      // over a pipeline row.
      let dealId = ag.deal_id || null;
      try { dealId = await buildSchedule(ag); }
      catch (e) { console.error('upload-signed schedule failed:', e.message); }

      return res.json({
        ok: true,
        agreement_id: ag.id,
        deal_id: dealId,
        agreement: {
          id: ag.id, status: 'signed', signed_at: signedAt, signed_date: signedOn,
          signer_name: signerName, signature_method: 'upload', file_url: fileUrl, sign_token: signToken,
        },
      });
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
