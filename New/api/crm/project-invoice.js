import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';
import stripe from '../_lib/stripe.js';

const { call } = stripe;

// Create + send a real Stripe invoice for a project, from its agreed price/terms.
// One-time value → a send_invoice Stripe Invoice (Stripe emails a hosted invoice).
// Recurring amount → a monthly Subscription billed by invoice. IDs + status are
// stored back on the project. This is "invoicing per project" — there is no
// standalone invoices page anymore.
export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'project id required' });

  try {
    const [project] = await supaFetch(`crm_projects?id=eq.${id}`);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Billing email: from the request (Ray confirms in the UI) or the linked client.
    let email = (req.body?.email || '').trim();
    let name = (req.body?.name || project.client || '').trim();
    if (!email && project.client_id) {
      const [c] = await supaFetch(`crm_clients?id=eq.${project.client_id}&select=contact_email,business_name,owner_name`).catch(() => []);
      if (c) { email = c.contact_email || ''; name = name || c.business_name || c.owner_name || ''; }
    }
    if (!email) return res.status(400).json({ error: 'A billing email is required (link a client with an email, or enter one).' });

    const oneTime = Number(project.billing_type === 'monthly' ? 0 : (project.value || 0));
    const monthly = Number(project.billing_type === 'one_time' ? 0 : (project.recurring_amount || 0));
    if (oneTime <= 0 && monthly <= 0) return res.status(400).json({ error: 'Set a price on this project before invoicing.' });

    // ── Customer (reuse if we already made one for this project) ──────────────
    let customerId = project.stripe_customer_id;
    if (!customerId) {
      const cust = await call('POST', '/customers', { email, name: name || undefined, metadata: { project_id: id } });
      customerId = cust.id;
    }

    const result = { invoiceUrl: null, subscriptionId: null };

    // ── One-time invoice (send_invoice → Stripe emails a hosted invoice) ──────
    if (oneTime > 0) {
      await call('POST', '/invoiceitems', {
        customer: customerId,
        amount: Math.round(oneTime * 100),
        currency: 'usd',
        description: `${project.name || 'Project'}${project.billing_type === 'hybrid' ? ' — upfront' : ''}`,
      });
      let invoice = await call('POST', '/invoices', {
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: 7,
        auto_advance: true,
        metadata: { project_id: id },
      });
      invoice = await call('POST', `/invoices/${invoice.id}/finalize`, {});
      await call('POST', `/invoices/${invoice.id}/send`, {}).catch(() => {});
      result.invoiceUrl = invoice.hosted_invoice_url || null;
      result.invoiceId = invoice.id;
    }

    // ── Recurring subscription (monthly, billed by invoice) ───────────────────
    if (monthly > 0 && !project.stripe_subscription_id) {
      const product = await call('POST', '/products', { name: `${project.name || 'Project'} — monthly` });
      const price = await call('POST', '/prices', {
        product: product.id, currency: 'usd', unit_amount: Math.round(monthly * 100),
        recurring: { interval: 'month' },
      });
      const sub = await call('POST', '/subscriptions', {
        customer: customerId,
        items: [{ price: price.id }],
        collection_method: 'send_invoice',
        days_until_due: 7,
        metadata: { project_id: id },
      });
      result.subscriptionId = sub.id;
    }

    await supaFetch(`crm_projects?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stripe_customer_id: customerId,
        stripe_invoice_id: result.invoiceId || project.stripe_invoice_id || null,
        stripe_invoice_url: result.invoiceUrl || project.stripe_invoice_url || null,
        stripe_subscription_id: result.subscriptionId || project.stripe_subscription_id || null,
        invoice_status: 'sent',
        updated_at: new Date().toISOString(),
      }),
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('project-invoice error:', err);
    return res.status(err.status || 500).json({ error: err.message || 'Failed to create invoice' });
  }
}
