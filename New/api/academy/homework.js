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
      const submissions = await supaFetch(
        `academy_homework_submissions?user_id=eq.${user.id}&lesson_id=eq.${lesson_id}&order=submitted_at.desc`
      );
      return res.json(submissions);
    }

    if (req.method === 'POST') {
      const { lesson_id: lid, submission_text, file_urls } = req.body;
      if (!lid) return res.status(400).json({ error: 'lesson_id is required' });
      const submission = {
        user_id: user.id,
        lesson_id: lid,
        submission_text: submission_text || '',
        file_urls: file_urls || [],
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_homework_submissions', {
        method: 'POST',
        body: JSON.stringify(submission),
      });
      return res.status(201).json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy homework error:', err);
    return res.status(500).json({ error: err.message });
  }
}
