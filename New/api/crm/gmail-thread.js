import { setCors, requireAuth } from '../_lib/supabase.js';
import { getGmailAuth } from '../_lib/gmail.js';

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

function parseFrom(fromStr) {
  const match = fromStr.match(/^(.+?)\s*<(.+)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2] };
  return { name: fromStr, email: fromStr };
}

/**
 * Decode the email body from a Gmail message payload.
 * Returns { text, isHtml } — plain text preferred, HTML returned raw if no plain text.
 */
function decodeBody(payload) {
  if (!payload) return { text: '', html: '' };

  // Direct body data — check mime type
  if (payload.body?.data) {
    const raw = base64Decode(payload.body.data);
    const isHtml = (payload.mimeType || '').includes('html');
    return isHtml ? { text: '', html: raw } : { text: raw, html: '' };
  }

  // Multipart — extract both plain and html parts
  if (payload.parts) {
    const plainPart = findPart(payload.parts, 'text/plain');
    const htmlPart = findPart(payload.parts, 'text/html');
    const text = plainPart?.body?.data ? base64Decode(plainPart.body.data) : '';
    const html = htmlPart?.body?.data ? base64Decode(htmlPart.body.data) : '';
    if (text || html) return { text, html };

    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = decodeBody(part);
        if (nested.text || nested.html) return nested;
      }
    }
  }

  return { text: '', html: '' };
}

function findPart(parts, mimeType) {
  for (const p of parts) {
    if (p.mimeType === mimeType) return p;
    if (p.parts) {
      const found = findPart(p.parts, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function base64Decode(data) {
  // Gmail uses URL-safe base64
  const fixed = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(fixed, 'base64').toString('utf-8');
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { threadId } = req.query;
  if (!threadId) return res.status(400).json({ error: 'threadId required' });

  try {
    const { accessToken, email: userEmail } = await getGmailAuth();

    // Fetch full thread with full message bodies
    const thread = await gmailFetch(`/threads/${threadId}?format=full`, accessToken);
    const messages = (thread.messages || []).map(msg => {
      const from = parseFrom(getHeader(msg, 'From'));
      const { text, html } = decodeBody(msg.payload);

      return {
        id: msg.id,
        threadId: msg.threadId,
        from,
        to: getHeader(msg, 'To'),
        subject: getHeader(msg, 'Subject') || '(no subject)',
        date: getHeader(msg, 'Date'),
        snippet: msg.snippet || '',
        body: text,
        bodyHtml: html,
        labelIds: msg.labelIds || [],
        isFromMe: from.email.toLowerCase() === (userEmail || '').toLowerCase(),
      };
    });

    return res.json({ threadId, messages, messageCount: messages.length });
  } catch (err) {
    console.error('Gmail thread error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
