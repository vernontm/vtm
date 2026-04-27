const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { client_id, script_id, storage_path, file_name } = req.body;
    if (!client_id || !script_id || !storage_path) {
      return res.status(400).json({ error: 'client_id, script_id, and storage_path are required' });
    }

    // Fetch client for brand context
    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}`);
    const client = clients?.[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Detect content type from filename. Images take a different path:
    // no transcription, just send the image to Claude vision for caption gen.
    const lowerName = (file_name || '').toLowerCase();
    const isImage = /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(lowerName);

    // ── IMAGE PATH ──
    if (isImage) {
      const downloadUrl = `${SUPABASE_URL}/storage/v1/object/content-media/${storage_path}`;
      const fileRes = await fetch(downloadUrl, {
        headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
      });
      if (!fileRes.ok) {
        const errText = await fileRes.text();
        throw new Error(`Failed to download image from storage: ${fileRes.status} ${errText}`);
      }
      const imgBuffer = Buffer.from(await fileRes.arrayBuffer());
      const imgB64 = imgBuffer.toString('base64');
      const mediaType = lowerName.endsWith('.png') ? 'image/png'
        : lowerName.endsWith('.webp') ? 'image/webp'
        : lowerName.endsWith('.gif') ? 'image/gif'
        : 'image/jpeg';

      let generated = {};
      if (ANTHROPIC_API_KEY) {
        const brandContext = [
          client.business_name ? `Business: ${client.business_name}` : '',
          client.industry ? `Industry: ${client.industry}` : '',
          client.location ? `Location: ${client.location}` : '',
          client.brand_bible ? `Brand Bible:\n${client.brand_bible}` : '',
          client.target_audience ? `Target Audience: ${client.target_audience}` : '',
          client.preferred_tone ? `Tone: ${client.preferred_tone}` : '',
          client.instagram_handle ? `Instagram: @${client.instagram_handle}` : '',
          client.tiktok_handle ? `TikTok: @${client.tiktok_handle}` : '',
          client.threads_handle ? `Threads: @${client.threads_handle}` : '',
          client.core_hashtags ? `MANDATORY CORE HASHTAGS (always include first): ${client.core_hashtags}` : '',
        ].filter(Boolean).join('\n');

        const today = new Date().toISOString().slice(0, 10);
        const prompt = `You are a social media content creator. Look at this image and the brand context below, then generate content for posting this image on social media.

TODAY'S DATE: ${today}

BRAND CONTEXT:
${brandContext}

Generate the following:
1. "title" - A short, click-worthy title for this image (max 10 words)
2. "caption" - An engaging social media caption that complements the image. Match the brand voice. 1-3 short paragraphs.
3. "hashtags" - Include any core brand hashtags from the brand bible first, then 4-6 image/topic-specific ones.
4. "first_comment" - An engagement-driving first comment (question or CTA)

RULES:
- NEVER use em dashes (—). Use commas, periods, or colons instead.
- Match the brand voice and tone from the brand bible
- Reference what's actually visible in the image
- Caption should drive engagement (question, story, or CTA)

