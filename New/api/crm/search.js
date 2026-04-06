import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ leads: [], contacts: [], deals: [], accounts: [], projects: [] });

  const term = q.trim().toLowerCase();

  try {
    // Search across multiple tables using ilike
    const [leads, contacts, deals, accounts, projects] = await Promise.all([
      supaFetch(`crm_leads?or=(name.ilike.*${term}*,email.ilike.*${term}*,company.ilike.*${term}*,phone.ilike.*${term}*)&limit=10`),
      supaFetch(`crm_contacts?or=(name.ilike.*${term}*,email.ilike.*${term}*,company.ilike.*${term}*,phone.ilike.*${term}*)&limit=10`),
      supaFetch(`crm_deals?or=(name.ilike.*${term}*,company.ilike.*${term}*)&limit=10`),
      supaFetch(`crm_accounts?or=(name.ilike.*${term}*,email.ilike.*${term}*,industry.ilike.*${term}*)&limit=10`),
      supaFetch(`crm_projects?or=(name.ilike.*${term}*,client.ilike.*${term}*)&limit=10`),
    ]);

    return res.json({ leads, contacts, deals, accounts, projects });
  } catch (err) {
    console.error('CRM search error:', err);
    return res.status(500).json({ error: err.message });
  }
}
