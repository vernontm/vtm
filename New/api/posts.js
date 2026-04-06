export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    let url = `${process.env.SUPABASE_URL}/rest/v1/blog_posts?published=eq.true&order=created_at.desc`;

    if (id) {
      url = `${process.env.SUPABASE_URL}/rest/v1/blog_posts?id=eq.${id}&published=eq.true`;
    }

    const response = await fetch(url, {
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) return res.status(502).json({ error: 'Database error' });

    const posts = await response.json();

    if (id) {
      return res.status(200).json(posts[0] || null);
    }

    return res.status(200).json(posts);
  } catch (err) {
    console.error('Posts fetch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
