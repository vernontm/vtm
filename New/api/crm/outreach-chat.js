const { setCors, requireAuth } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { messages, client } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const clientContext = client ? `
Current client selected: ${client.business_name}
Industry: ${client.industry || client.business_type || 'Unknown'}
Location: ${client.location_city || ''}, ${client.location_state || ''}
Services: ${client.services || 'Not specified'}
Target Audience: ${client.target_audience || 'Not specified'}
Campaign Goals: ${client.campaign_goals || 'Not specified'}
Outreach Tone: ${client.outreach_tone || 'friendly'}` : 'No client selected.';

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
        system: `You are Ray's outreach assistant inside the Vernon Tech & Media CRM. You help Ray manage client outreach campaigns.

${clientContext}

You can understand and respond to commands like:
- "Find Houston food reviewers for [client]" — triggers lead research
- "Generate outreach emails for these leads" — triggers email generation
- "Show me the approval queue" — shows pending emails
- "Send approved emails" — triggers sending

When Ray gives a research command, respond with:
1. A brief confirmation of what you're about to search for
2. Include the tag [ACTION:RESEARCH] followed by a clean search description on the next line

When Ray asks to generate emails, respond with:
1. A brief confirmation
2. Include the tag [ACTION:GENERATE_EMAILS]

When Ray asks to send approved emails, respond with:
1. A confirmation with warning about sending
2. Include the tag [ACTION:SEND_APPROVED]

For general questions or unclear commands, just respond conversationally and ask for clarification.

Keep responses short (1-3 sentences). Match Ray's direct, no-fluff communication style. No em dashes.`,
        messages: messages.slice(-20),
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      console.error('Anthropic error:', err);
      return res.status(502).json({ error: 'AI service error' });
    }

    const aiData = await aiRes.json();
    const reply = aiData.content?.[0]?.text || '';

    // Parse actions from the reply
    let action = null;
    if (reply.includes('[ACTION:RESEARCH]')) {
      const searchLine = reply.split('[ACTION:RESEARCH]')[1]?.trim().split('\n')[0] || '';
      action = { type: 'research', query: searchLine };
    } else if (reply.includes('[ACTION:GENERATE_EMAILS]')) {
      action = { type: 'generate_emails' };
    } else if (reply.includes('[ACTION:SEND_APPROVED]')) {
      action = { type: 'send_approved' };
    }

    // Clean the reply text (remove action tags)
    const cleanReply = reply
      .replace(/\[ACTION:RESEARCH\].*$/m, '')
      .replace(/\[ACTION:GENERATE_EMAILS\]/g, '')
      .replace(/\[ACTION:SEND_APPROVED\]/g, '')
      .trim();

    return res.json({ reply: cleanReply, action });

  } catch (err) {
    console.error('Outreach chat error:', err);
    return res.status(500).json({ error: err.message });
  }
};
