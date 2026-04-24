import { setCors, requireAuth } from '../_lib/supabase.js';
import { getGmailAuth } from '../_lib/gmail.js';
import Anthropic from '@anthropic-ai/sdk';

/** Strip em dashes (—), en dashes (–), and replace with hyphens */
function stripDashes(text) {
  if (!text) return text;
  return text.replace(/\u2014/g, '-').replace(/\u2013/g, '-');
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch(path, accessToken) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API ${res.status}: ${err}`);
  }
  return res.json();
}

function getHeader(msg, name) {
  return (msg.payload?.headers || []).find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )?.value || '';
}

function daysSince(dateStr) {
  const sent = new Date(dateStr);
  if (isNaN(sent.getTime())) return 0;
  return Math.floor((Date.now() - sent.getTime()) / (1000 * 60 * 60 * 24));
}

function extractEmail(str) {
  const match = str.match(/<(.+?)>/);
  return match ? match[1].toLowerCase() : str.toLowerCase().trim();
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { accessToken } = await getGmailAuth();

    // Fetch last 30 days of sent emails (limit to 20 for speed)
    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const sentList = await gmailFetch(
      `/messages?labelIds=SENT&maxResults=20&q=after:${thirtyDaysAgo}`,
      accessToken
    );
    const sentMessageIds = sentList.messages || [];

    if (sentMessageIds.length === 0) {
      return res.json({ suggestions: [] });
    }

    // Fetch metadata for each sent message
    const sentDetailed = await Promise.all(
      sentMessageIds.map(m =>
        gmailFetch(
          `/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=Message-ID`,
          accessToken
        ).catch(() => null)
      )
    );

    const sentEmails = sentDetailed.filter(Boolean).map(d => ({
      id: d.id,
      threadId: d.threadId,
      to: getHeader(d, 'To'),
      subject: getHeader(d, 'Subject'),
      date: getHeader(d, 'Date'),
      messageId: getHeader(d, 'Message-ID'),
      daysSinceSent: daysSince(getHeader(d, 'Date')),
    }));

    // Only consider emails sent 3+ days ago (no reply expected yet for recent ones)
    const candidates = sentEmails.filter(e => e.daysSinceSent >= 3);

    if (candidates.length === 0) {
      return res.json({ suggestions: [] });
    }

    // Check each candidate's thread for replies in the last 7 days
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    const followUpCandidates = [];

    // Check threads in parallel
    const threadChecks = await Promise.all(
      candidates.map(async (sent) => {
        try {
          const thread = await gmailFetch(
            `/threads/${sent.threadId}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
            accessToken
          );

          const threadMessages = thread.messages || [];
          const recipientEmail = extractEmail(sent.to);

          // Look for a reply from the recipient after our sent email
          const hasReply = threadMessages.some(msg => {
            const from = extractEmail(getHeader(msg, 'From'));
            const msgDate = new Date(getHeader(msg, 'Date'));
            const sentDate = new Date(sent.date);
            return from === recipientEmail && msgDate > sentDate;
          });

          return hasReply ? null : sent;
        } catch {
          return null;
        }
      })
    );

    threadChecks.forEach(c => {
      if (c) followUpCandidates.push(c);
    });

    if (followUpCandidates.length === 0) {
      return res.json({ suggestions: [] });
    }

    // If no Anthropic API key, return candidates without AI suggestions
    if (!process.env.ANTHROPIC_API_KEY) {
      const basicSuggestions = followUpCandidates.map(c => ({
        id: `suggestion-${c.id}`,
        original_subject: c.subject,
        original_to: c.to,
        original_date: c.date,
        days_since_sent: c.daysSinceSent,
        suggested_subject: `Re: ${c.subject.replace(/^Re:\s*/i, '')}`,
        suggested_body: '',
        threadId: c.threadId,
        priority: c.daysSinceSent >= 7 ? 'high' : c.daysSinceSent >= 5 ? 'medium' : 'low',
      }));
      return res.json({ suggestions: basicSuggestions });
    }

    // Use Claude to generate smart follow-up suggestions
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const candidateSummary = followUpCandidates.map(c =>
      `- To: ${c.to} | Subject: "${c.subject}" | Sent: ${c.date} (${c.daysSinceSent} days ago)`
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: `You are a professional business follow-up email assistant for Vernon Tech & Media.
Generate concise, friendly follow-up emails that are not pushy. Keep them short (2-4 sentences).
IMPORTANT: Never use em dashes (—) or en dashes (–). Use hyphens (-) or commas instead.
Return valid JSON only, no markdown.`,
      messages: [{
        role: 'user',
        content: `These sent emails have received no reply. Generate a follow-up for each.

${candidateSummary}

Return a JSON array where each element has:
{
  "original_subject": "the original subject",
  "priority": "high" (7+ days), "medium" (5-6 days), or "low" (3-4 days),
  "suggested_subject": "a follow-up subject line",
  "suggested_body": "the follow-up email body"
}

Return ONLY the JSON array, no other text.`,
      }],
    });

    const aiText = response.content[0].text;
    let aiSuggestions = [];
    try {
      const jsonMatch = aiText.match(/\[[\s\S]*\]/);
      aiSuggestions = JSON.parse(jsonMatch[0]);
    } catch {
      // If parsing fails, fall back to empty suggestions from AI
      aiSuggestions = [];
    }

    // Merge AI suggestions with candidate metadata
    const suggestions = followUpCandidates.map((c, i) => {
      const ai = aiSuggestions.find(
        a => a.original_subject === c.subject
      ) || aiSuggestions[i] || {};

      return {
        id: `suggestion-${c.id}`,
        original_subject: c.subject,
        original_to: c.to,
        original_date: c.date,
        days_since_sent: c.daysSinceSent,
        suggested_subject: stripDashes(ai.suggested_subject) || `Re: ${c.subject.replace(/^Re:\s*/i, '')}`,
        suggested_body: stripDashes(ai.suggested_body) || '',
        threadId: c.threadId,
        priority: ai.priority || (c.daysSinceSent >= 7 ? 'high' : c.daysSinceSent >= 5 ? 'medium' : 'low'),
      };
    });

    return res.json({ suggestions });
  } catch (err) {
    console.error('AI follow-ups error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
