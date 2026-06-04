// Thin Stripe REST helper. The project has no `stripe` npm package; the
// academy endpoints call api.stripe.com directly, so the funnel does the same
// through this shared wrapper. Form-encodes nested params the way Stripe wants
// (line_items[0][price_data][product_data][name]=...) and supports idempotency.
//
// Required env:
//   STRIPE_SECRET_KEY   — sk_live_… or sk_test_…

const STRIPE_API = 'https://api.stripe.com/v1';
const STRIPE_VERSION = '2024-06-20';

// Recursively flatten an object/array into Stripe's bracketed form encoding.
function toForm(obj, prefix, out) {
  out = out || new URLSearchParams();
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          toForm(item, `${field}[${i}]`, out);
        } else {
          out.append(`${field}[${i}]`, String(item));
        }
      });
    } else if (typeof value === 'object') {
      toForm(value, field, out);
    } else {
      out.append(field, String(value));
    }
  }
  return out;
}

// Core call. method: 'GET' | 'POST'. path begins with '/'. body is an object
// (POST) and gets form-encoded. opts.idempotencyKey sets the header.
async function call(method, path, body, opts = {}) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const e = new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
    e.status = 500;
    throw e;
  }
  const headers = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': STRIPE_VERSION,
  };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let url = `${STRIPE_API}${path}`;
  let payload;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = toForm(body || {}).toString();
  }

  const res = await fetch(url, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data?.error?.message || `Stripe error ${res.status}`);
    e.status = res.status;
    e.data = data;
    e.code = data?.error?.code;
    throw e;
  }
  return data;
}

function createCheckoutSession(params, opts = {}) {
  return call('POST', '/checkout/sessions', params, opts);
}

function retrieveSession(sessionId, expand = []) {
  const qs = expand.map((e, i) => `expand[${i}]=${encodeURIComponent(e)}`).join('&');
  return call('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}${qs ? `?${qs}` : ''}`);
}

module.exports = { call, createCheckoutSession, retrieveSession, toForm };
