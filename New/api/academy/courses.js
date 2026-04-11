import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { slug } = req.query;

  try {
    if (req.method === 'GET') {
      if (slug) {
        const rows = await supaFetch(`academy_courses?slug=eq.${encodeURIComponent(slug)}&status=eq.published`);
        return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Course not found' });
      }
      const courses = await supaFetch('academy_courses?status=eq.published&order=sort_order.asc');
      return res.json(courses);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy courses error:', err);
    return res.status(500).json({ error: err.message });
  }
}
