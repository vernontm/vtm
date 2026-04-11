import { setCors, requireAdminAuth, SUPABASE_URL, SERVICE_KEY } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'POST') {
      const { bucket, path, file, content_type } = req.body;
      if (!bucket || !path || !file) {
        return res.status(400).json({ error: 'bucket, path, and file (base64) are required' });
      }

      const fileBuffer = Buffer.from(file, 'base64');
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

      const uploadRes = await fetch(storageUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': content_type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: fileBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Storage upload failed ${uploadRes.status}: ${errText}`);
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
      return res.status(201).json({ url: publicUrl, bucket, path });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
