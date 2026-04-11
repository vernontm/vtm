import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      let path = 'academy_community_posts?select=*,academy_profiles(full_name,avatar_url),reply_count:academy_community_replies(count)&order=created_at.desc';
      const posts = await supaFetch(path);
      return res.json(posts);
    }

    if (req.method === 'PUT') {
      const { id, pinned } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      const data = {};
      if (pinned !== undefined) data.pinned = pinned;

      const result = await supaFetch(`academy_community_posts?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param is required' });

      // Delete replies first, then the post
      await supaFetch(`academy_community_replies?post_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await supaFetch(`academy_community_posts?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-community error:', err);
    return res.status(500).json({ error: err.message });
  }
}
