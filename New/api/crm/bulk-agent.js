const { setCors, requireCrmUser, supaFetch, assertClientAccess, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Upload a base64 image attachment to the content-media bucket
async function uploadAttachmentToStorage(clientId, att) {
  const b64 = (att.data_base64 || '').includes(',') ? att.data_base64.split(',')[1] : att.data_base64;
  if (!b64) throw new Error('Attachment missing data_base64');
  const buffer = Buffer.from(b64, 'base64');
  const safeName = (att.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const filePath = `${clientId}/agent-uploads/${Date.now()}_${safeName}`;
  const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/content-media/${filePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': att.media_type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!upRes.ok) throw new Error(`Storage upload failed: ${await upRes.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/content-media/${filePath}`;
}

// Build a Claude vision message from attachments (images only here)
function attachmentsToVisionBlocks(attachments) {
  const blocks = [];
  for (const a of attachments || []) {
    if (a.kind === 'image' && a.data_base64) {
      const b64 = a.data_base64.includes(',') ? a.data_base64.split(',')[1] : a.data_base64;
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: a.media_type || 'image/jpeg', data: b64 },
      });
    }
  }
  return blocks;
}

// Parse a scheduled_at hint. Accepts ISO string, "+Nm", "+Nh", "+Nd", or returns null.
function parseScheduleAt(value) {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const rel = trimmed.match(/^\+\s*(\d+)\s*(m|min|minute|minutes|h|hr|hour|hours|d|day|days)$/i);
  if (rel) {
    const n = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    const ms = unit.startsWith('m') && !unit.startsWith('min') === false ? n * 60 * 1000
      : unit.startsWith('h') ? n * 60 * 60 * 1000
      : unit.startsWith('d') ? n * 24 * 60 * 60 * 1000
      : n * 60 * 1000;
    return new Date(Date.now() + ms);
  }
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d;
}

function fmtForPg(d, tz) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${tz}`;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tenant guard on any referenced client_id
  {
    const refClient = req.query?.client_id || req.body?.client_id;
    if (refClient) {
      const chk = await assertClientAccess(user, refClient);
      if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    }
  }

  try {
    const { prompt, attachments = [] } = req.body;
    if (!prompt && !attachments.length) return res.status(400).json({ error: 'prompt or attachments required' });

    // Fetch all active content clients
    const allClients = await supaFetch('crm_content_clients?is_active=eq.true&order=business_name.asc');
    if (!allClients?.length) return res.status(400).json({ error: 'No active content clients found' });

    // Build context about all clients
    const clientSummaries = allClients.map(c => ({
      id: c.id,
      business_name: c.business_name,
      industry: c.industry,
      handle: c.instagram_handle || c.threads_handle || '',
      tone: c.preferred_tone,
      target_audience: c.target_audience,
    }));

    const attachmentSummary = (attachments || []).map((a, i) => ({
      index: i, name: a.name, kind: a.kind, media_type: a.media_type, size: a.size,
    }));
    const nowIso = new Date().toISOString();

    // Use AI to interpret the task and generate an action plan
    const systemPrompt = `You are a content management agent for a CRM system. You manage multiple social media content clients.

CURRENT UTC TIME: ${nowIso}

ACTIVE CLIENTS:
${JSON.stringify(clientSummaries, null, 2)}

ATTACHMENTS PROVIDED BY USER (if any):
${JSON.stringify(attachmentSummary, null, 2)}

CAPABILITIES:
1. "generate_posts" - Generate social media posts from text prompts (no media).
   params: { prompt: "specific prompt", count: number }
2. "schedule_posts" - Bulk auto-schedule all existing unscheduled content using the client's default slots.
   params: {}
3. "generate_captions" - Generate captions for existing scripts (placeholder).
4. "upload_post" - Create ONE new post using an uploaded attachment as its media, auto-generate title/caption/hashtags/first_comment from the image, and schedule it at a specific time.
   params: {
     attachment_index: number,
     schedule_at: "ISO datetime or relative like +2m, +30m, +1h",
     prompt: "optional extra instructions for caption generation"
   }
5. "update_post" - Rewrite/update the title, caption, and/or hashtags of an EXISTING post, identified by a snippet of its current content.
   params: {
     content_match: "partial text to find the post (title or caption snippet)",
     fields: ["title", "caption", "hashtags", "first_comment"],  // which fields to rewrite
     prompt: "optional extra instructions for the rewrite"
   }

