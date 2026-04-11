const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { client_id, file_text, file_base64, file_name, business_name, media_type } = req.body;

  if (!file_text && !file_base64) {
    return res.status(400).json({ error: 'file_text or file_base64 required' });
  }

  try {
    const systemPrompt = `You are a brand strategist. Analyze the provided document and extract a comprehensive brand bible summary.

${business_name ? `BUSINESS: ${business_name}` : ''}

Extract and organize into a clean, structured brand bible:

1. Brand Voice & Tone: How does the brand speak? Personality traits, communication style.
2. Core Values & Mission: What the brand stands for.
3. Target Audience: Who they're trying to reach.
4. Key Messages & Taglines: Core messaging, slogans, recurring phrases.
5. Visual Identity Notes: Colors, fonts, logo usage if mentioned.
6. Content Guidelines: Dos and don'ts for content creation.
7. Core Hashtags: Any branded or frequently used hashtags. If none mentioned, suggest 5-8 based on the brand.
8. Posting Guidelines: Tone per platform, content types, frequency if mentioned.
9. Unique Selling Points: What makes them different.

Format as a clean, readable brand bible. Use simple headers and bullet points. Keep it concise but thorough. Never use em dashes.`;

    // Build message content based on file type
    let content;
    if (file_base64 && media_type === 'application/pdf') {
      // Use Claude's PDF document support
      content = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: file_base64,
          },
        },
        {
          type: 'text',
          text: `Analyze this document (${file_name || 'uploaded PDF'}) and create a brand bible from it.`,
        },
      ];
    } else if (file_base64 && (media_type || '').startsWith('image/')) {
      // Image file - use vision
      content = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: media_type,
            data: file_base64,
          },
        },
        {
          type: 'text',
          text: `Analyze this image (${file_name || 'uploaded image'}) and extract any brand-relevant information for a brand bible.`,
        },
      ];
    } else {
      // Text content
      content = `Analyze this document (${file_name || 'uploaded document'}) and create a brand bible from it:\n\n${(file_text || '').substring(0, 15000)}`;
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
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(502).json({ error: 'AI processing failed', detail: err });
    }

    const aiData = await aiRes.json();
    const brandBible = aiData.content?.[0]?.text || '';

    // Save to client if client_id provided
    if (client_id) {
      await supaFetch(`crm_content_clients?id=eq.${client_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          brand_bible: brandBible,
          updated_at: new Date().toISOString(),
        }),
      });
    }

    return res.json({ brand_bible: brandBible });

  } catch (err) {
    console.error('Process brand bible error:', err);
    return res.status(500).json({ error: err.message });
  }
};
