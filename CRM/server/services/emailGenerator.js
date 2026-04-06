/**
 * emailGenerator.js
 * Builds Claude prompts from lead data + settings, calls Anthropic API,
 * parses and validates the JSON response.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { scoreLead } = require('./leadScorer');
const { db } = require('../db');

// Lazy-load client so missing key doesn't crash on startup
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not set. Add it to server/.env');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function getSetting(key) {
  return db.get('app_settings').find({ key }).value()?.value || '';
}

/**
 * Determine email type based on communication history and lead score.
 */
function getEmailType(lead) {
  const sent = db.get('communication_log')
    .filter(e => e.lead_id === lead.id && e.direction === 'outbound')
    .value();

  const count = sent.length;
  const { score } = scoreLead(lead);

  if (count === 0) return 'cold_outreach';

  const sorted = [...sent].sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  const daysSinceLast = Math.floor((Date.now() - new Date(sorted[0].sent_at)) / 86400000);
  const hasReply = sent.some(e => e.reply_received);

  if (count === 1 && daysSinceLast < 7)  return 'follow_up';
  if (count >= 2 && daysSinceLast > 14)  return 're_engagement';
  if (score >= 8 && !hasReply)           return 'value_add';
  if (hasReply)                          return 'soft_pitch';
  return 'check_in';
}

