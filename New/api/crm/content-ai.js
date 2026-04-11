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
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    // Fetch schedule config
    const configs = await supaFetch(
      `crm_auto_schedule_config?client_id=eq.${client_id}&limit=1`
    );
    const config = configs && configs[0];
    if (!config || !config.time_slots || !config.time_slots.length) {
      return res.status(400).json({ error: 'No schedule config found for this client' });
    }

    // Fetch unscheduled scripts ordered by sort_order
    const scripts = await supaFetch(
      `crm_content_scripts?client_id=eq.${client_id}&scheduled_datetime=is.null&order=sort_order.asc`
    );

    if (!scripts || !scripts.length) {
      return res.json({ scheduled: 0 });
    }

    const { time_slots, timezone } = config;
    let slotIndex = 0;

    // Start from tomorrow to avoid scheduling in the past
    const now = new Date();
    let currentDate = new Date(now);
    currentDate.setDate(currentDate.getDate() + 1);

    let scheduled = 0;

    for (const script of scripts) {
      const slot = time_slots[slotIndex];

      // Build the scheduled datetime string
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const scheduledDatetime = `${year}-${month}-${day}T${slot}:00`;

      await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          scheduled_datetime: scheduledDatetime,
          status: 'scheduled',
          updated_at: new Date().toISOString(),
        }),
      });

      scheduled++;
      slotIndex++;

      // When all slots for the day are used, advance to next day
      if (slotIndex >= time_slots.length) {
        slotIndex = 0;
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    return res.json({ scheduled });
  }

  return res.status(400).json({ error: 'Invalid action or method' });
};
