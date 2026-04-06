import crypto from 'crypto';

function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const [expiry, hmac] = token.split('.');
  if (!expiry || !hmac) return false;
  if (Date.now() > parseInt(expiry)) return false;
  const expected = crypto.createHmac('sha256', process.env.ADMIN_PASSWORD).update(`${expiry}`).digest('hex');
  return hmac === expected;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });

  const base = `${process.env.SUPABASE_URL}/rest/v1/blog_posts`;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  const headers = {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };

  try {
    // GET all posts (including unpublished)
    if (req.method === 'GET') {
      const response = await fetch(`${base}?order=created_at.desc`, { headers });
      const posts = await response.json();
      return res.status(200).json(posts);
    }

    // POST create new post
    if (req.method === 'POST') {
      const response = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body),
      });
      if (!response.ok) {
        const err = await response.text();
        console.error('Supabase POST error:', response.status, err);
        return res.status(502).json({ error: 'Database error', details: err });
      }
      const post = await response.json();
      return res.status(201).json(post);
    }

    // PUT update post
    if (req.method === 'PUT') {
      const { id, ...data } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      data.updated_at = new Date().toISOString();
      const response = await fetch(`${base}?id=eq.${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(data),
      });
      const post = await response.json();
      return res.status(200).json(post);
    }

    // DELETE post
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await fetch(`${base}?id=eq.${id}`, { method: 'DELETE', headers });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin posts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
