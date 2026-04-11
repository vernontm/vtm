import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id, course_id, action, content_id } = req.query;

  try {
    // ── Content item management ──
    if (action === 'add-content' && req.method === 'POST') {
      const data = { ...req.body, created_at: new Date().toISOString() };
      const result = await supaFetch('academy_lesson_content', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.status(201).json(result[0] || result);
    }

    if (action === 'delete-content' && req.method === 'DELETE' && content_id) {
      await supaFetch(`academy_lesson_content?id=eq.${content_id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    // ── Standard lesson CRUD ──
    if (req.method === 'GET') {
      if (id) {
        const rows = await supaFetch(`academy_lessons?id=eq.${id}&select=*,academy_lesson_content(*)`);
        return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Lesson not found' });
      }
      if (course_id) {
        const lessons = await supaFetch(`academy_lessons?course_id=eq.${course_id}&order=sort_order.asc`);
        return res.json(lessons);
      }
      return res.status(400).json({ error: 'course_id or id is required' });
    }

    if (req.method === 'POST') {
      const data = { ...req.body, created_at: new Date().toISOString() };
      const result = await supaFetch('academy_lessons', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`academy_lessons?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`academy_lessons?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-lessons error:', err);
    return res.status(500).json({ error: err.message });
  }
}
