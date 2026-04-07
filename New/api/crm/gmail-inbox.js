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

  const { label = 'INBOX', sync } = req.query;
  const validLabels = ['INBOX', 'SENT', 'DRAFT'];
  const labelId = validLabels.includes(label.toUpperCase()) ? label.toUpperCase() : 'INBOX';

  try {
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
    const spamIds = new Set(crmLabels.filter(l => l.label === 'spam').map(l => l.gmail_message_id));

    // ── Return cached data if not syncing ─────────────────────────────────
    if (sync !== 'true') {
      let cached = [];
      try {
        cached = await supaFetch(
          `crm_gmail_cache?label=eq.${labelId}&order=date.desc.nullslast&limit=200`
        );
      } catch {}

      if (cached.length > 0) {
        const messages = cached
          .filter(c => labelId !== 'INBOX' || !spamIds.has(c.gmail_id))
          .map(c => ({
            id: c.gmail_id,
            threadId: c.thread_id,
            from: { name: c.from_name || '', email: c.from_email || '' },
            to: c.to_email || '',
            subject: c.subject || '(no subject)',
            snippet: c.snippet || '',
            date: c.raw_date || (c.date ? new Date(c.date).toISOString() : ''),
            labelIds: c.label_ids || [],
            isReply: c.is_reply || false,
            crmLabels: labelMap[c.gmail_id] || [],
            _cached: true,
          }));

        return res.json({
          messages,
          resultCount: messages.length,
          cached: true,
        });
      }
      // No cache yet — fall through to full sync
    }

    // ── Sync: fetch from Gmail ────────────────────────────────────────────
    const { accessToken } = await getGmailAuth();

    // Find most recent cached date to only fetch newer emails
    let newestCached = null;
    try {
      const [newest] = await supaFetch(
        `crm_gmail_cache?label=eq.${labelId}&order=date.desc.nullslast&limit=1`
      );
      if (newest?.date) newestCached = newest.date;
    } catch {}

    const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    let afterTs = thirtyDaysAgo;

    // If we have cache, only fetch emails newer than the most recent cached one
    // Subtract 1 hour buffer to catch any overlap
    if (newestCached) {
      const cachedTs = Math.floor(new Date(newestCached).getTime() / 1000) - 3600;
      afterTs = Math.max(cachedTs, thirtyDaysAgo);
    }

    const maxTotal = newestCached ? 50 : 200; // Fewer if just catching up
    let fetchedMessages = [];
    let allMessageIds = [];
    let nextPage = null;

    while (fetchedMessages.length < maxTotal) {
      const perPage = Math.min(50, maxTotal - fetchedMessages.length);
      let query = `/messages?labelIds=${labelId}&maxResults=${perPage}&q=after:${afterTs}`;
      if (nextPage) query += `&pageToken=${nextPage}`;

      const listRes = await gmailFetch(query, accessToken);
      const messages = listRes.messages || [];
      if (messages.length === 0) break;

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

    // Parse fetched messages
    const parsed = fetchedMessages.filter(Boolean).map(d => {
      const from = parseFrom(getHeader(d, 'From'));
      const rawDate = getHeader(d, 'Date');
      let parsedDate = null;
      try { parsedDate = new Date(rawDate).toISOString(); } catch {}
      return {
        id: d.id,
        threadId: d.threadId,
        from,
        to: getHeader(d, 'To'),
        subject: getHeader(d, 'Subject') || '(no subject)',
        snippet: d.snippet || '',
        date: rawDate,
        parsedDate,
        labelIds: d.labelIds || [],
        isReply: !!getHeader(d, 'In-Reply-To'),
        crmLabels: labelMap[d.id] || [],
      };
    });

    // ── Upsert into cache ─────────────────────────────────────────────────
    if (parsed.length > 0) {
      // Batch upsert in chunks of 50
      for (let i = 0; i < parsed.length; i += 50) {
        const chunk = parsed.slice(i, i + 50).map(m => ({
          gmail_id: m.id,
          thread_id: m.threadId,
          label: labelId,
          from_name: m.from.name || '',
          from_email: m.from.email || '',
          to_email: m.to || '',
          subject: m.subject,
          snippet: m.snippet,
          date: m.parsedDate,
          label_ids: JSON.stringify(m.labelIds),
          is_reply: m.isReply,
          raw_date: m.date,
          cached_at: new Date().toISOString(),
        }));
        try {
          await supaFetch('crm_gmail_cache?on_conflict=gmail_id', {
            method: 'POST',
            body: JSON.stringify(chunk),
            headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
          });
        } catch (e) {
          console.error('Cache upsert error:', e.message);
        }
      }
    }

    // ── Clean up old cache (older than 30 days) ───────────────────────────
    const thirtyDaysAgoISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      await supaFetch(
        `crm_gmail_cache?label=eq.${labelId}&date=lt.${thirtyDaysAgoISO}`,
        { method: 'DELETE' }
      );
    } catch {}

    // ── Return full cached data after sync (fallback to parsed if cache empty) ─
    let allCached = [];
    try {
      allCached = await supaFetch(
        `crm_gmail_cache?label=eq.${labelId}&order=date.desc.nullslast&limit=200`
      );
    } catch {}

    let messages;
    if (allCached && allCached.length > 0) {
      messages = allCached
        .filter(c => labelId !== 'INBOX' || !spamIds.has(c.gmail_id))
        .map(c => ({
          id: c.gmail_id,
          threadId: c.thread_id,
          from: { name: c.from_name || '', email: c.from_email || '' },
          to: c.to_email || '',
          subject: c.subject || '(no subject)',
          snippet: c.snippet || '',
          date: c.raw_date || (c.date ? new Date(c.date).toISOString() : ''),
          labelIds: c.label_ids || [],
          isReply: c.is_reply || false,
          crmLabels: labelMap[c.gmail_id] || [],
        }));
    } else {
      // Cache upsert may have failed — return parsed Gmail results directly
      messages = parsed
        .filter(m => labelId !== 'INBOX' || !spamIds.has(m.id))
        .map(m => ({
          id: m.id,
          threadId: m.threadId,
          from: m.from,
          to: m.to,
          subject: m.subject,
          snippet: m.snippet,
          date: m.date,
          labelIds: m.labelIds,
          isReply: m.isReply,
          crmLabels: m.crmLabels,
        }));
    }

    return res.json({
      messages,
      resultCount: messages.length,
      newMessages: parsed.length,
      cached: false,
    });
  } catch (err) {
    console.error('Gmail inbox error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
