// GET /api/funnel/download?session=<cs_…>&asset=repo|context
// 302-redirects to a short-lived signed URL for the paid deliverable, but ONLY
// after verifying the Stripe checkout session is actually paid. This is what
// gates the $17 build (and the $9 Context File bump) behind real payment — the
// files live in a PRIVATE Supabase bucket, never publicly reachable.
//
//   asset=repo    -> crm-build.zip   (any paid tripwire buyer)
//   asset=context -> CLAUDE.md       (only buyers who added the $9 bump)

const { setCors, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
const stripe = require('../_lib/stripe.js');

const BUCKET = 'funnel-deliverables';
const ASSETS = {
  repo:    { path: 'crm-build.zip', filename: 'crm-build.zip', requiresBump: false },
  context: { path: 'CLAUDE.md',     filename: 'CLAUDE.md',     requiresBump: true },
};

async function signedUrl(path, filename) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 600 }), // 10 minutes
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.signedURL) throw new Error(data.message || 'Could not sign download URL');
  // signedURL is relative to the storage API, e.g. /object/sign/<bucket>/<path>?token=...
  const sep = data.signedURL.includes('?') ? '&' : '?';
  return `${SUPABASE_URL}/storage/v1${data.signedURL}${sep}download=${encodeURIComponent(filename)}`;
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const sessionId = (req.query.session || '').toString();
    const assetKey = (req.query.asset || 'repo').toString();
    const asset = ASSETS[assetKey];
    if (!asset) return res.status(400).json({ error: 'Unknown asset.' });
    if (!sessionId.startsWith('cs_')) return res.status(400).json({ error: 'Missing or invalid session.' });

    // Verify the purchase with Stripe.
    const session = await stripe.retrieveSession(sessionId);
    const paid = session.payment_status === 'paid';
    const isTripwire = session.metadata?.funnel_product === 'tripwire';
    if (!paid || !isTripwire) {
      return res.status(403).json({ error: 'This download is only available after purchase.' });
    }
    if (asset.requiresBump && session.metadata?.bump !== '1') {
      return res.status(403).json({ error: 'The Context File was not part of this order.' });
    }

    const url = await signedUrl(asset.path, asset.filename);
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(302, { Location: url });
    return res.end();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'Download failed.' });
  }
}
