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

// ── 16 thumbnail example prompts (pre-analyzed from reference images) ──
const THUMBNAIL_EXAMPLES = [
  `YouTube thumbnail, 16:9 aspect ratio, graphic design composition. A man positioned in the center-left of the frame, shot from a slightly low angle, looking directly into camera with a confident, slightly skeptical expression and one eyebrow raised. Subject is wearing glasses with thin dark frames and a casual dark crew-neck shirt. Behind his head on the left side is the Claude/Anthropic spiral sunburst logo icon in white/light gray, and on the right side is a bright orange-red radial sunburst logo. The background is a dark charcoal-to-black gradient with subtle texture. Bold white uppercase text at the top reads "SWITCH → CLAUDE" using a heavy, condensed sans-serif font. Key light from the front-right providing even illumination with soft shadows. Color palette: dark background (#1A1A2E), white (#FFFFFF), orange (#E8590C), warm tones. Rule of thirds with subject anchoring the left third and logos flanking. Mood is persuasive and tech-forward.`,
  `YouTube thumbnail, 16:9 aspect ratio, cinematic design composition. No human subject — fully graphic-based. The Anthropic snowflake-asterisk logo in the top-left corner in white. Below it, centered-left, bold white uppercase "INTRODUCING" in medium-weight sans-serif. Beneath that, much larger bold white uppercase "OPUS 4.7 LEAK" in heavy condensed sans-serif dominating the frame. Background features an abstract sweeping wave of warm orange-gold particles flowing diagonally from bottom-left to upper-right against a deep dark navy-black background (#0D0D1A). Particle wave gradient from deep burnt orange (#C65D07) to bright amber-gold (#F5A623). Thin orange border outlines the entire thumbnail. Mood is exclusive and dramatic, evoking a leaked announcement. Color palette: deep navy-black, bright amber-orange, white.`,
  `YouTube thumbnail, 16:9 aspect ratio, mixed photo-graphic composition. A person positioned in the bottom-right quadrant, shot from a slightly elevated angle, looking up at camera with a calm, composed expression and subtle smile. Bold white uppercase "CONTENT MARKETING" at top-left in heavy sans-serif, with "ON AUTOPILOT" below in bright orange/amber text. Center of frame shows a diagram/flowchart with the Claude Skills orange sunburst logo connected by lines to several smaller red/coral icons in an org-chart pattern suggesting automated workflow. Background is a light, airy off-white to soft gray gradient (#F0F0F0). Soft diffused lighting from front-left. Color palette: white (#FFFFFF), dark charcoal (#2D2D2D), bright orange (#E8731A), coral-red (#E05555). Z-pattern composition. Mood is professional, automated, and educational.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned center frame, shot straight-on at eye level, looking at camera with a friendly, approachable expression and slight smile. Large bold text: "AI" and "Project" in white on the left, "Ideas" in white on the right, clean heavy sans-serif font. Below the subject, five small app/tool icons in rounded squares including ChatGPT logo, brain icon, gear icon in muted purple, teal, and blue tones. Background is a soft lavender-to-light-purple gradient (#E8E0F0 to #D0C4E0) with subtle light rays or bokeh. Bright, even, soft front-facing lighting. Color palette: white (#FFFFFF), soft lavender (#D8CEE8), muted purple (#7B6BA0). Centered symmetrical composition. Mood is inspiring, creative, and beginner-friendly.`,
  `YouTube thumbnail, 16:9 aspect ratio, casual photo-based composition. A person positioned center-right, shot from a slightly elevated front angle, warm natural expression with a gentle smile. Seated at a desk with a laptop partially visible. Bold white uppercase "AI AGENT" then "COURSE" at top-left in heavy sans-serif. A 3D-style cartoon robot emoji in green/teal tones floats in the center. Behind the robot, a dark code editor screen faintly visible. Background is a natural, softly blurred interior with warm neutral tones. Natural soft window light from the left. Color palette: warm beige (#F5E6D3), white (#FFFFFF), teal-green (#2DB87A), dark charcoal (#333333). Rule of thirds. Mood is educational, approachable, and hands-on.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned center-left, shot at eye level, relaxed contemplative expression. Bold white uppercase "INVESTING" at the top in heavy sans-serif with subtle gold/tan texture fill. Below, "Your Money" in white text. A curved upward arrow in teal/dark green (#2E7D6B) sweeps from lower-left to upper-right symbolizing growth. Background is a rich muted sage-green to dark teal gradient (#4A7C6B to #2D5E4D). Soft diffused lighting with warm tone from front-right. Color palette: sage green (#5B8C7A), dark teal (#2D5E4D), white (#FFFFFF), warm gold (#D4A843). Rule of thirds. Mood is aspirational, financial, and educational.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned center-right, focused determined expression, holding or gesturing with a pen. Bold white text left side: "Complete" medium-weight, "AI" in very large bold, "Roadmap" medium-weight, "2026" in bold red (#E03030) with a curved red arrow below. Background shows faded mathematical equations in light gray suggesting academic depth. Soft even slightly warm front-facing lighting. Color palette: off-white/cream (#F5F0E8), white (#FFFFFF), bold red (#E03030). Left-heavy text balanced by subject on right. Mood is comprehensive, academic, and forward-looking.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned in the right third, slight angle, calm studious expression looking down slightly. Bold white "2026 Study Plan" at top-left in heavy sans-serif. Below text, a horizontal timeline graphic shows four connected nodes labeled "Jan," "Feb," "Mar," "Apr" with small circular icons connected by green dotted lines suggesting progression. Background is soft blurred neutral interior with warm beige/cream (#F0E8DD). Natural soft warm window light creating cozy study atmosphere. Color palette: warm cream (#F0E8DD), white (#FFFFFF), green (#4CAF50), muted coral/pink. Text top-left, timeline center, subject right. Mood is organized, motivational, and academic.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned center, eye level, relaxed confident half-smile. Bold white "Jobs of the Future" at top in large heavy sans-serif. Behind subject, a line graph with multiple colored trend lines (red, blue) with circle markers at data points. Faint text labels along lines: "Technology," "Environment," "Trades." Background transitions light gray-blue (#E0E5EA) left to slightly darker right. Soft even front-facing lighting. Color palette: white (#FFFFFF), light blue-gray (#D0D8E0), red (#E04040), blue (#4080C0). Subject centered with text above and data visualization behind. Mood is futuristic, informative, career-oriented.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned center-right, friendly enthusiastic expression with broad smile. Bold white "Open Source AI" at top, below in bold yellow/amber (#FFD700) with 3D effect "Fundamentals" in large letters. Between text and subject, hexagonal icons representing open-source AI tools — llama icon, rubber duck icon, tool logos in muted earth tones. Background is dark charcoal to near-black gradient (#1A1A1A to #2D2D2D). Bright front lighting contrasting dark background. Color palette: dark charcoal (#1A1A1A), white (#FFFFFF), bright yellow-amber (#FFD700). Upper text, middle icons, right subject. Mood is educational, community-driven, accessible.`,
  `YouTube thumbnail, 16:9 aspect ratio, minimalist photo-graphic. A person positioned in the right third, eye level front angle, pointing toward the left side with index finger and a knowing confident expression. Left two-thirds features five vertical color bars side by side — dark navy, green, blue-teal, lighter tone, coral/orange-red — each containing a small white logo at top representing different AI tools. Background behind subject is soft neutral gray (#D0D0D0). Soft natural front-facing lighting. Color palette: navy (#1A1A3E), green (#2E8B57), blue (#3A7BD5), coral-orange (#E8734A), white (#FFFFFF). Clear left-right split between colorful tool comparison and subject. Mood is comparative, informative, recommendation-oriented.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned center-right, eye level, slightly intense focused expression. Left side overlays a dark semi-transparent code editor showing green code text — "@pytest.fixture," "def driver," "username," "config.set" suggesting Python test automation. Bold text right side: "Coding in" white, "2026" larger font. Small programming language icons (Python, JavaScript) in rounded badges near text. Background dark moody gradient (#2A2A2A). Warm directional key light from front-right. Color palette: dark charcoal (#2A2A2A), green code (#4EC94E), white (#FFFFFF), Python yellow (#FFD43B), blue (#3776AB). Code left, subject right. Mood is technical, modern, developer-focused.`,
  `YouTube thumbnail, 16:9 aspect ratio, photo-graphic hybrid. A person positioned in the right third, warm professional expression with subtle smile. Bold white "Personal AI Workflows" at top-left in heavy sans-serif. Center-left shows a dark UI mockup/workflow panel with vertical list of automation steps — "Console," "Email," "Generate Email Draft," "Google Drive," "Upload File" — with small toggle indicators resembling n8n or Make interface. Background is dark warm-toned gradient (#2D2A28). Warm soft key light from front with gentle rim lighting. Color palette: dark warm charcoal (#2D2A28), white (#FFFFFF), muted UI blues and greens. Text top, workflow center-left, subject right. Mood is productivity-focused, personal, empowering.`,
  `YouTube thumbnail, 16:9 aspect ratio, clean photo-product composition. A person positioned center, eye level, neutral composed expression. Seated behind a silver Apple Mac Mini computer on surface. Bold white uppercase "LOCAL AI" at top in heavy sans-serif. Arranged in curved arc above Mac hardware: several app/tool icons in rounded square badges — Ollama, LM Studio, robot/AI icon — in orange, purple, yellow, green. Small white Apple logo visible on device. Background clean light neutral gray (#E8E8E8). Bright studio-quality even front lighting. Color palette: light gray (#E8E8E8), white (#FFFFFF), dark charcoal (#333333), colorful icons. Subject and hardware centered with icons arcing above. Mood is clean, technical, hardware-review oriented.`,
  `YouTube thumbnail, 16:9 aspect ratio, cinematic photo-typographic. A person positioned center, eye level, serene confident expression. Very large semi-transparent warm-toned text "Claude" fills background in soft serif font, muted warm beige/cream (#D4C4A8), slightly blurred creating depth — subject partially overlaps the letters. Below subject, bold "Beginner" left in white, dotted arrow line leading to "Pro" right, suggesting progression. Claude/Anthropic orange sunburst logo near "Pro" text. Background warm soft golden-cream gradient (#E8D8C0 to #C8B898) with dreamy quality. Warm golden diffused lighting. Color palette: warm cream (#E8D8C0), golden beige (#C8B898), white (#FFFFFF), orange (#E8731A). Subject centered with typographic background and bottom progression bar. Mood is aspirational, polished, journey-oriented.`,
  `YouTube thumbnail, 16:9 aspect ratio, professional graphic design composition. A confident man positioned in the left third of the frame, shot straight-on at eye level, looking directly into camera with an open, approachable expression and a warm genuine smile. Subject is wearing a clean, dark black button-up shirt or blazer over a dark top, presenting a modern professional look. Background is a rich deep purple-to-dark-navy gradient (#2A1845 to #1A0E30) with subtle geometric hexagonal line patterns in faint purple. Right side: large bold uppercase "SETUP CLAUDE" in white heavy sans-serif at top, "FOR BEGINNERS" in bright orange (#E8731A) below. Floating 3D elements: glowing orange/amber triangular shield with luminous ring, two metallic gray gear/cog icons, small orange checkmark badge, small browser icon — connected by faint geometric lines suggesting setup flow. Strong front key light with warm tones, faint rim/edge light separating subject from dark background. Color palette: deep purple (#2A1845), dark navy (#1A0E30), bright orange (#E8731A), amber-gold (#D4922A), white (#FFFFFF), metallic gray (#A0A0A0). Classic left-subject right-text layout. Mood is welcoming, beginner-friendly, professional.`,
];

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

      // ── Build style reference text from the 16 example prompts ──
      const examplePromptsText = THUMBNAIL_EXAMPLES.map((p, i) => `EXAMPLE ${i + 1}:\n${p}`).join('\n\n');

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

