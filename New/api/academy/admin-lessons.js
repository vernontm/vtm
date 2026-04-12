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
        if (!rows[0]) return res.status(404).json({ error: 'Lesson not found' });

        // Attach quiz questions
        const lesson = rows[0];
        const quizzes = await supaFetch(`academy_quizzes?lesson_id=eq.${id}`);
        if (quizzes.length > 0) {
          const questions = await supaFetch(`academy_quiz_questions?quiz_id=eq.${quizzes[0].id}&order=sort_order.asc`);
          lesson.quiz = questions.map(q => ({
            question: q.question_text,
            options: Array.isArray(q.options) ? q.options.map(o => typeof o === 'string' ? o : (o.text || '')) : [],
            correct_answer: q.correct_option_id ? q.correct_option_id.charCodeAt(0) - 97 : 0,
          }));
        } else {
          lesson.quiz = [];
        }

        return res.json(lesson);
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
      const { id: _, quiz, content, academy_lesson_content, ...data } = req.body;
      data.updated_at = new Date().toISOString();

      // Save lesson fields
      const result = await supaFetch(`academy_lessons?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });

      // Save quiz if provided
      if (Array.isArray(quiz)) {
        // Get or create quiz for this lesson
        let quizzes = await supaFetch(`academy_quizzes?lesson_id=eq.${id}`);
        let quizId;
        if (quizzes.length === 0) {
          const created = await supaFetch('academy_quizzes', {
            method: 'POST',
            body: JSON.stringify({ lesson_id: id, title: 'Lesson Quiz', created_at: new Date().toISOString() }),
          });
          quizId = (created[0] || created).id;
        } else {
          quizId = quizzes[0].id;
        }

        // Delete existing questions and re-insert
        await supaFetch(`academy_quiz_questions?quiz_id=eq.${quizId}`, { method: 'DELETE' });
        if (quiz.length > 0) {
          const questions = quiz.map((q, i) => ({
            quiz_id: quizId,
            question_text: q.question || q.question_text || '',
            options: Array.isArray(q.options) ? q.options.map((opt, oi) => (
              typeof opt === 'string' ? { id: String.fromCharCode(97 + oi), text: opt } : opt
            )) : [],
            correct_option_id: typeof q.correct_answer === 'number'
              ? String.fromCharCode(97 + q.correct_answer)
              : (q.correct_option_id || 'a'),
            sort_order: i,
          }));
          await supaFetch('academy_quiz_questions', {
            method: 'POST',
            body: JSON.stringify(questions),
          });
        }
      }

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
