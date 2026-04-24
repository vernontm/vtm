import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const { status } = req.query;
      let path = 'academy_homework_submissions?select=*,academy_profiles(full_name,avatar_url),academy_lessons(title)&order=submitted_at.desc';
      if (status) path += `&status=eq.${status}`;
      const submissions = await supaFetch(path);
      return res.json(submissions);
    }

    if (req.method === 'PUT') {
      const { id, status, admin_feedback } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      const data = {};
      if (status) data.status = status;
      if (admin_feedback !== undefined) data.admin_feedback = admin_feedback;
      data.reviewed_at = new Date().toISOString();

      const result = await supaFetch(`academy_homework_submissions?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-homework error:', err);
    return res.status(500).json({ error: err.message });
  }
}
