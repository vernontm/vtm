/**
 * gmailThreadSync.js
 * Searches Gmail for the most recent reply FROM a lead AND the most recent email
 * sent TO a lead. Fetches the full reply thread, summarizes with Claude, and
 * returns structured data to be saved on the lead record.
 */

const { google }   = require('googleapis');
const Anthropic    = require('@anthropic-ai/sdk');
const { getAuthenticatedClient, getSetting } = require('./gmailClient');

// ── Gmail helpers ─────────────────────────────────────────────────────────────

function getAuthGmail() {
  return getAuthenticatedClient().then(auth => google.gmail({ version: 'v1', auth }));
}

function getHeader(message, name) {
  return (message.payload?.headers || []).find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )?.value || '';
}

/**
 * Recursively walk a Gmail message payload to extract the first text/plain part.
 */
function extractPlainText(payload) {
  if (!payload) return '';

  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }

  // Fallback: if body has data and no mimeType matched
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  return '';
}

// ── Core functions ────────────────────────────────────────────────────────────

/**
 * Search Gmail for the most recent message sent FROM leadEmail.
 * Returns { threadId, messageId, subject, date } or null.
 */
async function findLatestReplyInfo(leadEmail) {
  const gmail = await getAuthGmail();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `from:${leadEmail}`,
    maxResults: 5,
  });

  const messages = listRes.data.messages;
  if (!messages || messages.length === 0) return null;

  // Get metadata for the most recent message (include Message-ID for threading)
  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messages[0].id,
    format: 'metadata',
    metadataHeaders: ['Subject', 'Date', 'From', 'Message-ID'],
  });

  return {
    threadId:     detail.data.threadId,
    messageId:    messages[0].id,
    rfcMessageId: getHeader(detail.data, 'Message-ID'), // RFC 2822 header for In-Reply-To
    subject:      getHeader(detail.data, 'Subject'),
    date:         getHeader(detail.data, 'Date'),
  };
}

/**
 * Search Gmail for the most recent message sent TO leadEmail (outbound).
 * Returns { subject, date, preview } or null.
 */
async function findLastSentToLead(leadEmail) {
  const gmail = await getAuthGmail();

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `to:${leadEmail}`,
    maxResults: 1,
  });

  const messages = listRes.data.messages;
  if (!messages || messages.length === 0) return null;

  const detail = await gmail.users.messages.get({
    userId: 'me',
    id: messages[0].id,
    format: 'full',
  });

  let sent_at;
  try {
    sent_at = new Date(getHeader(detail.data, 'Date')).toISOString();
  } catch {
    sent_at = new Date().toISOString();
  }

  return {
    subject:      getHeader(detail.data, 'Subject'),
    sent_at,
    preview:      extractPlainText(detail.data.payload).slice(0, 400),
    threadId:     detail.data.threadId,
    messageId:    messages[0].id,
    rfcMessageId: getHeader(detail.data, 'Message-ID'), // RFC 2822 header for In-Reply-To
  };
}

/**
 * Fetch all messages in a thread and decode bodies.
 * Caps each message body at 2 000 chars to stay within Claude context limits.
 */
async function getThreadMessages(threadId) {
  const gmail = await getAuthGmail();

  const threadRes = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  return (threadRes.data.messages || []).map(msg => ({
    id:      msg.id,
    from:    getHeader(msg, 'From'),
    date:    getHeader(msg, 'Date'),
    subject: getHeader(msg, 'Subject'),
    body:    extractPlainText(msg.payload).slice(0, 2000),
  }));
}

/**
 * Call Claude to summarize the thread and return a concise string.
 */
async function summarizeThread(messages, leadName) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const threadText = messages
    .map(m => `[${m.date}]\nFrom: ${m.from}\n\n${m.body || '(empty)'}`)
    .join('\n\n────────────────\n\n');

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 250,
    messages: [{
      role: 'user',
      content: `You are analyzing an email thread between a business and a lead named "${leadName}".

EMAIL THREAD:
${threadText}

Summarize this thread in 2-3 sentences covering:
1. What the lead said or asked
2. Their apparent sentiment and interest level
3. Any objections, concerns, or specific requests

Be specific and actionable. No filler phrases. Output only the summary.`,
    }],
  });

  return response.content[0]?.text?.trim() || '';
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * syncLeadGmail(lead)
 * Runs two parallel Gmail searches:
 *   1. Most recent message FROM lead (inbound reply)
 *   2. Most recent message TO lead (outbound sent)
 * Summarizes the reply thread with Claude if a reply exists.
 *
 * Returns:
 *   {
 *     hasReply: bool,
 *     last_reply_at?, last_reply_subject?, last_reply_summary?, thread_message_count?,
 *     last_reply_thread_id?, last_reply_message_id?, last_reply_rfc_message_id?,
 *     hasSent: bool,
 *     last_sent_at?, last_sent_subject?, last_sent_preview?,
 *     last_sent_thread_id?, last_sent_message_id?, last_sent_rfc_message_id?,
 *   }
 */
async function syncLeadGmail(lead) {
  if (!lead.email) throw new Error('Lead has no email address');

  const accessToken = getSetting('gmail_access_token');
  if (!accessToken) throw new Error('Gmail not connected. Connect Gmail in Settings first.');

  // Run both searches in parallel
  const [replyInfo, sentInfo] = await Promise.all([
    findLatestReplyInfo(lead.email).catch(() => null),
    findLastSentToLead(lead.email).catch(() => null),
  ]);

  const result = {
    hasReply: false,
    hasSent:  false,
  };

  // ── Outbound (last sent TO the lead) ──────────────────────────────────────
  if (sentInfo) {
    result.hasSent                  = true;
    result.last_sent_at             = sentInfo.sent_at;
    result.last_sent_subject        = sentInfo.subject;
    result.last_sent_preview        = sentInfo.preview;
    result.last_sent_thread_id      = sentInfo.threadId     || null;
    result.last_sent_message_id     = sentInfo.messageId    || null;
    result.last_sent_rfc_message_id = sentInfo.rfcMessageId || null;
  }

  // ── Inbound (last reply FROM the lead) ────────────────────────────────────
  if (replyInfo) {
    const messages = await getThreadMessages(replyInfo.threadId);
    const summary  = await summarizeThread(messages, lead.name || lead.full_name || 'the lead');

    let last_reply_at;
    try {
      last_reply_at = new Date(replyInfo.date).toISOString();
    } catch {
      last_reply_at = new Date().toISOString();
    }

    result.hasReply                  = true;
    result.last_reply_at             = last_reply_at;
    result.last_reply_subject        = replyInfo.subject;
    result.last_reply_summary        = summary;
    result.thread_message_count      = messages.length;
    result.last_reply_thread_id      = replyInfo.threadId     || null;
    result.last_reply_message_id     = replyInfo.messageId    || null;
    result.last_reply_rfc_message_id = replyInfo.rfcMessageId || null;
  }

  return result;
}

module.exports = { syncLeadGmail };
