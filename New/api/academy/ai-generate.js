import { setCors, requireAdminAuth, SUPABASE_URL, SERVICE_KEY } from '../_lib/supabase.js';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const HCTI_USER_ID = process.env.HCTI_USER_ID;
const HCTI_API_KEY = process.env.HCTI_API_KEY;

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAdminAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { action, lesson_id, transcript, content, prompt, course_title } = req.body;

    if (!action) return res.status(400).json({ error: 'action required' });

    const textContent = transcript || content || '';

    // ── Generate Title ──
    if (action === 'generate-title') {
      const aiRes = await callClaude(
        `Based on the following lesson content, generate:\n1. A concise, compelling lesson title (max 10 words)\n2. A 2-3 sentence description of what students will learn\n\nReturn JSON: {"title": "...", "description": "..."}\n\nContent:\n${textContent.slice(0, 4000)}`,
        'You are an expert course content creator. Return ONLY valid JSON, no markdown.',
        500,
      );
      return res.json(aiRes);
    }

    // ── Generate Quiz ──
    if (action === 'generate-quiz') {
      const aiRes = await callClaude(
        `Based on this lesson content, generate 5 multiple-choice quiz questions.\n\nReturn JSON array: [{"question": "...", "options": [{"id": "a", "text": "..."}, {"id": "b", "text": "..."}, {"id": "c", "text": "..."}, {"id": "d", "text": "..."}], "correct_option_id": "a"}]\n\nContent:\n${textContent.slice(0, 4000)}`,
        'You are a quiz creator for online courses. Questions should test comprehension. Return ONLY valid JSON.',
        2000,
      );
      return res.json({ questions: aiRes });
    }

    // ── Generate Homework ──
    if (action === 'generate-homework') {
      const aiRes = await callClaude(
        `Based on this lesson content, create a practical homework assignment that requires students to apply what they learned.\n\nReturn JSON: {"title": "...", "prompt": "detailed assignment description", "deliverables": ["list", "of", "what to submit"]}\n\nContent:\n${textContent.slice(0, 4000)}`,
        'You are a course instructor. Create actionable, hands-on assignments. Return ONLY valid JSON.',
        1000,
      );
      return res.json(aiRes);
    }

    // ── Generate Cover Image ──
    if (action === 'generate-cover') {
      if (!HCTI_USER_ID || !HCTI_API_KEY) {
        return res.status(400).json({ error: 'HCTI_USER_ID and HCTI_API_KEY env vars are required for cover image generation' });
      }

      const userPrompt = prompt || '';
      const title = course_title || 'Course';

      // Step 1: Have Claude generate beautiful HTML/CSS for the cover
      const htmlResult = await callClaude(
        `Create a stunning course cover image as HTML/CSS. The image should be exactly 1200x630 pixels.\n\nCourse title: "${title}"\nStyle direction: ${userPrompt || 'modern, dark, professional with subtle gradients'}\n\nRequirements:\n- Use the exact dimensions: 1200x630px on the root container\n- Use a dark background (#111112 or similar dark tones)\n- Use orange (#ff9b26) as the accent color\n- Use the font 'Plus Jakarta Sans' (will be loaded via Google Fonts)\n- Make the title prominent and readable\n- Add subtle decorative elements (gradients, shapes, patterns) but keep it clean\n- Do NOT use any external images\n- The design should look premium and professional\n\nReturn ONLY the raw HTML (including inline CSS in a <style> tag). No markdown, no code fences, no explanation.`,
        'You are a world-class graphic designer who creates beautiful course cover images using HTML and CSS. Return ONLY raw HTML code.',
        3000,
      );

      // htmlResult is a string of raw HTML
      const htmlString = typeof htmlResult === 'string' ? htmlResult : (htmlResult.html || htmlResult.content || JSON.stringify(htmlResult));

      // Step 2: Render with HCTI
      const hctiRes = await fetch('https://hcti.io/v1/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + Buffer.from(`${HCTI_USER_ID}:${HCTI_API_KEY}`).toString('base64'),
        },
        body: JSON.stringify({
          html: htmlString,
          google_fonts: 'Plus Jakarta Sans',
          viewport_width: 1200,
          viewport_height: 630,
          device_scale: 2,
        }),
      });

      if (!hctiRes.ok) {
        const errText = await hctiRes.text();
        throw new Error(`HCTI rendering failed: ${errText}`);
      }

      const hctiData = await hctiRes.json();
      const imageUrl = hctiData.url;

      if (!imageUrl) throw new Error('HCTI did not return an image URL');

      // Step 3: Download the image and upload to Supabase storage
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) throw new Error('Failed to download rendered image');
      const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

      const fileName = `covers/course-cover-${Date.now()}.png`;
      const storageUrl = `${SUPABASE_URL}/storage/v1/object/course-media/${fileName}`;

      const uploadRes = await fetch(storageUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'image/png',
          'x-upsert': 'true',
        },
        body: imageBuffer,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Storage upload failed: ${errText}`);
      }

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/course-media/${fileName}`;
      return res.json({ url: publicUrl, hcti_url: imageUrl });
    }

    return res.status(400).json({ error: 'Invalid action. Use: generate-title, generate-quiz, generate-homework, generate-cover' });
  } catch (err) {
    console.error('ai-generate error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function callClaude(userMessage, systemMessage, maxTokens) {
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userMessage }],
      system: systemMessage,
    }),
  });
  if (!aiRes.ok) {
    const errBody = await aiRes.text();
    throw new Error(`AI generation failed: ${errBody}`);
  }
  const aiData = await aiRes.json();
  const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```html\s*/gi, '').replace(/```\s*/g, '').trim();

  // Try to parse as JSON; if it fails, return as string (for HTML responses)
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
