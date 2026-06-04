// POST /api/funnel/oto
// Body: { session: <tripwire stripe session id> }
// Returns: { ok, redirect } or { ok:false, requires_checkout, fallback_url }
//
// One-click OTO: the visitor just bought the tripwire (card saved off-session).
// Clicking "Yes" charges $297 for the CRM Lab founding annual against that same
// card, off-session, with no re-entry. 3DS-required cards fall back to a fresh
// Stripe Checkout pre-bound to the customer. Idempotent on the session id so a
// double-click never double-charges.
//
// Note: this charges the founding year as a single $297 payment. True annual
// auto-renew (a Stripe subscription) is a documented follow-up — see FUNNEL_SETUP.md.

import { setCors } from '../_lib/supabase.js';
import { call, createCheckoutSession, retrieveSession } from '../_lib/stripe.js';
import { tagContact } from '../_lib/funnel.js';

const APP_URL = (process.env.FUNNEL_DOMAIN || 'https://vernontm.com').replace(/\/$/, '');

const OTO = {
  cents: 29700, // $297 — CRM Lab founding annual
  name: 'CRM Lab — Founding Annual',
  desc: 'A full year inside CRM Lab: deploy the build and wire in Gmail, AI, voice calling, and every feature, with live help. Founding rate locked.',
};

function fallbackCheckout(customerId, sessionId, email) {
  const body = {
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: OTO.name, description: OTO.desc },
        unit_amount: OTO.cents,
      },
      quantity: 1,
    }],
    success_url: `${APP_URL}/crm-welcome?product=crm-lab&upgraded=1&session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/crm-welcome?product=crm-build&session=${encodeURIComponent(sessionId)}`,
    metadata: { funnel_product: 'oto', source: 'funnel_oto_fallback', oto_from_session: sessionId, email: email || '' },
  };
  if (customerId) body.customer = customerId;
  return createCheckoutSession(body, { idempotencyKey: `crm-oto-fb-${sessionId}` });
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sessionId = ((req.body || {}).session || '').toString();
    if (!sessionId.startsWith('cs_')) {
      return res.status(400).json({ error: 'Missing or invalid session id.' });
    }

    const session = await retrieveSession(sessionId, ['payment_intent', 'payment_intent.payment_method']);
    if (session.metadata?.funnel_product !== 'tripwire') {
      return res.status(400).json({ error: 'This upgrade is only available right after the CRM Build purchase.' });
    }
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'The original payment is not complete yet. Please refresh in a moment.' });
    }

    const customerId = session.customer;
    const email = (session.customer_details?.email || session.metadata?.email || '').toLowerCase();
    const paymentMethodId = session.payment_intent?.payment_method?.id || session.payment_intent?.payment_method;

    if (!customerId || !paymentMethodId) {
      const fb = await fallbackCheckout(customerId, sessionId, email);
      return res.status(200).json({ ok: false, requires_checkout: true, fallback_url: fb.url });
    }

    let pi;
    try {
      pi = await call('POST', '/payment_intents', {
        amount: OTO.cents,
        currency: 'usd',
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: OTO.name,
        metadata: { funnel_product: 'oto', source: 'funnel_oto', oto_from_session: sessionId, email },
      }, { idempotencyKey: `crm-oto-${sessionId}` });
    } catch (err) {
      const code = err?.data?.error?.code;
      if (code === 'authentication_required' || code === 'requires_action' || err?.status === 402) {
        const fb = await fallbackCheckout(customerId, sessionId, email);
        return res.status(200).json({ ok: false, requires_checkout: true, fallback_url: fb.url });
      }
      throw err;
    }

    if (pi.status === 'requires_action' || pi.status === 'requires_payment_method') {
      const fb = await fallbackCheckout(customerId, sessionId, email);
      return res.status(200).json({ ok: false, requires_checkout: true, fallback_url: fb.url });
    }

    // Tag immediately (webhook also tags as the durable record).
    if (email) tagContact({ email, addTags: ['buyer:crm-lab', 'crm-lab:annual'] }).catch(() => {});

    return res.status(200).json({
      ok: true,
      redirect: `/crm-welcome?product=crm-lab&upgraded=1&session=${encodeURIComponent(sessionId)}`,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Charge failed.' });
  }
}
