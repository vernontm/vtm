const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');
const { buildUserContent } = require('../_lib/agent-attachments.js');

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
    const { prompt, conversation, page, attachments } = req.body;
    if (!prompt && (!attachments || !attachments.length)) return res.status(400).json({ error: 'prompt required' });
    if (typeof prompt === 'string' && prompt.length > 20000) {
      return res.status(400).json({ error: 'Prompt too long (max 20000 chars)' });
    }
    if (Array.isArray(conversation) && JSON.stringify(conversation).length > 50000) {
      return res.status(400).json({ error: 'Conversation history too long' });
    }

    // Gather CRM context
    const [settings, contacts, leads, deals, todos] = await Promise.all([
      supaFetch('crm_app_settings').catch(() => []),
      supaFetch('crm_contacts?select=id,name,email,company,title&limit=50').catch(() => []),
      supaFetch('crm_leads?select=id,name,email,company,status,lead_segment,notes&limit=50').catch(() => []),
      supaFetch('crm_deals?select=id,name,stage,value,contact_name&limit=30').catch(() => []),
      supaFetch('crm_todos?select=id,title,completed,due_date,priority&is_completed=eq.false&limit=20').catch(() => []),
    ]);

    const settingsMap = {};
    (settings || []).forEach(s => { settingsMap[s.key] = s.value; });

    const contactList = [
      ...(contacts || []).map(c => `- ${c.name} (${c.email})${c.company ? ` at ${c.company}` : ''} [contact]`),
      ...(leads || []).map(l => `- ${l.name} (${l.email})${l.company ? ` at ${l.company}` : ''} [lead, ${l.status}]`),
    ].join('\n');

    const dealList = (deals || []).map(d => `- ${d.name}: ${d.stage} ($${d.value || 0}) - ${d.contact_name || 'no contact'}`).join('\n');
    const todoList = (todos || []).map(t => `- [${t.priority || 'normal'}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ''}`).join('\n');

    const systemPrompt = `You are an AI assistant for ${settingsMap.company_name || 'Vernon Tech & Media'} CRM.
Owner: ${settingsMap.sender_name || 'Ray Vernon'}
Services: ${settingsMap.services_offered || 'web development, AI automation, social media marketing'}
Current page: ${page || 'unknown'}

CONTACTS & LEADS:
${contactList || 'None yet.'}

DEALS/PIPELINE:
${dealList || 'None yet.'}

OPEN TASKS:
${todoList || 'None.'}

YOUR JOB:
- Answer questions about the CRM data above
- Help with analysis, summaries, suggestions
- If the user wants to draft an email, return a draft_email action
- If the user asks to navigate somewhere, return a navigate action
- Be concise, direct, and helpful
- NEVER use em dashes or en dashes - use hyphens, commas, or periods

RESPONSE FORMAT - return JSON:
For answers/info:
{ "action": "answer", "message": "your response here" }

For email drafts:
{ "action": "draft_email", "to_name": "name", "to_email": "email", "subject": "subject", "body": "email body", "reasoning": "why" }

For navigation:
{ "action": "navigate", "path": "/leads", "message": "Taking you to leads..." }

Return ONLY valid JSON. No code blocks.`;

    const messages = [];
    if (conversation && conversation.length > 0) {
      for (const msg of conversation) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: buildUserContent(prompt || 'Please review the attached files.', attachments) });

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
      else return res.json({ action: 'answer', message: stripDashes(raw) });
    }

    if (parsed.message) parsed.message = stripDashes(parsed.message);
    if (parsed.body) parsed.body = stripDashes(parsed.body);
    if (parsed.subject) parsed.subject = stripDashes(parsed.subject);
    if (parsed.reasoning) parsed.reasoning = stripDashes(parsed.reasoning);

    return res.json(parsed);
  } catch (err) {
    console.error('Global agent error:', err);
    return res.status(500).json({ error: 'Agent failed: ' + err.message });
  }
};
