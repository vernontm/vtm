// POST /api/funnel/stripe-webhook
// Stripe webhook for the CRM funnel. Verifies the signature against the raw
// body (body parser disabled), then tags the buyer in crm_email_contacts so
// email automation + the CRM know what they purchased.
//
// Events handled:
//   checkout.session.completed   — tripwire ($17 + optional $9 bump), or the
//                                  3DS fallback OTO checkout
//   payment_intent.succeeded     — the one-click off-session OTO charge ($297)
//
// Required env:
//   FUNNEL_STRIPE_WEBHOOK_SECRET (falls back to STRIPE_WEBHOOK_SECRET)

import crypto from 'crypto';
import { setCors } from '../_lib/supabase.js';
import { tagContact } from '../_lib/funnel.js';

export const config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const item of sigHeader.split(',')) {
    const [k, v] = item.split('=');
    parts[k] = v;
  }
  if (!parts.t || !parts.v1) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const rawBody = await getRawBody(req);
    const secret = process.env.FUNNEL_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
    if (!verifyStripeSignature(rawBody.toString(), req.headers['stripe-signature'], secret)) {
      console.error('Funnel webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody.toString());
    const obj = event.data?.object || {};
    const meta = obj.metadata || {};

    // Only act on funnel-originated events; ignore everything else (other
    // products may share the Stripe account).
    if (event.type === 'checkout.session.completed') {
      const email = (obj.customer_details?.email || meta.email || '').toLowerCase();
      if (meta.funnel_product === 'tripwire' && email) {
        const tags = ['buyer:crm-build'];
        if (meta.bump === '1') tags.push('bump:context-file');
        await tagContact({ email, addTags: tags });
      } else if (meta.funnel_product === 'oto' && email) {
        // 3DS fallback OTO checkout completed.
        await tagContact({ email, addTags: ['buyer:crm-lab', 'crm-lab:annual'] });
      }
    } else if (event.type === 'payment_intent.succeeded') {
      const email = (meta.email || obj.receipt_email || '').toLowerCase();
      if (meta.funnel_product === 'oto' && email) {
        await tagContact({ email, addTags: ['buyer:crm-lab', 'crm-lab:annual'] });
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Funnel webhook error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
