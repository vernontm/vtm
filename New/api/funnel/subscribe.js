// POST /api/funnel/subscribe
// Body: { email, name?, hp?, source?, source_url? }
// Returns: { ok, redirect, email }
//
// Captures the free-magnet opt-in for the CRM funnel. The blueprint is NOT
// emailed here — it is revealed on the welcome page after the visitor either
// buys or explicitly declines the tripwire (decline-as-delivery). We tag the
// contact 'blueprint:pending' so follow-up email automation can deliver it as
// a safety net for visitors who bounce.

import { setCors } from '../_lib/supabase.js';
import { tagContact, isEmail } from '../_lib/funnel.js';

const REDIRECT_PATH = '/crm-build';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};

    // Honeypot — bots fill hidden fields. Pretend success, store nothing.
    if (body.hp) return res.status(200).json({ ok: true, redirect: REDIRECT_PATH });

    const email = (body.email || '').toString().trim().toLowerCase();
    if (!isEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const name = (body.name || '').toString().slice(0, 120);

    await tagContact({
      email,
      name,
      source: (body.source || 'funnel:crm-opt-in').toString().slice(0, 60),
      addTags: ['warm lead', 'funnel:crm-lead', 'blueprint:pending'],
    });

    return res.status(200).json({ ok: true, redirect: REDIRECT_PATH, email });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
  }
}
