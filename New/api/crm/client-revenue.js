// Per-client revenue, pulled DIRECTLY from Stripe (not from the CRM tables,
// which miss ad-hoc charges like RTI). Two streams:
//   1. Direct payments  — succeeded /charges, attributed to a client by the
//      charge's billing email (then business name) against crm_clients.
//   2. Collector fees   — Stripe Connect /application_fees, attributed to a
//      client by the connected account id (crm_clients.stripe_account_id).
// Returns per-client all-time + last-30-day totals and the last payment date,
// plus any charges that could not be matched to a client (so mapping gaps,
// e.g. a missing client email, are visible instead of silently dropped).
//
// Auth: a shared REVENUE_SYNC_TOKEN (Bearer or ?key=, used by the Notion sync
// task) OR a logged-in admin session (for eyeballing in the browser).
// Read-only. Money data — never writes anything.
import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';
import { secretKey } from '../_lib/stripe.js';

const STRIPE_API = 'https://api.stripe.com/v1';

const norm = (s) => (s || '').trim().toLowerCase();
// Loose business-name key so "Veteran Nexus Advisors" and a charge named
// "Veteran Nexus" collide. Strips common suffixes and non-alphanumerics.
const nameKey = (s) =>
  norm(s)
    .replace(/\b(llc|inc|co|ltd|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── Auth ────────────────────────────────────────────────────────────────
  const provided = String(
    req.query.key || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  ).trim();
  const SYNC_TOKEN = process.env.REVENUE_SYNC_TOKEN || '';
  let authorized = SYNC_TOKEN && provided && provided === SYNC_TOKEN;
  if (!authorized) authorized = !!(await requireAdminAuth(req));
  if (!authorized) return res.status(401).json({ error: 'Unauthorized' });

  const STRIPE_KEY = secretKey(); // follows STRIPE_MODE (test/live)
  if (!STRIPE_KEY || STRIPE_KEY.includes('REPLACE')) {
    return res.status(500).json({ error: 'Stripe is not configured for this mode' });
  }

  try {
    // ── Client lookup maps ──────────────────────────────────────────────────
    const clients =
      (await supaFetch('crm_clients?select=id,business_name,contact_email,stripe_account_id')) || [];
    const byEmail = {};
    const byAccount = {};
    const byName = {};
    for (const c of clients) {
      if (c.contact_email) byEmail[norm(c.contact_email)] = c;
      if (c.stripe_account_id) byAccount[c.stripe_account_id] = c;
      if (c.business_name) byName[nameKey(c.business_name)] = c;
    }

    // ── Stripe pagination ───────────────────────────────────────────────────
    const sHeaders = { Authorization: `Bearer ${STRIPE_KEY}` };
    const sFetch = async (path) => {
      const r = await fetch(`${STRIPE_API}${path}`, { headers: sHeaders });
      if (!r.ok) throw new Error(`Stripe ${r.status} on ${path.split('?')[0]}`);
      return r.json();
    };
    const sFetchAll = async (path, { maxPages = 40 } = {}) => {
      const out = [];
      let after = null;
      for (let i = 0; i < maxPages; i++) {
        const sep = path.includes('?') ? '&' : '?';
        const page = await sFetch(`${path}${sep}limit=100${after ? `&starting_after=${after}` : ''}`);
        const data = page.data || [];
        out.push(...data);
        if (!page.has_more || data.length === 0) break;
        after = data[data.length - 1].id;
      }
      return out;
    };

    const now = Math.floor(Date.now() / 1000);
    const cut30 = now - 30 * 86400;

    const [charges, fees] = await Promise.all([
      sFetchAll('/charges'),
      sFetchAll('/application_fees'),
    ]);

    const agg = {}; // client_id -> totals
    const ensure = (c) => {
      if (!agg[c.id]) {
        agg[c.id] = {
          client_id: c.id,
          business_name: c.business_name,
          collected: 0,
          collected_30d: 0,
          collector_fees: 0,
          collector_fees_30d: 0,
          last_payment: null,
        };
      }
      return agg[c.id];
    };

    // ── Direct payments ─────────────────────────────────────────────────────
    const unmatched = {}; // key -> { label, amount, count }
    for (const ch of charges) {
      if (ch.status !== 'succeeded' || ch.paid !== true) continue;
      const net = (ch.amount - (ch.amount_refunded || 0)) / 100;
      if (net <= 0) continue;
      const email = norm(ch.billing_details?.email || ch.receipt_email || '');
      const nm = nameKey(ch.billing_details?.name || '');
      const c = byEmail[email] || (nm && byName[nm]);
      if (!c) {
        const key = email || nm || 'unknown';
        const u = (unmatched[key] = unmatched[key] || {
          label: ch.billing_details?.name || ch.billing_details?.email || ch.receipt_email || 'Unknown',
          amount: 0,
          count: 0,
        });
        u.amount += net;
        u.count += 1;
        continue;
      }
      const a = ensure(c);
      a.collected += net;
      if (ch.created >= cut30) a.collected_30d += net;
      if (!a.last_payment || ch.created > a.last_payment) a.last_payment = ch.created;
    }

    // ── Collector / royalty fees (Connect application fees) ──────────────────
    for (const f of fees) {
      const c = byAccount[f.account];
      if (!c) continue;
      const net = (f.amount - (f.amount_refunded || 0)) / 100;
      const a = ensure(c);
      a.collector_fees += net;
      if (f.created >= cut30) a.collector_fees_30d += net;
    }

    const round = (n) => Math.round(n * 100) / 100;
    const resultClients = Object.values(agg)
      .map((a) => ({
        ...a,
        collected: round(a.collected),
        collected_30d: round(a.collected_30d),
        collector_fees: round(a.collector_fees),
        collector_fees_30d: round(a.collector_fees_30d),
        last_payment: a.last_payment
          ? new Date(a.last_payment * 1000).toISOString().slice(0, 10)
          : null,
      }))
      .sort((x, y) => y.collected - x.collected || y.collector_fees - x.collector_fees);

    const unmatchedList = Object.values(unmatched)
      .map((u) => ({ ...u, amount: round(u.amount) }))
      .sort((x, y) => y.amount - x.amount);

    return res.status(200).json({
      ok: true,
      mode: (process.env.STRIPE_MODE || 'live').toLowerCase(),
      generated_at: new Date().toISOString(),
      clients: resultClients,
      unmatched_charges: unmatchedList,
    });
  } catch (e) {
    console.error('client-revenue error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
