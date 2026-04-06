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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/leads?order=created_at.desc`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    if (!response.ok) return res.status(502).json({ error: 'Database error' });
    const leads = await response.json();
    return res.status(200).json(leads);
  } catch (err) {
    console.error('Admin leads error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
