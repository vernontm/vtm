const { setCors, requireAuth } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { script, lead } = req.body;
  if (!script || !lead) return res.status(400).json({ error: 'script and lead required' });

  const systemPrompt = `You are a sales script personalizer for Vernon Tech & Media, a creative technology studio that builds websites, apps, AI content systems, and marketing automation for small businesses.

You receive a base call script template and specific information about a lead. Your job is to rewrite the script so it is hyper-personalized — short, natural, and focused on booking a 15-minute call.

HARD RULES:
- The ONE goal is always to book a 15-minute call — never a 30-minute demo, never "schedule some time", always 15 minutes this week.
- NEVER discuss pricing on a cold call. If the lead asks about price, respond: "Great question — that's actually another reason to hop on the call, we'll walk through everything and find what fits."
- Keep the opening SHORT — 3-5 sentences max before asking for the 15 minutes. Do not lecture, do not pile on bullet points of what you offer.
- Always mention the tangible thing we built for them (free demo website / content sample / growth system breakdown) — make it feel like we already did the work.

STYLE:
- Conversational, confident, not salesy. Match how a real rep talks on the phone.
- Replace generic placeholders with specific details from the lead info
- If the lead has no website → lead with that angle
- If the lead has a bad/Wix/not-working website → reference it specifically ("I saw your current site and…")
- If the lead uses Google Calendar only → reference the lack of a real booking system
- If the lead expressed prior interest → acknowledge it warmly and pick that thread up
- The rep's name should remain "Stephanie" (she handles cold outreach)
- Include short objection-handling lines at the bottom (If asks price / If busy / If not interested)

Output ONLY the personalized script text, no explanations or headers.`;

  const userMessage = `Lead Information:
- Name: ${lead.name || 'Unknown'}
- Company: ${lead.company || 'Unknown'}
- Industry/Title: ${lead.title || 'not specified'}
- Phone: ${lead.phone || ''}
- Email: ${lead.email || ''}
- Product Need: ${lead.product_need || 'not set'}
- Status: ${lead.status || ''}
- Notes: ${lead.notes || 'none'}
- Problem: ${lead.problem || 'none'}
- Current Situation: ${lead.current_situation || 'none'}
- Financial Goal: ${lead.financial_goal || 'none'}
- Budget: ${lead.budget || 'unknown'}
- Best Time to Call: ${lead.best_time || 'unknown'}

Base Script to Personalize:
${script}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Anthropic error: ${err}` });
    }

    const data = await response.json();
    const personalizedScript = data.content?.[0]?.text || '';
    return res.json({ script: personalizedScript });
  } catch (err) {
    console.error('personalize-script error:', err);
    return res.status(500).json({ error: err.message });
  }
};
