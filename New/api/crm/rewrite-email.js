const { setCors, requireAuth } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { current_subject, current_body, to_name, instructions, client_name, client } = req.body;

  if (!current_body || !instructions) {
    return res.status(400).json({ error: 'current_body and instructions required' });
  }

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Edit this outreach email based on the instructions below.

CURRENT SUBJECT: ${current_subject}
CURRENT BODY:
${current_body}

RECIPIENT: ${to_name}
SENT FROM: ${client_name || 'our team'}

EDIT INSTRUCTIONS: ${instructions}

MANDATORY RULES (always enforce even if not in edit instructions):
- NEVER use em dashes (—). Use commas, periods, or "or" instead.
- The email must start with Ray introducing himself as the brand outreach manager for ${client_name || 'the company'}.
- The email must include the company website link and at least one social media link (Instagram or TikTok) if they were in the original.

Return a JSON object with the updated email:
{"subject": "updated subject line", "body": "updated full email body"}

Keep the same tone and format. Only change what the instructions ask for. Make sure the recipient name (${to_name}) is correct in the greeting.
Return ONLY valid JSON, no markdown.`,
        }],
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      return res.status(502).json({ error: 'AI service error' });
    }

    const aiData = await aiRes.json();
    const text = aiData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse response' });

    return res.json(JSON.parse(jsonMatch[0]));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
