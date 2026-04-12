const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function stripDashes(text) {
  if (!text) return text;
  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { prompt, conversation } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });

    // Get settings for context
    const settings = await supaFetch('crm_app_settings');
    const settingsMap = {};
    (settings || []).forEach(s => { settingsMap[s.key] = s.value; });

    // Get all contacts and leads for context
    const contacts = await supaFetch('crm_contacts?select=id,name,email,company,title&limit=100');
    const leads = await supaFetch('crm_leads?select=id,name,email,company,status,lead_segment,notes,problem,current_situation&limit=100');

    const contactList = [
      ...(contacts || []).map(c => `- ${c.name} (${c.email})${c.company ? ` at ${c.company}` : ''}${c.title ? `, ${c.title}` : ''} [contact]`),
      ...(leads || []).map(l => `- ${l.name} (${l.email})${l.company ? ` at ${l.company}` : ''} [lead, ${l.status || 'unknown'}]${l.notes ? ` Notes: ${l.notes}` : ''}${l.problem ? ` Problem: ${l.problem}` : ''}`),
    ].join('\n');

    const systemPrompt = `You are an AI email agent for ${settingsMap.company_name || 'Vernon Tech & Media'}.
Sender: ${settingsMap.sender_name || 'Ray Vernon'}
Company: ${settingsMap.company_name || 'Vernon Tech & Media'}
Services: ${settingsMap.services_offered || 'web development, AI automation, social media marketing, content creation'}
Tone: ${settingsMap.tone_preference || 'professional but personable, direct, no fluff'}
Target clients: ${settingsMap.target_client || 'small business owners, entrepreneurs'}

YOUR CONTACTS & LEADS:
${contactList || 'No contacts yet.'}

YOUR JOB:
The user will describe an email they want to create. You must:
1. Figure out WHO to send it to (match against the contacts/leads list above, or use the email/name they provide)
2. Generate the complete email with subject line and body
3. Make it sound natural, matching the brand tone

RULES:
- NEVER use em dashes or en dashes. Use hyphens, commas, or periods.
- Keep emails concise and action-oriented
- Match the sender's voice (direct, confident, helpful)
- If the user mentions a name, try to match it to an existing contact/lead
- If you can't find the contact, ask the user for the email address

Return JSON:
{
  "action": "draft_email",
  "to_name": "recipient name",
  "to_email": "recipient@email.com",
  "subject": "email subject line",
  "body": "full email body text",
  "reasoning": "brief explanation of your approach",
  "matched_contact": true/false,
  "needs_info": false,
  "question": null
}

If you need more information (like an email address or clarification), return:
{
  "action": "ask",
  "needs_info": true,
  "question": "What is their email address?"
}

Return ONLY valid JSON. No code blocks.`;

    // Build conversation messages
    const messages = [];
    if (conversation && conversation.length > 0) {
      for (const msg of conversation) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: prompt });

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      }),
    });

    if (!aiRes.ok) {
      const err = await aiRes.text();
      throw new Error('AI generation failed: ' + err);
    }

    const aiData = await aiRes.json();
    const raw = aiData.content[0].text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else throw new Error('Failed to parse AI response');
    }

    // Strip dashes
    if (parsed.body) parsed.body = stripDashes(parsed.body);
    if (parsed.subject) parsed.subject = stripDashes(parsed.subject);
    if (parsed.reasoning) parsed.reasoning = stripDashes(parsed.reasoning);

    return res.json(parsed);
  } catch (err) {
    console.error('Email agent error:', err);
    return res.status(500).json({ error: 'Email agent failed: ' + err.message });
  }
};
