const { SUPABASE_URL, SERVICE_KEY, setCors, requireAuth } = require('../_lib/supabase');
import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const contentType = req.headers['content-type'] || 'application/octet-stream';
    const originalName = req.headers['x-file-name'] || '';
    const origExt = originalName.includes('.') ? originalName.split('.').pop().toLowerCase() : '';
    const ext = origExt
      || (contentType.includes('pdf') ? 'pdf'
      : contentType.includes('video') ? 'mp4'
      : contentType.includes('png') ? 'png'
      : contentType.includes('webp') ? 'webp'
      : contentType.includes('zip') ? 'zip'
      : contentType.includes('json') ? 'json'
      : contentType.includes('text') ? 'txt'
      : 'jpg');
    const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/blog-media/${filename}`,
      {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
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

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/blog-media/${filename}`;
    return res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error('Upload handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
