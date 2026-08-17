const { setCors, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

// Public, token-gated redirect to a signed agreement's stored PDF. The token is
// the agreement's unguessable sign_token, so this is safe to use as a durable
// link (e.g. from the client's Documents tab) without embedding an expiring
// signed URL. It looks the agreement up, mints a fresh short-lived signed
// storage URL server-side, and 302-redirects to it.
//   GET /api/crm/agreement-file?token=<sign_token>
const adminHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function signedUrlFor(fileUrl, expiresIn = 3600) {
  const i = fileUrl.indexOf('/');
  const bucket = fileUrl.slice(0, i), path = fileUrl.slice(i + 1);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) return null;
  const { signedURL } = await res.json();
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const token = req.query?.token;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const rows = await supaFetch(`crm_agreements?sign_token=eq.${encodeURIComponent(token)}&select=file_url`);
    const fileUrl = rows?.[0]?.file_url;
    if (!fileUrl) return res.status(404).json({ error: 'Not found' });
    const signed = await signedUrlFor(fileUrl, 3600);
    if (!signed) return res.status(502).json({ error: 'Could not open the document' });
    res.setHeader('Location', signed);
    return res.status(302).end();
  } catch (e) {
    console.error('agreement-file error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
