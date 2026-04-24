const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function stripDashes(s) {
  if (!s) return s;
  return s.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
}

// POST /api/crm/email-template-ai
// Body: { client_id, prompt?, template_type? }
// Returns: { subject, preview_text, html_body }
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

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
    const { client_id, prompt, template_type } = req.body || {};
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const clients = await supaFetch(`crm_content_clients?id=eq.${client_id}`);
    const client = clients?.[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const configs = await supaFetch(`crm_email_config?client_id=eq.${client_id}`);
    const config = configs?.[0] || {};

    const brandBible = (client.brand_bible || '').slice(0, 6000);
    const primary = client.brand_primary_color || '#E8650A';
    const secondary = client.brand_secondary_color || '#1a1a2e';
    const logoUrl = client.logo_url || '';
    const businessName = client.business_name || 'Your Brand';
    const fromName = config.from_name || businessName;
    const website = client.website_url || '';
    const tone = client.preferred_tone || 'warm, confident, direct';

    const tplType = template_type || 'blast';
    const userAsk = (prompt || '').trim();

    const systemPrompt = `You are an expert email designer generating a complete, production-ready HTML email template for ${businessName}.

BRAND CONTEXT:
- Business: ${businessName}
- Tone: ${tone}
- Primary color: ${primary}
- Secondary/dark color: ${secondary}
- Website: ${website || 'n/a'}
- Sender name: ${fromName}
${logoUrl ? `- Logo URL: ${logoUrl} (MUST include this image at top of the email, centered, max-width:160px)` : '- No logo provided (use brand name as wordmark)'}

BRAND BIBLE EXCERPT:
${brandBible || '(none provided)'}

TEMPLATE TYPE: ${tplType}${tplType === 'welcome' ? ' — this is a WELCOME email for brand new subscribers. Warm, thankful, set expectations, one CTA.' : ' — this is a BROADCAST email; punchy hook, value, one CTA.'}

USER REQUEST: ${userAsk || '(generate a generic high-converting template appropriate for the type)'}

REQUIREMENTS:
1. Output ONLY valid JSON, no code fences. Shape:
   { "subject": "...", "preview_text": "...", "html_body": "..." }
2. html_body is the INNER body HTML only — do NOT include <html>, <head>, or <body> wrappers. It will be wrapped in a styled shell by our renderer.
3. Use inline styles only (no <style> tags, no external CSS). Email clients strip them.
4. Layout: single-column, max-width 600px, center-aligned container.
5. Top of email: ${logoUrl ? `<img src="${logoUrl}" alt="${businessName}" style="max-width:160px;height:auto;display:block;margin:0 auto 24px;" />` : `<h1 style="color:${secondary};text-align:center;margin:0 0 24px;">${businessName}</h1>`}
6. Use brand colors meaningfully: primary ${primary} for CTA buttons and accents, ${secondary} for headings.
7. Include a prominent CTA button styled with the primary color (rounded, padding 14px 32px, white text, display inline-block).
8. Use {{name}} personalization where natural (e.g., "Hey {{name}},").
9. Include a professional footer with business name, unsubscribe placeholder text, and (if available) website.
10. Copy should be concise, scannable, brand-aligned. No em dashes or en dashes - use hyphens, commas, or periods only.
11. Subject line: under 55 chars, compelling. Preview text: 40-90 chars, complements subject.

Return ONLY the JSON object.`;

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
        system: systemPrompt,
        messages: [{ role: 'user', content: userAsk || `Generate a ${tplType} email template for ${businessName}.` }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(500).json({ error: 'AI generation failed: ' + err });
    }

    const aiData = await aiRes.json();
    const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
      else return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    return res.json({
      subject: stripDashes(parsed.subject || ''),
      preview_text: stripDashes(parsed.preview_text || ''),
      html_body: stripDashes(parsed.html_body || ''),
    });
  } catch (err) {
    console.error('email-template-ai error:', err);
    return res.status(500).json({ error: err.message });
  }
};
