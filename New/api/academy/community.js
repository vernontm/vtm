import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { page, action, post_id } = req.query;

  try {
    if (req.method === 'GET') {
      const pageNum = parseInt(page) || 0;
      const limit = 20;
      const offset = pageNum * limit;
      // Get top-level posts (parent_id is null) with reply counts
      const posts = await supaFetch(
        `academy_community_posts?parent_id=is.null&select=*,replies:academy_community_posts(count)&order=created_at.desc&limit=${limit}&offset=${offset}`
      );
      return res.json(posts);
    }

    if (req.method === 'POST') {
      if (action === 'reply' && post_id) {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'message is required' });
        const reply = {
          user_id: user.id,
          parent_id: post_id,
          message,
          created_at: new Date().toISOString(),
        };
        const result = await supaFetch('academy_community_posts', {
          method: 'POST',
          body: JSON.stringify(reply),
        });
        return res.status(201).json(result[0] || result);
      }

      // Create new post
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });
      const post = {
        user_id: user.id,
        message,
        created_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_community_posts', {
        method: 'POST',
        body: JSON.stringify(post),
      });
      return res.status(201).json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy community error:', err);
    return res.status(500).json({ error: err.message });
  }
}
