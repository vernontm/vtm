import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
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

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { maxResults = '200', label = 'INBOX' } = req.query;

  try {
    const { accessToken } = await getGmailAuth();

    // Determine label filter
    const validLabels = ['INBOX', 'SENT', 'DRAFT'];
    const labelId = validLabels.includes(label.toUpperCase()) ? label.toUpperCase() : 'INBOX';

    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const maxTotal = Math.min(parseInt(maxResults), 200);
    let fetchedMessages = [];
    let allMessageIds = [];
    let nextPage = null;

    // Paginate through Gmail API (up to 200 messages, 50 per page)
    while (fetchedMessages.length < maxTotal) {
      const perPage = Math.min(50, maxTotal - fetchedMessages.length);
      let query = `/messages?labelIds=${labelId}&maxResults=${perPage}&q=after:${thirtyDaysAgo}`;
      if (nextPage) query += `&pageToken=${nextPage}`;

      const listRes = await gmailFetch(query, accessToken);
      const messages = listRes.messages || [];
      if (messages.length === 0) break;

      // Fetch metadata for each message in parallel
      const pageMeta = await Promise.all(
        messages.map(m =>
          gmailFetch(`/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=In-Reply-To`, accessToken)
            .catch(() => null)
        )
      );
      allMessageIds = allMessageIds.concat(messages);
      fetchedMessages = fetchedMessages.concat(pageMeta);

      nextPage = listRes.nextPageToken;
      if (!nextPage) break;
    }

    const detailed = fetchedMessages;

    // Load CRM labels (spam, favorite, follow-up, etc.)
    let crmLabels = [];
    try {
      crmLabels = await supaFetch('crm_email_labels?select=gmail_message_id,label');
    } catch {}
    const labelMap = {};
    crmLabels.forEach(l => {
      if (!labelMap[l.gmail_message_id]) labelMap[l.gmail_message_id] = [];
      labelMap[l.gmail_message_id].push(l.label);
    });

    // For INBOX: load persisted labeled messages older than 30 days
    let persistedMessages = [];
    if (labelId === 'INBOX') {
      try {
        const labeled = await supaFetch('crm_email_labels?label=neq.spam&select=gmail_message_id,gmail_thread_id,label,from_email,to_email,subject,snippet,date&order=date.desc');
        const inboxIds = new Set(allMessageIds.map(m => m.id));
        const unseenLabeled = labeled.filter(l => !inboxIds.has(l.gmail_message_id));
        const seen = new Set();
        unseenLabeled.forEach(l => {
          if (!seen.has(l.gmail_message_id)) {
            seen.add(l.gmail_message_id);
            persistedMessages.push({
              id: l.gmail_message_id,
              threadId: l.gmail_thread_id || '',
              from: { name: l.from_email || '', email: l.from_email || '' },
              to: l.to_email || '',
              subject: l.subject || '(no subject)',
              snippet: l.snippet || '',
              date: l.date || '',
              labelIds: [],
              isReply: false,
              crmLabels: labelMap[l.gmail_message_id] || [],
              _persisted: true,
            });
          }
        });
      } catch {}
    }

    // Filter out spam-labeled messages (inbox only)
    const spamIds = new Set(
      crmLabels.filter(l => l.label === 'spam').map(l => l.gmail_message_id)
    );

    const result = detailed
      .filter(Boolean)
      .filter(d => labelId !== 'INBOX' || !spamIds.has(d.id))
      .map(d => {
        const from = parseFrom(getHeader(d, 'From'));
        return {
          id: d.id,
          threadId: d.threadId,
          from,
          to: getHeader(d, 'To'),
          subject: getHeader(d, 'Subject') || '(no subject)',
          snippet: d.snippet || '',
          date: getHeader(d, 'Date'),
          labelIds: d.labelIds || [],
          isReply: !!getHeader(d, 'In-Reply-To'),
          crmLabels: labelMap[d.id] || [],
        };
      });

    // Append persisted labeled messages (inbox only, also filter spam)
    const combinedMessages = labelId === 'INBOX'
      ? [...result, ...persistedMessages.filter(m => !spamIds.has(m.id))]
      : result;

    return res.json({
      messages: combinedMessages,
      nextPageToken: null,
      resultCount: combinedMessages.length,
    });
  } catch (err) {
    console.error('Gmail inbox error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
