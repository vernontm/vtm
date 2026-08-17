const { setCors, supaFetch } = require('../_lib/supabase.js');
const stripe = require('../_lib/stripe.js');

// Public, token-gated "pay your deposit" link. Safe to embed in reminder emails:
// the token is the agreement's unguessable sign_token. It finds the first
// outstanding payment and 302-redirects to a fresh Stripe Checkout. If nothing
// is owed (already paid), it sends them to their portal instead.
//   GET /api/crm/pay-deposit?token=<sign_token>
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const token = req.query?.token;
  const origin = (req.headers.origin || ('https://' + (req.headers.host || 'vernontm.com'))).replace(/\/+$/, '');
  const toPortal = () => { res.setHeader('Location', origin + '/client'); return res.status(302).end(); };
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const rows = await supaFetch(`crm_agreements?sign_token=eq.${encodeURIComponent(token)}&select=id,deal_id,client:crm_clients(id,business_name,contact_email)`);
    const ag = rows?.[0];
    const client = ag?.client;
    if (!ag || !client) return toPortal();

    // First outstanding payment (the deposit).
    const pays = await supaFetch(`crm_payments?agreement_id=eq.${ag.id}&status=eq.pending&order=created_at.asc&limit=1`);
    const dep = pays && pays[0];
    if (!dep || !(Number(dep.amount) > 0) || !stripe.configured()) return toPortal(); // nothing to pay

    // Reuse the deal's Stripe customer so the card can carry the recurring plan.
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
    res.setHeader('Location', session.url);
    return res.status(302).end();
  } catch (e) {
    console.error('pay-deposit error:', e.message);
    return toPortal();
  }
};