RULES:
- If the user wants to rewrite, update, or change an existing post's caption/title/hashtags, choose "update_post".
- If the user provides an image and says things like "upload this", "schedule this post", "post this for X in N minutes", choose "upload_post".
- Pick the client whose business_name matches what the user said (case-insensitive substring).
- If the user says "in 2 minutes" use schedule_at: "+2m". If they specify an absolute time, return ISO.
- If "all accounts" → emit one action per client.
- Return ONLY valid JSON, no code fences.

Return JSON:
{
  "interpretation": "What you understood",
  "actions": [
    { "client_id": "uuid", "client_name": "Name", "action": "upload_post", "params": {...} }
  ]
}`;

    const planRes = await fetch('https://api.anthropic.com/v1/messages', {
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
        messages: [{ role: 'user', content: prompt || '(no text, attachments only)' }],
      }),
    });

    if (!planRes.ok) throw new Error('AI planning failed: ' + await planRes.text());
    const planData = await planRes.json();
    const raw = planData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let plan;
    try {
      plan = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) plan = JSON.parse(match[0]);
      else throw new Error('Failed to parse AI plan');
    }

    // Execute each action
    const results = [];

    for (const action of plan.actions) {
      try {
        if (action.action === 'generate_posts') {
          // Fetch full client data for brand context
          const clientRows = await supaFetch(`crm_content_clients?id=eq.${action.client_id}&limit=1`);
          const client = clientRows?.[0];
          if (!client) { results.push({ ...action, status: 'error', error: 'Client not found' }); continue; }

          const brandContext = `
