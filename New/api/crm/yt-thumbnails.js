const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KIE_API_KEY = process.env.KIE_API_KEY;

const MODELS = {
  'nano-banana': {
    id: 'google/nano-banana-edit',
    buildInput: (prompt, imageUrls) => ({
      prompt,
      image_urls: imageUrls,
      output_format: 'png',
      image_size: '16:9',
    }),
  },
  'seedream': {
    id: 'seedream/4.5-edit',
    buildInput: (prompt, imageUrls) => ({
      prompt,
      image_urls: imageUrls,
      aspect_ratio: '16:9',
      quality: 'basic',
      nsfw_checker: true,
    }),
  },
};

function getModel(modelKey) {
  return MODELS[modelKey] || MODELS['nano-banana'];
}

// ── Kie.ai: Image-to-Image edit ──
async function imageToImage(templateUrl, textPrompt, modelKey) {
  const model = getModel(modelKey);
  const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.id,
      input: model.buildInput(textPrompt, [templateUrl]),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kie.ai image-to-image error: ${res.status} ${err}`);
  }
  const data = await res.json();
  if (data.code && data.code !== 200) throw new Error(`Kie.ai error: ${data.msg || JSON.stringify(data)}`);
  return data.data?.taskId || data.taskId || data.data?.id;
}

// ── Kie.ai: Text-to-Image ──
async function generateImage(prompt, modelKey) {
  const model = getModel(modelKey);
  const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KIE_API_KEY}`,
    },
    body: JSON.stringify({
      model: model.id,
      input: model.buildInput(prompt, []),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Kie.ai generate error: ${res.status} ${err}`);
  }
  const data = await res.json();
  if (data.code && data.code !== 200) throw new Error(`Kie.ai error: ${data.msg || JSON.stringify(data)}`);
  return data.data?.taskId || data.taskId || data.data?.id;
}

// ── Kie.ai: Poll for task completion ──
async function waitForImage(taskId, maxWait = 240000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));

    const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
    });
    if (!res.ok) continue;
    const data = await res.json();

    const state = data.data?.state;
    if (state === 'success') {
      const resultJson = data.data?.resultJson;
      if (resultJson) {
        try {
          const parsed = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
          const url = parsed.resultUrls?.[0] || parsed.resultUrl;
          if (url) return url;
        } catch (e) {
          if (typeof resultJson === 'string' && resultJson.startsWith('http')) return resultJson;
        }
      }
      throw new Error('Kie.ai completed but no image URL in resultJson: ' + JSON.stringify(data.data).slice(0, 500));
    } else if (state === 'fail') {
      throw new Error(`Kie.ai generation failed: ${data.data?.failMsg || data.data?.failCode || 'unknown error'}`);
    }
  }
  throw new Error('Kie.ai image generation timed out');
}

// ── Download and upload to Supabase Storage ──
async function saveImageToStorage(imageUrl, clientId, thumbnailId) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error('Failed to download image from Kie.ai');
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  const filePath = `${clientId}/thumbnails/${thumbnailId}.png`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/content-media/${filePath}`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'image/png',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Storage upload error: ${err}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/content-media/${filePath}`;
}


module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // ── Analyze inspiration thumbnails ──
  if (action === 'analyze-inspiration' && req.method === 'POST') {
    try {
      const { inspiration_urls, video_title } = req.body;
      if (!inspiration_urls || !inspiration_urls.length) {
        return res.status(400).json({ error: 'inspiration_urls array required' });
      }
      if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });

      // Build image blocks for Claude Vision
      const imageBlocks = inspiration_urls.map(url => ({
        type: 'image',
        source: { type: 'url', url },
      }));

      const systemPrompt = `You are a YouTube thumbnail design expert. Analyze the provided thumbnail images and extract the visual design patterns that make them effective.

For each thumbnail, identify:
- Color scheme (dominant colors, accent colors, background treatment)
- Text placement (position, size relative to image, alignment)
- Facial expression (if a person is present: emotion, direction of gaze, intensity)
- Composition (rule of thirds, centered, asymmetric, layered)
- Visual effects (glow, shadow, blur, gradient, outline, 3D effect)
- Text style (font weight, color, outline, shadow, capitalization)
- Mood (energetic, calm, dramatic, playful, professional, urgent)

Then provide a COMBINED analysis summarizing the best patterns across all thumbnails.

Return ONLY valid JSON:
{
  "individual_analyses": [
    {
      "thumbnail_index": 0,
      "color_scheme": "description",
      "text_placement": "description",
      "facial_expression": "description or N/A",
      "composition": "description",
      "visual_effects": "description",
      "text_style": "description",
      "mood": "description"
    }
  ],
  "combined": {
    "color_scheme": "best patterns",
    "text_placement": "best patterns",
    "facial_expression": "best patterns",
    "composition": "best patterns",
    "visual_effects": "best patterns",
    "text_style": "best patterns",
    "mood": "best patterns"
  }
}`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              ...imageBlocks,
              {
                type: 'text',
                text: `Analyze these ${inspiration_urls.length} YouTube thumbnail(s).${video_title ? ` The video title is: "${video_title}"` : ''} Extract the design patterns that make them effective.`,
              },
            ],
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

      return res.json(analysis);
    } catch (err) {
      console.error('Analyze inspiration error:', err);
      return res.status(500).json({ error: 'Inspiration analysis failed: ' + err.message });
    }
  }

  // ── Generate a thumbnail ──
  if (action === 'generate' && req.method === 'POST') {
    try {
      const { client_id, script_id, video_title, character_ref_url, logo_urls, inspiration_analysis, model } = req.body;
      if (!client_id || !video_title) {
        return res.status(400).json({ error: 'client_id and video_title required' });
      }
      if (!ANTHROPIC_API_KEY) return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured' });
      if (!KIE_API_KEY) return res.status(400).json({ error: 'KIE_API_KEY not configured' });

      // Use Claude to create an optimized Kie.ai prompt
      const analysisContext = inspiration_analysis
        ? `\nINSPIRATION ANALYSIS (match these patterns):\n${JSON.stringify(inspiration_analysis.combined || inspiration_analysis, null, 2)}`
        : '';

      const logoContext = logo_urls?.length
        ? `\nInclude brand logos in the design.`
        : '';

      const characterContext = character_ref_url
        ? `\nThe thumbnail should feature the person from the character reference image in a creative, expressive pose related to the video topic.`
        : '';

      const promptSystemPrompt = `You are a YouTube thumbnail prompt engineer. Create a detailed image generation prompt for a YouTube thumbnail.

The prompt must describe:
1. A 16:9 YouTube thumbnail that is visually striking and click-worthy
2. The character/person in an expressive, engaging pose${characterContext}
3. Bold, readable text overlay with the video title or a shortened version
4. Eye-catching colors and visual effects${analysisContext}${logoContext}

RULES:
1. The prompt should be specific and detailed for an AI image generator
2. Describe the exact composition, colors, lighting, and text placement
3. Keep text overlay SHORT (3-6 words max from the title)
4. Emphasize contrast and readability at small sizes
5. Include dramatic lighting or effects that catch the eye

Return ONLY a plain text prompt string, no JSON, no code blocks. Just the prompt.`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          system: promptSystemPrompt,
          messages: [{
            role: 'user',
            content: `Create a thumbnail generation prompt for this video:\n\nTitle: "${video_title}"`,
          }],
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        throw new Error(`AI prompt generation failed: ${err}`);
      }

      const aiData = await aiRes.json();
      const imagePrompt = aiData.content[0].text.trim();

      // Generate the thumbnail via Kie.ai
      let taskId;
      if (character_ref_url) {
        console.log(`Thumbnail: image-to-image from character ref (${model || 'nano-banana'})`);
        taskId = await imageToImage(character_ref_url, imagePrompt, model);
      } else {
        console.log(`Thumbnail: text-to-image (${model || 'nano-banana'})`);
        taskId = await generateImage(imagePrompt, model);
      }

      const imgUrl = await waitForImage(taskId);
      const thumbnailId = Date.now().toString(36);
      const storageUrl = await saveImageToStorage(imgUrl, client_id, thumbnailId);

      // Save to crm_yt_thumbnails
      const rows = await supaFetch('crm_yt_thumbnails', {
        method: 'POST',
        body: JSON.stringify([{
          client_id,
          script_id: script_id || null,
          video_title,
          result_url: storageUrl,
          generation_prompt: imagePrompt,
          vision_analysis: JSON.stringify(inspiration_analysis || {}),
          inspiration_urls: inspiration_analysis?.inspiration_urls || [],
          character_ref_url: character_ref_url || '',
          logo_urls: logo_urls || [],
          status: 'complete',
        }]),
      });

      return res.json({
        thumbnail: rows?.[0] || { result_url: storageUrl },
        result_url: storageUrl,
        generation_prompt: imagePrompt,
      });
    } catch (err) {
      console.error('Generate thumbnail error:', err);
      return res.status(500).json({ error: 'Thumbnail generation failed: ' + err.message });
    }
  }

  // ── List thumbnails ──
  if (req.method === 'GET') {
    try {
      let query = 'crm_yt_thumbnails?order=created_at.desc';
      if (req.query.client_id) query += `&client_id=eq.${req.query.client_id}`;

      const rows = await supaFetch(query);
      return res.json(rows);
    } catch (err) {
      console.error('List thumbnails error:', err);
      return res.status(500).json({ error: 'Failed to list thumbnails: ' + err.message });
    }
  }

  // ── Delete a thumbnail ──
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });

      await supaFetch(`crm_yt_thumbnails?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      console.error('Delete thumbnail error:', err);
      return res.status(500).json({ error: 'Delete failed: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action or method' });
};
