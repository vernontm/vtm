const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Ask Claude for a short lowercase hook title from the full script.
async function suggestTitleFromScript(script) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `Read this short-form video script and return a punchy TikTok-style lowercase title (3-7 words, no quotes, no trailing punctuation, occasionally one period between short words like "effort. environment. presentation." is fine). Return ONLY the title text, nothing else.\n\nScript:\n${script}`,
      }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude error ${res.status}: ${err}`);
  }
  const data = await res.json();
  const txt = (data?.content?.[0]?.text || '').trim().replace(/^["""'']|["""'']$/g, '');
  return txt;
}

// Avatar renders endpoint.
// - GET                           — all renders (optionally filter by avatar_id or status)
// - GET ?id=                      — single render with sentences
// - POST                          — create a render (sets status='pending' for worker pickup)
// - PUT  ?id=                     — patch render fields
// - DELETE ?id=
// - POST ?id=&action=schedule     — promote final_video_url into crm_content_scripts under a client

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, avatar_id, status, action } = req.query;

  // ── GET one ──
  if (req.method === 'GET' && id) {
    const rows = await supaFetch(`crm_avatar_renders?id=eq.${id}`);
    return res.json(rows[0] || null);
  }

  // ── GET list ──
  if (req.method === 'GET') {
    const filters = [];
    if (avatar_id) filters.push(`avatar_id=eq.${avatar_id}`);
    if (status)    filters.push(`status=eq.${status}`);
    filters.push('order=created_at.desc');
    const rows = await supaFetch(`crm_avatar_renders?${filters.join('&')}`);
    return res.json(rows);
  }

  // ── Suggest title from script ──
  if (req.method === 'POST' && action === 'suggest-title') {
    const { script } = req.body || {};
    if (!script || !script.trim()) return res.status(400).json({ error: 'script required' });
    try {
      const title = await suggestTitleFromScript(script);
      return res.json({ title });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── Schedule under client ──
  if (req.method === 'POST' && action === 'schedule') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const { client_id, caption = '', hashtags = '', title } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const renders = await supaFetch(`crm_avatar_renders?id=eq.${id}`);
    const render = renders[0];
    if (!render) return res.status(404).json({ error: 'render not found' });
    if (!render.final_video_url) return res.status(400).json({ error: 'render not yet complete' });

    const existing = await supaFetch(`crm_content_scripts?client_id=eq.${client_id}&select=id`);
    const baseOrder = (existing?.length || 0) + 1;

    const script = {
      client_id,
      title: title || render.title || `${render.script.slice(0, 40)}...`,
      caption: caption || render.script,
      hashtags,
      full_script: render.script,
      media_urls: [render.final_video_url],
      media_type: 'video',
      status: 'caption_ready',
      sort_order: baseOrder,
    };

    const created = await supaFetch('crm_content_scripts', {
      method: 'POST',
      body: JSON.stringify([script]),
    });
    const scriptId = created?.[0]?.id;

    await supaFetch(`crm_avatar_renders?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduled_post_id: scriptId }),
    });

    return res.json({ success: true, script: created?.[0] });
  }

  // ── POST create ──
  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.avatar_id || !body.script) {
      return res.status(400).json({ error: 'avatar_id and script required' });
    }
    const payload = {
      ...body,
      status: body.status || 'pending',
    };
    const rows = await supaFetch('crm_avatar_renders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.json(rows[0] || rows);
  }

  // ── PUT patch ──
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const rows = await supaFetch(`crm_avatar_renders?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req.body || {}),
    });
    return res.json(rows[0] || null);
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_avatar_renders?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
