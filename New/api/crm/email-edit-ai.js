const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// POST /api/crm/email-edit-ai
// Body: { client_id, html, instruction, selection? }
//   selection = { refId, text, tag, outerHtml }  (optional — what the user clicked)
// Returns: { html: <updated full doc>, message: <short human-readable note> }
//
// The AI agent edits the template in-place. It may:
//   - Rewrite text
//   - Add or remove sections
//   - Change design elements (colors, spacing, buttons)
//   - Swap media (YouTube links, images)
// When `selection` is provided, edits are scoped to that element unless the
// instruction clearly implies a broader change.
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { client_id, html, instruction, selection } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    if (!html) return res.status(400).json({ error: 'html required' });
    if (!instruction) return res.status(400).json({ error: 'instruction required' });

    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}`);
    const client = clients?.[0];
    const brand = client ? {
      name: client.business_name || '',
      tone: client.preferred_tone || 'warm, confident, direct',
      primary: client.brand_primary_color || '',
      secondary: client.brand_secondary_color || '',
      bible: (client.brand_bible || '').slice(0, 6000),
      logo: client.logo_url || '',
      website: client.website_url || '',
    } : {};

    const selectionBlock = selection && selection.refId
      ? `\n\nUSER CLICKED ON THIS ELEMENT (scope your edit here when the instruction is about "this"/"it"/etc):\n- refId: ${selection.refId}\n- tag: <${selection.tag || '?'}>\n- text: "${(selection.text || '').slice(0, 200)}"\n- outerHTML: ${(selection.outerHtml || '').slice(0, 1200)}\n\nYou can target that element precisely via its data-vtm-ref="${selection.refId}" attribute.`
      : '';

    const systemPrompt = `You are an AI email design assistant. You are given the FULL HTML of an email template and a user instruction. Return the UPDATED full HTML that satisfies the instruction.

${brand.name ? `BRAND: ${brand.name} — tone: ${brand.tone}. Primary color: ${brand.primary}. Secondary: ${brand.secondary}.${brand.website ? ` Website: ${brand.website}.` : ''}${brand.logo ? ` Logo URL: ${brand.logo}.` : ''}` : ''}
${brand.bible ? `BRAND BIBLE:\n${brand.bible}\n\nALIGN all copy, voice, and tone adjustments with this brand bible.` : ''}

RULES:
1. Output ONLY valid JSON (no code fences, no prose). Shape: { "html": "<full updated document>", "message": "<one short sentence about what you changed>" }
2. Preserve the overall structure, brand feel, and any data-vtm-ref attributes on elements you do not fundamentally change.
3. When the user's instruction uses "this", "it", "the section", "this text" etc, apply the change to the clicked element (see SELECTION below).
4. When the instruction asks to remove a section, delete the entire logical block (card/container/strip), not just inner text.
5. When adding a new section, match the existing visual style (classes, inline styles, color palette).
6. No em/en dashes — use hyphens, commas, or periods.
7. Keep YouTube thumbnails in sync: if you change a YouTube link, update the nested <img src="https://img.youtube.com/vi/{ID}/maxresdefault.jpg"> as well.
8. Never add <script>, <iframe>, or external JS. Inline styles are fine.
${selectionBlock}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `INSTRUCTION: ${instruction}\n\nCURRENT HTML:\n${html}`,
        }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(500).json({ error: 'AI edit failed: ' + err.slice(0, 500) });
    }
    const aiData = await aiRes.json();
    const raw = (aiData.content?.[0]?.text || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) return res.status(500).json({ error: 'Failed to parse AI response' });
      parsed = JSON.parse(m[0]);
    }

    const newHtml = (parsed.html || '').replace(/\u2014/g, '-').replace(/\u2013/g, '-');
    return res.json({ html: newHtml, message: parsed.message || 'Updated.' });
  } catch (err) {
    console.error('email-edit-ai error:', err);
    return res.status(500).json({ error: err.message });
  }
};
