import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id, project_id } = req.query;

  try {
    if (req.method === 'GET') {
      if (project_id) {
        return res.json(await supaFetch(`crm_project_items?project_id=eq.${project_id}&order=created_at.asc`));
      }
      return res.json(await supaFetch('crm_project_items?order=created_at.asc'));
    }

    if (req.method === 'POST') {
      const result = await supaFetch('crm_project_items', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_project_items?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_project_items?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM project-items error:', err);
    return res.status(500).json({ error: err.message });
  }
}
