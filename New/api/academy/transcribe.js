import { setCors, requireAdminAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } from '../_lib/supabase.js';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { content_id, lesson_id } = req.body;
    if (!content_id) return res.status(400).json({ error: 'content_id is required' });

    // Get the content record
    const rows = await supaFetch(`academy_lesson_content?id=eq.${content_id}`);
    if (!rows[0]) return res.status(404).json({ error: 'Content not found' });

    const content = rows[0];
    if (!content.storage_url) return res.status(400).json({ error: 'No storage URL on content record' });

    // Mark as processing
    await supaFetch(`academy_lesson_content?id=eq.${content_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ transcription_status: 'processing' }),
    });

    // Download the file from Supabase storage
    const fileRes = await fetch(content.storage_url);
    if (!fileRes.ok) throw new Error('Failed to download file from storage');
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    // Determine filename and mime
    const fileName = content.file_name || 'media.mp4';
    const mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg'
      : fileName.endsWith('.wav') ? 'audio/wav'
      : fileName.endsWith('.m4a') ? 'audio/mp4'
      : 'video/mp4';

    // Build multipart form data for ElevenLabs
    const boundary = '----FormBoundary' + Date.now();
    const parts = [];

    // model_id field
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model_id"\r\n\r\n` +
      `scribe_v1\r\n`
    );

    // file field header
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`
    );

    // Combine into a single buffer
    const preFileBuffer = Buffer.from(parts.join(''));
    const postFileBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([preFileBuffer, fileBuffer, postFileBuffer]);

    // Call ElevenLabs Speech-to-Text
    const sttRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      await supaFetch(`academy_lesson_content?id=eq.${content_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ transcription_status: 'failed' }),
      });
      throw new Error(`Transcription failed: ${errText}`);
    }

    const sttData = await sttRes.json();
    const transcript = sttData.text || '';

    // Save transcript
    await supaFetch(`academy_lesson_content?id=eq.${content_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ transcript, transcription_status: 'complete' }),
    });

    // Auto-generate lesson title + description from transcript using Claude
    let generatedDescription = null;
    const targetLessonId = lesson_id || content.lesson_id;

    if (transcript.length > 20 && targetLessonId && ANTHROPIC_API_KEY) {
      try {
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: `Based on this video transcript, generate:\n1. A concise lesson title (max 10 words)\n2. A 2-3 sentence description of what this lesson covers\n\nReturn JSON: {"title": "...", "description": "..."}\n\nTranscript:\n${transcript.slice(0, 6000)}`,
            }],
            system: 'You are an expert course content creator. Return ONLY valid JSON, no markdown.',
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          const parsed = JSON.parse(raw);
          generatedDescription = parsed;

          // Update lesson with generated title/description (only if currently empty)
          const lessons = await supaFetch(`academy_lessons?id=eq.${targetLessonId}`);
          if (lessons[0]) {
            const updates = {};
            if (!lessons[0].title || lessons[0].title === 'Untitled Lesson' || lessons[0].title === '') {
              updates.title = parsed.title;
            }
            if (!lessons[0].description || lessons[0].description === '') {
              updates.description = parsed.description;
            }
            if (Object.keys(updates).length > 0) {
              updates.updated_at = new Date().toISOString();
              await supaFetch(`academy_lessons?id=eq.${targetLessonId}`, {
                method: 'PATCH',
                body: JSON.stringify(updates),
              });
            }
          }
        }
      } catch (aiErr) {
        console.error('AI description generation failed:', aiErr);
      }
    }

    return res.json({
      transcript,
      generated: generatedDescription,
      content_id,
      status: 'complete',
    });

  } catch (err) {
    console.error('Academy transcribe error:', err);
    return res.status(500).json({ error: err.message });
  }
}