Below are 16 example thumbnail prompts that define the visual style, composition patterns, and quality level to match. Study these examples carefully and create prompts at the SAME level of detail and specificity. Your output prompts should follow the same structure: subject positioning → background/graphics → text overlays → lighting → color palette → composition → mood.

REFERENCE EXAMPLES:
${examplePromptsText}

END OF EXAMPLES.

Now, using those examples as your style and quality benchmark, build new thumbnail prompts using this layer architecture:
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
            content: `Create 3 DISTINCT thumbnail generation prompts for this video. Each variation should have a different creative direction (e.g., different composition, color grade, mood, or text placement) while all staying on-brand and matching the quality/detail level of the 16 reference examples.\n\nTitle: "${video_title}"`,
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

      // Validate character ref URL is accessible before using image-to-image
      let validCharRef = null;
      if (character_ref_url) {
        try {
          const checkRes = await fetch(character_ref_url, { method: 'HEAD' });
          if (checkRes.ok) {
            validCharRef = character_ref_url;
          } else {
            console.warn(`Character ref URL returned ${checkRes.status}, falling back to text-to-image`);
          }
        } catch (e) {
          console.warn(`Character ref URL unreachable: ${e.message}, falling back to text-to-image`);
        }
      }

      // Fire off all 3 Kie.ai tasks in parallel
      const taskIds = await Promise.all(imagePrompts.map(async (prompt, i) => {
        if (validCharRef) {
          console.log(`Thumbnail variation ${i + 1}: image-to-image (${model || 'nano-banana'})`);
          return imageToImage(validCharRef, prompt, model);
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
