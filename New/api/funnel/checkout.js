// POST /api/funnel/checkout
// Body: { product: 'tripwire', bump?: boolean, email?: string }
// Returns: { url, session_id }
//
// One-time (mode:'payment') Stripe Checkout for the CRM tripwire ($17 repo)
// plus the optional $9 "Deploy It Live" order bump. Prices are inline via
// price_data so there is nothing to create in the Stripe dashboard.
//
// The card is saved off-session (setup_future_usage) so the next page can
// one-click charge the $297 CRM Lab annual upsell with no card re-entry.

import { setCors } from '../_lib/supabase.js';
import { createCheckoutSession } from '../_lib/stripe.js';

const APP_URL = (process.env.FUNNEL_DOMAIN || 'https://vernontm.com').replace(/\/$/, '');

const TRIPWIRE = {
  cents: 1700, // $17
  name: 'The CRM Build (full repo)',
  desc: 'The complete GitHub repo for the CRM built from scratch with AI. Clone it and own it.',
};
const BUMP = {
  cents: 900, // $9
  name: 'The Context File (for Claude)',
  desc: 'The exact context file that teaches Claude how the CRM was built. Drop it into Claude and it walks you through every step to the same outcome.',
};

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    if ((body.product || '') !== 'tripwire') {
      return res.status(400).json({ error: 'Unknown product' });
    }
    const wantBump = !!body.bump;
    const email = (body.email || '').toString().trim().toLowerCase() || undefined;

    const line_items = [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: TRIPWIRE.name, description: TRIPWIRE.desc },
          unit_amount: TRIPWIRE.cents,
        },
        quantity: 1,
      },
    ];
    if (wantBump) {
      line_items.push({
        price_data: {
          currency: 'usd',
          product_data: { name: BUMP.name, description: BUMP.desc },
          unit_amount: BUMP.cents,
        },
        quantity: 1,
      });
    }

    const checkoutBody = {
      mode: 'payment',
      line_items,
      success_url: `${APP_URL}/crm-lab?session={CHECKOUT_SESSION_ID}&bump=${wantBump ? 1 : 0}`,
      cancel_url: `${APP_URL}/crm-build`,
      allow_promotion_codes: false,
      // Save the card for the one-click OTO on /crm-lab.
      payment_intent_data: { setup_future_usage: 'off_session' },
      customer_creation: 'always',
      metadata: { funnel_product: 'tripwire', bump: wantBump ? '1' : '0', source: 'funnel', email: email || '' },
    };
    if (email) checkoutBody.customer_email = email;

    const session = await createCheckoutSession(checkoutBody, {
      idempotencyKey: `crm-tw-${wantBump ? 'b' : 'n'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });

    return res.status(200).json({ url: session.url, session_id: session.id });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}
