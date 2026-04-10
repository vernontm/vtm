const { setCors, requireAuth } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { website_url, business_name, instagram, facebook, tiktok, youtube, linkedin } = req.body;

  if (!website_url && !business_name) {
    return res.status(400).json({ error: 'website_url or business_name required' });
  }

  try {
    // Step 1: Fetch website content
    let websiteContent = '';
    if (website_url) {
      try {
        const url = website_url.startsWith('http') ? website_url : `https://${website_url}`;
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VTM-CRM/1.0)' },
          signal: AbortSignal.timeout(10000),
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          // Extract useful parts: title, meta, headings, key text (first 8000 chars)
          websiteContent = html.substring(0, 12000);
        }
      } catch (e) {
        websiteContent = `Could not fetch website: ${e.message}`;
      }
    }

    // Step 2: Try to fetch social media pages for additional context
    const socialContext = [];
    const socialUrls = [
      instagram ? `https://www.instagram.com/${instagram.replace('@', '')}/` : null,
      facebook || null,
    ].filter(Boolean);

    for (const socialUrl of socialUrls.slice(0, 2)) {
      try {
        const sRes = await fetch(socialUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VTM-CRM/1.0)' },
          signal: AbortSignal.timeout(5000),
        });
        if (sRes.ok) {
          const html = await sRes.text();
          // Extract meta tags and og: data
          const metaMatch = html.match(/<meta[^>]+(property|name)="(og:|description|title)[^"]*"[^>]*content="([^"]*)"[^>]*>/gi) || [];
          socialContext.push(`[${socialUrl}] ` + metaMatch.join(' '));
        }
      } catch (e) { /* skip */ }
    }

    // Step 3: Send to Claude for brand analysis
    const prompt = `Analyze this business and extract a comprehensive brand profile. Return a JSON object with these exact fields:

{
  "business_name": "full business name",
  "owner_name": "owner/founder name if found, otherwise empty string",
  "business_type": "e.g. Restaurant, Salon, Agency, etc.",
  "industry": "broader industry category",
  "location_address": "full address if found",
  "location_city": "city",
  "location_state": "state",
  "target_audience": "who they serve, described in 1-2 sentences",
  "services": "their main services/products, comma separated",
  "unique_selling_points": "what makes them different, 1-2 sentences",
  "brand_colors": ["#hex1", "#hex2", "#hex3"],
  "brand_fonts": ["font name 1", "font name 2"],
  "outreach_tone": "formal or casual or friendly",
  "campaign_goals": "suggested campaign goals based on their business type",
  "website_url": "main website url",
  "instagram": "handle if found",
  "tiktok": "handle if found",
  "facebook": "url if found",
  "youtube": "channel if found",
  "linkedin": "url if found",
  "brand_bible": "A comprehensive brand bible summary including: brand voice and tone, visual identity (colors, fonts, imagery style), mission/vision, core values, key messaging pillars, target demographics, brand personality traits, do's and don'ts for brand communication. Write this as a detailed reference document that could be used for any future content or outreach. 3-5 paragraphs."
}

Business name provided: ${business_name || 'unknown'}
Website URL: ${website_url || 'none'}
Instagram: ${instagram || 'none'}
TikTok: ${tiktok || 'none'}
Facebook: ${facebook || 'none'}
YouTube: ${youtube || 'none'}
LinkedIn: ${linkedin || 'none'}

Website HTML content:
${websiteContent}

Social media context:
${socialContext.join('\n')}

IMPORTANT: Extract brand colors from CSS, inline styles, or any color references in the HTML. Look for hex codes, primary brand colors used in headers, buttons, and logos. For fonts, look for Google Fonts imports, font-family declarations, or any typography references.

Return ONLY valid JSON, no markdown, no explanation.`;

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
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse brand data', raw: text });
    }

    const brandData = JSON.parse(jsonMatch[0]);
    return res.json(brandData);

  } catch (err) {
    console.error('Brand scan error:', err);
    return res.status(500).json({ error: err.message });
  }
};
