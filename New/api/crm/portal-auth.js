const { setCors, requireCrmUser, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const stripe = require('../_lib/stripe.js');

// Full client-portal API. The client logs in (Supabase auth); we resolve their
// client record via crm_clients.portal_user_id and scope everything to it:
// dashboard data, their onboarding checklist, the info/logins they submit, their
// signed documents, and their payment balance (incl. a pay-now checkout).
const CRED_KEY = process.env.CRM_CRED_KEY || process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Fields the client is allowed to edit on their own record.
const PROFILE_FIELDS = ['contact_phone', 'website_url', 'instagram', 'tiktok', 'facebook', 'youtube', 'linkedin'];

async function signedUrlFor(fileUrl, expiresIn = 604800) {
  if (!fileUrl || fileUrl.indexOf('/') === -1) return null;
  const i = fileUrl.indexOf('/');
  const bucket = fileUrl.slice(0, i), path = fileUrl.slice(i + 1);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { action } = req.query;

  // ── Stripe return (no auth — verified by the checkout session metadata) ──
  if (req.method === 'GET' && action === 'paid') {
    const origin = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
    try {
      const sid = req.query.session_id;
      if (sid) {
        const s = await stripe.retrieveSession(sid);
        const clientId = s && s.metadata && s.metadata.client_id;
        const pids = ((s && s.metadata && s.metadata.pids) || '').split(',').filter(Boolean);
        if (s && s.payment_status === 'paid' && clientId && pids.length) {
          for (const pid of pids) {
            await supaFetch(`crm_payments?id=eq.${pid}&client_id=eq.${clientId}`, {
              method: 'PATCH', body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString(), stripe_invoice_id: s.payment_intent || s.id }),
            }).catch(() => {});
          }
          await supaFetch('crm_client_alerts', { method: 'POST', body: JSON.stringify({ client_id: clientId, type: 'payment_received', message: `Portal payment received` }) }).catch(() => {});
        }
      }
    } catch (e) { console.error('portal paid:', e.message); }
    res.setHeader('Location', origin + '/client?paid=1');
    return res.status(302).end();
  }

  // ── Everything else is the authenticated client ──
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await supaFetch(`crm_clients?portal_user_id=eq.${user.id}&select=id,business_name,owner_name,contact_email,contact_phone,website_url,instagram,tiktok,facebook,youtube,linkedin,stage,payment_received`);
    const client = rows && rows[0];
    if (!client) return res.status(403).json({ error: 'No client workspace for this account' });

    // PATCH — toggle a checklist task (scoped)
    if (req.method === 'PATCH') {
      const { task_id } = req.query;
      if (!task_id) return res.status(400).json({ error: 'task_id required' });
      const status = (req.body && req.body.status) === 'done' ? 'done' : 'todo';
      const owned = await supaFetch(`crm_client_tasks?id=eq.${task_id}&client_id=eq.${client.id}&select=id,title,status`);
      if (!owned || owned.length === 0) return res.status(403).json({ error: 'Not your task' });
      const prev = owned[0];
      const r = await supaFetch(`crm_client_tasks?id=eq.${task_id}`, { method: 'PATCH', body: JSON.stringify({ status, completed_at: status === 'done' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }) });
      if (status === 'done' && prev.status !== 'done') {
        await supaFetch('crm_client_alerts', { method: 'POST', body: JSON.stringify({ client_id: client.id, task_id, type: 'task_completed', message: `${client.business_name} completed "${prev.title}"` }) }).catch(() => {});
      }
      return res.json(r[0]);
    }

    if (req.method === 'POST') {
      // Save social / website profile fields
      if (action === 'save-profile') {
        const patch = {};
        for (const f of PROFILE_FIELDS) if (Object.prototype.hasOwnProperty.call(req.body || {}, f)) patch[f] = req.body[f] || null;
        if (Object.keys(patch).length) { patch.updated_at = new Date().toISOString(); await supaFetch(`crm_clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); }
        return res.json({ ok: true });
      }
      // Add a login / access entry (encrypted at rest via pgcrypto RPC)
      if (action === 'add-credential') {
        const d = req.body || {};
        if (!d.label) return res.status(400).json({ error: 'label required' });
        const newId = await supaFetch('rpc/cred_upsert', {
          method: 'POST',
          body: JSON.stringify({ p_id: null, p_client_id: client.id, p_label: d.label, p_category: d.category || 'login', p_username: d.username || null, p_url: d.url || null, p_secret: d.secret || null, p_notes: d.notes || null, p_key: CRED_KEY }),
        });
        await supaFetch('crm_client_alerts', { method: 'POST', body: JSON.stringify({ client_id: client.id, type: 'access_submitted', message: `${client.business_name} added access: ${d.label}` }) }).catch(() => {});
        return res.status(201).json({ id: newId });
      }
      // Delete one of their credential entries (scoped)
      if (action === 'delete-credential') {
        const { cred_id } = req.query;
        if (!cred_id) return res.status(400).json({ error: 'cred_id required' });
        await supaFetch(`crm_client_credentials?id=eq.${cred_id}&client_id=eq.${client.id}`, { method: 'DELETE' });
        return res.json({ ok: true });
      }
      // Create a Stripe checkout to pay one installment or the whole balance
      if (action === 'pay') {
        if (!stripe.configured()) return res.status(500).json({ error: 'Payments are not enabled right now.' });
        const payments = await supaFetch(`crm_payments?client_id=eq.${client.id}&order=created_at.asc`);
        const pending = (payments || []).filter(p => p.status !== 'paid');
        const { payment_id, all } = req.body || {};
        const toPay = all ? pending : pending.filter(p => p.id === payment_id);
        if (!toPay.length) return res.status(400).json({ error: 'Nothing to pay.' });
        const amount = toPay.reduce((s, p) => s + Number(p.amount || 0), 0);
        if (amount <= 0) return res.status(400).json({ error: 'Nothing to pay.' });
        const origin = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
        const session = await stripe.createCheckoutSession({
          mode: 'payment',
          customer_email: client.contact_email || undefined,
          line_items: [{ price_data: { currency: 'usd', product_data: { name: (all ? 'Balance payment' : (toPay[0].label || 'Payment')) + ' — ' + client.business_name }, unit_amount: Math.round(amount * 100) }, quantity: 1 }],
          success_url: `${origin}/api/crm/portal-auth?action=paid&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/client`,
          metadata: { client_id: client.id, pids: toPay.map(p => p.id).join(','), kind: 'portal_payment' },
        });
        return res.json({ url: session.url });
      }
      return res.status(400).json({ error: 'Unknown action' });
    }

    // ── GET — the full dashboard payload ──
    const [tasks, platforms, agrRows, payments, creds] = await Promise.all([
      supaFetch(`crm_client_tasks?client_id=eq.${client.id}&select=id,title,description,category,status&order=created_at.asc`),
      supaFetch(`crm_client_platforms?client_id=eq.${client.id}&select=platform_name,access_status,access_process&order=created_at.asc`),
      supaFetch(`crm_agreements?client_id=eq.${client.id}&select=id,title,status,total_amount,signed_at,file_url,terms&order=created_at.desc&limit=1`),
      supaFetch(`crm_payments?client_id=eq.${client.id}&order=created_at.asc`),
      supaFetch('rpc/cred_list', { method: 'POST', body: JSON.stringify({ p_client_id: client.id, p_key: CRED_KEY }) }).catch(() => []),
    ]);

    const agreement = (agrRows && agrRows[0]) || null;
    const documents = [];
    if (agreement) {
      const url = agreement.file_url ? await signedUrlFor(agreement.file_url) : null;
      const hasNda = !!(agreement.terms && agreement.terms.nda_markdown);
      documents.push({ title: agreement.title || 'Service Agreement', status: agreement.status, signed_at: agreement.signed_at, url, has_nda: hasNda });
    }

    const pays = payments || [];
    const paid = pays.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
    const pending = pays.filter(p => p.status !== 'paid');
    const remaining = pending.reduce((s, p) => s + Number(p.amount || 0), 0);
    const summary = { total: paid + remaining, paid, remaining, remaining_count: pending.length, next: pending[0] || null };

    // Redact the stored secret value — the client sees their metadata, not the secret.
    const credentials = (creds || []).map(c => ({ id: c.id, label: c.label, category: c.category, username: c.username, url: c.url, notes: c.notes, has_secret: !!c.secret }));

    return res.json({
      client,
      tasks: tasks || [],
      platforms: platforms || [],
      credentials,
      documents,
      payments: pays.map(p => ({ id: p.id, label: p.label, amount: p.amount, status: p.status, due_condition: p.due_condition, paid_at: p.paid_at })),
      summary,
      agreement: agreement ? { title: agreement.title, status: agreement.status, signed_at: agreement.signed_at, total_amount: agreement.total_amount } : null,
    });
  } catch (err) {
    console.error('portal-auth error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
