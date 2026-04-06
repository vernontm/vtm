import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, lead_id, contact_id } = req.query;

  try {
    if (req.method === 'GET') {
      let query = 'crm_activities?order=created_at.desc';
      if (lead_id) query += `&lead_id=eq.${lead_id}`;
      if (contact_id) query += `&contact_id=eq.${contact_id}`;
      return res.json(await supaFetch(query));
    }

    if (req.method === 'POST') {
      const result = await supaFetch('crm_activities', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_activities?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM activities error:', err);
    return res.status(500).json({ error: err.message });
  }
}
