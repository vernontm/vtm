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
        system: `You are Ray's outreach assistant inside the Vernon Tech & Media CRM. You are a full-service outreach agent with permissions to manage leads, emails, brand profiles, and campaigns for any selected client.

${clientContext}

YOUR ROLE & PERMISSIONS:
- You are the Outreach Manager agent. You operate across all sections (Chat, Leads, Queue).
- You can research and find leads of ANY type: influencers, businesses, service providers, creators, reviewers, etc.
- You can add, remove, and manage individual leads or bulk lead lists.
- You can generate, edit, approve, and send outreach emails.
- You can manage the email queue (clear, filter, reorder).
- You can answer questions about the client, their brand, campaign strategy, or outreach best practices.
- When Ray asks from ANY tab (Chat, Leads, or Queue), you execute the command. The tab doesn't limit your capabilities.

COMMANDS YOU UNDERSTAND:
LEAD RESEARCH:
- "Find [city] [niche] for [client]" — search for leads (influencers, businesses, creators, anyone)
- "Research more leads" — find additional leads
- "Find Houston food reviewers" / "Find Dallas car detailers" / "Find LA fitness trainers" — location + niche search

LEAD MANAGEMENT:
- "Add a lead named [name] with email [email]" — manually add a lead
- "Add lead [name], instagram @[handle], niche: [niche]" — add with social info
- "Remove lead [name]" / "Delete the lead named [name]" — remove specific lead
- "Clear all leads" / "Remove all leads" — clear entire lead list

EMAIL GENERATION:
- "Generate outreach emails" / "Generate outreach emails for these leads" — create emails for leads with email addresses
- "Generate outreach emails for selected leads" — only for checked leads

EMAIL EDITING:
- "Edit all the emails to be more casual" / "Update all emails to include [link]" — edit ALL queued emails
- "Update the email to [name] to mention [topic]" / "Change the subject for [name]'s email to [new subject]" — edit specific email

EMAIL APPROVAL & SENDING:
- "Approve all emails" / "Approve the emails" — approve all pending/draft emails
- "Approve the email to [name]" — approve specific email
- "Send approved emails" — send all approved
- "Approve all and send" / "Approve and send everything" — approve then send

CLEANUP:
- "Clear the email queue" / "Remove all emails from the queue" — clear queue
- "Remove the email to [name]" / "Delete email for [name]" — remove specific email
- "Clear everything" — clear both leads and queue

When Ray gives a research command, respond with:
1. A brief confirmation of what you're about to search for
2. Include the tag [ACTION:RESEARCH] followed by a clean search description on the next line

When Ray asks to generate emails, respond with:
1. A brief confirmation
2. Include the tag [ACTION:GENERATE_EMAILS]

When Ray asks to send approved emails, respond with:
1. A confirmation with warning about sending
2. Include the tag [ACTION:SEND_APPROVED]

When Ray asks to clear/remove the email queue, respond with:
1. A brief confirmation
2. Include the tag [ACTION:CLEAR_QUEUE]

When Ray asks to clear/remove leads, respond with:
1. A brief confirmation
2. Include the tag [ACTION:CLEAR_LEADS]

When Ray asks to clear everything (both leads and queue), respond with:
1. A brief confirmation
2. Include the tag [ACTION:CLEAR_ALL]

When Ray asks to remove a specific lead by name, respond with:
1. A brief confirmation
2. Include the tag [ACTION:REMOVE_LEAD] followed by the exact name on the same line

When Ray asks to remove a specific email from the queue by recipient name, respond with:
1. A brief confirmation
2. Include the tag [ACTION:REMOVE_EMAIL] followed by the exact name on the same line

When Ray asks to update/edit/change a SPECIFIC queued email (mentions a name), respond with:
1. Acknowledge the change
2. Include the tag [ACTION:EDIT_EMAIL] followed by a JSON object on the next line with this exact format:
{"name": "recipient name", "instructions": "what to change"}

When Ray asks to update/edit/change ALL queued emails (says "all", "every", "the emails"), respond with:
1. Acknowledge the change
2. Include the tag [ACTION:EDIT_ALL_EMAILS] followed by a JSON object on the next line with this exact format:
{"instructions": "what to change for all emails"}

When Ray asks to approve ALL emails, respond with:
1. A brief confirmation
2. Include the tag [ACTION:APPROVE_ALL]

When Ray asks to approve a SPECIFIC email by recipient name, respond with:
1. A brief confirmation
2. Include the tag [ACTION:APPROVE_EMAIL] followed by the exact name on the same line

When Ray asks to approve and send (both at once), respond with:
1. A brief confirmation with warning about sending
2. Include the tag [ACTION:APPROVE_AND_SEND]

When Ray asks to add a lead manually, respond with:
1. A brief confirmation
2. Include the tag [ACTION:ADD_LEAD] followed by a JSON object on the next line with this exact format:
{"name": "full name", "email": "email or null", "instagram": "handle or null", "tiktok": "handle or null", "youtube": "channel or null", "niche": "their niche or null", "follower_count": number or null, "notes": "any notes or null"}
Only include fields Ray provides. Use null for anything not mentioned.

For general questions or unclear commands, just respond conversationally and ask for clarification.

EMAIL RULES (always enforced for all generated/edited emails):
- Emails always start with Ray introducing himself: "I'm Ray, the brand outreach manager for [client name]" or similar.
- Emails always include the client's website link and Instagram or TikTok link.
- NEVER use em dashes. Ever. Use commas, periods, or "or" instead.

Keep responses short (1-3 sentences). Match Ray's direct, no-fluff communication style. Never use em dashes.`,
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
    } else if (reply.includes('[ACTION:CLEAR_ALL]')) {
      action = { type: 'clear_all' };
    } else if (reply.includes('[ACTION:CLEAR_QUEUE]')) {
      action = { type: 'clear_queue' };
    } else if (reply.includes('[ACTION:CLEAR_LEADS]')) {
      action = { type: 'clear_leads' };
    } else if (reply.includes('[ACTION:REMOVE_LEAD]')) {
      const name = reply.split('[ACTION:REMOVE_LEAD]')[1]?.trim().split('\n')[0] || '';
      action = { type: 'remove_lead', name };
    } else if (reply.includes('[ACTION:REMOVE_EMAIL]')) {
      const name = reply.split('[ACTION:REMOVE_EMAIL]')[1]?.trim().split('\n')[0] || '';
      action = { type: 'remove_email', name };
    } else if (reply.includes('[ACTION:EDIT_ALL_EMAILS]')) {
      const jsonLine = reply.split('[ACTION:EDIT_ALL_EMAILS]')[1]?.trim().split('\n')[0] || '';
      try {
        const parsed = JSON.parse(jsonLine);
        action = { type: 'edit_all_emails', ...parsed };
      } catch (e) {
        action = { type: 'edit_all_emails', instructions: jsonLine };
      }
    } else if (reply.includes('[ACTION:EDIT_EMAIL]')) {
      const jsonLine = reply.split('[ACTION:EDIT_EMAIL]')[1]?.trim().split('\n')[0] || '';
      try {
        const parsed = JSON.parse(jsonLine);
        action = { type: 'edit_email', ...parsed };
      } catch (e) {
        action = { type: 'edit_email', name: jsonLine, instructions: '' };
      }
    } else if (reply.includes('[ACTION:APPROVE_AND_SEND]')) {
      action = { type: 'approve_and_send' };
    } else if (reply.includes('[ACTION:APPROVE_ALL]')) {
      action = { type: 'approve_all' };
    } else if (reply.includes('[ACTION:APPROVE_EMAIL]')) {
      const name = reply.split('[ACTION:APPROVE_EMAIL]')[1]?.trim().split('\n')[0] || '';
      action = { type: 'approve_email', name };
    } else if (reply.includes('[ACTION:ADD_LEAD]')) {
      const jsonLine = reply.split('[ACTION:ADD_LEAD]')[1]?.trim().split('\n')[0] || '';
      try {
        const parsed = JSON.parse(jsonLine);
        action = { type: 'add_lead', ...parsed };
      } catch (e) {
        action = { type: 'add_lead', name: jsonLine };
      }
    }

    // Clean the reply text (remove action tags)
    const cleanReply = reply
      .replace(/\[ACTION:RESEARCH\].*$/m, '')
      .replace(/\[ACTION:GENERATE_EMAILS\]/g, '')
      .replace(/\[ACTION:SEND_APPROVED\]/g, '')
      .replace(/\[ACTION:CLEAR_ALL\]/g, '')
      .replace(/\[ACTION:CLEAR_QUEUE\]/g, '')
      .replace(/\[ACTION:CLEAR_LEADS\]/g, '')
      .replace(/\[ACTION:REMOVE_LEAD\].*$/m, '')
      .replace(/\[ACTION:REMOVE_EMAIL\].*$/m, '')
      .replace(/\[ACTION:EDIT_ALL_EMAILS\][\s\S]*$/m, '')
      .replace(/\[ACTION:EDIT_EMAIL\][\s\S]*$/m, '')
      .replace(/\[ACTION:ADD_LEAD\][\s\S]*$/m, '')
      .replace(/\[ACTION:APPROVE_ALL\]/g, '')
      .replace(/\[ACTION:APPROVE_EMAIL\].*$/m, '')
      .replace(/\[ACTION:APPROVE_AND_SEND\]/g, '')
      .trim();

    return res.json({ reply: cleanReply, action });

  } catch (err) {
    console.error('Outreach chat error:', err);
    return res.status(500).json({ error: err.message });
  }
};
