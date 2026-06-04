// POST /api/funnel/decline
// Body: { email, offer?: 'tripwire' }
// Returns: { ok, redirect }
//
// Decline-as-delivery: when a visitor explicitly declines the tripwire on the
// shame-decline modal, we tag them and send them to the welcome page in
// "blueprint" mode, where the free Simple CRM Blueprint download is revealed.
// This is what gives the tripwire real stakes — the free thing arrives only
// once you decline, so on-the-fence visitors often buy instead.

import { setCors } from '../_lib/supabase.js';
import { tagContact, isEmail } from '../_lib/funnel.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const email = ((req.body || {}).email || '').toString().trim().toLowerCase();
    const redirect = '/crm-welcome?product=blueprint';
    if (!isEmail(email)) {
      // No email on file (visitor cleared storage). Still deliver the blueprint.
      return res.status(200).json({ ok: true, redirect });
    }
    await tagContact({
      email,
      addTags: ['declined:tripwire', 'blueprint:delivered'],
    });
    return res.status(200).json({ ok: true, redirect });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Something went wrong.' });
  }
}
