import crypto from 'crypto';
import { setCors, supaFetch } from '../_lib/supabase.js';

// Disable body parsing so we can verify the raw signature
export const config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [key, val] = item.split('=');
    parts[key] = val;
  }
  const timestamp = parts['t'];
  const signature = parts['v1'];
  if (!timestamp || !signature) return false;

  const payload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = await getRawBody(req);
    const sigHeader = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!verifyStripeSignature(rawBody.toString(), sigHeader, webhookSecret)) {
      console.error('Stripe webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString());
    console.log(`Stripe webhook received: ${event.type} (${event.id})`);

    // Idempotency check — skip if already processed
    try {
      const insertResult = await supaFetch('academy_stripe_events', {
        method: 'POST',
        body: JSON.stringify({ event_id: event.id, event_type: event.type, created_at: new Date().toISOString() }),
        headers: { 'Prefer': 'return=representation,resolution=ignore-duplicates' },
      });
      if (!insertResult || (Array.isArray(insertResult) && insertResult.length === 0)) {
        console.log(`Stripe event ${event.id} already processed, skipping`);
        return res.json({ received: true, skipped: true });
      }
    } catch {
      // If the table doesn't support ON CONFLICT, continue processing
    }

    const obj = event.data.object;

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const customerId = obj.customer;
        const profiles = await supaFetch(`academy_profiles?stripe_customer_id=eq.${customerId}&select=user_id`);
        if (profiles[0]) {
          await supaFetch(`academy_profiles?stripe_customer_id=eq.${customerId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              subscription_status: obj.status,
              stripe_subscription_id: obj.id,
              current_period_end: obj.current_period_end
                ? new Date(obj.current_period_end * 1000).toISOString()
                : null,
              updated_at: new Date().toISOString(),
            }),
          });
        }
        console.log(`Updated subscription for customer ${customerId}: ${obj.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const customerId = obj.customer;
        await supaFetch(`academy_profiles?stripe_customer_id=eq.${customerId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            subscription_status: 'canceled',
            current_period_end: obj.current_period_end
              ? new Date(obj.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => {});
        console.log(`Subscription canceled for customer ${customerId}`);
        break;
      }

      case 'checkout.session.completed': {
        const customerId = obj.customer;
        const customerEmail = obj.customer_email || obj.customer_details?.email;
        if (customerEmail) {
          // Try to find profile by email and update
          await supaFetch(`academy_profiles?email=eq.${customerEmail}`, {
            method: 'PATCH',
            body: JSON.stringify({
              stripe_customer_id: customerId,
              subscription_status: 'active',
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => {});
        }
        console.log(`Checkout completed for ${customerEmail}, customer ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
