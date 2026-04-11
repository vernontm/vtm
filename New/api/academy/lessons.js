import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { course_id, id } = req.query;

  try {
    if (req.method === 'GET') {
      if (id) {
        const rows = await supaFetch(`academy_lessons?id=eq.${id}&select=*,academy_lesson_content_items(*)&status=eq.published`);
        return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Lesson not found' });
      }
      if (course_id) {
        const lessons = await supaFetch(`academy_lessons?course_id=eq.${course_id}&status=eq.published&order=sort_order.asc`);
        return res.json(lessons);
      }
      return res.status(400).json({ error: 'course_id or id is required' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy lessons error:', err);
    return res.status(500).json({ error: err.message });
  }
}
