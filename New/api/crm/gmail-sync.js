import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
import { getGmailAuth } from '../_lib/gmail.js';

// GET /api/crm/gmail-sync?startHistoryId=<n>
//
// Near-real-time label sync. The client hits this endpoint on a short interval
// with the last historyId it knows about. We ask Gmail for every history entry
// since then (label add/remove + delete), collect the affected message IDs,
// fetch their current labelIds in one round trip each, mirror the change into
// crm_gmail_cache, and hand the client { historyId, changes } to reconcile
// against its in-memory state.
//
// Without a startHistoryId we just return the current historyId so the client
// has a starting anchor. That call is nearly free.

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch(path, accessToken) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`Gmail API ${res.status}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  try {
    const { accessToken } = await getGmailAuth();
    const startHistoryId = req.query?.startHistoryId ? String(req.query.startHistoryId) : null;
    const refreshIds = req.query?.ids ? String(req.query.ids).split(',').filter(Boolean).slice(0, 200) : null;

    // Batch label refresh: caller supplies a list of message IDs, we return each
    // one's current labelIds and mirror them into the cache. Used by the manual
    // Refresh button so any labels that were applied before real-time sync was
    // running (or applied outside our history window) get pulled back in.
    if (refreshIds && refreshIds.length) {
      const CONCURRENCY = 10;
      const changes = [];
      const deleted = [];
      for (let i = 0; i < refreshIds.length; i += CONCURRENCY) {
        const batch = refreshIds.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(async id => {
          try {
            const m = await gmailFetch(`/messages/${id}?format=minimal`, accessToken);
            return { id, labelIds: m.labelIds || [] };
          } catch (e) {
            if (e.status === 404) { deleted.push(id); return null; }
            return null;
          }
        }));
        results.forEach(r => r && changes.push(r));
      }
      if (changes.length) {
        await Promise.all(changes.map(c =>
          supaFetch(`crm_gmail_cache?gmail_id=eq.${encodeURIComponent(c.id)}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ label_ids: c.labelIds }),
          }).catch(() => null)
        ));
      }
      return res.json({ changes, deleted, refreshed: changes.length });
    }

    // Anchor call: just return the current historyId so the client has a
    // starting point. Cheap (one profile lookup).
    if (!startHistoryId) {
      const profile = await gmailFetch('/profile', accessToken);
      return res.json({ historyId: String(profile.historyId), changes: [], deleted: [] });
    }

    // Walk the history list, paging until we've seen everything.
    const affectedIds = new Set();
    const addedIds = new Set();
    const deletedIds = new Set();
    let nextPage = null;
    let newHistoryId = startHistoryId;

    do {
      const qs = new URLSearchParams({
        startHistoryId,
        historyTypes: 'labelAdded',
      });
      // Gmail wants historyTypes as REPEATED, not comma-joined. URLSearchParams
      // handles append() correctly.
      qs.append('historyTypes', 'labelRemoved');
      qs.append('historyTypes', 'messageDeleted');
      qs.append('historyTypes', 'messageAdded');
      if (nextPage) qs.set('pageToken', nextPage);

      let data;
      try {
        data = await gmailFetch(`/history?${qs.toString()}`, accessToken);
      } catch (e) {
        // Gmail returns 404 when startHistoryId is older than the 7-day window.
        // Signal "reset" so the client re-anchors instead of retrying forever.
        if (e.status === 404) {
          const profile = await gmailFetch('/profile', accessToken);
          return res.json({ historyId: String(profile.historyId), changes: [], deleted: [], reset: true });
        }
        throw e;
      }

      if (data.historyId) newHistoryId = String(data.historyId);

      for (const entry of (data.history || [])) {
        for (const add of (entry.labelsAdded || []))    { if (add.message?.id) affectedIds.add(add.message.id); }
        for (const rm  of (entry.labelsRemoved || []))  { if (rm.message?.id)  affectedIds.add(rm.message.id); }
        for (const del of (entry.messagesDeleted || [])){ if (del.message?.id) deletedIds.add(del.message.id); }
        for (const ad  of (entry.messagesAdded || []))  { if (ad.message?.id)  addedIds.add(ad.message.id); }
      }
      nextPage = data.nextPageToken || null;
    } while (nextPage);

    // Fetch fresh labelIds for every affected message. Cap concurrency at 10 to
    // keep Gmail happy but stay snappy on bigger batches.
    const idList = Array.from(affectedIds).filter(id => !deletedIds.has(id));
    const CONCURRENCY = 10;
    const changes = [];
    for (let i = 0; i < idList.length; i += CONCURRENCY) {
      const batch = idList.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async id => {
        try {
          const m = await gmailFetch(`/messages/${id}?format=minimal`, accessToken);
          return { id, labelIds: m.labelIds || [] };
        } catch (e) {
          // Message might have been deleted between the history entry and now.
          if (e.status === 404) { deletedIds.add(id); return null; }
          return null;
        }
      }));
      results.forEach(r => r && changes.push(r));
    }

    // Mirror the fresh labels into the cache (best-effort).
    if (changes.length) {
      await Promise.all(changes.map(c =>
        supaFetch(`crm_gmail_cache?gmail_id=eq.${encodeURIComponent(c.id)}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ label_ids: c.labelIds }),
        }).catch(() => null)
      ));
    }

    // Newly-arrived messages — fetch metadata so the client can prepend them
    // to the inbox list without a full refresh. Only include ones actually in
    // the inbox (skip drafts, spam, category-only messages, etc.).
    const newMessages = [];
    const newAdded = Array.from(addedIds).filter(id => !deletedIds.has(id));
    for (let i = 0; i < newAdded.length; i += CONCURRENCY) {
      const batch = newAdded.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async id => {
        try {
          const m = await gmailFetch(
            `/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date&metadataHeaders=In-Reply-To`,
            accessToken
          );
          const labelIds = m.labelIds || [];
          // Only pipe INBOX arrivals through — the client tracks Sent separately.
          if (!labelIds.includes('INBOX')) return null;
          const hdrs = (m.payload?.headers || []);
          const h = (name) => (hdrs.find(x => x.name.toLowerCase() === name.toLowerCase())?.value || '');
          const fromRaw = h('From');
          const match = fromRaw.match(/^(.+?)\s*<(.+)>$/);
          const from = match
            ? { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2] }
            : { name: fromRaw, email: fromRaw };
          const rawDate = h('Date');
          return {
            id: m.id,
            threadId: m.threadId,
            from,
            to: h('To'),
            subject: h('Subject') || '(no subject)',
            snippet: m.snippet || '',
            date: rawDate,
            labelIds,
            isReply: !!h('In-Reply-To'),
          };
        } catch { return null; }
      }));
      results.forEach(r => r && newMessages.push(r));
    }

    // Upsert new arrivals into the cache so subsequent loads see them too.
    if (newMessages.length) {
      const rows = newMessages.map(m => ({
        gmail_id: m.id,
        thread_id: m.threadId,
        label: 'INBOX',
        from_name: m.from.name || '',
        from_email: m.from.email || '',
        to_email: m.to || '',
        subject: m.subject,
        snippet: m.snippet,
        raw_date: m.date || null,
        date: m.date ? new Date(m.date).toISOString() : null,
        label_ids: m.labelIds,
        is_reply: !!m.isReply,
        cached_at: new Date().toISOString(),
      }));
      await supaFetch('crm_gmail_cache', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      }).catch(() => null);
    }

    return res.json({
      historyId: newHistoryId,
      changes,
      deleted: Array.from(deletedIds),
      newMessages,
    });
  } catch (err) {
    console.error('gmail-sync error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
