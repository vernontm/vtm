import { setCors, requireStaff } from './_lib/supabase.js';

// Dictation: the app records a clip, posts it here as multipart, and gets the
// words back from ElevenLabs speech to text. The bytes stream straight through
// and nothing is stored.
//
//   POST /api/transcribe   multipart/form-data (file + model_id)  ->  { text }
//
// Signed-in CRM users only. This spends real ElevenLabs credits and used to be
// open to anyone who found the URL, so it now authenticates like every other
// CRM endpoint and caps what one call can upload.
export const config = { api: { bodyParser: false } };

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB, far above any dictation clip

export default async function handler(req, res) {
  setCors(res, req);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const me = await requireStaff(req);
  if (!me) return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'Transcription is not configured: ELEVENLABS_API_KEY is not set.' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return res.status(400).json({ error: 'Send the audio as multipart/form-data.' });
  }

  try {
    // Read the body as it arrives, stopping the moment it goes over the cap.
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > MAX_BYTES) {
        return res.status(413).json({ error: 'Audio too large. Keep it under 25 MB.' });
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    if (!body.length) return res.status(400).json({ error: 'Audio file required' });

    // Forward the multipart form data untouched, boundary and all, so every
    // field the caller sent (file, model_id) survives the hop.
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': contentType,
      },
      body: body,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('ElevenLabs error:', err);
      return res.status(502).json({ error: 'Transcription service error' });
    }

    const data = await response.json();
    return res.status(200).json({ text: data.text || '' });

  } catch (error) {
    console.error('Transcribe handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
