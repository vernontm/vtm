import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      return res.json(await supaFetch('crm_quick_notes?order=created_at.desc'));
    }

    if (req.method === 'POST') {
      const result = await supaFetch('crm_quick_notes', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_quick_notes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_quick_notes?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM quick-notes error:', err);
    return res.status(500).json({ error: err.message });
  }
}
