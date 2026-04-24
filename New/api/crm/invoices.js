import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id, deal_id, action } = req.query;

  try {
    if (req.method === 'GET') {
      let query = 'crm_invoices?order=created_at.desc';
      if (deal_id) query += `&deal_id=eq.${deal_id}`;
      return res.json(await supaFetch(query));
    }

    if (req.method === 'POST' && !action) {
      // Create invoice - Stripe integration will be added in Phase 3
      const result = await supaFetch('crm_invoices', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'POST' && action === 'refresh' && id) {
      // Placeholder for Stripe refresh - Phase 3
      return res.json({ message: 'Stripe integration pending' });
    }

    if (req.method === 'POST' && action === 'void' && id) {
      await supaFetch(`crm_invoices?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'void', updated_at: new Date().toISOString() }),
      });
      return res.json({ success: true });
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_invoices?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM invoices error:', err);
    return res.status(500).json({ error: err.message });
  }
}
