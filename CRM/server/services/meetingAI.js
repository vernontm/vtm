/**
 * meetingAI.js
 * Claude AI integration for meeting summaries and Sidekick chat.
 * Since auto-transcription is not enabled, summaries are generated from
 * meeting metadata: title, description, participants, duration, linked leads.
 */

const Anthropic = require('@anthropic-ai/sdk');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Build a rich context string for a meeting from its metadata.
 */
function buildMeetingContext(meeting, linkedLeads = []) {
  const lines = [];
  lines.push(`MEETING: ${meeting.title || '(Untitled)'}`);
  if (meeting.start_time) {
    const d = new Date(meeting.start_time);
    lines.push(`DATE: ${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
    lines.push(`TIME: ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`);
  }
  if (meeting.duration_minutes) lines.push(`DURATION: ${meeting.duration_minutes} minutes`);

  if (meeting.participants?.length > 0) {
    const names = meeting.participants.map(p => p.name !== p.email ? `${p.name} (${p.email})` : p.email).join(', ');
    lines.push(`PARTICIPANTS: ${names}`);
  }

  if (meeting.description?.trim()) {
    lines.push(`\nAGENDA / DESCRIPTION:\n${meeting.description.trim()}`);
  }

  if (meeting.notes?.trim()) {
    lines.push(`\nMEETING NOTES:\n${meeting.notes.trim()}`);
  }

  if (linkedLeads.length > 0) {
    lines.push(`\nLINKED CRM LEADS:`);
    linkedLeads.forEach(lead => {
      const parts = [lead.name, lead.company, lead.status ? `Status: ${lead.status}` : ''].filter(Boolean);
      lines.push(`  - ${parts.join(' | ')}`);
      if (lead.budget) lines.push(`    Budget: ${lead.budget}`);
      if (lead.financial_goal) lines.push(`    Goal: ${lead.financial_goal}`);
    });
  }

  return lines.join('\n');
}

/**
 * Generate a structured AI summary for a meeting.
 * Returns the parsed summary object and saves it.
 *
 * @param {object} meeting      - Full meeting record from DB
 * @param {array}  linkedLeads  - Array of linked lead objects
 * @returns {object} summary    - Structured summary object
 */
async function generateMeetingSummary(meeting, linkedLeads = []) {
  const client  = getClient();
  const context = buildMeetingContext(meeting, linkedLeads);

  const prompt = `You are a professional meeting analyst for a digital marketing/tech business called Vernon Tech & Media. Based on the meeting information below, generate a structured analysis.

IMPORTANT: Since no transcript is available, base your analysis entirely on the meeting metadata — title, agenda, participants, linked lead details, and any notes provided. Be specific and business-relevant. Do not make up facts that aren't implied by the information.

${context}

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "summary_title": "A descriptive, professional title for this meeting (different from the raw meeting name)",
  "general_summary": "2-3 paragraph professional overview of what this meeting was likely about, its purpose, and business context",
  "main_points": ["3-5 key bullet points about the meeting's purpose and likely outcomes"],
  "topics": [
    {
      "title": "Topic name",
      "bullets": ["Key point about this topic", "Another point"]
    }
  ],
  "action_items": ["Specific action items or follow-ups implied by the meeting context"],
  "key_decisions": ["Any decisions that were likely discussed or made"],
  "follow_up_suggested": "A professional one-paragraph follow-up email suggestion for this meeting"
}`;

  const response = await client.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 1500,
    messages:   [{ role: 'user', content: prompt }],
  });

  const raw = response.content[0]?.text || '';

  // Parse JSON — handle both raw and markdown-wrapped
  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch (e) {
    throw new Error(`Failed to parse AI summary JSON: ${e.message}`);
  }

  return parsed;
}

/**
 * Answer a question about a meeting (Sidekick chat).
 * Uses meeting context + conversation history.
 *
 * @param {object} meeting           - Full meeting record
 * @param {array}  linkedLeads       - Linked leads
 * @param {string} question          - User's question
 * @param {array}  conversationHistory - [{role: 'user'|'assistant', content: string}]
 * @param {object|null} summary      - Previously generated summary if available
 * @returns {string} AI response
 */
async function askAboutMeeting(meeting, linkedLeads = [], question, conversationHistory = [], summary = null) {
  const client  = getClient();
  const context = buildMeetingContext(meeting, linkedLeads);

  let systemPrompt = `You are a helpful AI assistant ("Sidekick") for Vernon Tech & Media's CRM. You help the user understand and act on information from their meetings.

MEETING CONTEXT:
${context}`;

  if (summary) {
    systemPrompt += `\n\nAI-GENERATED SUMMARY:
Title: ${summary.summary_title || ''}
Summary: ${summary.general_summary || ''}
Main Points: ${(summary.main_points || []).join('; ')}
Action Items: ${(summary.action_items || []).join('; ')}
Key Decisions: ${(summary.key_decisions || []).join('; ')}`;
  }

  systemPrompt += `

INSTRUCTIONS:
- Answer questions about this specific meeting only
- Be concise, direct, and business-focused
- If asked to generate a follow-up email, write a professional email ready to send
- If you don't have enough information to answer, say so honestly
- Do not make up information not present in the meeting context`;

  // Build message history
  const messages = [];
  conversationHistory.forEach(msg => {
    messages.push({ role: msg.role, content: msg.content });
  });
  messages.push({ role: 'user', content: question });

  const response = await client.messages.create({
    model:      'claude-opus-4-5',
    max_tokens: 800,
    system:     systemPrompt,
    messages,
  });

  return response.content[0]?.text || 'I was unable to generate a response. Please try again.';
}

module.exports = { generateMeetingSummary, askAboutMeeting, buildMeetingContext };
