import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { password } = req.body;

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Create a token: HMAC of password + expiry timestamp (24h from now)
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const secret = process.env.ADMIN_PASSWORD;
  const hmac = crypto.createHmac('sha256', secret).update(`${expiry}`).digest('hex');
  const token = `${expiry}.${hmac}`;

  return res.status(200).json({ token });
}
