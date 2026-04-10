const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { command, client } = req.body;

  if (!command || !client) {
    return res.status(400).json({ error: 'command and client required' });
  }

  try {
    const prompt = `You are a lead research agent for Vernon Tech & Media, a digital services agency.

Your task: "${command}"

You are researching leads for this client:
- Business: ${client.business_name}
- Industry: ${client.industry || client.business_type}
- Location: ${client.location_city}, ${client.location_state}
- Services: ${client.services}
- Target Audience: ${client.target_audience}
- Campaign Goals: ${client.campaign_goals}

Based on the command, generate a list of 15-25 realistic leads that would be relevant. These should be real types of people/businesses/influencers that exist in this space. For each lead, provide realistic but fictional details.

Return a JSON array of leads:
[
  {
    "name": "Full Name or Business Name",
    "instagram": "@handle",
    "tiktok": "@handle",
    "youtube": "channel name or empty",
    "email": "realistic email address",
    "follower_count": 12500,
    "niche": "food review, lifestyle, tech, etc.",
    "content_style": "short description of their content approach",
    "relevance_score": 85,
    "notes": "why they'd be a good fit for this client"
  }
]

Rules:
- Generate realistic, plausible leads matching the search command
- Relevance scores should be 1-100 based on how well they match the client's needs
- Follower counts should be realistic and varied (mix of micro and mid-tier)
- Email addresses should follow common patterns (name@gmail.com, business@domain.com)
- Include a mix of platforms, not every lead needs all social handles
- Sort by relevance score descending

Return ONLY valid JSON array, no markdown, no explanation.`;

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

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Could not parse leads', raw: text });
    }

    const leads = JSON.parse(jsonMatch[0]);

    // Save leads to database if client_id provided
    if (client.id) {
      const leadsToInsert = leads.map(l => ({
        client_id: client.id,
        name: l.name || '',
        instagram: l.instagram || '',
        tiktok: l.tiktok || '',
        youtube: l.youtube || '',
        email: l.email || '',
        follower_count: l.follower_count || 0,
        niche: l.niche || '',
        content_style: l.content_style || '',
        relevance_score: l.relevance_score || 0,
        notes: l.notes || '',
        email_status: 'new',
      }));

      await supaFetch('crm_client_leads', {
        method: 'POST',
        body: JSON.stringify(leadsToInsert),
      });
    }

    return res.json({ leads, count: leads.length });

  } catch (err) {
    console.error('Research error:', err);
    return res.status(500).json({ error: err.message });
  }
};
