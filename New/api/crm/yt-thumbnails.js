const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const KIE_API_KEY = process.env.KIE_API_KEY;

// ── Brand logo map: keyword → logo URL ──
const LOGO_BASE = 'https://ssllepovajmohdhvhzsa.supabase.co/storage/v1/object/public/publice_images/logos';
const BRAND_LOGOS = [
  { keywords: ['chatgpt', 'chat gpt', 'openai', 'gpt-4', 'gpt4', 'gpt-5', 'gpt5'], url: `${LOGO_BASE}/Chatgpt.png`, name: 'ChatGPT' },
  { keywords: ['claude', 'anthropic'], url: `${LOGO_BASE}/claude.png`, name: 'Claude' },
  { keywords: ['elevenlabs', 'eleven labs', '11labs'], url: `${LOGO_BASE}/elevenlabs.png`, name: 'ElevenLabs' },
  { keywords: ['github', 'git hub'], url: `${LOGO_BASE}/github.png`, name: 'GitHub' },
  { keywords: ['gmail', 'google mail'], url: `${LOGO_BASE}/gmail.png`, name: 'Gmail' },
  { keywords: ['heygen', 'hey gen'], url: `${LOGO_BASE}/heygen.jpeg`, name: 'HeyGen' },
  { keywords: ['higgsfield'], url: `${LOGO_BASE}/higgsfield.jpeg`, name: 'Higgsfield' },
  { keywords: ['nano banana', 'nanobanana'], url: `${LOGO_BASE}/Nano%20Banana.jpeg`, name: 'Nano Banana' },
  { keywords: ['openart', 'open art'], url: `${LOGO_BASE}/Openart.jpeg`, name: 'OpenArt' },
  { keywords: ['supabase', 'supa base'], url: `${LOGO_BASE}/supabase.jpeg`, name: 'Supabase' },
  { keywords: ['vercel'], url: `${LOGO_BASE}/vercel.png`, name: 'Vercel' },
];

