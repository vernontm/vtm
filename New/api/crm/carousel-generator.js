const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');
let sharp;
try { sharp = require('sharp'); } catch (e) { console.warn('Sharp not available, logo compositing disabled'); }

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NANOBANANA_API_KEY = process.env.NANOBANANA_API_KEY;

// ── Brand constants ──
const LOGO_ICON_URL = 'https://www.vernontm.com/admin/vtm-icon-light.png'; // transparent V icon
const LOGO_ICON_DARK_URL = 'https://www.vernontm.com/admin/vtm-icon.png'; // dark bg V icon
let cachedLogoBuffer = null;

// ── Fetch and cache logo ──
async function getLogoBuffer() {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  try {
    const res = await fetch(LOGO_ICON_URL);
    if (!res.ok) throw new Error('Logo fetch failed');
    cachedLogoBuffer = Buffer.from(await res.arrayBuffer());
    return cachedLogoBuffer;
  } catch (e) {
    console.error('Failed to fetch logo:', e.message);
    return null;
  }
}

// ── Composite logo onto image using Sharp ──
async function compositeLogoOnImage(imageBuffer, logoSize = 48, padding = 28) {
  if (!sharp) return imageBuffer; // fallback: return original if sharp unavailable
  const logoBuffer = await getLogoBuffer();
  if (!logoBuffer) return imageBuffer;

  try {
    // Resize logo to consistent size
    const resizedLogo = await sharp(logoBuffer)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // Create orange rounded-corner container for the icon (like the reference design)
    const containerSize = logoSize + 16;
    const containerSvg = Buffer.from(`
      <svg width="${containerSize}" height="${containerSize}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${containerSize}" height="${containerSize}" rx="10" ry="10" fill="#E8650A"/>
      </svg>
    `);

    // Composite: container first, then logo centered inside it
    const containerBuffer = await sharp(containerSvg)
      .resize(containerSize, containerSize)
      .png()
      .toBuffer();

    const iconInContainer = await sharp(containerBuffer)
      .composite([{
        input: resizedLogo,
        left: 8,
        top: 8,
      }])
      .png()
      .toBuffer();

    // Create wordmark "VERNONTM" text as SVG
    const wordmarkSvg = Buffer.from(`
      <svg width="160" height="${containerSize}" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="${containerSize * 0.65}" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="18" fill="white" letter-spacing="1">VERNON<tspan fill="#E8650A">TM</tspan></text>
      </svg>
    `);

    const wordmarkBuffer = await sharp(wordmarkSvg).png().toBuffer();

    // Composite everything onto the image
    const result = await sharp(imageBuffer)
      .composite([
        {
          input: iconInContainer,
          left: padding,
          top: padding,
        },
        {
          input: wordmarkBuffer,
          left: padding + containerSize + 10,
          top: padding,
        },
      ])
      .png()
      .toBuffer();

    return result;
  } catch (e) {
    console.error('Logo composite error:', e.message);
    return imageBuffer; // fallback to original
  }
}

// ── NanoBanana: Generate image from prompt ──
async function generateImage(prompt) {
  const res = await fetch('https://api.nanobananaapi.ai/api/v1/nanobanana/generate-pro', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NANOBANANA_API_KEY}`,
    },
    body: JSON.stringify({
      prompt,
      resolution: '4K',
      aspectRatio: '4:5',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NanoBanana generate error: ${res.status} ${err}`);
  }
  const data = await res.json();
  if (data.code !== 200) throw new Error(`NanoBanana error: ${data.message || JSON.stringify(data)}`);
  return data.data.taskId;
}

// ── NanoBanana: Poll for task completion ──
async function waitForImage(taskId, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 3000));

    const res = await fetch(`https://api.nanobananaapi.ai/api/v1/nanobanana/record-info?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${NANOBANANA_API_KEY}` },
    });
    if (!res.ok) continue;
    const data = await res.json();

    if (data.data?.successFlag === 1) {
      return data.data.response?.resultImageUrl || data.data.response?.originImageUrl;
    } else if (data.data?.successFlag >= 2) {
      throw new Error(`NanoBanana generation failed: ${data.data.errorMessage || 'unknown error'}`);
    }
  }
  throw new Error('NanoBanana image generation timed out');
}

// ── Download image, composite logo, upload to Supabase ──
async function saveImageToStorage(imageUrl, clientId, carouselId, slideIndex, addLogo = true) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error('Failed to download image from NanoBanana');
  let buffer = Buffer.from(await imgRes.arrayBuffer());

  // Composite the real VTM logo onto the image
  if (addLogo) {
    buffer = await compositeLogoOnImage(buffer);
  }

  const filePath = `${clientId}/carousels/${carouselId}/slide-${String(slideIndex).padStart(2, '0')}.png`;
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

