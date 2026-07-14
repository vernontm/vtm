import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';
import stripe from '../_lib/stripe.js';

const { call } = stripe;

// Create + send ONE combined Stripe invoice for a whole Deal: a line item per
// project (one-time value), plus a single monthly subscription carrying a
// recurring line per project. So a client with two projects gets one bill.
export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id } = req.query; // deal id
  if (!id) return res.status(400).json({ error: 'deal id required' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [deal] = await supaFetch(`crm_deals?id=eq.${id}`);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const projects = await supaFetch(`crm_projects?deal_id=eq.${id}&select=id,name,value,recurring_amount,billing_type`);
    if (!projects || !projects.length) return res.status(400).json({ error: 'This deal has no projects to invoice.' });

    // Billing email: from the request or the client on the deal.
    let email = (req.body?.email || '').trim();
    let name = (req.body?.name || deal.name || '').trim();
    if (!email && deal.client_id) {
      const [c] = await supaFetch(`crm_clients?id=eq.${deal.client_id}&select=contact_email,business_name`).catch(() => []);
      if (c) { email = c.contact_email || ''; name = name || c.business_name || ''; }
    }
    if (!email) return res.status(400).json({ error: 'A billing email is required (add a contact email on the client, or enter one).' });

    const oneTimeItems = projects
      .filter(p => p.billing_type !== 'monthly' && Number(p.value) > 0)
      .map(p => ({ name: p.name || 'Project', amount: Math.round(Number(p.value) * 100) }));
    const recurringItems = projects
      .filter(p => p.billing_type !== 'one_time' && Number(p.recurring_amount) > 0)
      .map(p => ({ name: p.name || 'Project', amount: Math.round(Number(p.recurring_amount) * 100) }));

    if (!oneTimeItems.length && !recurringItems.length) {
      return res.status(400).json({ error: 'Set a price on the deal\'s projects before invoicing.' });
    }

    // ── Customer (reuse if already made for this deal) ────────────────────────
    let customerId = deal.stripe_customer_id;
    if (!customerId) {
      const cust = await call('POST', '/customers', { email, name: name || undefined, metadata: { deal_id: id } });
      customerId = cust.id;
    }

    const result = { invoiceUrl: null, invoiceId: null, subscriptionId: null };

    // ── One combined invoice, a line item per one-time project ────────────────
    if (oneTimeItems.length) {
      for (const item of oneTimeItems) {
        await call('POST', '/invoiceitems', {
          customer: customerId, amount: item.amount, currency: 'usd', description: item.name,
        });
      }
      let invoice = await call('POST', '/invoices', {
        customer: customerId, collection_method: 'send_invoice', days_until_due: 7,
        auto_advance: true, metadata: { deal_id: id },
      });
      invoice = await call('POST', `/invoices/${invoice.id}/finalize`, {});
      await call('POST', `/invoices/${invoice.id}/send`, {}).catch(() => {});
      result.invoiceUrl = invoice.hosted_invoice_url || null;
      result.invoiceId = invoice.id;
    }

    // ── One monthly subscription, a recurring line per project ────────────────
    if (recurringItems.length && !deal.stripe_subscription_id) {
      const items = [];
      for (const item of recurringItems) {
        const product = await call('POST', '/products', { name: `${item.name} — monthly` });
        const price = await call('POST', '/prices', {
          product: product.id, currency: 'usd', unit_amount: item.amount, recurring: { interval: 'month' },
        });
        items.push({ price: price.id });
      }
      const sub = await call('POST', '/subscriptions', {
        customer: customerId, items, collection_method: 'send_invoice', days_until_due: 7,
        metadata: { deal_id: id },
      });
      result.subscriptionId = sub.id;
    }

    await supaFetch(`crm_deals?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stripe_customer_id: customerId,
        stripe_invoice_id: result.invoiceId || deal.stripe_invoice_id || null,
        stripe_invoice_url: result.invoiceUrl || deal.stripe_invoice_url || null,
        stripe_subscription_id: result.subscriptionId || deal.stripe_subscription_id || null,
        invoice_status: 'sent',
        updated_at: new Date().toISOString(),
      }),
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('deal-invoice error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to create combined invoice' });
  }
}
