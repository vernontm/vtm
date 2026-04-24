const { setCors, requireAuth, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const BUCKET = 'email-images';

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Expect: { client_id, filename, content_type, data_base64 }
    const { client_id, filename, content_type, data_base64 } = req.body || {};
    if (!client_id || !filename || !data_base64) {
      return res.status(400).json({ error: 'client_id, filename, data_base64 required' });
    }

    // Decode base64 payload (strip data URI prefix if present)
    const b64 = data_base64.includes(',') ? data_base64.split(',')[1] : data_base64;
    const buffer = Buffer.from(b64, 'base64');

    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (buffer.length > maxBytes) return res.status(413).json({ error: 'File too large (max 10MB)' });

    // Sanitize filename → unique path
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const key = `${client_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': content_type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: buffer,
    });

    if (!upRes.ok) {
      const errText = await upRes.text();
      return res.status(500).json({ error: `Upload failed: ${errText}` });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
    return res.json({ url: publicUrl, key });
  } catch (err) {
    console.error('Email image upload error:', err);
    return res.status(500).json({ error: err.message });
  }
};