// ── Design system prompt ──
const DESIGN_SYSTEM = `
CAROUSEL DESIGN SYSTEM (match this EXACTLY for every slide):

VISUAL STYLE:
- Background: Very dark brown-black (#0D0600 to #0e0e0e)
- Radial gradient glows: Subtle orange (#7C2E00, #5A1E00) at 10-20% opacity, positioned off-center
- Grid overlay: Fine 40px grid lines in orange at 5-7% opacity covering entire background
- Neural network decoration: Small glowing orange dots (nodes) connected by thin orange lines, positioned in bottom-right or bottom-left corner

COLOR PALETTE:
- Primary: #E8650A (bright orange)
- Accents: #FFB060 (warm gold), #FFD080 (light gold), #7C2E00 (deep orange)
- Text: White (#FFFFFF) for headings, rgba(255,255,255,0.78) for body
- Background: #0D0600 (near black)

TYPOGRAPHY (render text directly on image):
- Headings: Bold, heavy weight, large size (like Impact/Syne 800). White with some words in orange for emphasis.
- Body text: Clean sans-serif, medium weight, lighter opacity white
- All text should be crisp, readable, and well-positioned

LAYOUT:
- 4:5 aspect ratio (1080x1350 or equivalent)
- Leave top-left corner EMPTY (60x60px area) - the real logo will be composited there separately
- Do NOT render any logo or brand mark - leave that area blank/dark
- Content centered or left-aligned with generous padding (28-32px from edges)
- Orange accent bar (thin vertical line) to the left of body text on content slides

SLIDE TYPES:
- COVER: Large bold headline text centered, neural network decoration, dark dramatic feel
- CONTENT: Slide label at top (e.g. "01 | SERVICE"), title in orange, body text below with accent bar, "swipe" indicator bottom-right
- CTA: Centered layout, "Save this for later." with "for later." in white and "Save this" in orange, "Follow @handle for more." below
`;


