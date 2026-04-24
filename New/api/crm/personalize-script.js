const { setCors, requireAuth } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { script, lead } = req.body;
  if (!script || !lead) return res.status(400).json({ error: 'script and lead required' });
  if (typeof script !== 'string' || script.length > 20000) {
    return res.status(400).json({ error: 'Script too long (max 20000 chars)' });
  }
  if (typeof lead !== 'object' || JSON.stringify(lead).length > 10000) {
    return res.status(400).json({ error: 'Lead payload too large' });
  }

  const systemPrompt = `You are a sales script personalizer for Vernon Tech & Media, a creative technology studio that builds websites, apps, AI content systems, and marketing automation for small businesses.

You receive a base call script template and specific information about a lead. Your job is to rewrite the script so it is hyper-personalized, short, natural, and focused on booking a 15-minute call. These are COLD calls — the prospect did not ask for this call, so you need to keep them engaged without taking up too much of their time.

HARD RULES:
- The ONE goal is always to book a 15-minute call. Never a 30-minute demo, never "schedule some time", always 15 minutes this week.
- NEVER discuss pricing on a cold call. If the lead asks about price, respond: "Great question, that's actually another reason to hop on the call, we'll walk through everything and find what fits."
- Keep the opening SHORT, 3 to 5 sentences max before asking for the 15 minutes. Do not lecture, do not pile on bullet points of what you offer.
- Always mention the tangible thing we built for them (free demo website, content sample, growth system breakdown), and tie it to a specific pain point we would solve for THIS lead. Make it feel like we already did the work.
- NEVER use em dashes (—) anywhere. Not in the script, not in objection handling, not anywhere. Use natural connector words instead like "so", "and", "there's", "but", or just a period and a new sentence. Example: instead of "I noticed you're missing some key pieces — no way for customers to book lessons", write "I noticed you're missing some key pieces. There's no way for customers to book lessons". It should flow like how a real person actually talks on the phone.
- NEVER repeat the company or lead name twice in the intro. The opening pattern is: confirm who you reached, then immediately introduce yourself. Example: "Hey, is this Knox Archery? Hey, this is Steph with Vernon Tech and Media, super quick call." Do NOT write "Hey, is this Knox Archery? Knox Archery, this is Steph…" — that sounds robotic.

STYLE:
- Conversational, confident, not salesy. Match how a real rep talks on the phone. Contractions, casual phrasing, short sentences.
- The rep introduces herself as "Steph" (short for Stephanie) in the opening. "Stephanie" is fine later in the script if needed, but the phone intro uses "Steph".
- Replace generic placeholders with specific details from the lead info.
- MINE THE NOTES FIELD for anything relatable or personal the rep can mention to build rapport. Examples:
    • If the notes say "saw their bus parked at F45 gym", weave that in naturally: "Hey, I actually saw your bus parked at F45 the other day, love the branding."
    • If the notes mention a neighborhood, event, mutual contact, or observation, reference it specifically.
    • This is what makes the call feel like it came from a real person who knows them, not a mass-dial.
- If the lead has no website, lead with that angle.
- If the lead has a bad/Wix/broken website, reference it specifically ("I saw your current site and…").
- If the lead uses Google Calendar only, reference the lack of a real booking system.
- If the lead expressed prior interest, acknowledge it warmly and pick that thread up.
- Tie the demo/work we did back to concrete business outcomes for THIS lead. Example for Knox Archery: "We actually built you a demo site that would let you sell your crossbows and archery gear online, bring more walk-ins into the shop, and position you as the go-to archery authority in your area."
- Include short objection-handling lines at the bottom (If asks price / If busy / If not interested). These also follow the no-em-dash rule.

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
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      return res.status(502).json({ error: 'AI provider error. Please try again.' });
    }

    const data = await response.json();
    const personalizedScript = data.content?.[0]?.text || '';
    return res.json({ script: personalizedScript });
  } catch (err) {
    console.error('personalize-script error:', err);
    return res.status(500).json({ error: 'Personalization failed' });
  }
};
