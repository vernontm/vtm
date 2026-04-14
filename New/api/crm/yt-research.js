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
      const { video_id } = req.body;
      if (!video_id) return res.status(400).json({ error: 'video_id required' });

      // Mark as processing
      await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ transcription_status: 'processing', updated_at: new Date().toISOString() }),
      });

      // Fetch the video record
      const videos = await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`);
      const video = videos?.[0];
      if (!video?.video_url) throw new Error('Video URL not found');

      // Extract video ID from URL
      const vidMatch = video.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
      if (!vidMatch) throw new Error('Invalid YouTube URL');
      const ytVideoId = vidMatch[1];

      // Use youtubei.js to get video info and caption tracks
      const { Innertube } = require('youtubei.js');
      const yt = await Innertube.create();
      const info = await yt.getInfo(ytVideoId);

      // Auto-fill title and channel if missing
      const autoTitle = info.basic_info?.title || '';
      const autoChannel = info.basic_info?.author || '';
      if (autoTitle || autoChannel) {
        const updates = {};
        if (!video.video_title && autoTitle) updates.video_title = autoTitle;
        if (!video.channel_name && autoChannel) updates.channel_name = autoChannel;
        if (Object.keys(updates).length) {
          await supaFetch(`crm_yt_competitor_videos?id=eq.${video_id}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
          });
        }
      }

      // Get caption tracks
      const tracks = info.captions?.caption_tracks || [];
      if (!tracks.length) throw new Error('No captions/subtitles available for this video.');

      // Prefer English manual, then English auto, then first track
      const track = tracks.find(t => t.language_code === 'en' && t.kind !== 'asr')
        || tracks.find(t => t.language_code === 'en')
        || tracks[0];

      console.log(`Found caption track: ${track.language_code} (${track.kind || 'manual'})`);

      // Fetch captions XML (the server's real IP makes the signed URL work)
      const capRes = await fetch(track.base_url);
      const xml = await capRes.text();

      let transcript = '';
      if (xml && xml.length > 0) {
        // Parse XML: <text start="0" dur="5.1">caption text here</text>
        const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
          .map(m => m[1]
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n/g, ' ')
          );
        transcript = segments.join(' ').replace(/  +/g, ' ').trim();
        console.log(`Parsed ${segments.length} caption segments, ${transcript.length} chars`);
      }

      if (!transcript || transcript.length < 20) {
        throw new Error('Could not extract transcript. Captions may be empty or restricted.');
      }

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
