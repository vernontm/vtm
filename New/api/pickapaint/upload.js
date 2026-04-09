import crypto from 'crypto';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Parse multipart form data to extract the file
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'No boundary found' });
    }

    // Extract file from multipart body
    const { fileBuffer, fileMimeType } = parseMultipart(body, boundary);
    if (!fileBuffer) {
      return res.status(400).json({ error: 'No image file found in upload' });
    }

    const ext = fileMimeType.includes('png') ? 'png' : fileMimeType.includes('webp') ? 'webp' : 'jpg';
    const filename = `pickapaint_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;

    const SUPA_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.CRM_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    const uploadRes = await fetch(
      `${SUPA_URL}/storage/v1/object/pickapaint-uploads/${filename}`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': fileMimeType,
        },
        body: fileBuffer,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('Supabase upload error:', err);
      return res.status(502).json({ error: 'Upload failed' });
    }

    const publicUrl = `${SUPA_URL}/storage/v1/object/public/pickapaint-uploads/${filename}`;
    return res.status(200).json({ url: publicUrl });
  } catch (err) {
    console.error('Upload handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function parseMultipart(body, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;

  while (true) {
    const idx = body.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    if (start > 0) {
      parts.push(body.slice(start, idx));
    }
    start = idx + boundaryBuf.length;
    // Skip \r\n after boundary
    if (body[start] === 0x0d && body[start + 1] === 0x0a) start += 2;
  }

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = part.slice(0, headerEnd).toString();
    if (!headers.includes('filename=')) continue;

    const fileBuffer = part.slice(headerEnd + 4, part.length - 2); // trim trailing \r\n
    const mimeMatch = headers.match(/Content-Type:\s*(.+)/i);
    const fileMimeType = mimeMatch ? mimeMatch[1].trim() : 'image/jpeg';

    return { fileBuffer, fileMimeType };
  }

  return { fileBuffer: null, fileMimeType: null };
}