Return ONLY valid JSON:
{"title": "...", "caption": "...", "hashtags": "...", "first_comment": "..."}`;

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
              max_tokens: 2000,
              system: 'You are an expert social media content creator. Return ONLY valid JSON, no markdown.',
              messages: [{
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: mediaType, data: imgB64 } },
                  { type: 'text', text: prompt },
                ],
              }],
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            generated = JSON.parse(raw);
          } else {
            console.error('Claude vision failed:', await aiRes.text());
          }
        } catch (aiErr) {
          console.error('Image AI generation failed:', aiErr);
        }
      }

      const updates = {
        title: generated.title || (file_name || '').replace(/\.[^.]+$/, '') || 'Untitled',
        caption: generated.caption || '',
        hashtags: generated.hashtags || '',
        first_comment: generated.first_comment || '',
        media_type: 'image',
        status: generated.caption ? 'caption_ready' : 'media_uploaded',
        updated_at: new Date().toISOString(),
      };
      await supaFetch(`crm_content_scripts?id=eq.${script_id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      return res.json({ script_id, kind: 'image', generated: !!generated.caption, ...updates });
    }

    // ── Step 1: Transcribe via ElevenLabs ──
    let transcript = '';
    let firstWordMs = null; // cover frame: first word start time in ms

    if (ELEVENLABS_API_KEY) {
      // Download file from Supabase storage using service key (bucket may be private)
      const downloadUrl = `${SUPABASE_URL}/storage/v1/object/content-media/${storage_path}`;
      const fileRes = await fetch(downloadUrl, {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
        },
      });
      if (!fileRes.ok) {
        const errText = await fileRes.text();
        throw new Error(`Failed to download video from storage: ${fileRes.status} ${errText}`);
      }
      const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

      const name = file_name || 'video.mp4';
      const mimeType = name.endsWith('.mp3') ? 'audio/mpeg'
        : name.endsWith('.wav') ? 'audio/wav'
        : name.endsWith('.m4a') ? 'audio/mp4'
        : name.endsWith('.mov') ? 'video/quicktime'
        : 'video/mp4';

      // Build multipart form data
      const boundary = '----FormBoundary' + Date.now();
      const parts = [];
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n`
      );
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      );

      const preFileBuffer = Buffer.from(parts.join(''));
      const postFileBuffer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body = Buffer.concat([preFileBuffer, fileBuffer, postFileBuffer]);

      const sttRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      if (sttRes.ok) {
        const sttData = await sttRes.json();
        transcript = sttData.text || '';
        // ElevenLabs Scribe returns `words: [{ text, start, end, type }]`
        // Pick the first "word" type entry's start (seconds) + 100ms offset.
        const words = Array.isArray(sttData.words) ? sttData.words : [];
        const firstWord = words.find(w => (w.type === 'word' || !w.type) && typeof w.start === 'number');
        if (firstWord) {
          firstWordMs = Math.max(0, Math.round(firstWord.start * 1000) + 100);
        }
      } else {
        const errText = await sttRes.text();
        console.error('ElevenLabs STT failed:', errText);
      }
    }

    // ── Step 2: AI Generate content using transcript + brand bible ──
    let generated = {};

    if (ANTHROPIC_API_KEY && transcript.length > 20) {
      const brandContext = [
        client.business_name ? `Business: ${client.business_name}` : '',
        client.industry ? `Industry: ${client.industry}` : '',
        client.location ? `Location: ${client.location}` : '',
        client.brand_bible ? `Brand Bible:\n${client.brand_bible}` : '',
        client.target_audience ? `Target Audience: ${client.target_audience}` : '',
        client.preferred_tone ? `Tone: ${client.preferred_tone}` : '',
        client.instagram_handle ? `Instagram: @${client.instagram_handle}` : '',
        client.tiktok_handle ? `TikTok: @${client.tiktok_handle}` : '',
        client.threads_handle ? `Threads: @${client.threads_handle}` : '',
        client.core_hashtags ? `MANDATORY CORE HASHTAGS (always include first): ${client.core_hashtags}` : '',
      ].filter(Boolean).join('\n');

      const today = new Date().toISOString().slice(0, 10);
      const prompt = `You are a social media content creator. Based on this video transcript and the brand context below, generate content for posting this video on social media.

TODAY'S DATE: ${today}

BRAND CONTEXT:
${brandContext}

VIDEO TRANSCRIPT:
${transcript.slice(0, 8000)}

Generate the following:
1. "title" - A short, click-worthy, engaging title for this video (max 12 words)
2. "hook" - The opening 1-2 sentences that hook viewers
3. "full_script" - A cleaned up version of the transcript as a readable script
4. "caption" - An engaging social media caption to post with this video. Match the brand voice.
5. "hashtags" - Include any core brand hashtags from the brand bible first, then 4-6 topic-specific ones.
6. "first_comment" - An engagement-driving first comment (question or call to action)

RULES:
- NEVER use em dashes (—). Use commas, periods, or colons instead.
- Match the brand voice and tone from the brand bible
- Make the caption punchy and engaging
- The title should be curiosity-driven, not generic

Return ONLY valid JSON:
{"title": "...", "hook": "...", "full_script": "...", "caption": "...", "hashtags": "...", "first_comment": "..."}`;

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
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }],
            system: 'You are an expert social media content creator. Return ONLY valid JSON, no markdown.',
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          generated = JSON.parse(raw);
        }
      } catch (aiErr) {
        console.error('AI generation failed:', aiErr);
      }
    }

    // ── Step 3: Update the script row with all generated content ──
    const updates = {
      title: generated.title || file_name?.replace(/\.[^.]+$/, '') || 'Untitled',
      hook: generated.hook || '',
      full_script: generated.full_script || transcript || '',
      caption: generated.caption || '',
      hashtags: generated.hashtags || '',
      first_comment: generated.first_comment || '',
      status: generated.caption ? 'caption_ready' : (transcript ? 'media_uploaded' : 'draft'),
      updated_at: new Date().toISOString(),
    };
    if (firstWordMs != null) updates.cover_timestamp = firstWordMs;

    await supaFetch(`crm_content_scripts?id=eq.${script_id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });

    return res.json({
      script_id,
      transcript_length: transcript.length,
      generated: !!generated.title,
      scheduled: false,
      ...updates,
    });

  } catch (err) {
    console.error('Bulk upload processing error:', err);
    return res.status(500).json({ error: err.message });
  }
};
