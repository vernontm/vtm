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
    const { client_id, text } = req.body;
    if (!client_id || !text) {
      return res.status(400).json({ error: 'client_id and text required' });
    }

    const systemPrompt = `You are a content script parser. Given raw document text that contains multiple video scripts, parse them into individual scripts.

Return a JSON array where each object has:
- "series_name": the series or category name if identifiable (otherwise null)
- "title": an engaging, click-worthy title for the script (never just a number)
- "hook": the first 1-2 sentences that hook the viewer
- "full_script": the complete script text

Return ONLY valid JSON, no markdown formatting or code blocks.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: `Parse the following document into individual video scripts:\n\n${text}` }],
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
    const clients = await supaFetch(`crm_clients?id=eq.${client_id}`);
    const client = clients && clients[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Fetch scripts to generate captions for
    let scriptsQuery = `crm_content_scripts?client_id=eq.${client_id}`;
    if (script_ids && script_ids.length) {
      scriptsQuery += `&id=in.(${script_ids.join(',')})`;
    } else {
      // All scripts missing captions
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
      client.services ? `Services: ${client.services}` : '',
      client.outreach_tone ? `Tone: ${client.outreach_tone}` : '',
    ].filter(Boolean).join('\n');

    let updated = 0;

    for (const script of scripts) {
      const prompt = `You are a social media caption writer. Given a video script and brand context, generate a caption, hashtags, and a first comment for posting.

Brand Context:
${brandContext}

Video Script Title: ${script.title}
Script: ${script.full_script}

Return ONLY valid JSON with these fields:
- "caption": an engaging social media caption that matches the brand voice
- "hashtags": a string of relevant hashtags (include #)
- "first_comment": an engaging first comment to boost engagement`;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!aiRes.ok) continue;

      const aiData = await aiRes.json();
      let generated;
      try {
        const raw = aiData.content[0].text;
        const cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        generated = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      } catch {
        continue;
      }

      await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          caption: generated.caption,
          hashtags: generated.hashtags,
          first_comment: generated.first_comment,
          status: 'caption_ready',
          updated_at: new Date().toISOString(),
        }),
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