module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // ── Regenerate a single slide ──
  if (action === 'regenerate') {
    try {
      const { client_id, script_id, slide_index, image_prompt } = req.body;
      if (!client_id || !script_id || slide_index === undefined || !image_prompt) {
        return res.status(400).json({ error: 'client_id, script_id, slide_index, and image_prompt required' });
      }
      if (!NANOBANANA_API_KEY) return res.status(400).json({ error: 'NANOBANANA_API_KEY not configured' });

      const taskId = await generateImage(image_prompt);
      const nanoUrl = await waitForImage(taskId);
      const carouselId = Date.now().toString(36);
      const storageUrl = await saveImageToStorage(nanoUrl, client_id, carouselId, slide_index);

      const scripts = await supaFetch(`crm_content_scripts?id=eq.${script_id}`);
      const script = scripts?.[0];
      if (script) {
        const urls = [...(script.media_urls || [])];
        urls[slide_index] = storageUrl;
        await supaFetch(`crm_content_scripts?id=eq.${script_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ media_urls: urls, updated_at: new Date().toISOString() }),
        });
      }

      return res.json({ url: storageUrl, slide_index });
    } catch (err) {
      console.error('Regenerate error:', err);
      return res.status(500).json({ error: 'Regenerate failed: ' + err.message });
    }
  }

  // ── Edit a slide with a modification prompt ──
  if (action === 'edit') {
    try {
      const { client_id, script_id, slide_index, edit_prompt, original_image_url } = req.body;
      if (!client_id || !script_id || slide_index === undefined || !edit_prompt) {
        return res.status(400).json({ error: 'client_id, script_id, slide_index, and edit_prompt required' });
      }
      if (!NANOBANANA_API_KEY) return res.status(400).json({ error: 'NANOBANANA_API_KEY not configured' });

      const fullPrompt = `Edit this social media carousel slide: ${edit_prompt}. ${DESIGN_SYSTEM} IMPORTANT: Leave the top-left 60x60px corner area empty/dark for logo overlay.`;

      const genBody = {
        prompt: fullPrompt,
        resolution: '4K',
        aspectRatio: '4:5',
      };
      if (original_image_url) {
        genBody.imageUrls = [original_image_url];
      }

      const genRes = await fetch('https://api.nanobananaapi.ai/api/v1/nanobanana/generate-pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NANOBANANA_API_KEY}`,
        },
        body: JSON.stringify(genBody),
      });
      if (!genRes.ok) throw new Error('NanoBanana edit request failed');
      const genData = await genRes.json();
      if (genData.code !== 200) throw new Error(genData.message || 'NanoBanana error');

      const nanoUrl = await waitForImage(genData.data.taskId);
      const carouselId = Date.now().toString(36);
      const storageUrl = await saveImageToStorage(nanoUrl, client_id, carouselId, slide_index);

      const scripts = await supaFetch(`crm_content_scripts?id=eq.${script_id}`);
      const script = scripts?.[0];
      if (script) {
        const urls = [...(script.media_urls || [])];
        urls[slide_index] = storageUrl;
        await supaFetch(`crm_content_scripts?id=eq.${script_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ media_urls: urls, updated_at: new Date().toISOString() }),
        });
      }

      return res.json({ url: storageUrl, slide_index });
    } catch (err) {
      console.error('Edit slide error:', err);
      return res.status(500).json({ error: 'Edit failed: ' + err.message });
    }
  }

  // ── Generate full carousel ──
  try {
    const { client_id, prompt, slide_count } = req.body;
    if (!client_id || !prompt) return res.status(400).json({ error: 'client_id and prompt required' });

    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}&limit=1`);
    const client = clients?.[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const handle = client.instagram_handle || client.threads_handle || 'rayvaughnceo';
    const numSlides = Math.min(slide_count || 5, 10);

    // ── Step 1: AI generates slide content + image prompts ──
    const systemPrompt = `You are a carousel slide designer. Generate content for a ${numSlides + 2}-slide carousel (cover + ${numSlides} content slides + CTA slide).

BRAND CONTEXT:
Business: ${client.business_name || 'Vernon Tech & Media'}
Industry: ${client.industry || 'AI & Technology'}
Brand Bible: ${client.brand_bible || 'None provided'}
Handle: @${handle}
Website: vernontm.com

${DESIGN_SYSTEM}

CRITICAL RULES:
1. NEVER use em dashes. Use periods, commas, or colons instead.
2. For each slide, generate BOTH text content AND a detailed image_prompt
3. The image_prompt must describe EXACTLY what the rendered slide looks like as a graphic
4. Include ALL visible text in the image_prompt (the AI image generator will render the text)
5. Describe text styling: size, weight, color, position
6. ALWAYS instruct to leave top-left 80x80px area dark/empty for logo overlay
7. Keep slide text concise and impactful. Max 3-4 lines per slide.
8. Use the handle @${handle} on content slides
9. Use vernontm.com on cover and CTA slides

Return JSON:
{
  "slides": [
    {
      "type": "cover|content|cta",
      "slide_number": 0,
      "label": "COVER or 01 | SERVICE etc",
      "title": "slide title",
      "body": "body text (content slides only)",
      "bold_line": "bold emphasis line (content slides only)",
      "image_prompt": "EXTREMELY detailed prompt describing the complete visual: background (dark with orange gradients and grid), text content with exact words and styling, layout, decorations (neural dots), colors. Must match the design system. Leave top-left 80x80px empty for logo."
    }
  ],
  "caption": "Instagram caption for the carousel post",
  "hashtags": "#relevant #hashtags"
}

Return ONLY valid JSON.`;

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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) throw new Error('AI generation failed: ' + await aiRes.text());
    const aiData = await aiRes.json();
    const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let content;
    try {
      content = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) content = JSON.parse(match[0]);
      else throw new Error('Failed to parse AI response');
    }

    if (!NANOBANANA_API_KEY) {
      return res.json({
        slides: content.slides,
        content,
        images: false,
        message: 'NANOBANANA_API_KEY not configured. Returning content only.',
      });
    }

    // ── Step 2: Generate images via NanoBanana ──
    const carouselId = Date.now().toString(36);

    console.log(`Submitting ${content.slides.length} slides to NanoBanana...`);
    const taskIds = [];
    for (const slide of content.slides) {
      const taskId = await generateImage(slide.image_prompt);
      taskIds.push(taskId);
    }

    console.log('Waiting for NanoBanana to generate images...');
    const imageUrls = [];
    for (let i = 0; i < taskIds.length; i++) {
      const nanoUrl = await waitForImage(taskIds[i]);
      // Download, composite real logo, save to Supabase
      const storageUrl = await saveImageToStorage(nanoUrl, client_id, carouselId, i, true);
      imageUrls.push(storageUrl);
      console.log(`Slide ${i} saved with logo: ${storageUrl}`);
    }

    // ── Step 3: Create content script row ──
    const coverSlide = content.slides.find(s => s.type === 'cover') || content.slides[0];
    const scriptData = {
      client_id,
      title: coverSlide.title || 'Carousel Post',
      caption: content.caption || '',
      hashtags: content.hashtags || '',
      media_urls: imageUrls,
      media_type: 'carousel',
      status: 'caption_ready',
    };

    const created = await supaFetch('crm_content_scripts', {
      method: 'POST',
      body: JSON.stringify([scriptData]),
    });

    return res.json({
      carousel_id: carouselId,
      script: created?.[0],
      image_urls: imageUrls,
      slide_count: imageUrls.length,
      content,
    });

  } catch (err) {
    console.error('Carousel generator error:', err);
    return res.status(500).json({ error: 'Carousel generation failed: ' + err.message });
  }
};
