// POST /api/crm/stripe-webhook
//
// Real-time Stripe → CRM sync. Every CRM-originated invoice, payment,
// refund, and subscription change flows through here and updates:
//   • crm_invoices   (upserted by stripe_invoice_id)
//   • crm_payments   (a paid row logged per successful invoice/charge)
//   • crm_deals      (matched by metadata.deal_id or stripe_subscription_id)
//   • crm_clients    (payment_received flag when a deposit lands)
//
// Events handled:
//   invoice.finalized          — invoice created & sendable
//   invoice.paid / .payment_succeeded — money in
//   invoice.payment_failed     — dunning / failed charge
//   invoice.voided             — cancelled
//   charge.refunded            — money back out
//   customer.subscription.updated / .deleted — recurring status changes
//
// Verifies against CRM_STRIPE_WEBHOOK_SECRET (falls back to STRIPE_WEBHOOK_SECRET).
// Body parsing is disabled so we can verify the raw signature.

import crypto from 'crypto';
import { setCors, supaFetch } from '../_lib/supabase.js';

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifySig(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [k, v] = item.split('=');
    parts[k] = v;
  }
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected)); }
  catch { return false; }
}

// dollars from Stripe cents
const toDollars = (cents) => (Number(cents) || 0) / 100;
const iso = (ts) => ts ? new Date(ts * 1000).toISOString() : null;

