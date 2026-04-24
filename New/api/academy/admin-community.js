import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    if (req.method === 'GET') {
      const posts = await supaFetch('academy_community_posts?order=created_at.desc');

      // Fetch author names and reply counts
      const userIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
      let profileMap = {};
      if (userIds.length > 0) {
        const profiles = await supaFetch(
          `academy_profiles?id=in.(${userIds.join(',')})&select=id,full_name,avatar_url`
        );
        for (const p of profiles) profileMap[p.id] = p;
      }

      // Get reply counts
      const postIds = posts.map(p => p.id);
      let replyCounts = {};
      if (postIds.length > 0) {
        const replies = await supaFetch(
          `academy_community_replies?post_id=in.(${postIds.join(',')})&select=post_id`
        );
        for (const r of replies) {
          replyCounts[r.post_id] = (replyCounts[r.post_id] || 0) + 1;
        }
      }

      const result = posts.map(p => ({
        ...p,
        author_name: profileMap[p.user_id]?.full_name || 'Unknown',
        avatar_url: profileMap[p.user_id]?.avatar_url || null,
        reply_count: replyCounts[p.id] || 0,
      }));

      return res.json(result);
    }

    if (req.method === 'PUT' && id) {
      if (action === 'pin') {
        // Toggle pin — fetch current state first
        const rows = await supaFetch(`academy_community_posts?id=eq.${id}&select=pinned`);
        const current = rows[0]?.pinned || false;
        const result = await supaFetch(`academy_community_posts?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ pinned: !current }),
        });
        return res.json(result[0] || { success: true, pinned: !current });
      }

      return res.status(400).json({ error: 'action is required (pin)' });
    }

    if (req.method === 'DELETE' && id) {
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
