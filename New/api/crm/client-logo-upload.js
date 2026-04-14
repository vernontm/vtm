const { setCors, requireAuth, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const BUCKET = 'client-logos';

// Uploads a client's logo image to the `client-logos` storage bucket.
// Body: { client_id, filename, content_type, data_base64 }
// Returns: { url, key }
module.exports = async function handler(req, res) {
  setCors(res);
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

    const maxBytes = 5 * 1024 * 1024; // 5MB plenty for a logo
    if (buffer.length > maxBytes) return res.status(413).json({ error: 'File too large (max 5MB)' });

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
    const key = `${client_id}/${Date.now()}_${safeName}`;

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

    // Persist on the client row
    await fetch(`${SUPABASE_URL}/rest/v1/crm_content_clients?id=eq.${client_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ logo_url: publicUrl }),
    });

    return res.json({ url: publicUrl, key });
  } catch (err) {
    console.error('Client logo upload error:', err);
    return res.status(500).json({ error: err.message });
  }
};
