const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/stats', (req, res) => {
  const contacts = db.get('contacts').filter(c => !c.archived).value();
  const deals    = db.get('deals').filter(d => !d.archived).value();
  const projects = db.get('projects').filter(p => !p.archived).value();
  const invoices = db.get('invoices').value();
  const leads    = db.get('leads').filter(l => !l.archived).value();

  // Revenue = sum of Won + Completed deals
  const wonDeals = deals.filter(d => d.stage === 'Won' || d.stage === 'Completed');
  const totalRevenue = wonDeals.reduce((s, d) => s + (d.value || 0), 0);

  // Last 30 days revenue = Paid deals (payment_status=Paid) updated within last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
  const last30DaysRevenue = deals
    .filter(d => (d.amount_paid || 0) > 0 && (d.updated_at || '') >= thirtyDaysAgoISO)
    .reduce((s, d) => s + (d.amount_paid || 0), 0);

  // Invoiced = sum of paid invoices
  const totalInvoiced = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0);

  // Pipeline value = sum of active deals
  const pipelineValue = deals
    .filter(d => !['Won', 'Lost', 'Completed'].includes(d.stage))
    .reduce((s, d) => s + (d.value || 0), 0);

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
    if (k) revenueByMonth[k] = (revenueByMonth[k] || 0) + (d.value || 0);
  });

  const monthlyChart = months.map(m => ({
    label: m.label,
    revenue: revenueByMonth[m.key] || 0,
  }));

  // Deals by stage
  const dealsByStage = deals.reduce((acc, d) => {
    acc[d.stage] = (acc[d.stage] || 0) + 1;
    return acc;
  }, {});

  // Recent deals (last 5)
  const recentDeals = [...deals]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 6);

  // Invoice breakdown
  const invoiceStats = {
    total:   invoices.length,
    sent:    invoices.filter(i => i.status === 'open').length,
    paid:    invoices.filter(i => i.status === 'paid').length,
    totalAmount: invoices.reduce((s, i) => s + (i.amount || 0), 0),
    paidAmount:  invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0),
  };

  // Lead interest tallies
  const leadsInterested   = leads.filter(l => l.interest === 'up').length;
  const leadsUninterested = leads.filter(l => l.interest === 'down').length;
  const leadsContacted    = leadsInterested + leadsUninterested;

  res.json({
    totalRevenue,
    totalInvoiced,
    pipelineValue,
    activeClients:   contacts.length,
    activeProjects:  projects.filter(p => !['Completed', 'Cancelled'].includes(p.status)).length,
    completedProjects: projects.filter(p => p.status === 'Completed').length,
    openLeads: leads.filter(l => l.status !== 'Converted').length,
    activeDeals: deals.filter(d => !['Won', 'Lost', 'Completed'].includes(d.stage)).length,
    last30DaysRevenue,
    monthlyChart,
    dealsByStage,
    recentDeals,
    invoiceStats,
    leadsContacted,
    leadsInterested,
    leadsUninterested,
  });
});

module.exports = router;
