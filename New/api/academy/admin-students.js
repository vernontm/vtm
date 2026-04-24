import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const { id, search } = req.query;

      // Single student detail
      if (id) {
        const profiles = await supaFetch(`academy_profiles?id=eq.${id}&select=*`);
        if (!profiles[0]) return res.status(404).json({ error: 'Student not found' });
        const profile = profiles[0];

        const [progress, quizAttempts, homework, loginEvents] = await Promise.all([
          supaFetch(`academy_user_progress?user_id=eq.${id}&completed=eq.true&select=*`),
          supaFetch(`academy_quiz_attempts?user_id=eq.${id}&select=*&order=created_at.desc`),
          supaFetch(`academy_homework_submissions?user_id=eq.${id}&select=*&order=submitted_at.desc`),
          supaFetch(`academy_login_events?user_id=eq.${id}&select=*&order=created_at.desc&limit=50`),
        ]);

        return res.json({
          ...profile,
          progress,
          quiz_attempts: quizAttempts,
          homework_submissions: homework,
          login_events: loginEvents,
        });
      }

      // List all students
      let path = 'academy_profiles?role=eq.student&select=*&order=created_at.desc';
      if (search) {
        path += `&full_name=ilike.*${search}*`;
      }
      const students = await supaFetch(path);

      // Get progress stats for each student
      const studentsWithStats = await Promise.all(
        students.map(async (s) => {
          const completed = await supaFetch(
            `academy_user_progress?user_id=eq.${s.id}&completed=eq.true&select=id`
          );
          return { ...s, lessons_completed: completed.length };
        })
      );

      return res.json(studentsWithStats);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-students error:', err);
    return res.status(500).json({ error: err.message });
  }
}
