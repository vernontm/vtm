import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { lesson_id } = req.query;

  try {
    if (req.method === 'GET') {
      if (!lesson_id) return res.status(400).json({ error: 'lesson_id is required' });
      const quizzes = await supaFetch(
        `academy_quizzes?lesson_id=eq.${lesson_id}&select=*,academy_quiz_questions(*)`
      );
      return res.json(quizzes[0] || null);
    }

    if (req.method === 'POST') {
      const { quiz_id, answers } = req.body;
      if (!quiz_id || !answers) return res.status(400).json({ error: 'quiz_id and answers are required' });

      // Fetch quiz questions to calculate score
      const questions = await supaFetch(`academy_quiz_questions?quiz_id=eq.${quiz_id}`);
      if (!questions.length) return res.status(404).json({ error: 'Quiz not found' });

      let correct = 0;
      for (const q of questions) {
        if (answers[q.id] === q.correct_option_id) correct++;
      }
      const score = Math.round((correct / questions.length) * 100);

      const passed = score >= 70;
      const attempt = {
        user_id: user.id,
        quiz_id,
        answers,
        score,
        passed,
        created_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_quiz_attempts', {
        method: 'POST',
        body: JSON.stringify(attempt),
      });
      return res.status(201).json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy quizzes error:', err);
    return res.status(500).json({ error: err.message });
  }
}
