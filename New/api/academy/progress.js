import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { course_id } = req.query;

  try {
    if (req.method === 'GET') {
      if (!course_id) return res.status(400).json({ error: 'course_id is required' });
      // Get all lessons for this course, then fetch progress for those lessons
      const lessons = await supaFetch(`academy_lessons?course_id=eq.${course_id}&select=id`);
      const lessonIds = lessons.map(l => l.id);
      if (lessonIds.length === 0) return res.json([]);
      const progress = await supaFetch(
        `academy_user_progress?user_id=eq.${user.id}&lesson_id=in.(${lessonIds.join(',')})`
      );
      return res.json(progress);
    }

    if (req.method === 'POST') {
      const { lesson_id, watch_seconds, completed } = req.body;
      if (!lesson_id) return res.status(400).json({ error: 'lesson_id is required' });
      const record = {
        user_id: user.id,
        lesson_id,
        watch_seconds: watch_seconds || 0,
        completed: completed || false,
        last_watched_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_user_progress', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(record),
      });
      return res.json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy progress error:', err);
    return res.status(500).json({ error: err.message });
  }
}
