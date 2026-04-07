import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [contacts, deals, projects, invoices, leads] = await Promise.all([
      supaFetch('crm_contacts?select=id,archived'),
      supaFetch('crm_deals?select=id,name,stage,value,amount_paid,payment_status,created_at,updated_at,archived'),
      supaFetch('crm_projects?select=id,status,value,archived'),
      supaFetch('crm_invoices?select=id,status,amount'),
      supaFetch('crm_leads?select=id,status,interest,lead_segment,archived,created_at'),
    ]);

    // ── Stripe Revenue ────────────────────────────────────────────────────────
    let stripeRevenue = null;
    const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
    if (STRIPE_KEY && !STRIPE_KEY.includes('REPLACE')) {
      try {
        const stripeHeaders = { 'Authorization': `Bearer ${STRIPE_KEY}` };
        const stripeFetch = async (path) => {
          const r = await fetch(`https://api.stripe.com/v1${path}`, { headers: stripeHeaders });
          if (!r.ok) throw new Error(`Stripe ${r.status}`);
          return r.json();
        };

        const thirtyDaysAgoTs = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        const yearAgoTs = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);

        const [balance, recentCharges, yearCharges] = await Promise.all([
          stripeFetch('/balance'),
          stripeFetch(`/charges?created[gte]=${thirtyDaysAgoTs}&limit=100`),
          stripeFetch(`/charges?created[gte]=${yearAgoTs}&limit=100&status=succeeded`),
        ]);

        const availableBalance = balance.available.reduce((s, b) => s + b.amount, 0) / 100;
        const pendingBalance = balance.pending.reduce((s, b) => s + b.amount, 0) / 100;

        const succeededRecent = recentCharges.data.filter(c => c.status === 'succeeded');
        const last30Revenue = succeededRecent.reduce((s, c) => s + c.amount, 0) / 100;
        const totalStripeRevenue = yearCharges.data.reduce((s, c) => s + c.amount, 0) / 100;

        const stripeByMonth = {};
        yearCharges.data.forEach(c => {
          const d = new Date(c.created * 1000);
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          stripeByMonth[k] = (stripeByMonth[k] || 0) + c.amount / 100;
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
          total: totalStripeRevenue,
          byMonth: stripeByMonth,
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
