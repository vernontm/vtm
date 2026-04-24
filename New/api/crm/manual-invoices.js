import { setCors, supaFetch, requireClientScope } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { clientId, all } = scope;
  const scopeFilter = all ? '' : `&client_id=eq.${clientId}`;

  const { id, deal_id } = req.query;

  try {
    if (req.method === 'GET') {
      let query = 'crm_manual_invoices?order=created_at.desc';
      if (!all) query += `&client_id=eq.${clientId}`;
      if (deal_id) query += `&deal_id=eq.${deal_id}`;
      return res.json(await supaFetch(query));
    }

    if (req.method === 'POST') {
      if (!clientId) return res.status(400).json({ error: 'X-Client-Id header required for create' });
      const payload = { ...req.body, client_id: clientId };
      const result = await supaFetch('crm_manual_invoices', { method: 'POST', body: JSON.stringify(payload) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, client_id: __, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_manual_invoices?id=eq.${id}${scopeFilter}`, { method: 'PATCH', body: JSON.stringify(data) });
      if (!result || (Array.isArray(result) && result.length === 0)) return res.status(404).json({ error: 'Not found' });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_manual_invoices?id=eq.${id}${scopeFilter}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM manual-invoices error:', err);
    return res.status(500).json({ error: err.message });
  }
}
