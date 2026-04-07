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

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!verifyToken(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const contentType = req.headers['content-type'];
    const ext = contentType.includes('video') ? 'mp4' : contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

    const SUPA_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

    const uploadRes = await fetch(
      `${SUPA_URL}/storage/v1/object/blog-media/${filename}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': contentType,
        },
        body: body,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Upload error:', err);
      return res.status(502).json({ error: 'Upload failed' });
    }

    const publicUrl = `${SUPA_URL}/storage/v1/object/public/blog-media/${filename}`;
    return res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error('Upload handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
