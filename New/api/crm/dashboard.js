import { setCors, requireClientScope, supaFetch } from '../_lib/supabase.js';
import { secretKey } from '../_lib/stripe.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  // Dashboard is scoped: admin + no client selected → sees everything,
  // admin + selected client → sees only that client, non-admin → sees their
  // scoped data (tenant-filtered queries below). Non-admins without any
  // selected client get a limited placeholder instead of a 400.
  const scope = await requireClientScope(req);
  if (!scope.ok) {
    // Non-admin without X-Client-Id → return limited placeholder (legacy UX).
    if (scope.status === 400) {
      return res.json({ limited: true, contacts: [], deals: [], projects: [], invoices: [], leads: [], stripeRevenue: null });
    }
    return res.status(scope.status).json({ error: scope.error });
  }
  const { user, clientId, all } = scope;
  // Optional filter appended to every supabase query. Admins with no client
  // selected (all=true) use an empty filter and see global aggregates.
  const q = all ? '' : `&client_id=eq.${clientId}`;
  const qStart = all ? '' : `client_id=eq.${clientId}&`;

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [contacts, deals, projects, invoices, leads] = await Promise.all([
      supaFetch(`crm_contacts?select=id,archived${q}`),
      supaFetch(`crm_deals?select=id,name,stage,value,amount_paid,payment_status,created_at,updated_at,archived${q}`),
      supaFetch(`crm_projects?select=id,status,value,archived${q}`),
      supaFetch(`crm_invoices?select=id,status,amount${q}`),
      supaFetch(`crm_leads?select=id,status,interest,lead_segment,archived,created_at${q}`),
    ]);

    // ── Stripe Revenue ────────────────────────────────────────────────────────
    // Stripe connects to Ray's account, so only pull it when we're showing
    // the global admin view. When scoped to a specific client, skip it
    // until per-client Stripe accounts are supported.
    let stripeRevenue = null;
    const STRIPE_KEY = secretKey(); // follows STRIPE_MODE (test/live)
    // Stripe is Ray's account-level money data — show it to any admin
    // regardless of client scope (the CRM is single-account now).
    if (user.is_admin && STRIPE_KEY && !STRIPE_KEY.includes('REPLACE')) {
      try {
        const stripeHeaders = { 'Authorization': `Bearer ${STRIPE_KEY}` };
        const stripeFetch = async (path) => {
          const r = await fetch(`https://api.stripe.com/v1${path}`, { headers: stripeHeaders });
          if (!r.ok) throw new Error(`Stripe ${r.status}`);
          return r.json();
        };
        // Walk Stripe's cursor pagination until has_more=false or hard cap.
        // Without this, a busy account silently under-reports annual revenue.
        const stripeFetchAll = async (path, { maxPages = 25 } = {}) => {
          const all = [];
          let starting_after = null;
          for (let i = 0; i < maxPages; i++) {
            const sep = path.includes('?') ? '&' : '?';
            const url = `${path}${sep}limit=100${starting_after ? `&starting_after=${starting_after}` : ''}`;
            const page = await stripeFetch(url);
            const data = page.data || [];
            all.push(...data);
            if (!page.has_more || data.length === 0) break;
            starting_after = data[data.length - 1].id;
          }
          return { data: all };
        };

        const thirtyDaysAgoTs = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        const yearAgoTs = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);

        const [balance, recentCharges, yearCharges, activeSubs] = await Promise.all([
          stripeFetch('/balance'),
          stripeFetchAll(`/charges?created[gte]=${thirtyDaysAgoTs}`),
          stripeFetchAll(`/charges?created[gte]=${yearAgoTs}&status=succeeded`),
          stripeFetchAll(`/subscriptions?status=active`),
        ]);

        const availableBalance = balance.available.reduce((s, b) => s + b.amount, 0) / 100;
        const pendingBalance = balance.pending.reduce((s, b) => s + b.amount, 0) / 100;

        const succeededRecent = recentCharges.data.filter(c => c.status === 'succeeded');
        const last30Revenue = succeededRecent.reduce((s, c) => s + c.amount, 0) / 100;
        const totalStripeRevenue = yearCharges.data.reduce((s, c) => s + c.amount, 0) / 100;

        const stripeMonthly = {};
        yearCharges.data.forEach(c => {
          const d = new Date(c.created * 1000);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          stripeMonthly[k] = (stripeMonthly[k] || 0) + c.amount / 100;
        });

        // This calendar month's sales (month-to-date).
        const nowD = new Date();
        const thisMonthKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
        const thisMonthCharges = yearCharges.data.filter(c => {
          const d = new Date(c.created * 1000);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === thisMonthKey;
        });
        const thisMonthSales = thisMonthCharges.reduce((s, c) => s + c.amount, 0) / 100;

        // Current MRR — sum of active subscriptions, each normalized to a
        // monthly figure (yearly ÷ 12, weekly × 52/12, daily × 365/12).
        const toMonthly = (amount, interval, count = 1) => {
          const per = amount / (count || 1);
          switch (interval) {
            case 'year':  return per / 12;
            case 'week':  return per * (52 / 12);
            case 'day':   return per * (365 / 12);
            default:      return per; // month
          }
        };
        let mrr = 0;
        (activeSubs.data || []).forEach(sub => {
          (sub.items?.data || []).forEach(it => {
            const price = it.price || {};
            const rec = price.recurring || {};
            if (!rec.interval) return;
            const line = (price.unit_amount || 0) * (it.quantity || 1) / 100;
            mrr += toMonthly(line, rec.interval, rec.interval_count);
          });
        });

        const recentPayments = succeededRecent.slice(0, 10).map(c => ({
          id: c.id,
          amount: c.amount / 100,
          customer: c.billing_details?.name || c.billing_details?.email || c.customer || 'Unknown',
          email: c.billing_details?.email || '',
          description: c.description || '',
          date: new Date(c.created * 1000).toISOString(),
        }));

        stripeRevenue = {
          available: availableBalance,
          pending: pendingBalance,
          last30Days: last30Revenue,
          last30Count: succeededRecent.length,
          thisMonth: thisMonthSales,
          thisMonthCount: thisMonthCharges.length,
          mrr,
          activeSubCount: (activeSubs.data || []).length,
          total: totalStripeRevenue,
          byMonth: stripeMonthly,
          recentPayments,
        };
      } catch (stripeErr) {
        console.error('Stripe fetch error:', stripeErr.message);
      }
    }

    const activeContacts = contacts.filter(c => !c.archived);
    const activeDeals = deals.filter(d => !d.archived);
    const activeProjects = projects.filter(p => !p.archived);
    const activeLeads = leads.filter(l => !l.archived);

    // Revenue = sum of Won + Completed deals
    const wonDeals = activeDeals.filter(d => d.stage === 'Won' || d.stage === 'Completed');
    const totalRevenue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);

    // Last 30 days revenue
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
    const last30DaysRevenue = activeDeals
      .filter(d => (Number(d.amount_paid) || 0) > 0 && (d.updated_at || '') >= thirtyDaysAgoISO)
      .reduce((s, d) => s + (Number(d.amount_paid) || 0), 0);

    // Invoiced = sum of paid invoices
    const totalInvoiced = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.amount) || 0), 0);

    // Pipeline value
    const pipelineValue = activeDeals
      .filter(d => !['Won', 'Lost', 'Completed'].includes(d.stage))
      .reduce((s, d) => s + (Number(d.value) || 0), 0);

    // Monthly revenue chart (last 12 months)
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      };
    });

    const revenueByMonth = {};
    wonDeals.forEach(d => {
      const k = d.created_at ? d.created_at.slice(0, 7) : null;
      if (k) revenueByMonth[k] = (revenueByMonth[k] || 0) + (Number(d.value) || 0);
    });

    const stripeByMonth = stripeRevenue?.byMonth || {};
    const monthlyChart = months.map(m => ({
      label: m.label,
      revenue: (revenueByMonth[m.key] || 0) + (stripeByMonth[m.key] || 0),
      deals: revenueByMonth[m.key] || 0,
      stripe: stripeByMonth[m.key] || 0,
    }));

    // Deals by stage
    const dealsByStage = activeDeals.reduce((acc, d) => {
      acc[d.stage] = (acc[d.stage] || 0) + 1;
      return acc;
    }, {});

    // Recent deals (last 6)
    const recentDeals = [...activeDeals]
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, 6);

    // Invoice breakdown
    const invoiceStats = {
      total: invoices.length,
      sent: invoices.filter(i => i.status === 'open').length,
      paid: invoices.filter(i => i.status === 'paid').length,
      totalAmount: invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0),
      paidAmount: invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.amount) || 0), 0),
    };

    // Lead interest tallies
    const leadsInterested = activeLeads.filter(l => l.interest === 'up').length;
    const leadsUninterested = activeLeads.filter(l => l.interest === 'down').length;
    const leadsContacted = leadsInterested + leadsUninterested;

    return res.json({
      totalRevenue,
      totalInvoiced,
      pipelineValue,
      activeClients: activeContacts.length,
      activeProjects: activeProjects.filter(p => !['Completed', 'Cancelled'].includes(p.status)).length,
      completedProjects: activeProjects.filter(p => p.status === 'Completed').length,
      openLeads: activeLeads.filter(l => l.status !== 'Converted').length,
      activeDeals: activeDeals.filter(d => !['Won', 'Lost', 'Completed'].includes(d.stage)).length,
      last30DaysRevenue,
      monthlyChart,
      dealsByStage,
      recentDeals,
      invoiceStats,
      leadsContacted,
      leadsInterested,
      leadsUninterested,
      stripeRevenue,
    });
  } catch (err) {
    console.error('CRM dashboard error:', err);
    return res.status(500).json({ error: err.message });
  }
}
