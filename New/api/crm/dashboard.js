import { setCors, requireAuth, supaFetch, SUPABASE_URL, headers } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Fetch counts and data in parallel
    const [leads, contacts, deals, projects, invoices, manualInvoices, activities, emailQueue] = await Promise.all([
      supaFetch('crm_leads?select=id,status,lead_segment,created_at'),
      supaFetch('crm_contacts?select=id'),
      supaFetch('crm_deals?select=id,stage,value,amount_paid,payment_status,created_at'),
      supaFetch('crm_projects?select=id,status,value'),
      supaFetch('crm_invoices?select=id,status,amount'),
      supaFetch('crm_manual_invoices?select=id,status,amount'),
      supaFetch('crm_activities?select=id,type,created_at&order=created_at.desc&limit=10'),
      supaFetch('crm_email_queue?select=id,status'),
    ]);

    // Pipeline stats
    const stages = {};
    deals.forEach(d => { stages[d.stage] = (stages[d.stage] || 0) + 1; });

    const totalRevenue = deals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    const wonDeals = deals.filter(d => d.stage === 'Won');
    const wonRevenue = wonDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    const totalPaid = deals.reduce((sum, d) => sum + (Number(d.amount_paid) || 0), 0);

    // Lead segment counts
    const segments = {};
    leads.forEach(l => { segments[l.lead_segment || 'cold'] = (segments[l.lead_segment || 'cold'] || 0) + 1; });

    return res.json({
      counts: {
        leads: leads.length,
        contacts: contacts.length,
        deals: deals.length,
        projects: projects.length,
      },
      pipeline: stages,
      revenue: { total: totalRevenue, won: wonRevenue, paid: totalPaid },
      leadSegments: segments,
      recentActivity: activities,
      emailQueue: {
        draft: emailQueue.filter(e => e.status === 'draft').length,
        approved: emailQueue.filter(e => e.status === 'approved').length,
        sent: emailQueue.filter(e => e.status === 'sent').length,
      },
    });
  } catch (err) {
    console.error('CRM dashboard error:', err);
    return res.status(500).json({ error: err.message });
  }
}