function detectBrandLogos(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return BRAND_LOGOS.filter(b => b.keywords.some(k => lower.includes(k)));
}

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

      // Auto-detect brand logos from video title
      const detectedBrands = detectBrandLogos(video_title);
      const allLogoUrls = [...(logo_urls || [])];
      const detectedLogoNames = [];
      for (const brand of detectedBrands) {
        if (!allLogoUrls.includes(brand.url)) {
          allLogoUrls.push(brand.url);
        }
        detectedLogoNames.push(brand.name);
      }
      if (detectedBrands.length) {
        console.log(`Auto-detected brand logos: ${detectedLogoNames.join(', ')}`);
      }

      // ── Thumbnail example references for style guidance (4 representative samples to stay within token limits) ──
      const THUMB_EXAMPLE_BASE = 'https://ssllepovajmohdhvhzsa.supabase.co/storage/v1/object/public/publice_images/thumbnail_examples';
      const exampleIndices = [1, 5, 9, 13]; // 4 spread across the 16 examples
      const thumbExampleBlocks = exampleIndices.map(i => ({
        type: 'image',
        source: { type: 'url', url: `${THUMB_EXAMPLE_BASE}/${i}.png` },
      }));

      // Use Claude to create an optimized Kie.ai prompt using the VTM Image Prompt Enhancer system
      const analysisContext = inspiration_analysis
        ? `\nINSPIRATION ANALYSIS (match these visual patterns):\n${JSON.stringify(inspiration_analysis.combined || inspiration_analysis, null, 2)}`
        : '';

      const logoContext = allLogoUrls.length
        ? `\nInclude these brand logos/icons in the thumbnail composition: ${detectedLogoNames.length ? detectedLogoNames.join(', ') : 'brand logo'}. Place them visibly but not overwhelming — floating near the subject or in the background as recognizable elements.`
        : '';

      // CRITICAL: When character ref is provided, do NOT describe the person — the reference image handles that
      const characterContext = character_ref_url
        ? `\nIMPORTANT: A character reference image is provided. Do NOT describe the person's appearance (face, skin, hair, ethnicity, features). Instead, describe only their POSE, EXPRESSION, POSITION in frame, and INTERACTION with the scene. The AI model will use the reference image for the person's actual appearance. Example: "the person from the reference image positioned right of center, looking directly at camera with a confident expression, leaning slightly forward" — NOT "a man with brown hair and blue eyes".`
        : `\nDescribe the person/subject in the thumbnail with enough detail to generate them from scratch.`;

      const promptSystemPrompt = `You are a professional YouTube thumbnail prompt engineer using the VTM Image Prompt Enhancer system.

You will be shown reference thumbnail examples. Study their visual style, composition, color grading, text placement, and overall aesthetic. Use these as style guidance for the thumbnails you create.

IMPORTANT: The reference thumbnails may show video duration/length numbers in the bottom-right corner (e.g., "12:34", "1:05:23"). These are YouTube UI overlay elements — do NOT include any video duration numbers, timestamps, or runtime indicators in your prompt. Only include intentional design elements.

Build the prompt using this exact layer architecture:
[SUBJECT + POSE + POSITION] → [COMPOSITION + LAYOUT] → [LIGHTING] → [MOOD + COLOR GRADE] → [TEXT OVERLAY] → [QUALITY TAGS]

LAYER DETAILS:

1. SUBJECT + POSE: ${character_ref_url ? 'A character reference image is provided — do NOT describe the person\'s physical appearance. Only describe their pose, expression, body language, and position in frame. Say "the person from the reference image" and describe what they are DOING, not what they LOOK LIKE.' : 'Describe the person/subject in detail — what they look like, what they are doing, expression, pose.'}

2. COMPOSITION: YouTube thumbnail is 16:9. Use rule of thirds. Place subject on one side, text/graphics on the other. Leave space for text overlay. Think about what catches the eye at SMALL sizes (mobile feed).

3. LIGHTING: Be specific — not just "dramatic lighting" but exactly what kind:
   - Low-key side lighting with deep shadows = drama
   - Rim lighting from behind = glowing separation edge
   - Neon practical lights = colored ambient from environment
   - Golden hour backlight = warm, directional, natural rim halo
   Choose lighting that matches the video topic mood.

4. MOOD + COLOR GRADE: Pair mood with concrete color treatment:
   - Teal and orange grade = Hollywood blockbuster standard
   - Desaturated muted tones = prestige, sophisticated
   - High contrast with saturated accents = energetic, attention-grabbing
   - Dark gradient background = modern tech/tutorial feel

5. TEXT OVERLAY: Extract 2-5 punchy words from the video title. Describe text placement, size, color, and style (bold sans-serif, outline, shadow, glow). Text must be READABLE at small sizes.

6. QUALITY TAGS: End with: ultra-detailed, sharp focus, 8K, professional YouTube thumbnail, high contrast, vibrant${analysisContext}${logoContext}${characterContext}

RULES:
- Every word costs the AI's attention budget — make every word work
- Lead with subject + action, never with mood words alone
- No contradictions (e.g., don't say "f/1.8 deep focus")
- Be specific and concrete, not vague buzzwords
- ${character_ref_url ? 'NEVER describe the character\'s physical appearance — the reference image handles that' : 'Describe the subject in vivid detail'}
- Do NOT include video duration numbers, timestamps, or any numeric overlay elements from the reference thumbnails

Return ONLY valid JSON — an array of exactly 3 prompt strings. No markdown, no code blocks, no labels. Example format:
["prompt 1 here", "prompt 2 here", "prompt 3 here"]`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 3072,
          system: promptSystemPrompt,
          messages: [{
            role: 'user',
            content: [
              ...thumbExampleBlocks,
              {
                type: 'text',
                text: `Study the reference thumbnails above for style guidance. Now create 3 DISTINCT thumbnail generation prompts for this video. Each variation should have a different creative direction (e.g., different composition, color grade, mood, or text placement) while all staying on-brand and effective.\n\nTitle: "${video_title}"`,
              },
            ],
          }],
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        throw new Error(`AI prompt generation failed: ${err}`);
      }

      const aiData = await aiRes.json();
      const rawText = aiData.content[0].text.trim();

      // Parse the 3 prompts from Claude's response
      let imagePrompts;
      try {
        const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        imagePrompts = JSON.parse(cleaned);
        if (!Array.isArray(imagePrompts)) throw new Error('Not an array');
      } catch {
        // Fallback: try to extract JSON array
        const match = rawText.match(/\[[\s\S]*\]/);
        if (match) {
          imagePrompts = JSON.parse(match[0]);
        } else {
          // Last resort: use the whole text as a single prompt, generate 3 with same prompt
          imagePrompts = [rawText, rawText, rawText];
        }
      }
      // Ensure exactly 3
      while (imagePrompts.length < 3) imagePrompts.push(imagePrompts[0] || rawText);
      imagePrompts = imagePrompts.slice(0, 3);

      console.log(`Generated 3 thumbnail prompts for "${video_title}"`);

      // Fire off all 3 Kie.ai tasks in parallel
      const taskIds = await Promise.all(imagePrompts.map(async (prompt, i) => {
        if (character_ref_url) {
          console.log(`Thumbnail variation ${i + 1}: image-to-image (${model || 'nano-banana'})`);
          return imageToImage(character_ref_url, prompt, model);
        } else {
          console.log(`Thumbnail variation ${i + 1}: text-to-image (${model || 'nano-banana'})`);
          return generateImage(prompt, model);
        }
      }));

      // Wait for all 3 images in parallel
      const imgUrls = await Promise.all(taskIds.map(tid => waitForImage(tid)));

      // Upload all 3 to storage in parallel
      const storageResults = await Promise.all(imgUrls.map(async (imgUrl, i) => {
        const thumbnailId = Date.now().toString(36) + '_v' + (i + 1);
        return saveImageToStorage(imgUrl, client_id, thumbnailId);
      }));

      // Save all 3 thumbnail records
      const dbRows = storageResults.map((storageUrl, i) => ({
        client_id,
        script_id: script_id || null,
        video_title,
        result_url: storageUrl,
        generation_prompt: imagePrompts[i],
        vision_analysis: JSON.stringify(inspiration_analysis || {}),
        inspiration_urls: inspiration_analysis?.inspiration_urls || [],
        character_ref_url: character_ref_url || '',
        logo_urls: allLogoUrls,
        status: 'complete',
      }));

      const rows = await supaFetch('crm_yt_thumbnails', {
        method: 'POST',
        body: JSON.stringify(dbRows),
      });

      return res.json({
        thumbnails: rows || dbRows.map((r, i) => ({ ...r, result_url: storageResults[i] })),
        variations: storageResults.map((url, i) => ({
          result_url: url,
          generation_prompt: imagePrompts[i],
        })),
        count: 3,
      });
    } catch (err) {
      console.error('Generate thumbnail error:', err);
      return res.status(500).json({ error: 'Thumbnail generation failed: ' + err.message });
    }
  }

  // ── Edit/regenerate a thumbnail ──
  if (action === 'edit' && req.method === 'POST') {
    try {
      const { thumbnail_id, edit_prompt, model } = req.body;
      if (!thumbnail_id || !edit_prompt) {
        return res.status(400).json({ error: 'thumbnail_id and edit_prompt required' });
      }
      if (!KIE_API_KEY) return res.status(400).json({ error: 'KIE_API_KEY not configured' });

      // Fetch original thumbnail
      const thumbs = await supaFetch(`crm_yt_thumbnails?id=eq.${thumbnail_id}`);
      const thumb = thumbs?.[0];
      if (!thumb) return res.status(404).json({ error: 'Thumbnail not found' });
      if (!thumb.result_url) return res.status(400).json({ error: 'Original thumbnail has no image' });

      // Use image-to-image with the edit prompt on top of the original
      const fullPrompt = `${edit_prompt}. Maintain the overall composition and style of the original thumbnail.`;
      console.log(`Thumbnail edit: image-to-image on ${thumbnail_id} (${model || 'nano-banana'})`);
      const taskId = await imageToImage(thumb.result_url, fullPrompt, model || 'nano-banana');
      const imgUrl = await waitForImage(taskId);
      const newThumbId = Date.now().toString(36);
      const storageUrl = await saveImageToStorage(imgUrl, thumb.client_id, newThumbId);

      // Save as a new thumbnail record linked to the original
      const rows = await supaFetch('crm_yt_thumbnails', {
        method: 'POST',
        body: JSON.stringify([{
          client_id: thumb.client_id,
          script_id: thumb.script_id || null,
          video_title: thumb.video_title,
          result_url: storageUrl,
          generation_prompt: fullPrompt,
          vision_analysis: thumb.vision_analysis || '{}',
          inspiration_urls: thumb.inspiration_urls || [],
          character_ref_url: thumb.character_ref_url || '',
          logo_urls: thumb.logo_urls || [],
          status: 'complete',
        }]),
      });

      return res.json({
        thumbnail: rows?.[0] || { result_url: storageUrl },
        result_url: storageUrl,
        generation_prompt: fullPrompt,
      });
    } catch (err) {
      console.error('Edit thumbnail error:', err);
      return res.status(500).json({ error: 'Thumbnail edit failed: ' + err.message });
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
