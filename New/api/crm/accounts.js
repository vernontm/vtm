import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      if (id) {
        const [item] = await supaFetch(`crm_accounts?id=eq.${id}`);
        return item ? res.json(item) : res.status(404).json({ error: 'Not found' });
      }
      return res.json(await supaFetch('crm_accounts?order=created_at.desc'));
    }

    if (req.method === 'POST') {
      if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
      const result = await supaFetch('crm_accounts', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_accounts?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_accounts?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM accounts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
