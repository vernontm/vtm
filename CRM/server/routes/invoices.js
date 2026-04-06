const express = require('express');
const router = express.Router();
const { db, uuidv4, now } = require('../db');

// Lazy-initialize Stripe so the server boots even without a key
let stripe = null;
function getStripe() {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key || key.startsWith('sk_test_REPLACE')) {
      throw new Error('STRIPE_SECRET_KEY not configured. Add it to server/.env');
    }
    stripe = require('stripe')(key);
  }
  return stripe;
}

// ── GET /api/invoices?deal_id=xxx ─────────────────────────────────────────────
router.get('/', (req, res) => {
  const { deal_id } = req.query;
  let q = db.get('invoices');
  if (deal_id) q = q.filter({ deal_id });
  res.json(q.orderBy('created_at', 'asc').value());
});

// ── POST /api/invoices  (create + send a Stripe invoice) ─────────────────────
router.post('/', async (req, res) => {
  try {
    const s = getStripe();
    const {
      deal_id, email, customer_name, amount,
      description, phase_number = 1, total_phases = 1,
    } = req.body;

    const amountNum = Number(amount);
    if (!email)            return res.status(400).json({ error: 'email is required' });
    if (!amountNum || amountNum <= 0) return res.status(400).json({ error: `Invalid amount: ${amount}` });

    const amountCents = Math.round(amountNum * 100);
    console.log(`📄 Creating invoice: ${email} | $${amountNum} (${amountCents} cents) | phase ${phase_number}/${total_phases}`);

    // Find or create Stripe customer by email
    const existing = await s.customers.list({ email, limit: 1 });
    let customer = existing.data[0];
    if (!customer) {
      customer = await s.customers.create({ email, name: customer_name || email });
    }
    console.log(`👤 Stripe customer: ${customer.id}`);

    // Create the invoice first (empty), then attach the line item directly to it
    const inv = await s.invoices.create({
      customer: customer.id,
      auto_advance: false,
      collection_method: 'send_invoice',
      days_until_due: 30,
      pending_invoice_items_behavior: 'exclude', // don't pull in any stale pending items
      metadata: { deal_id, phase_number: String(phase_number), total_phases: String(total_phases) },
    });

    // Attach item directly to this invoice
    const item = await s.invoiceItems.create({
      customer: customer.id,
      invoice: inv.id,
      amount: amountCents,
      currency: 'usd',
      description: description || 'Professional Services',
    });
    console.log(`🧾 Invoice item created: ${item.id} for ${amountCents} cents → attached to ${inv.id}`);

    const finalized = await s.invoices.finalizeInvoice(inv.id);
    console.log(`✅ Invoice finalized: ${finalized.id} | amount_due: ${finalized.amount_due} cents`);
    await s.invoices.sendInvoice(finalized.id);
    console.log(`📬 Invoice sent to ${email}`);

    // Persist to db
    const record = {
      id: uuidv4(),
      deal_id,
      stripe_invoice_id: finalized.id,
      stripe_invoice_url: finalized.hosted_invoice_url,
      email,
      customer_name: customer_name || email,
      amount: amountNum,
      description: description || 'Professional Services',
      phase_number: Number(phase_number),
      total_phases: Number(total_phases),
      status: 'open',
      created_at: now(),
      paid_at: null,
    };
    db.get('invoices').push(record).write();
    res.status(201).json(record);
  } catch (err) {
    console.error('Invoice error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/:id/refresh  (poll Stripe for latest status) ──────────
router.post('/:id/refresh', async (req, res) => {
  try {
    const s = getStripe();
    const record = db.get('invoices').find({ id: req.params.id }).value();
    if (!record) return res.status(404).json({ error: 'Not found' });

    const stripeInv = await s.invoices.retrieve(record.stripe_invoice_id);
    const status = stripeInv.status; // open | paid | void | uncollectible
    const paid_at = stripeInv.status_transitions?.paid_at
      ? new Date(stripeInv.status_transitions.paid_at * 1000).toISOString()
      : null;

    db.get('invoices').find({ id: req.params.id }).assign({ status, paid_at, updated_at: now() }).write();
    res.json({ ...record, status, paid_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/invoices/:id/void  (void in Stripe + update local status) ───────
router.post('/:id/void', async (req, res) => {
  try {
    const s = getStripe();
    const record = db.get('invoices').find({ id: req.params.id }).value();
    if (!record) return res.status(404).json({ error: 'Not found' });
    if (record.status !== 'open') return res.status(400).json({ error: 'Only open invoices can be voided' });

    await s.invoices.voidInvoice(record.stripe_invoice_id);
    db.get('invoices').find({ id: req.params.id }).assign({ status: 'void', updated_at: now() }).write();
    res.json({ ...record, status: 'void' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/invoices/:id  (remove from local DB only) ────────────────────
router.delete('/:id', (req, res) => {
  const record = db.get('invoices').find({ id: req.params.id }).value();
  if (!record) return res.status(404).json({ error: 'Not found' });
  db.get('invoices').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── POST /api/invoices/webhook  (Stripe sends payment events here) ────────────
// NOTE: This route uses express.raw() — registered separately in index.js
router.post('/webhook', (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret.startsWith('whsec_REPLACE')) {
    console.warn('Stripe webhook secret not configured');
    return res.status(400).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = require('stripe')(process.env.STRIPE_SECRET_KEY)
      .webhooks.constructEvent(req.body, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'invoice.paid') {
    const stripeInv = event.data.object;
    const paid_at = stripeInv.status_transitions?.paid_at
      ? new Date(stripeInv.status_transitions.paid_at * 1000).toISOString()
      : now();
    db.get('invoices')
      .find({ stripe_invoice_id: stripeInv.id })
      .assign({ status: 'paid', paid_at })
      .write();
    console.log(`✅ Invoice ${stripeInv.id} marked as paid`);
  }

  res.json({ received: true });
});

module.exports = router;
