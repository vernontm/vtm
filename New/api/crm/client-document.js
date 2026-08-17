import { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } from '../_lib/supabase.js';

// Client document upload + AI processing.
// POST /api/crm/client-document
//   body: { client_id, filename, content_type, data_base64 }
//   -> uploads to Supabase Storage (`client-documents` bucket)
//   -> creates a `crm_client_activity` note pointing at the file
//   -> best-effort: runs OpenAI over the text content (PDF/text/docx) to
//      generate a short summary + key facts, stored on the same activity row
//      so it shows inline in the timeline.

const BUCKET = 'client-documents';
const MAX_BYTES = 25 * 1024 * 1024;
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';

// Very small text extractor — pulls raw text out of common file types. Falls
// back to filename-only prompt for anything binary/unsupported so the summary
// step still runs but with less signal.
async function extractText(mime, buffer, filename) {
  const text = () => buffer.toString('utf-8').slice(0, 40000);
  if (!mime) mime = '';
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('csv') || filename.match(/\.(txt|md|csv|json)$/i)) {
    return text();
  }
  // PDFs: skip full parsing (would need pdfjs); AI can still work with filename + notes.
  return '';
}

async function summarizeWithAI(context, filename) {
  if (!OPENAI_KEY) return null;
  const prompt = `A user uploaded a client document called "${filename}". Below is the extracted content (may be truncated or empty for binary files). Return a JSON object with:
- "summary": one short paragraph (2-3 sentences) describing what this document appears to be about
- "key_points": array of 3-5 short bullet strings pulling out the most useful facts
- "suggested_next_step": one short sentence recommending what to do next in the client relationship

Content:
"""
${context.slice(0, 30000) || '(no extractable text; base your answer on the filename alone)'}
"""

Respond ONLY with valid JSON.`;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You extract structured summaries from client documents. Be concise. Always return JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  } catch { return null; }
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { client_id, filename, content_type, data_base64 } = req.body || {};
    if (!client_id || !filename || !data_base64) {
      return res.status(400).json({ error: 'client_id, filename, data_base64 required' });
    }
    const b64 = data_base64.includes(',') ? data_base64.split(',')[1] : data_base64;
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'File too large (max 25MB)' });
    const mime = content_type || 'application/octet-stream';
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const key = `${client_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    // 1. upload
    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
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

    // 2. AI summarize (best-effort)
    const context = await extractText(mime, buffer, filename);
    const ai = await summarizeWithAI(context, filename);

    // 3. record as an activity note so it shows up in Overview
    const bodyLines = [`📎 Uploaded: **${safeName}**`];
    if (ai?.summary) bodyLines.push('', `**Summary:** ${ai.summary}`);
    if (ai?.key_points?.length) {
      bodyLines.push('', '**Key points:**');
      ai.key_points.forEach(p => bodyLines.push(`• ${p}`));
    }
    if (ai?.suggested_next_step) bodyLines.push('', `**Next step:** ${ai.suggested_next_step}`);
    if (!ai) bodyLines.push('', '_AI summary unavailable — file uploaded and saved to activity._');

    const activityRow = await supaFetch('crm_client_activity', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        client_id,
        type: 'note',
        tag: 'Document',
        body: bodyLines.join('\n'),
        attachment_url: url,
        attachment_name: safeName,
        author: 'AI processor',
      }),
    });
    return res.json({
      url,
      key,
      name: safeName,
      mime,
      size: buffer.length,
      ai: ai || null,
      activity: activityRow?.[0] || null,
    });
  } catch (err) {
    console.error('client-document error:', err);
    return res.status(500).json({ error: err.message });
  }
}
