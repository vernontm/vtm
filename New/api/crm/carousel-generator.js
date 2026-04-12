const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NANOBANANA_API_KEY = process.env.NANOBANANA_API_KEY;

// ── NanoBanana: Image-to-Image (change text on template) ──
async function imageToImage(templateUrl, textPrompt) {
  const res = await fetch('https://api.nanobananaapi.ai/api/v1/nanobanana/generate-pro', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${NANOBANANA_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: textPrompt,
      imageUrls: [templateUrl],
      type: 'IMAGETOIAMGE', // NanoBanana's spelling
      resolution: '4K',
      imageSize: '4:5',
      numImages: 1,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NanoBanana image-to-image error: ${res.status} ${err}`);
  }
  const data = await res.json();
  if (data.code !== 200) throw new Error(`NanoBanana error: ${data.message || JSON.stringify(data)}`);
  return data.data.taskId;
}

// ── NanoBanana: Text-to-Image (fallback when no template) ──
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
async function waitForImage(taskId, maxWait = 240000) {
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

// ── Download and upload to Supabase Storage ──
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

  // ── Save carousel templates ──
  if (action === 'save-templates') {
    try {
      const { client_id, templates } = req.body;
      if (!client_id || !templates) return res.status(400).json({ error: 'client_id and templates required' });

      await supaFetch(`crm_content_clients?id=eq.${client_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ carousel_templates: templates, updated_at: new Date().toISOString() }),
      });

      return res.json({ saved: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save templates: ' + err.message });
    }
  }

  // ── Regenerate a single slide (image-to-image if template available) ──
  if (action === 'regenerate') {
    try {
      const { client_id, script_id, slide_index, image_prompt, template_url } = req.body;
      if (!client_id || !script_id || slide_index === undefined || !image_prompt) {
        return res.status(400).json({ error: 'client_id, script_id, slide_index, and image_prompt required' });
      }
      if (!NANOBANANA_API_KEY) return res.status(400).json({ error: 'NANOBANANA_API_KEY not configured' });

      let taskId;
      if (template_url) {
        taskId = await imageToImage(template_url, image_prompt);
      } else {
        taskId = await generateImage(image_prompt);
      }

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

  // ── Edit a slide (image-to-image with the current slide as reference) ──
  if (action === 'edit') {
    try {
      const { client_id, script_id, slide_index, edit_prompt, original_image_url } = req.body;
      if (!client_id || !script_id || slide_index === undefined || !edit_prompt) {
        return res.status(400).json({ error: 'client_id, script_id, slide_index, and edit_prompt required' });
      }
      if (!NANOBANANA_API_KEY) return res.status(400).json({ error: 'NANOBANANA_API_KEY not configured' });

      // Use the current slide image as the reference for image-to-image edit
      let taskId;
      if (original_image_url) {
        taskId = await imageToImage(original_image_url, edit_prompt);
      } else {
        taskId = await generateImage(edit_prompt);
      }

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
      console.error('Edit slide error:', err);
      return res.status(500).json({ error: 'Edit failed: ' + err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ══ Generate full carousel (image-to-image from templates) ══
  // ══════════════════════════════════════════════════════════════
  try {
    const { client_id, prompt, slide_count } = req.body;
    if (!client_id || !prompt) return res.status(400).json({ error: 'client_id and prompt required' });

    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}&limit=1`);
    const client = clients?.[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const handle = client.instagram_handle || client.threads_handle || 'rayvaughnceo';
    const numSlides = Math.min(slide_count || 5, 10);

    // Get carousel templates
    const templates = client.carousel_templates || {};
    const hasCoverTemplate = !!templates.cover;
    const hasContentTemplate = !!templates.content;
    const hasCtaTemplate = !!templates.cta;
    const hasTemplates = hasCoverTemplate || hasContentTemplate;

    // ── Step 1: AI generates slide text content ──
    const TEXT_LIMITS = `
STRICT TEXT LIMITS (these are HARD limits, do NOT exceed):
- COVER title: MAX 10 words. Bold, punchy headline. MUST include "highlight_words" — 1-3 key words that should be in orange (#E8650A) while the rest is white. Example: "3 AI Automations That Save **15+ Hours Weekly**". In the image_prompt, specify which words should be orange.
- CONTENT label: exactly like "01 | TOPIC" (short topic name, 1-2 words)
- CONTENT title: MAX 4 words. Example: "Make.com"
- CONTENT body: MAX 25 words TOTAL. 2-3 short sentences. No paragraphs. No bullet points with full sentences.
- CONTENT bold_line: MAX 10 words. One punchy closer.
- CTA text: MAX 8 words. Example: "Save this for later."

CRITICAL: Every slide must have BREATHING ROOM. Less text = better design.
If a point needs more words, SPLIT it across two slides instead of cramming one.
NEVER use multiple "What it does / What we use it for / Why it matters" sections on ONE slide. One point per slide.`;

    const systemPrompt = hasTemplates
      ? `You are a carousel content writer. Generate text content for a ${numSlides + 2}-slide carousel (cover + ${numSlides} content slides + CTA).

BRAND CONTEXT:
Business: ${client.business_name || 'Vernon Tech & Media'}
Industry: ${client.industry || 'AI & Technology'}
Brand Bible: ${client.brand_bible || 'None provided'}
Handle: @${handle}
Website: vernontm.com

The slides will be generated using IMAGE-TO-IMAGE from existing brand templates. You only need to provide the TEXT that will be swapped onto each template.
${TEXT_LIMITS}

For each slide, provide an "image_prompt" that is a direct instruction to change the text on the template image. Format it as: "Change the writing to say: [exact text]". Include ONLY the text, nothing else. Keep it short.

For COVER slides: in the image_prompt, specify which words should be in orange highlight color and which in white. Example: "Change the writing to say: '3 AI Automations That Save' in white and '15+ Hours Weekly' in orange highlight color."

Return JSON:
{
  "slides": [
    {
      "type": "cover|content|cta",
      "slide_number": 0,
      "label": "COVER or 01 | TOPIC etc",
      "title": "max 10 words",
      "highlight_words": "the 1-3 words from title that should be orange (cover slides only)",
      "body": "max 25 words total",
      "bold_line": "max 10 words",
      "image_prompt": "Change the writing to say: [text]. For covers, specify which words are white and which are orange."
    }
  ],
  "caption": "Instagram caption for the carousel post",
  "hashtags": "#relevant #hashtags"
}

RULES:
1. NEVER use em dashes. Use periods, commas, or colons.
2. NEVER exceed the word limits above. Count your words.
3. One point per content slide. If you need more words, add more slides.
4. Match the brand voice.

Return ONLY valid JSON.`
      : `You are a carousel slide designer. Generate content for a ${numSlides + 2}-slide carousel.

BRAND CONTEXT:
Business: ${client.business_name || 'Vernon Tech & Media'}
Industry: ${client.industry || 'AI & Technology'}
Brand Bible: ${client.brand_bible || 'None provided'}
Handle: @${handle}

DESIGN:
- Dark background (#0D0600), orange accents (#E8650A)
- Grid overlay, neural network decorations
- Bold white + orange headings, 4:5 aspect ratio
- Vernon Tech & Media logo top-left, vernontm.com on cover/CTA
${TEXT_LIMITS}

Return JSON:
{
  "slides": [
    {
      "type": "cover|content|cta",
      "slide_number": 0,
      "label": "COVER or 01 | TOPIC",
      "title": "max 10 words",
      "body": "max 25 words",
      "bold_line": "max 10 words",
      "image_prompt": "Detailed prompt for generating this slide image"
    }
  ],
  "caption": "Instagram caption",
  "hashtags": "#hashtags"
}

RULES:
1. NEVER use em dashes.
2. NEVER exceed word limits. Count your words.
3. One point per slide.
4. Include ALL visible text in image_prompt.

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

    // ── Step 2: Generate images ──
    const carouselId = Date.now().toString(36);
    console.log(`Generating ${content.slides.length} slides (templates: ${hasTemplates ? 'yes' : 'no'})...`);

    const taskIds = [];
    for (const slide of content.slides) {
      // Pick the right template for this slide type
      let templateUrl = null;
      if (slide.type === 'cover' && templates.cover) {
        templateUrl = templates.cover;
      } else if (slide.type === 'cta' && templates.cta) {
        templateUrl = templates.cta || templates.cover; // fallback to cover template for CTA
      } else if (templates.content) {
        templateUrl = templates.content;
      }

      let taskId;
      if (templateUrl) {
        // Image-to-image: swap text on template
        console.log(`Slide ${slide.slide_number}: image-to-image from template`);
        taskId = await imageToImage(templateUrl, slide.image_prompt);
      } else {
        // Fallback: text-to-image from scratch
        console.log(`Slide ${slide.slide_number}: text-to-image (no template)`);
        taskId = await generateImage(slide.image_prompt);
      }
      taskIds.push(taskId);
    }

    // Wait for all images
    console.log('Waiting for NanoBanana...');
    const imageUrls = [];
    for (let i = 0; i < taskIds.length; i++) {
      const nanoUrl = await waitForImage(taskIds[i]);
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
      used_templates: hasTemplates,
    });

  } catch (err) {
    console.error('Carousel generator error:', err);
    return res.status(500).json({ error: 'Carousel generation failed: ' + err.message });
  }
};
