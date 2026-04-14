const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // ── Add a competitor video ──
  if (action === 'add' && req.method === 'POST') {
    try {
      const { client_id, video_url, video_title, channel_name } = req.body;
      if (!client_id || !video_url) return res.status(400).json({ error: 'client_id and video_url required' });

      const rows = await supaFetch('crm_yt_competitor_videos', {
        method: 'POST',
        body: JSON.stringify([{
          client_id,
          video_url,
          video_title: video_title || null,
          channel_name: channel_name || null,
        }]),
      });

      return res.json(rows?.[0] || { created: true });
    } catch (err) {
      console.error('Add video error:', err);
      return res.status(500).json({ error: 'Failed to add video: ' + err.message });
    }
  }

  // ── Transcribe a video ──
  if (action === 'transcribe' && req.method === 'POST') {
    try {
      const { video_id, audio_url } = req.body;
      if (!video_id) return res.status(400).json({ error: 'video_id required' });
      if (!ELEVENLABS_API_KEY) return res.status(400).json({ error: 'ELEVENLABS_API_KEY not configured' });

      // Mark as processing
      await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ transcription_status: 'processing', updated_at: new Date().toISOString() }),
      });

      let fileBuffer, fileName, mimeType;

      if (audio_url) {
        // Direct audio URL provided (e.g. from Supabase storage upload)
        const fileRes = await fetch(audio_url);
        if (!fileRes.ok) throw new Error('Failed to download audio');
        fileBuffer = Buffer.from(await fileRes.arrayBuffer());
        const urlPath = new URL(audio_url).pathname;
        fileName = urlPath.split('/').pop() || 'audio.mp4';
      } else {
        // Extract audio from YouTube URL automatically
        const videos = await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`);
        const video = videos?.[0];
        if (!video?.video_url) throw new Error('Video URL not found');

        // Use cobalt API to extract audio from YouTube
        const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            url: video.video_url,
            isAudioOnly: true,
            aFormat: 'mp3',
            filenamePattern: 'basic',
          }),
        });

        if (!cobaltRes.ok) {
          const errText = await cobaltRes.text();
          throw new Error(`Audio extraction failed: ${errText}`);
        }

        const cobaltData = await cobaltRes.json();
        const downloadUrl = cobaltData.url;
        if (!downloadUrl) throw new Error('No download URL from audio extractor. Try uploading the audio file manually.');

        console.log('Downloading audio from:', downloadUrl);
        const audioRes = await fetch(downloadUrl);
        if (!audioRes.ok) throw new Error('Failed to download extracted audio');
        fileBuffer = Buffer.from(await audioRes.arrayBuffer());
        fileName = 'audio.mp3';
      }

      mimeType = fileName.endsWith('.mp3') ? 'audio/mpeg'
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
        throw new Error(`Transcription failed: ${errText}`);
      }

      const sttData = await sttRes.json();
      const transcript = sttData.text || '';

      // Save transcript to the video record
      await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ transcript, transcription_status: 'complete', updated_at: new Date().toISOString() }),
      });

      return res.json({ transcript, video_id, status: 'complete' });
    } catch (err) {
      console.error('Transcribe error:', err);
      // Mark as failed
      await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ transcription_status: 'failed', updated_at: new Date().toISOString() }),
      }).catch(() => {});
      return res.status(500).json({ error: 'Transcription failed: ' + err.message });
    }
  }

  // ── Analyze a transcribed video ──
  if (action === 'analyze' && req.method === 'POST') {
    try {
      const { video_id } = req.body;
      if (!video_id) return res.status(400).json({ error: 'video_id required' });
      if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });

      // Fetch the video record
      const videos = await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`);
      const video = videos?.[0];
      if (!video) return res.status(404).json({ error: 'Video not found' });
      if (!video.transcript) return res.status(400).json({ error: 'Video has no transcript. Transcribe it first.' });

      const systemPrompt = `You are a YouTube content strategist and analyst. Analyze this video transcript in detail.

Identify every pattern that could be reused in future videos:
- Hooks: The opening lines designed to grab attention. Note the type (question, bold claim, story, statistic, curiosity gap) and rate effectiveness 1-100.
- Intros: How the creator transitions from hook to main content. Note the style (direct, story-based, credibility, problem-statement).
- CTAs: Every call to action in the video. Note where it appears (beginning, middle, end, throughout).
- Structure: Break down the video into logical sections with timestamps if discernible.
- Virality factors: What makes this video shareable or engaging.

Return ONLY valid JSON in this exact format:
{
  "topics": ["topic1", "topic2"],
  "hooks": [{"text": "exact hook text", "type": "question|bold_claim|story|statistic|curiosity_gap", "effectiveness": 85}],
  "intros": [{"text": "intro text or summary", "style": "direct|story|credibility|problem_statement"}],
  "ctas": [{"text": "exact CTA text", "placement": "beginning|middle|end"}],
  "structure": {"sections": [{"heading": "section name", "summary": "what this section covers", "approximate_position": "beginning|middle|end"}]},
  "virality_score": 75,
  "key_takeaways": ["takeaway1", "takeaway2"]
}

Be thorough. Extract EVERY hook, intro pattern, and CTA you can find.`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: `Analyze this YouTube video transcript:\n\nTitle: ${video.video_title || 'Unknown'}\nChannel: ${video.channel_name || 'Unknown'}\n\nTranscript:\n${video.transcript.slice(0, 30000)}`,
          }],
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        throw new Error(`AI analysis failed: ${err}`);
      }

      const aiData = await aiRes.json();
      const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      let analysis;
      try {
        analysis = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) analysis = JSON.parse(match[0]);
        else throw new Error('Failed to parse AI analysis response');
      }

      // Save analysis to the video record
      await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ analysis, updated_at: new Date().toISOString() }),
      });

      // Extract patterns into knowledge base
      const knowledgeRows = [];
      const client_id = video.client_id;

      for (const hook of (analysis.hooks || [])) {
        knowledgeRows.push({
          client_id,
          source_video_id: video_id,
          category: 'hooks',
          pattern_text: hook.text,
          effectiveness_score: hook.effectiveness || 0,
          metadata: { type: hook.type },
        });
      }

      for (const intro of (analysis.intros || [])) {
        knowledgeRows.push({
          client_id,
          source_video_id: video_id,
          category: 'intros',
          pattern_text: intro.text,
          metadata: { style: intro.style },
        });
      }

      for (const cta of (analysis.ctas || [])) {
        knowledgeRows.push({
          client_id,
          source_video_id: video_id,
          category: 'ctas',
          pattern_text: cta.text,
          metadata: { placement: cta.placement },
        });
      }

      if (knowledgeRows.length > 0) {
        await supaFetch('crm_yt_knowledge_base', {
          method: 'POST',
          body: JSON.stringify(knowledgeRows),
        });
      }

      return res.json({ analysis, patterns_extracted: knowledgeRows.length, video_id });
    } catch (err) {
      console.error('Analyze error:', err);
      return res.status(500).json({ error: 'Analysis failed: ' + err.message });
    }
  }

  // ── Batch add videos ──
  if (action === 'batch' && req.method === 'POST') {
    try {
      const { client_id, video_urls } = req.body;
      if (!client_id || !video_urls || !video_urls.length) {
        return res.status(400).json({ error: 'client_id and video_urls array required' });
      }

      const records = video_urls.map(v => ({
        client_id,
        video_url: v.url,
        video_title: v.title || null,
        channel_name: v.channel || null,
      }));

      const rows = await supaFetch('crm_yt_competitor_videos', {
        method: 'POST',
        body: JSON.stringify(records),
      });

      return res.json(rows);
    } catch (err) {
      console.error('Batch add error:', err);
      return res.status(500).json({ error: 'Batch add failed: ' + err.message });
    }
  }

  // ── List videos ──
  if (req.method === 'GET') {
    try {
      let query = 'crm_yt_competitor_videos?order=created_at.desc';
      if (req.query.client_id) query += `&client_id=eq.${req.query.client_id}`;

      const rows = await supaFetch(query);
      return res.json(rows);
    } catch (err) {
      console.error('List videos error:', err);
      return res.status(500).json({ error: 'Failed to list videos: ' + err.message });
    }
  }

  // ── Delete a video ──
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });

      await supaFetch(`crm_yt_competitor_videos?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      console.error('Delete video error:', err);
      return res.status(500).json({ error: 'Delete failed: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action or method' });
};
