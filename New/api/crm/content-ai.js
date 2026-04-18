const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // ── parse-scripts ─────────────────────────────────────────────────
  if (action === 'parse-scripts' && req.method === 'POST') {
    const { client_id, text, file_base64, media_type, file_name } = req.body;
    if (!client_id || (!text && !file_base64)) {
      return res.status(400).json({ error: 'client_id and text or file_base64 required' });
    }

    const systemPrompt = `You are a content script parser. Given a document that contains video scripts, parse them into individual scripts.

Return a JSON array where each object has:
- "series_name": the series or category name if identifiable (otherwise null)
- "title": an engaging, click-worthy title for the script (never just a number)
- "hook": the first 1-2 sentences that hook the viewer
- "full_script": the complete script text

Return ONLY valid JSON, no markdown formatting or code blocks.`;

    // Build message content
    let messageContent;
    if (file_base64 && media_type === 'application/pdf') {
      messageContent = [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file_base64 },
        },
        { type: 'text', text: `Parse this document (${file_name || 'uploaded PDF'}) into individual video scripts.` },
      ];
    } else if (file_base64 && (media_type || '').startsWith('image/')) {
      messageContent = [
        {
          type: 'image',
          source: { type: 'base64', media_type: media_type, data: file_base64 },
        },
        { type: 'text', text: `Parse this image (${file_name || 'uploaded image'}) into individual video scripts.` },
      ];
    } else {
      messageContent = `Parse the following document into individual video scripts:\n\n${text}`;
    }

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: messageContent }],
        system: systemPrompt,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(500).json({ error: 'AI parse failed', detail: err });
    }

    const aiData = await aiRes.json();
    const rawText = aiData.content[0].text;

    let parsed;
    try {
      // Try direct parse first, then extract JSON from markdown code blocks
      const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse AI response as JSON', raw: rawText });
    }

    // Insert each script into crm_content_scripts
    const scripts = parsed.map((s, i) => ({
      client_id,
      series_name: s.series_name || null,
      title: s.title,
      hook: s.hook,
      full_script: s.full_script,
      status: 'draft',
      sort_order: i + 1,
    }));

    const rows = await supaFetch('crm_content_scripts', {
      method: 'POST',
      body: JSON.stringify(scripts),
    });

    return res.json(rows);
  }

  // ── generate-captions ─────────────────────────────────────────────
  if (action === 'generate-captions' && req.method === 'POST') {
    const { client_id, script_ids } = req.body;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    // Fetch client profile for brand voice
    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}`);
    const client = clients && clients[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Fetch scripts to generate captions for
    let scriptsQuery = `crm_content_scripts?client_id=eq.${client_id}`;
    if (script_ids && script_ids.length) {
      scriptsQuery += `&id=in.(${script_ids.join(',')})`;
    } else {
      scriptsQuery += '&caption=is.null';
    }
    const scripts = await supaFetch(scriptsQuery);

    if (!scripts || !scripts.length) {
      return res.json({ updated: 0 });
    }

    const brandContext = [
      client.business_name ? `Business: ${client.business_name}` : '',
      client.brand_bible ? `Brand Bible: ${client.brand_bible}` : '',
      client.target_audience ? `Target Audience: ${client.target_audience}` : '',
      client.preferred_tone ? `Tone: ${client.preferred_tone}` : '',
    ].filter(Boolean).join('\n');

    // Batch all scripts into one Claude call
    const scriptsList = scripts.map((s, i) => `--- SCRIPT ${i} ---
TITLE: ${s.title || 'Untitled'}
SCRIPT: ${s.full_script || s.hook || s.title || 'No script text'}`).join('\n\n');

    const prompt = `You are a social media caption writer. Generate a title, caption, hashtags, and first comment for each script below.

Brand Context:
${brandContext}

${scriptsList}

