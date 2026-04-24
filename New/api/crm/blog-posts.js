const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase');

function generateSlug(title) {
  if (!title) return null;
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id } = req.query;

  try {
    // GET - list all posts (including unpublished)
    if (req.method === 'GET') {
      const posts = await supaFetch('blog_posts?order=created_at.desc');
      return res.status(200).json(posts);
    }

    // POST - create new post
    if (req.method === 'POST') {
      const body = { ...req.body };
      if (body.title && !body.slug) body.slug = generateSlug(body.title);
      const post = await supaFetch('blog_posts', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return res.status(201).json(post);
    }

    // PUT - update post
    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const data = { ...req.body, updated_at: new Date().toISOString() };
      if (data.title && !data.slug) data.slug = generateSlug(data.title);
      const post = await supaFetch(`blog_posts?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.status(200).json(post);
    }

    // DELETE
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`blog_posts?id=eq.${id}`, { method: 'DELETE' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Blog posts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