// Find the CRM deal this Stripe object belongs to. Prefer explicit deal_id in
// metadata; fall back to matching the subscription id we stored at setup time.
async function findDeal({ deal_id, subscription, customer }) {
  if (deal_id) {
    const rows = await supaFetch(`crm_deals?id=eq.${deal_id}&select=id,client_id,amount_paid`).catch(() => []);
    if (rows?.[0]) return rows[0];
  }
  if (subscription) {
    const rows = await supaFetch(`crm_deals?stripe_subscription_id=eq.${encodeURIComponent(subscription)}&select=id,client_id,amount_paid`).catch(() => []);
    if (rows?.[0]) return rows[0];
  }
  if (customer) {
    const rows = await supaFetch(`crm_deals?stripe_customer_id=eq.${encodeURIComponent(customer)}&select=id,client_id,amount_paid&order=updated_at.desc&limit=1`).catch(() => []);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

// Upsert a crm_invoices row keyed on the Stripe invoice id.
async function upsertInvoice(inv, statusOverride) {
  const meta = inv.metadata || {};
  const row = {
    stripe_invoice_id: inv.id,
    stripe_invoice_url: inv.hosted_invoice_url || null,
    deal_id: meta.deal_id || null,
    email: inv.customer_email || null,
    customer_name: inv.customer_name || null,
    amount: toDollars(inv.amount_due ?? inv.total ?? inv.amount_paid),
    description: inv.description || (inv.lines?.data?.[0]?.description) || null,
    status: statusOverride || inv.status || 'open',
    paid_at: inv.status === 'paid' || statusOverride === 'paid' ? iso(inv.status_transitions?.paid_at || Math.floor(Date.now() / 1000)) : null,
    updated_at: new Date().toISOString(),
  };
  // merge-duplicates on the unique stripe_invoice_id
  await supaFetch('crm_invoices?on_conflict=stripe_invoice_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([row]),
  }).catch(async (e) => {
    // If no unique constraint exists, fall back to update-or-insert by hand.
    const existing = await supaFetch(`crm_invoices?stripe_invoice_id=eq.${inv.id}&select=id&limit=1`).catch(() => []);
    if (existing?.[0]) {
      await supaFetch(`crm_invoices?id=eq.${existing[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    } else {
      await supaFetch('crm_invoices', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    }
  });
}

// Log a paid crm_payments row (idempotent on stripe_invoice_id).
async function logPayment({ stripe_invoice_id, stripe_invoice_url, amount, client_id, label }) {
  const existing = await supaFetch(`crm_payments?stripe_invoice_id=eq.${encodeURIComponent(stripe_invoice_id)}&select=id&limit=1`).catch(() => []);
  const row = {
    stripe_invoice_id,
    stripe_invoice_url: stripe_invoice_url || null,
    amount,
    status: 'paid',
    paid_at: new Date().toISOString(),
    client_id: client_id || null,
    label: label || 'Stripe payment',
    source: 'stripe-webhook',
  };
  if (existing?.[0]) {
    await supaFetch(`crm_payments?id=eq.${existing[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'paid', paid_at: row.paid_at, amount }) });
  } else {
    await supaFetch('crm_payments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  }
}

// Look up the CRM client that owns a connected Stripe account.
async function clientForAccount(accountId) {
  const rows = await supaFetch(`crm_clients?stripe_account_id=eq.${encodeURIComponent(accountId)}&select=id,business_name&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

// Log ONLY the application fee we collect on a connected account's charge —
// that's the money WE make from Connect. The client's gross revenue is theirs
// and is never stored here.
async function handleApplicationFee(event, obj) {
  const accountId = obj.account;                    // the connected account the fee came from
  const client = await clientForAccount(accountId);
  const fee = toDollars(obj.amount);
  const refunded = toDollars(obj.amount_refunded);
  const net = fee - refunded;
  const status = refunded >= fee && fee > 0 ? 'refunded' : 'succeeded';
  const chargeId = typeof obj.charge === 'string' ? obj.charge : obj.charge?.id || null;

  const row = {
    client_id: client?.id || null,
    stripe_account_id: accountId,
    stripe_fee_id: obj.id,
    stripe_charge_id: chargeId,
    fee_amount: fee,
    fee_refunded: refunded,
    net_amount: net,
    currency: obj.currency || 'usd',
    status,
    charged_at: iso(obj.created),
  };
  const existing = await supaFetch(`crm_connect_income?stripe_fee_id=eq.${encodeURIComponent(obj.id)}&select=id&limit=1`).catch(() => []);
  if (existing?.[0]) {
    await supaFetch(`crm_connect_income?id=eq.${existing[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ fee_refunded: refunded, net_amount: net, status }) });
  } else {
    await supaFetch('crm_connect_income', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  }
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rawBody = await getRawBody(req);
    // Two endpoints hit this URL: the account webhook and the Connect webhook,
    // each with its own signing secret. Accept either.
    const secrets = [
      process.env.CRM_STRIPE_WEBHOOK_SECRET,
      process.env.CRM_STRIPE_CONNECT_WEBHOOK_SECRET,
      process.env.STRIPE_WEBHOOK_SECRET,
    ].filter(Boolean);
    const sig = req.headers['stripe-signature'];
    const ok = secrets.some(s => verifySig(rawBody.toString(), sig, s));
    if (!ok) {
      console.error('CRM Stripe webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString());
    const obj = event.data?.object || {};

    // ── Application fee events (Stripe Connect) ───────────────────────────
    // These fire on OUR platform account whenever we collect a fee on a
    // connected account's charge. This is exactly "what we make" from Connect —
    // we log ONLY the fee, not the client's gross revenue.
    if (event.type === 'application_fee.created' || event.type === 'application_fee.refunded') {
      await handleApplicationFee(event, obj);
      return res.status(200).json({ received: true, fee: true });
    }
    // Ignore any other connected-account events (we only care about our fees).
    if (event.account) {
      return res.status(200).json({ received: true, ignored: true });
    }

    switch (event.type) {
      case 'invoice.finalized': {
        await upsertInvoice(obj);
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        await upsertInvoice(obj, 'paid');
        const deal = await findDeal({ deal_id: obj.metadata?.deal_id, subscription: obj.subscription, customer: obj.customer });
        const amount = toDollars(obj.amount_paid ?? obj.total);
        await logPayment({
          stripe_invoice_id: obj.id,
          stripe_invoice_url: obj.hosted_invoice_url,
          amount,
          client_id: deal?.client_id,
          label: obj.description || obj.lines?.data?.[0]?.description || 'Stripe payment',
        });
        if (deal) {
          await supaFetch(`crm_deals?id=eq.${deal.id}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              amount_paid: Number(deal.amount_paid || 0) + amount,
              stripe_invoice_id: obj.id,
              stripe_invoice_url: obj.hosted_invoice_url || null,
              stripe_customer_id: obj.customer || null,
              invoice_status: 'paid',
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => {});
          if (deal.client_id) {
            await supaFetch(`crm_clients?id=eq.${deal.client_id}`, {
              method: 'PATCH', headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({ payment_received: true }),
            }).catch(() => {});
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        await upsertInvoice(obj, 'payment_failed');
        break;
      }
      case 'invoice.voided': {
        await upsertInvoice(obj, 'void');
        break;
      }
      case 'charge.refunded': {
        // Log a negative payment so revenue nets out correctly.
        const refunded = toDollars(obj.amount_refunded);
        if (refunded > 0) {
          await supaFetch('crm_payments', {
            method: 'POST', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              stripe_invoice_id: obj.invoice || obj.id,
              amount: -refunded,
              status: 'refunded',
              paid_at: new Date().toISOString(),
              label: 'Refund',
              source: 'stripe-webhook',
            }),
          }).catch(() => {});
          // Mark the matching invoice refunded.
          if (obj.invoice) await upsertInvoice({ id: obj.invoice, status: 'refunded', metadata: {} }, 'refunded').catch(() => {});
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const deal = await findDeal({ subscription: obj.id, customer: obj.customer });
        if (deal) {
          await supaFetch(`crm_deals?id=eq.${deal.id}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              stripe_subscription_id: obj.id,
              stripe_customer_id: obj.customer || null,
              subscription_status: obj.status || null,
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => {});
        }
        break;
      }
      default:
        // ignore everything else (funnel + academy webhooks own their events)
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('CRM Stripe webhook error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
