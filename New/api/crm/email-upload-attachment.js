const { setCors, requireAuth, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

// General-purpose email attachment upload.
// Accepts docs, PDFs, images, etc. — anything under 25MB.
// Stores in the `email-attachments` bucket and returns a public URL that
// the send-time queue processor fetches back and folds into the outgoing email.

const BUCKET = 'email-attachments';
const MAX_BYTES = 25 * 1024 * 1024;

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { client_id, filename, content_type, data_base64 } = req.body || {};
    if (!client_id || !filename || !data_base64) {
      return res.status(400).json({ error: 'client_id, filename, data_base64 required' });
    }

    const b64 = data_base64.includes(',') ? data_base64.split(',')[1] : data_base64;
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'File too large (max 25MB)' });
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const key = `${client_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;
    const mime = content_type || 'application/octet-stream';

    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': mime,
        'x-upsert': 'true',
      },
      body: buffer,
    });
    if (!upRes.ok) {
      const errText = await upRes.text();
      return res.status(500).json({ error: `Upload failed: ${errText}` });
    }

    const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
    return res.json({ url, key, name: safeName, mime, size: buffer.length });
  } catch (err) {
    console.error('email attachment upload error:', err);
    return res.status(500).json({ error: err.message });
  }
};