Business: ${client.business_name || ''}
Industry: ${client.industry || ''}
Location: ${client.location || ''}
Target Audience: ${client.target_audience || ''}
Tone: ${client.preferred_tone || 'friendly'}
Brand Bible: ${client.brand_bible || 'None'}
Handle: @${client.instagram_handle || client.threads_handle || ''}
MANDATORY CORE HASHTAGS (always include first): ${client.core_hashtags || '(none)'}`;

          const threadsStyle = client.threads_style || {};
          let styleInstructions = '';
          if (threadsStyle.voice) {
            styleInstructions = `\nCONTENT STYLE:\nVoice: ${threadsStyle.voice}\nWriting: ${threadsStyle.writing_style || ''}\nCTA: ${threadsStyle.cta_style || ''}\nHashtags: ${threadsStyle.hashtag_rules || ''}`;
          }

          const genRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5',
              max_tokens: 4096,
              system: `Generate social media posts. NEVER use em dashes. TODAY'S DATE: ${new Date().toISOString().slice(0, 10)}.\n\nBRAND CONTEXT:${brandContext}${styleInstructions}\n\nReturn JSON: { "posts": [{ "title": "...", "caption": "...", "hashtags": "...", "first_comment": "..." }] }. Return ONLY valid JSON.`,
              messages: [{ role: 'user', content: action.params.prompt || `Create ${action.params.count || 5} engaging posts` }],
            }),
          });

          if (!genRes.ok) throw new Error('Generation failed');
          const genData = await genRes.json();
          const genRaw = genData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          let posts;
          try { posts = JSON.parse(genRaw); } catch { const m = genRaw.match(/\{[\s\S]*\}/); posts = m ? JSON.parse(m[0]) : { posts: [] }; }

          const existing = await supaFetch(`crm_content_scripts?client_id=eq.${action.client_id}&select=id`);
          const baseOrder = (existing?.length || 0) + 1;

          const scripts = (posts.posts || []).map((p, i) => ({
            client_id: action.client_id,
            title: p.title || 'Generated Post',
            caption: p.caption || '',
            hashtags: p.hashtags || '',
            first_comment: p.first_comment || '',
            full_script: p.full_script || p.caption || '',
            status: 'caption_ready',
            sort_order: baseOrder + i,
          }));

          if (scripts.length) {
            await supaFetch('crm_content_scripts', {
              method: 'POST',
              body: JSON.stringify(scripts),
            });
          }

          results.push({ ...action, status: 'success', count: scripts.length });

        } else if (action.action === 'upload_post') {
          const idx = action.params?.attachment_index ?? 0;
          const att = attachments?.[idx];
          if (!att) { results.push({ ...action, status: 'error', error: `No attachment at index ${idx}` }); continue; }
          if (att.kind !== 'image') { results.push({ ...action, status: 'error', error: 'upload_post currently supports image attachments only' }); continue; }

          const clientRows = await supaFetch(`crm_content_clients?id=eq.${action.client_id}&limit=1`);
          const client = clientRows?.[0];
          if (!client) { results.push({ ...action, status: 'error', error: 'Client not found' }); continue; }

          // Upload image to storage
          const publicUrl = await uploadAttachmentToStorage(action.client_id, att);

          // Vision-generate caption/title/hashtags/first_comment
          const brandContext = [
            client.business_name ? `Business: ${client.business_name}` : '',
            client.industry ? `Industry: ${client.industry}` : '',
            client.location ? `Location: ${client.location}` : '',
            client.brand_bible ? `Brand Bible:\n${client.brand_bible}` : '',
            client.target_audience ? `Target Audience: ${client.target_audience}` : '',
            client.preferred_tone ? `Tone: ${client.preferred_tone}` : '',
            client.instagram_handle ? `Instagram: @${client.instagram_handle}` : '',
            client.core_hashtags ? `MANDATORY CORE HASHTAGS (always include these first): ${client.core_hashtags}` : '',
          ].filter(Boolean).join('\n');

          const visionBlocks = attachmentsToVisionBlocks([att]);
          const extraPrompt = action.params?.prompt || '';
          const userContent = [
            ...visionBlocks,
            { type: 'text', text: `Generate a social media post for this image.

BRAND CONTEXT:
${brandContext}

${extraPrompt ? `EXTRA INSTRUCTIONS FROM USER:\n${extraPrompt}\n` : ''}
Return ONLY valid JSON:
{"title": "...", "caption": "...", "hashtags": "...", "first_comment": "..."}

RULES:
- NEVER use em dashes. Use commas, periods, or colons.
- Match the brand voice and tone.
- Caption: punchy, scroll-stopping, with a clear hook.
- Hashtags: mix core brand + topic-specific (5-8 total).
- first_comment: one engagement question or CTA.` },
          ];

          let generated = {};
          const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5',
              max_tokens: 2000,
              system: 'You are an expert social media content creator. Analyze the provided image and return ONLY valid JSON.',
              messages: [{ role: 'user', content: userContent }],
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const genRaw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            try { generated = JSON.parse(genRaw); } catch { const m = genRaw.match(/\{[\s\S]*\}/); if (m) generated = JSON.parse(m[0]); }
          }

          // Determine scheduled_datetime
          const configs = await supaFetch(`crm_auto_schedule_config?client_id=eq.${action.client_id}&limit=1`);
          const tz = configs?.[0]?.timezone || 'America/Chicago';
          const when = parseScheduleAt(action.params?.schedule_at) || new Date(Date.now() + 2 * 60 * 1000);
          const scheduledPg = fmtForPg(when, tz);

          const existing = await supaFetch(`crm_content_scripts?client_id=eq.${action.client_id}&select=id`);
          const baseOrder = (existing?.length || 0) + 1;

          const scriptData = {
            client_id: action.client_id,
            title: generated.title || 'New Post',
            caption: generated.caption || '',
            hashtags: generated.hashtags || '',
            first_comment: generated.first_comment || '',
            full_script: generated.caption || '',
            media_urls: [publicUrl],
            media_type: 'image',
            scheduled_datetime: scheduledPg,
            status: 'scheduled',
            sort_order: baseOrder,
          };

          const created = await supaFetch('crm_content_scripts', {
            method: 'POST',
            body: JSON.stringify([scriptData]),
          });

          results.push({
            ...action,
            status: 'success',
            script_id: created?.[0]?.id,
            media_url: publicUrl,
            scheduled_datetime: scheduledPg,
            title: scriptData.title,
          });

        } else if (action.action === 'schedule_posts') {
          const configs = await supaFetch(`crm_auto_schedule_config?client_id=eq.${action.client_id}&limit=1`);
          const config = configs?.[0];
          if (!config) { results.push({ ...action, status: 'skipped', reason: 'No schedule config' }); continue; }

          const unscheduled = await supaFetch(`crm_content_scripts?client_id=eq.${action.client_id}&scheduled_datetime=is.null&order=sort_order.asc`);
          if (!unscheduled?.length) { results.push({ ...action, status: 'skipped', reason: 'No unscheduled scripts' }); continue; }

          const tz = config.timezone || 'America/Chicago';
          const now = new Date();
          const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
          const parts = {};
          for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
          const nowHHMM = `${parts.hour}:${parts.minute}`;
          let currentDate = new Date(parseInt(parts.year), parseInt(parts.month) - 1, parseInt(parts.day));

          const slotsHHMM = config.time_slots.map(s => s.substring(0, 5));
          let slotIndex = slotsHHMM.findIndex(s => s > nowHHMM);
          if (slotIndex < 0) { currentDate.setDate(currentDate.getDate() + 1); slotIndex = 0; }

          let scheduled = 0;
          for (const script of unscheduled) {
            const slot = config.time_slots[slotIndex];
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const timeStr = slot.length <= 5 ? `${slot}:00` : slot;
            const scheduledDatetime = `${year}-${month}-${day} ${timeStr} ${tz}`;

            await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ scheduled_datetime: scheduledDatetime, status: 'scheduled', updated_at: new Date().toISOString() }),
            });
            scheduled++;
            slotIndex++;
            if (slotIndex >= config.time_slots.length) { slotIndex = 0; currentDate.setDate(currentDate.getDate() + 1); }
          }

          results.push({ ...action, status: 'success', scheduled });

        } else if (action.action === 'update_post') {
          const { content_match, fields = ['title', 'caption', 'hashtags'], prompt: extraPrompt } = action.params || {};
          if (!content_match) { results.push({ ...action, status: 'error', error: 'content_match required' }); continue; }

          // Find the matching script
          const allScripts = await supaFetch(`crm_content_scripts?client_id=eq.${action.client_id}&order=created_at.desc&limit=200`);
          const needle = content_match.toLowerCase();
          const script = (allScripts || []).find(s =>
            (s.title || '').toLowerCase().includes(needle) ||
            (s.caption || '').toLowerCase().includes(needle) ||
            (s.full_script || '').toLowerCase().includes(needle)
          );
          if (!script) { results.push({ ...action, status: 'error', error: `No post found matching "${content_match}"` }); continue; }

          // Fetch brand context
          const clientRows = await supaFetch(`crm_content_clients?id=eq.${action.client_id}&limit=1`);
          const client = clientRows?.[0];
          const brandContext = client ? [
            client.brand_bible ? `Brand Bible: ${client.brand_bible}` : '',
            client.target_audience ? `Target Audience: ${client.target_audience}` : '',
            client.preferred_tone ? `Tone: ${client.preferred_tone}` : '',
            client.core_hashtags ? `Core Hashtags (always include first): ${client.core_hashtags}` : '',
          ].filter(Boolean).join('\n') : '';

          const rewriteSystem = `You are an expert social media content creator. NEVER use em dashes. TODAY'S DATE: ${new Date().toISOString().slice(0, 10)}.\n\nBRAND CONTEXT:\n${brandContext}\n\nReturn ONLY valid JSON, no markdown.`;
          const rewritePrompt = `Rewrite the following fields for this existing social media post: ${fields.join(', ')}.
${extraPrompt ? `Extra instructions: ${extraPrompt}` : ''}

EXISTING POST:
Title: ${script.title || ''}
Caption: ${script.caption || ''}
Hashtags: ${script.hashtags || ''}
First Comment: ${script.first_comment || ''}

Return JSON with only the requested fields: ${JSON.stringify(Object.fromEntries(fields.map(f => [f, '...'])))}`;

          const rewriteRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2048, system: rewriteSystem, messages: [{ role: 'user', content: rewritePrompt }] }),
          });
          if (!rewriteRes.ok) throw new Error('Rewrite AI failed');
          const rewriteData = await rewriteRes.json();
          const rewriteRaw = rewriteData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          let rewritten;
          try { rewritten = JSON.parse(rewriteRaw); } catch { const m = rewriteRaw.match(/\{[\s\S]*\}/); rewritten = m ? JSON.parse(m[0]) : {}; }

          // Patch only the requested fields
          const patch = { updated_at: new Date().toISOString() };
          if (rewritten.title        !== undefined) patch.title        = rewritten.title;
          if (rewritten.caption      !== undefined) patch.caption      = rewritten.caption;
          if (rewritten.hashtags     !== undefined) patch.hashtags     = rewritten.hashtags;
          if (rewritten.first_comment !== undefined) patch.first_comment = rewritten.first_comment;

          await supaFetch(`crm_content_scripts?id=eq.${script.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
          results.push({ ...action, status: 'success', script_id: script.id, updated_fields: Object.keys(patch).filter(k => k !== 'updated_at'), rewritten });

        } else {
          results.push({ ...action, status: 'skipped', reason: 'Unknown action' });
        }
      } catch (err) {
        results.push({ ...action, status: 'error', error: err.message });
      }
    }

    return res.json({
      interpretation: plan.interpretation,
      results,
      total_actions: results.length,
      successful: results.filter(r => r.status === 'success').length,
    });

  } catch (err) {
    console.error('Bulk agent error:', err);
    return res.status(500).json({ error: 'Bulk agent failed: ' + err.message });
  }
};