RULES:
1. NEVER use em dashes (—) anywhere. Use commas, periods, or colons instead.
2. The "title" is a short, click-worthy title for the video (not a number, make it engaging and curiosity-driven).
3. The "caption" is the full social media post text that goes with the video. Punchy, engaging, matches the brand voice.
4. For hashtags: ALWAYS include any core hashtags from the brand bible first, then add 4-6 topic-specific ones.
5. The "first_comment" should encourage engagement (questions, calls to action).

Return a JSON array with one object per script, in order:
[
  {
    "index": 0,
    "title": "short engaging video title",
    "caption": "engaging social media caption matching the brand voice",
    "hashtags": "#core #brand #hashtags #plus #topic #specific",
    "first_comment": "engaging first comment to boost engagement"
  }
]

Return ONLY valid JSON, no markdown.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(502).json({ error: 'AI caption generation failed', detail: err });
    }

    const aiData = await aiRes.json();
    let results;
    try {
      const raw = aiData.content[0].text;
      const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      results = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
      return res.status(500).json({ error: 'Failed to parse captions response' });
    }

    let updated = 0;
    for (const result of results) {
      const script = scripts[result.index !== undefined ? result.index : updated];
      if (!script) continue;

      const updates = {
        caption: result.caption,
        hashtags: result.hashtags,
        first_comment: result.first_comment,
        status: 'caption_ready',
        updated_at: new Date().toISOString(),
      };
      if (result.title) updates.title = result.title;

      await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      updated++;
    }

    return res.json({ updated });
  }

  // ── auto-schedule ─────────────────────────────────────────────────
  if (action === 'auto-schedule' && req.method === 'POST') {
    try {
      const { client_id } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });

      const configs = await supaFetch(`crm_auto_schedule_config?client_id=eq.${client_id}&limit=1`);
      const config = configs && configs[0];
      if (!config || !config.time_slots || !config.time_slots.length) {
        return res.status(400).json({ error: 'No schedule config found. Open Schedule Settings first.' });
      }

      const scripts = await supaFetch(
        `crm_content_scripts?client_id=eq.${client_id}&scheduled_datetime=is.null&order=sort_order.asc`
      );
      if (!scripts || !scripts.length) {
        return res.json({ scheduled: 0, message: 'No unscheduled scripts found' });
      }

      const slots = config.time_slots;
      const tz = config.timezone || 'America/Chicago';

      // Get all already-scheduled datetimes to avoid collisions
      const allScheduled = await supaFetch(
        `crm_content_scripts?client_id=eq.${client_id}&scheduled_datetime=not.is.null&select=scheduled_datetime`
      );

      // Helper: format a Date into local date parts for a given timezone
      function localParts(date, timezone) {
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });
        const p = {};
        for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
        return p;
      }

      // Helper: is a candidate slot taken by any existing scheduled script?
      function isTaken(candidateStr, existingRows, timezone) {
        return (existingRows || []).some(s => {
          if (!s.scheduled_datetime) return false;
          const p = localParts(new Date(s.scheduled_datetime), timezone);
          return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === candidateStr;
        });
      }

      const now = new Date();
      const nowParts = localParts(now, tz);
      const nowHHMM = `${nowParts.hour}:${nowParts.minute}`;

      // Start from today's first future slot; if all passed, start tomorrow slot 0
      const slotsHHMM = slots.map(s => s.substring(0, 5));
      let slotIndex = slotsHHMM.findIndex(s => s > nowHHMM);
      // Track current date as a UTC midnight Date, initialised from local date in tz
      let currentDate = new Date(`${nowParts.year}-${nowParts.month}-${nowParts.day}T00:00:00Z`);
      if (slotIndex < 0) {
        slotIndex = 0;
        currentDate = new Date(currentDate.getTime() + 86400000); // +1 day
      }

      // Build a fresh copy of already-taken rows so we can append as we assign
      const takenRows = [...(allScheduled || [])];
      let scheduled = 0;

      for (const script of scripts) {
        // Find the next slot not already taken (scan up to 90 days)
        let found = null;
        const maxAttempts = slots.length * 90;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const slot = slots[slotIndex];
          const y = new Date(currentDate).getUTCFullYear();
          const m = String(new Date(currentDate).getUTCMonth() + 1).padStart(2, '0');
          const d = String(new Date(currentDate).getUTCDate()).padStart(2, '0');
          const timeStr = slot.length <= 5 ? `${slot}:00` : slot;
          const candidate = `${y}-${m}-${d} ${timeStr} ${tz}`;
          const candidateCheck = `${y}-${m}-${d}T${slot.substring(0, 5)}`;

          if (!isTaken(candidateCheck, takenRows, tz)) {
            found = candidate;
            // Mark this slot as taken so the next script doesn't reuse it
            takenRows.push({ scheduled_datetime: new Date(candidate).toISOString() });
            break;
          }

          slotIndex++;
          if (slotIndex >= slots.length) {
            slotIndex = 0;
            currentDate = new Date(currentDate.getTime() + 86400000);
          }
        }

        if (!found) continue; // safety: skip if no slot found in 90 days

        await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            scheduled_datetime: found,
            status: 'scheduled',
            updated_at: new Date().toISOString(),
          }),
        });

        scheduled++;
        slotIndex++;
        if (slotIndex >= slots.length) {
          slotIndex = 0;
          currentDate = new Date(currentDate.getTime() + 86400000);
        }
      }

      return res.json({ scheduled });
    } catch (err) {
      console.error('auto-schedule error:', err);
      return res.status(500).json({ error: 'Auto-schedule failed: ' + err.message });
    }
  }

  // ── generate-content ───────────────────────────────────────────────
  if (action === 'generate-content' && req.method === 'POST') {
    try {
      const { client_id, prompt, post_type } = req.body;
      if (!client_id || !prompt) return res.status(400).json({ error: 'client_id and prompt required' });

      // Fetch client info for brand context
      const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}&limit=1`);
      const client = clients && clients[0];
      const brandContext = client ? `
Business: ${client.business_name || ''}
Industry: ${client.industry || ''}
Target Audience: ${client.target_audience || ''}
Tone: ${client.preferred_tone || 'friendly'}
Brand Bible: ${client.brand_bible || 'None provided'}
Social Handles: IG @${client.instagram_handle || ''}, TT @${client.tiktok_handle || ''}, Threads @${client.threads_handle || ''}
` : '';

      // Threads style framework from client settings
      const threadsStyle = client?.threads_style || {};
      const hasThreadsStyle = threadsStyle && Object.keys(threadsStyle).length > 0;

      // Build the Threads-specific system prompt section
      let threadsInstructions = '';
      if (hasThreadsStyle) {
        threadsInstructions = `
THREADS CONTENT FRAMEWORK:
Voice/Persona: ${threadsStyle.voice || 'Direct, confident, value-first'}
Writing Style: ${threadsStyle.writing_style || 'Clean, punchy, no fluff. Short paragraphs. Scroll-friendly.'}
Formatting Rules:
${(threadsStyle.formatting_rules || [
  'Multi-page format: each page is a natural scroll stop',
  'Use numbered/bulleted lists for steps and value posts',
  'No emojis except strategic ones (one max per post)',
  'JSON code blocks ONLY when showing an actual example prompt',
  'Plain text for everything else',
  'One hashtag per post at the very end',
  'Line breaks between sections for readability',
]).map(r => '- ' + r).join('\n')}

Post Types to Use:
${(threadsStyle.post_types || [
  'How-to Steps: "How to use [tool] for [outcome] in 5 steps" with practical, actionable steps',
  'Value Lists: Numbered lists of tips, tools, or insights. Screenshot-worthy.',
  'Networking: "Dear algorithm, connect me with..." format',
  'Story/Origin: Personal story with lessons. Authentic, not polished.',
  'Tool Stack: What tools you use and why. Specific, not generic.',
  'Framework/System: Show your process or system with real examples',
  'Hot Take: Bold opinion backed by experience. Not controversial for clicks.',
]).map(t => '- ' + t).join('\n')}

Tone Rules:
${(threadsStyle.tone_rules || [
  'Talk like you are explaining to a friend, not pitching',
  'Be direct. No corporate language.',
  'Lead with value, CTA at the end only',
  'Confident but not arrogant',
  'Use "you" language, make it about the reader',
  'NEVER use em dashes. Use periods, commas, or colons.',
]).map(t => '- ' + t).join('\n')}

CTA Style: ${threadsStyle.cta_style || 'Soft CTAs. "Follow for more." "DM me." "Comment [KEYWORD]." Never pushy.'}
Hashtag Rules: ${threadsStyle.hashtag_rules || 'One hashtag per post. Rotate between brand and niche tags.'}
Core Topics: ${(threadsStyle.core_topics || []).join(', ') || 'AI, automation, Claude, productivity, business building'}

${threadsStyle.example_posts?.length ? `EXAMPLE POSTS FOR REFERENCE (match this energy and format):
${threadsStyle.example_posts.map((ex, i) => `--- Example ${i + 1} ---\n${ex}`).join('\n\n')}` : ''}
`;
      }

      const systemPrompt = `You are a social media content creator. Generate posts based on the user's request.

BRAND CONTEXT:
${brandContext}
${threadsInstructions}

RULES:
1. NEVER use em dashes (—) anywhere. Use commas, periods, or colons instead.
2. Each post needs: title (short engaging title), caption (the full post text), hashtags (relevant hashtags), first_comment (engagement-driving comment/question)
3. Match the brand voice and tone from the brand bible
4. Include any core hashtags from the brand bible
5. Make each post unique and engaging
6. For Threads posts: multi-page format. Each "page" separated by a blank line. Hook on page 1, value in middle, CTA at end. One hashtag only.
7. For TikTok scripts: include a hook and full script
8. For Instagram: include caption with line breaks for readability
9. If a post type was specified, follow that format exactly.
10. JSON code blocks should ONLY appear when showing an actual example prompt the reader can copy. Never use JSON for regular post content.

Return a JSON object with:
{
  "posts": [
    {
      "title": "engaging title",
      "caption": "full post text with line breaks for multi-page format",
      "hashtags": "#onehashtag",
      "first_comment": "engagement comment or question",
      "platform": "threads|tiktok|instagram|general",
      "post_type": "how-to|value-list|networking|story|tool-stack|framework|hot-take"
    }
  ]
}

Return ONLY valid JSON. No markdown code blocks.`;

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
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!aiRes.ok) {
        const err = await aiRes.text();
        throw new Error(`Anthropic API error: ${err}`);
      }

      const aiData = await aiRes.json();
      const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error('Failed to parse AI response');
      }

      return res.json(parsed);
    } catch (err) {
      console.error('generate-content error:', err);
      return res.status(500).json({ error: 'Content generation failed: ' + err.message });
    }
  }

  // ── approve-and-schedule ───────────────────────────────────────────
  // Creates a content script row (or uses existing), generates captions/hashtags
  // (using vision for images), and auto-schedules to next available slot
  if (action === 'approve-and-schedule' && req.method === 'POST') {
    try {
      const { client_id, script_id, post, image_urls } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });

      // Fetch client for brand context
      const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}&limit=1`);
      const client = clients?.[0];
      if (!client) return res.status(404).json({ error: 'Client not found' });

      let targetScriptId = script_id;

      // If no existing script_id, create one from post data
      if (!targetScriptId && post) {
        const scriptData = {
          client_id,
          title: post.title || 'Generated Post',
          caption: post.caption || '',
          hashtags: post.hashtags || '',
          first_comment: post.first_comment || '',
          full_script: post.full_script || post.caption || '',
          media_urls: image_urls || post.media_urls || null,
          media_type: image_urls?.length > 1 ? 'carousel' : (image_urls?.length === 1 ? 'image' : null),
          status: 'draft',
        };
        const created = await supaFetch('crm_content_scripts', {
          method: 'POST',
          body: JSON.stringify([scriptData]),
        });
        targetScriptId = created?.[0]?.id;
        if (!targetScriptId) throw new Error('Failed to create script');
      }

      if (!targetScriptId) return res.status(400).json({ error: 'script_id or post data required' });

      // Fetch the script
      const scriptRows = await supaFetch(`crm_content_scripts?id=eq.${targetScriptId}`);
      const script = scriptRows?.[0];
      if (!script) return res.status(404).json({ error: 'Script not found' });

      // ── Generate/enhance captions using AI ──
      const brandContext = [
        client.business_name ? `Business: ${client.business_name}` : '',
        client.brand_bible ? `Brand Bible: ${client.brand_bible}` : '',
        client.target_audience ? `Target Audience: ${client.target_audience}` : '',
        client.preferred_tone ? `Tone: ${client.preferred_tone}` : '',
        client.threads_handle ? `Threads: @${client.threads_handle}` : '',
        client.instagram_handle ? `Instagram: @${client.instagram_handle}` : '',
      ].filter(Boolean).join('\n');

      const threadsStyle = client.threads_style || {};
      let styleCtx = '';
      if (threadsStyle.voice) {
        styleCtx = `\nContent Style:\nVoice: ${threadsStyle.voice}\nWriting: ${threadsStyle.writing_style || ''}\nCTA: ${threadsStyle.cta_style || ''}\nHashtags: ${threadsStyle.hashtag_rules || ''}\nCore Topics: ${(threadsStyle.core_topics || []).join(', ')}`;
      }

      // Build message content - use vision if images are available
      const mediaUrls = script.media_urls || image_urls || [];
      const hasImages = mediaUrls.length > 0;

      let messageContent;
      if (hasImages) {
        // Use Claude Vision to analyze the images and generate captions
        const imageBlocks = [];
        for (const url of mediaUrls.slice(0, 8)) { // max 8 images
          imageBlocks.push({ type: 'image', source: { type: 'url', url } });
        }
        messageContent = [
          ...imageBlocks,
          {
            type: 'text',
            text: `Look at these ${mediaUrls.length} image(s). Read any text visible on the images.

Based on the visual content and any text on the images, generate:
1. An engaging title for this post
2. A compelling social media caption that matches the brand voice
3. Relevant hashtags
4. A first comment to drive engagement

Existing title: ${script.title || 'None'}
Existing caption: ${script.caption || 'None'}

If the existing caption is already good, enhance it. If there's no caption, create one from scratch based on what you see in the images.`
          }
        ];
      } else {
        messageContent = `Generate an engaging social media caption, hashtags, and first comment for this content:

Title: ${script.title || 'Untitled'}
Script/Content: ${script.full_script || script.caption || 'No content'}

If there's already a caption, enhance it. Generate missing fields.`;
      }

      const captionPrompt = `You are a social media caption expert. Generate or enhance the caption, hashtags, and first comment for this post.

BRAND CONTEXT:
${brandContext}${styleCtx}

RULES:
1. NEVER use em dashes
2. Caption should be engaging and match brand voice
3. Include relevant hashtags (core brand tags first, then topic tags)
4. First comment should drive engagement
5. Title should be short and click-worthy

Return JSON:
{
  "title": "engaging title",
  "caption": "full caption text",
  "hashtags": "#relevant #hashtags",
  "first_comment": "engagement-driving comment"
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
          max_tokens: 2048,
          system: captionPrompt,
          messages: [{ role: 'user', content: messageContent }],
        }),
      });

      let captionData = {};
      if (aiRes.ok) {
        const aiBody = await aiRes.json();
        const raw = aiBody.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        try {
          captionData = JSON.parse(raw);
        } catch {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) captionData = JSON.parse(match[0]);
        }
      }

      // ── Auto-schedule to next available slot ──
      let scheduledDatetime = null;
      const configs = await supaFetch(`crm_auto_schedule_config?client_id=eq.${client_id}&limit=1`);
      const config = configs?.[0];
      if (config?.time_slots?.length) {
        const tz = config.timezone || 'America/Chicago';
        const slots = config.time_slots;

        // Get all already-scheduled datetimes for this client
        const allScheduled = await supaFetch(`crm_content_scripts?client_id=eq.${client_id}&scheduled_datetime=not.is.null&select=scheduled_datetime`);
        const takenSlots = new Set((allScheduled || []).map(s => s.scheduled_datetime));

        const now = new Date();
        const fmt = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const parts = {};
        for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
        const nowHHMM = `${parts.hour}:${parts.minute}`;

        let currentDate = new Date(parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day));
        const slotsHHMM = slots.map(s => s.substring(0, 5));
        const todayFirstSlot = slotsHHMM.findIndex(s => s > nowHHMM);

        let slotIndex = todayFirstSlot >= 0 ? todayFirstSlot : 0;
        if (todayFirstSlot < 0) currentDate.setDate(currentDate.getDate() + 1);

        // Find the next open slot (not already taken)
        let attempts = 0;
        const maxAttempts = slots.length * 60; // check up to 60 days out
        while (attempts < maxAttempts) {
          const slot = slots[slotIndex];
          const year = currentDate.getFullYear();
          const month = String(currentDate.getMonth() + 1).padStart(2, '0');
          const day = String(currentDate.getDate()).padStart(2, '0');
          const timeStr = slot.length <= 5 ? `${slot}:00` : slot;
          const candidate = `${year}-${month}-${day} ${timeStr} ${tz}`;

          // Check if this slot is already taken (compare as date strings)
          const candidateCheck = `${year}-${month}-${day}T${timeStr}`;
          const isTaken = (allScheduled || []).some(s => {
            if (!s.scheduled_datetime) return false;
            const sFmt = new Intl.DateTimeFormat('en-US', {
              timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
            });
            const sParts = {};
            for (const p of sFmt.formatToParts(new Date(s.scheduled_datetime))) sParts[p.type] = p.value;
            return `${sParts.year}-${sParts.month}-${sParts.day}T${sParts.hour}:${sParts.minute}:${sParts.second}` === candidateCheck;
          });

          if (!isTaken) {
            scheduledDatetime = candidate;
            break;
          }

          slotIndex++;
          if (slotIndex >= slots.length) {
            slotIndex = 0;
            currentDate.setDate(currentDate.getDate() + 1);
          }
          attempts++;
        }
      }

      // ── Update the script with captions + schedule ──
      const updates = {
        updated_at: new Date().toISOString(),
        status: scheduledDatetime ? 'scheduled' : 'caption_ready',
      };
      if (captionData.title) updates.title = captionData.title;
      if (captionData.caption) updates.caption = captionData.caption;
      if (captionData.hashtags) updates.hashtags = captionData.hashtags;
      if (captionData.first_comment) updates.first_comment = captionData.first_comment;
      if (scheduledDatetime) updates.scheduled_datetime = scheduledDatetime;

      await supaFetch(`crm_content_scripts?id=eq.${targetScriptId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      // Fetch updated script
      const updatedRows = await supaFetch(`crm_content_scripts?id=eq.${targetScriptId}`);

      return res.json({
        script: updatedRows?.[0],
        captions_generated: !!(captionData.caption),
        scheduled: !!scheduledDatetime,
        scheduled_datetime: scheduledDatetime,
        used_vision: hasImages,
      });
    } catch (err) {
      console.error('approve-and-schedule error:', err);
      return res.status(500).json({ error: 'Approve and schedule failed: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action or method' });
};
