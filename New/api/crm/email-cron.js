const { setCors } = require('../_lib/supabase.js');

// ─────────────────────────────────────────────────────────────
// DEPRECATED — delivery moved to MailerLite.
//
// This endpoint used to:
//   1. Send scheduled campaigns (now scheduled in MailerLite directly)
//   2. Process rollover queue (no longer needed — MailerLite handles throttling)
//   3. Send sequence step emails (MailerLite automations handle sequences now)
//
// We keep the endpoint as a no-op so the Vercel cron job doesn't 404. The cron
// entry in vercel.json can be removed at any time; leaving it running is
// harmless and fast.
// ─────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth pass-through (matches previous behavior so existing cron config works)
  const cronSecret = req.headers['authorization'];
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  return res.json({
    ok: true,
    deprecated: true,
    message: 'Email delivery moved to MailerLite — this cron is now a no-op.',
    timestamp: new Date().toISOString(),
  });
};