function buildPrompt(lead, settings, previousEmails, emailType, options = {}) {
  const { focus, extra_context } = options;
  const { score, segment } = scoreLead(lead);
  const rawDate = lead.submission_date || lead.created_at;
  const daysSinceSubmission = rawDate
    ? Math.floor((Date.now() - new Date(rawDate)) / 86400000)
    : 'unknown';

  const prevText = previousEmails.length > 0
    ? previousEmails.map((e, i) =>
        `Email ${i + 1} (sent ${e.sent_at?.slice(0, 10) || 'unknown'}):\nSubject: ${e.subject}\nPreview: ${e.body_preview}`
      ).join('\n\n')
    : 'No previous emails sent to this lead.';

  // Gmail sent + reply context
  const sentSection = lead.last_sent_subject
    ? `LAST EMAIL YOU SENT TO THIS LEAD:
Subject: ${lead.last_sent_subject}
Date: ${lead.last_sent_at ? new Date(lead.last_sent_at).toLocaleDateString() : 'unknown'}
Preview: ${lead.last_sent_preview || '(no preview)'}

Do NOT repeat the same angle or CTA from this email. Build forward from it.`
    : 'LAST EMAIL YOU SENT: None found in Gmail.';

  const replySection = lead.last_reply_summary
    ? `LAST REPLY FROM LEAD:
Subject: ${lead.last_reply_subject || '(unknown subject)'}
Date: ${lead.last_reply_at ? new Date(lead.last_reply_at).toLocaleDateString() : 'unknown'}
Summary: ${lead.last_reply_summary}

Important: This lead has replied. Acknowledge their response in your email. Build directly on what they said.`
    : 'LAST REPLY FROM LEAD: None on record — lead has not replied to any email yet.';

  // Focus override — tells Claude exactly what this email is centred on
  const focusSection = focus === 'reply' && lead.last_reply_summary
    ? `⚡ PRIMARY FOCUS — RESPOND TO THEIR REPLY:
This email exists SOLELY because the lead replied. Do NOT write a generic follow-up.
Your opening sentence must directly address what they said. Every paragraph must connect back to their reply.
If they asked a question, answer it. If they raised an objection, address it head-on.
The survey data and score are context only — the reply drives the entire email.`
    : focus === 'sent' && lead.last_sent_subject
    ? `⚡ PRIMARY FOCUS — FOLLOW UP ON YOUR LAST SENT EMAIL:
This is a deliberate follow-up to the email you already sent (subject: "${lead.last_sent_subject}").
Reference it naturally in your opening — they've seen it. Build forward from the specific angle or CTA you used.
Do NOT restart the conversation from scratch or repeat the same pitch word-for-word.`
    : '';

  // Extra context from the sender
  const extraContextSection = extra_context && extra_context.trim()
    ? `ADDITIONAL INSTRUCTIONS FROM SENDER:
${extra_context.trim()}
Incorporate these instructions naturally — they take priority over the default email type guidelines.`
    : '';

  // Calendar booking link — drives the ENTIRE email goal
  const calendarLink = settings.calendar_link || '';
  const callBooked = !!lead.call_completed;

  const unsubFooter = settings.unsubscribe_enabled === 'true'
    ? `\n\n---\n${settings.unsubscribe_text}`
    : '';

  const signature = settings.email_signature
    ? `\n\n${settings.email_signature}`
    : `\n\nBest,\n${settings.sender_name || 'Vernon'}`;

  return `You are a conversion-focused email copywriter for ${settings.company_name || 'a digital agency'}.

BUSINESS PROFILE:
Company: ${settings.company_name || 'Vernon Tech & Media'}
Services: ${settings.services_offered || '(not specified)'}
Target client: ${settings.target_client || '(not specified)'}
Tone: ${settings.tone_preference || 'professional'} (professional | casual | motivational | direct)
Sender name: ${settings.sender_name || 'Vernon'}

${calendarLink && !callBooked ? `PRIMARY GOAL - THIS IS NON-NEGOTIABLE:
Every email you write has ONE purpose: get this lead to book a discovery call.
The booking link is: ${calendarLink}
This exact URL must appear in every email as the single closing CTA.
Do NOT offer guides, PDFs, free resources, audits, case studies, or any other alternative.
Do NOT use vague language like "let's connect" or "reply to this email" as the CTA.
The call to action is ALWAYS and ONLY: click the link and book a call.

` : ''}LEAD DATA:
Name: ${lead.name || 'Unknown'}
Email: ${lead.email || 'Unknown'}
Location: ${lead.location || '—'}
TikTok: ${lead.tiktok_handle || '—'}
Has Business: ${lead.has_business || '—'}
Budget: ${lead.budget || '—'}
Time Available: ${lead.time_available || '—'}
Financial Goal: ${lead.financial_goal || '—'}
Current Situation: ${lead.current_situation || '—'}
Why Now: ${lead.why_now || '—'}
Skills & Story: ${lead.skills_story || '—'}
Previous Attempts: ${lead.previous_attempts || '—'}
Biggest Fear: ${lead.biggest_fear || '—'}
Biggest Wish: ${lead.biggest_wish || '—'}
Tech Comfort: ${lead.tech_comfort || '—'}
Content Preference: ${lead.content_preference || '—'}
Work Style: ${lead.work_style || '—'}
Social Media: ${lead.social_media || '—'}
Website: ${lead.website || '—'}
Submitted: ${daysSinceSubmission} days ago
Traffic Source: ${lead.lead_source || '—'}

LEAD SCORE: ${score}/10 — Segment: ${segment.toUpperCase()}

EMAIL TYPE TO WRITE: ${emailType}
- cold_outreach: First contact. Reference their specific situation. Build curiosity about what a call could unlock for them. Close with the booking link.
- follow_up: Follow-up on prior outreach. New angle or fresh perspective. Same destination: book the call.
- re_engagement: They've gone quiet. Re-spark interest with a different hook tied to their goals. Make booking feel easy and low-risk.
- value_add: Drop ONE concrete, specific insight tied to their exact situation — then use it to show why a call is the natural next step. Close with the booking link.
- soft_pitch: They've shown interest. Present your offer clearly with their goal as the anchor. The call is the obvious, logical close.
- check_in: Short, human check-in under 100 words. One line of empathy, one ask: book the call.

PREVIOUS EMAILS SENT TO THIS LEAD:
${prevText}

${sentSection}

${replySection}
${focusSection ? `\n${focusSection}` : ''}
${extraContextSection ? `\n${extraContextSection}` : ''}
WRITING RULES:
- Do NOT use "I hope this email finds you well" or any generic opener
- Reference at least 2 specific details from their survey data
- Subject lines under 60 characters; vary each: one direct, one curiosity, one benefit-led
- Body length: cold_outreach/soft_pitch = 150-250 words; follow_up/re_engagement = 120-180 words; check_in = under 100 words
- The closing CTA must be the booking link${calendarLink && !callBooked ? ` — embed it as a real URL: ${calendarLink}` : ' or a direct next step'}. No other CTA.
- Append the email signature and unsubscribe footer at the end of the body
- Write the body in plain text (no HTML tags, no markdown)
- Do NOT use em dashes (—) or en dashes (–) anywhere. Use a regular hyphen ( - ) instead.

EMAIL SIGNATURE TO APPEND:${signature}

UNSUBSCRIBE FOOTER:${unsubFooter || ' (none — do not add one)'}

Respond ONLY with valid JSON (no markdown, no explanation, no code fences):
{
  "email_type": "${emailType}",
  "subject_lines": ["Subject A (direct)", "Subject B (curiosity)", "Subject C (benefit)"],
  "body": "Full email body including signature and unsubscribe footer as plain text",
  "reasoning": "1-2 sentences: which specific survey fields you leveraged and why",
  "confidence_score": 75,
  "suggested_next_action": "Brief instruction for the sender on what to do next",
  "personalization_hooks_used": ["field_name_1", "field_name_2"]
}`;
}

