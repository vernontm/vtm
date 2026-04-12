const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

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

    // Use AI to interpret the task and generate an action plan
    const systemPrompt = `You are a content management agent for a CRM system. You manage multiple social media content clients.

ACTIVE CLIENTS:
${JSON.stringify(clientSummaries, null, 2)}

Your job is to interpret the user's request and generate specific actions for each relevant client.

CAPABILITIES:
1. "generate_posts" - Generate social media posts for a client
2. "schedule_posts" - Auto-schedule unscheduled content
3. "generate_captions" - Generate captions for existing scripts

For each action, specify:
- client_id: which client this applies to
- action: the action type
- params: action-specific parameters (e.g. prompt for generate_posts, count for posts)

If the user says "all accounts" or "all clients", apply the action to every client.
If they specify a business or name, only apply to matching clients.

Return JSON:
{
  "interpretation": "What you understood from the request",
  "actions": [
    {
      "client_id": "uuid",
      "client_name": "Business Name",
      "action": "generate_posts",
      "params": { "prompt": "specific prompt for this client", "count": 5 }
    }
  ]
}

Return ONLY valid JSON. No code blocks.`;

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
        messages: [{ role: 'user', content: prompt }],
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
Target Audience: ${client.target_audience || ''}
Tone: ${client.preferred_tone || 'friendly'}
Brand Bible: ${client.brand_bible || 'None'}
Handle: @${client.instagram_handle || client.threads_handle || ''}`;

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
              system: `Generate social media posts. NEVER use em dashes.\n\nBRAND CONTEXT:${brandContext}${styleInstructions}\n\nReturn JSON: { "posts": [{ "title": "...", "caption": "...", "hashtags": "...", "first_comment": "..." }] }. Return ONLY valid JSON.`,
              messages: [{ role: 'user', content: action.params.prompt || `Create ${action.params.count || 5} engaging posts` }],
            }),
          });

          if (!genRes.ok) throw new Error('Generation failed');
          const genData = await genRes.json();
          const genRaw = genData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          let posts;
          try { posts = JSON.parse(genRaw); } catch { const m = genRaw.match(/\{[\s\S]*\}/); posts = m ? JSON.parse(m[0]) : { posts: [] }; }

          // Get existing script count for sort order
          const existing = await supaFetch(`crm_content_scripts?client_id=eq.${action.client_id}&select=id`);
          const baseOrder = (existing?.length || 0) + 1;

          // Save posts as content scripts
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

        } else if (action.action === 'schedule_posts') {
          // Trigger auto-schedule for this client
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
