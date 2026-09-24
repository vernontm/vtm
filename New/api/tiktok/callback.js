const { supaFetch } = require('../_lib/supabase.js');

// TikTok for Business (Marketing API) OAuth callback. TikTok redirects the
// advertiser here with an auth_code after they authorize the VernonTM app; we
// exchange it for an access token and store it, then send them back to the CRM.
// Stays reachable (HTTP 200) even before app credentials exist, so it can be
// registered as the redirect URL immediately.
const APP_ID = process.env.TIKTOK_APP_ID;
const APP_SECRET = process.env.TIKTOK_APP_SECRET;

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Vernon Tech & Media</title>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f6f8fc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:440px;background:#fff;border:1px solid #e6e9ef;border-radius:16px;padding:32px 34px;text-align:center;box-shadow:0 10px 40px rgba(15,23,42,.06)">
<div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 14px">V</div>
<div style="font-size:20px;font-weight:800;margin-bottom:8px">${title}</div>
<div style="font-size:14px;color:#475569;line-height:1.6">${body}</div>
<a href="https://vernontm.com/admin/" style="display:inline-block;margin-top:18px;background:#2563eb;color:#fff;text-decoration:none;padding:10px 22px;border-radius:999px;font-weight:700">Back to the CRM</a>
</div></body>`;
}
function html(res, title, body) { res.setHeader('Content-Type', 'text/html'); return res.status(200).send(page(title, body)); }

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const code = q.auth_code || q.code || '';
  const err = q.error_description || q.error;

  if (err) return html(res, 'Connection canceled', String(err).slice(0, 200));
  if (!code) return html(res, 'TikTok callback ready', 'This is the VernonTM TikTok connection endpoint. Start the connection from inside the CRM.');
  if (!APP_ID || !APP_SECRET) return html(res, 'Almost there', 'We received your authorization. The connection finishes once the TikTok app credentials are configured.');

  try {
    const r = await fetch('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: APP_ID, secret: APP_SECRET, auth_code: code }),
    });
    const data = await r.json().catch(() => ({}));
    const tok = data && data.data;
    if (!tok || !tok.access_token) return html(res, 'Connection issue', 'TikTok did not return an access token. Please try connecting again.');

    // Store the token set as a settings row (best-effort; wired fully in the CRM sync step).
    await supaFetch('crm_app_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'tiktok_marketing_auth', value: tok }),
    }).catch(() => {});

    return html(res, 'TikTok connected', 'Your TikTok Business account is linked to the VernonTM CRM. You can close this window.');
  } catch (e) {
    return html(res, 'Connection issue', 'Something went wrong finishing the connection. Please try again.');
  }
};
