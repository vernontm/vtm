import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      if (id) {
        const rows = await supaFetch(`academy_courses?id=eq.${id}`);
        return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Course not found' });
      }
      const courses = await supaFetch('academy_courses?order=sort_order.asc');
      return res.json(courses);
    }

    if (req.method === 'POST') {
      const data = { ...req.body, created_at: new Date().toISOString() };
      const result = await supaFetch('academy_courses', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`academy_courses?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`academy_courses?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-courses error:', err);
    return res.status(500).json({ error: err.message });
  }
}
