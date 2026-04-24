import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

  try {
    if (req.method === 'GET') {
      const rows = await supaFetch(`academy_profiles?id=eq.${user.id}&select=subscription_status,subscription_product_id,stripe_customer_id,subscription_id`);
      return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Profile not found' });
    }

    if (req.method === 'POST') {
      if (!STRIPE_KEY) return res.status(500).json({ error: 'Stripe not configured' });

      if (action === 'create-checkout') {
        const { price_id, success_url, cancel_url } = req.body;
        if (!price_id) return res.status(400).json({ error: 'price_id is required' });

        // Check if user already has a Stripe customer ID
        const profiles = await supaFetch(`academy_profiles?id=eq.${user.id}&select=stripe_customer_id`);
        const customerId = profiles[0]?.stripe_customer_id;

        const params = {
          'mode': 'subscription',
          'line_items[0][price]': price_id,
          'line_items[0][quantity]': '1',
          'success_url': success_url || `${req.headers.origin || 'https://vernontm.com'}/academy/account?success=true`,
          'cancel_url': cancel_url || `${req.headers.origin || 'https://vernontm.com'}/academy/account?canceled=true`,
          'client_reference_id': user.id,
          'customer_email': customerId ? undefined : user.email,
        };
        if (customerId) params['customer'] = customerId;

        // Remove undefined values
        Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(params).toString(),
        });
        const session = await stripeRes.json();
        if (!stripeRes.ok) return res.status(400).json({ error: session.error?.message || 'Stripe error' });
        return res.json({ url: session.url, session_id: session.id });
      }

      if (action === 'customer-portal') {
        const profiles = await supaFetch(`academy_profiles?id=eq.${user.id}&select=stripe_customer_id`);
        const customerId = profiles[0]?.stripe_customer_id;
        if (!customerId) return res.status(400).json({ error: 'No subscription found' });

        const stripeRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${STRIPE_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'customer': customerId,
            'return_url': `${req.headers.origin || 'https://vernontm.com'}/academy/account`,
          }).toString(),
        });
        const session = await stripeRes.json();
        if (!stripeRes.ok) return res.status(400).json({ error: session.error?.message || 'Stripe error' });
        return res.json({ url: session.url });
      }

      return res.status(400).json({ error: 'Invalid action. Use create-checkout or customer-portal.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy billing error:', err);
    return res.status(500).json({ error: err.message });
  }
}
