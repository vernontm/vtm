export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id, slug } = req.query;
    const SUPA_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.CRM_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    let url = `${SUPA_URL}/rest/v1/blog_posts?published=eq.true&order=created_at.desc`;

    if (id) {
      url = `${SUPA_URL}/rest/v1/blog_posts?id=eq.${id}&published=eq.true`;
    } else if (slug) {
      url = `${SUPA_URL}/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&published=eq.true`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
    });

    if (!response.ok) return res.status(502).json({ error: 'Database error' });

    const posts = await response.json();

    if (id || slug) {
      return res.status(200).json(posts[0] || null);
    }

    return res.status(200).json(posts);
  } catch (err) {
    console.error('Posts fetch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