async function generateEmailForLead(lead, options = {}) {
  const emailType = getEmailType(lead);

  // Load settings
  const settingKeys = [
    'company_name', 'services_offered', 'target_client', 'tone_preference',
    'sender_name', 'email_signature', 'unsubscribe_enabled', 'unsubscribe_text',
    'calendar_link',
  ];
  const settings = {};
  settingKeys.forEach(k => { settings[k] = getSetting(k); });

  // Last 3 outbound emails to this lead
  const previousEmails = db.get('communication_log')
    .filter(e => e.lead_id === lead.id && e.direction === 'outbound')
    .orderBy('sent_at', 'desc')
    .take(3)
    .value();

  const prompt = buildPrompt(lead, settings, previousEmails, emailType, options);

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content[0].text.trim();

  // Parse — handle both raw JSON and markdown code-block wrapping
  let parsed;
  try {
    // Try raw first
    parsed = JSON.parse(rawText);
  } catch {
    // Strip ```json ... ``` wrapper if present
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (!match) throw new Error(`Could not parse Claude response as JSON:\n${rawText.slice(0, 300)}`);
    parsed = JSON.parse(match[1].trim());
  }

  // Validate required fields
  if (!Array.isArray(parsed.subject_lines) || parsed.subject_lines.length < 1) {
    throw new Error('Claude response missing subject_lines array');
  }
  if (!parsed.body) {
    throw new Error('Claude response missing body');
  }

  // Ensure exactly 3 subject lines
  while (parsed.subject_lines.length < 3) {
    parsed.subject_lines.push(parsed.subject_lines[0]);
  }

  // Strip em dashes (—) and en dashes (–) from all text output.
  // [^\S\n]{2,} collapses extra spaces/tabs but preserves newlines (paragraph breaks).
  const stripDashes = str => (str || '').replace(/[—–]/g, ' - ').replace(/[^\S\n]{2,}/g, ' ').trim();
  parsed.body = stripDashes(parsed.body);
  parsed.subject_lines = parsed.subject_lines.map(stripDashes);

  // Normalize confidence_score to 0-100 integer
  let conf = parsed.confidence_score || 70;
  if (conf > 0 && conf <= 1) conf = Math.round(conf * 100); // e.g. 0.75 → 75
  parsed.confidence_score = Math.max(0, Math.min(100, Math.round(conf)));

  return { ...parsed, email_type: emailType };
}

module.exports = { generateEmailForLead, getEmailType };
