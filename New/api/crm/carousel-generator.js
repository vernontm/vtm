const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NANOBANANA_API_KEY = process.env.NANOBANANA_API_KEY;

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
    await new Promise(r => setTimeout(r, 3000)); // poll every 3s

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
    // successFlag === 0 means still processing, keep polling
  }
  throw new Error('NanoBanana image generation timed out');
}

// ── Download image and upload to Supabase Storage ──
async function saveImageToStorage(imageUrl, clientId, carouselId, slideIndex) {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error('Failed to download image from NanoBanana');
  const buffer = Buffer.from(await imgRes.arrayBuffer());

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

      // Update the script's media_urls array
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

      // Use original image as reference + edit instructions
      const fullPrompt = `Edit this social media carousel slide: ${edit_prompt}. Maintain the dark premium tech aesthetic with orange #E8650A accents, black background, Syne bold headings, DM Sans body text, and Vernon Tech & Media branding.`;

      const genBody = {
        prompt: fullPrompt,
        resolution: '4K',
        aspectRatio: '4:5',
      };
      // If we have the original image, pass it as reference
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

      // Update the script's media_urls
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

    // Fetch client info
    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}&limit=1`);
    const client = clients?.[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const handle = client.instagram_handle || client.threads_handle || 'rayvaughnceo';
    const numSlides = Math.min(slide_count || 5, 10);

    // ── Step 1: Generate slide content + image prompts with AI ──
    const systemPrompt = `You are a carousel slide content creator for social media. Generate content for a ${numSlides + 2}-slide carousel (cover + ${numSlides} content slides + CTA slide).

BRAND CONTEXT:
Business: ${client.business_name || ''}
Industry: ${client.industry || ''}
Brand Bible: ${client.brand_bible || 'None provided'}
Handle: @${handle}

BRAND DESIGN:
- Dark premium aesthetic: black/dark brown backgrounds (#0D0600, #0e0e0e)
- Orange accent color: #E8650A
- Fonts: Syne (bold headings), DM Sans (body)
- Logo: Vernon Tech & Media "V" logomark in orange square, "VERNTONTM" wordmark
- Grid overlay pattern with subtle orange lines
- Accent bars on the left side of body text
- Neural network/tech decorative elements
- "Swipe" CTA button on content slides
- @${handle} handle shown on content slides

RULES:
1. NEVER use em dashes. Use periods, commas, or colons instead.
2. For each slide, generate BOTH the text content AND a detailed image generation prompt
3. Image prompts must describe the exact visual layout matching the brand design above
4. Keep text concise. These are visual slides, not articles.
5. Match the brand voice

For EACH slide's image_prompt, describe a premium social media carousel slide with:
- Dark background with subtle orange radial gradients
- The Vernon Tech & Media "V" logo in an orange rounded square in the top-left corner
- "VERNTONTM" text next to logo (white text, "TM" in orange)
- Exact text content rendered on the slide (specify font sizes, positions)
- The brand's dark tech aesthetic with subtle grid patterns
- 4:5 aspect ratio, designed for Instagram

Return JSON:
{
  "slides": [
    {
      "type": "cover|content|cta",
      "slide_number": 0,
      "label": "COVER or 01 | SERVICE etc",
      "title": "slide title or headline",
      "body": "body text if content slide",
      "bold_line": "bold closer line if content slide",
      "image_prompt": "Detailed prompt for NanoBanana AI to generate this exact slide as an image. Be extremely specific about layout, colors, text placement, and the dark premium tech aesthetic. Include ALL text that should appear on the slide."
    }
  ],
  "caption": "Instagram caption for the carousel post",
  "hashtags": "#relevant #hashtags"
}

Return ONLY valid JSON. No code blocks.`;

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

    // Submit all image generation tasks in parallel
    console.log(`Submitting ${content.slides.length} slides to NanoBanana...`);
    const taskIds = [];
    for (const slide of content.slides) {
      const taskId = await generateImage(slide.image_prompt);
      taskIds.push(taskId);
    }

    // Wait for all images to complete
    console.log('Waiting for NanoBanana to generate images...');
    const imageUrls = [];
    for (let i = 0; i < taskIds.length; i++) {
      const nanoUrl = await waitForImage(taskIds[i]);
      // Download and save to Supabase
      const storageUrl = await saveImageToStorage(nanoUrl, client_id, carouselId, i);
      imageUrls.push(storageUrl);
      console.log(`Slide ${i} saved: ${storageUrl}`);
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
