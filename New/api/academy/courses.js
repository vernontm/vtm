import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { slug, public: isPublic } = req.query;

  try {
    if (req.method === 'GET') {
      // Public browsing — no auth required, returns limited fields
      if (isPublic === 'true') {
        if (slug) {
          const rows = await supaFetch(`academy_courses?slug=eq.${encodeURIComponent(slug)}&status=eq.published&select=id,title,slug,description,cover_image_url,status,sort_order,stripe_product_id,allow_free_preview`);
          if (!rows[0]) return res.status(404).json({ error: 'Course not found' });
          // Get lesson count + free lesson count
          const lessons = await supaFetch(`academy_lessons?course_id=eq.${rows[0].id}&status=eq.published&select=id,title,description,sort_order,is_free_preview,drip_days`);
          return res.json({ ...rows[0], lessons: lessons || [] });
        }
        const courses = await supaFetch('academy_courses?status=eq.published&order=sort_order.asc&select=id,title,slug,description,cover_image_url,status,sort_order,stripe_product_id,allow_free_preview');
        // Get lesson counts per course
        for (const c of courses) {
          const lessons = await supaFetch(`academy_lessons?course_id=eq.${c.id}&status=eq.published&select=id,is_free_preview`);
          c.lesson_count = lessons?.length || 0;
          c.free_lesson_count = lessons?.filter(l => l.is_free_preview)?.length || 0;
        }
        return res.json(courses);
      }

      // Authenticated browsing
      const user = await requireStudentAuth(req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

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
