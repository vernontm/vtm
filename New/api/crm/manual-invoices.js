import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, deal_id } = req.query;

  try {
    if (req.method === 'GET') {
      let query = 'crm_manual_invoices?order=created_at.desc';
      if (deal_id) query += `&deal_id=eq.${deal_id}`;
      return res.json(await supaFetch(query));
    }

    if (req.method === 'POST') {
      const result = await supaFetch('crm_manual_invoices', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_manual_invoices?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_manual_invoices?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM manual-invoices error:', err);
    return res.status(500).json({ error: err.message });
  }
}
