import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { page, action, post_id } = req.query;

  try {
    if (req.method === 'GET') {
      const pageNum = parseInt(page) || 0;
      const limit = 20;
      const offset = pageNum * limit;

      const posts = await supaFetch(
        `academy_community_posts?order=created_at.desc&limit=${limit}&offset=${offset}`
      );

      // Fetch author names
      const userIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
      let profileMap = {};
      if (userIds.length > 0) {
        const profiles = await supaFetch(
          `academy_profiles?id=in.(${userIds.join(',')})&select=id,full_name,avatar_url`
        );
        for (const p of profiles) profileMap[p.id] = p;
      }

      // Fetch replies for these posts
      const postIds = posts.map(p => p.id);
      let repliesMap = {};
      if (postIds.length > 0) {
        const replies = await supaFetch(
          `academy_community_replies?post_id=in.(${postIds.join(',')})&order=created_at.asc`
        );
        // Get reply author names
        const replyUserIds = [...new Set(replies.map(r => r.user_id).filter(Boolean))];
        for (const uid of replyUserIds) {
          if (!profileMap[uid]) {
            // will be fetched below
          }
        }
        const missingIds = replyUserIds.filter(id => !profileMap[id]);
        if (missingIds.length > 0) {
          const moreProfiles = await supaFetch(
            `academy_profiles?id=in.(${missingIds.join(',')})&select=id,full_name,avatar_url`
          );
          for (const p of moreProfiles) profileMap[p.id] = p;
        }

        for (const r of replies) {
          if (!repliesMap[r.post_id]) repliesMap[r.post_id] = [];
          repliesMap[r.post_id].push({
            ...r,
            author_name: profileMap[r.user_id]?.full_name || 'Student',
          });
        }
      }

      const result = posts.map(p => ({
        ...p,
        author_name: profileMap[p.user_id]?.full_name || 'Student',
        avatar_url: profileMap[p.user_id]?.avatar_url || null,
        replies: repliesMap[p.id] || [],
        reply_count: (repliesMap[p.id] || []).length,
      }));

      return res.json(result);
    }

    if (req.method === 'POST') {
      if (action === 'reply' && post_id) {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'message is required' });
        const reply = {
          post_id,
          user_id: user.id,
          message,
          created_at: new Date().toISOString(),
        };
        const result = await supaFetch('academy_community_replies', {
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
