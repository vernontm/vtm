/**
 * gmailInbox.js
 * Serves threads from the configured Gmail label (default: VernonTM).
 * Uses threads.list so each conversation appears only once, just like the
 * Gmail label view. Fetches metadata for each thread in parallel.
 *
 * Rate budget per call (30 threads):
 *   threads.list  = ~5 units
 *   threads.get×30 = 30×5 = 150 units
 *   Total ≈ 155 / 250 per-sec limit → well within quota
 */

const express = require('express');
const router  = express.Router();
const { google } = require('googleapis');
const { getAuthenticatedClient, getSetting, getLabelId } = require('../services/gmailClient');

function getHeader(message, name) {
  return (message.payload?.headers || []).find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )?.value || '';
}

// ── GET /api/gmail/inbox ──────────────────────────────────────────────────────
// Query params:
//   maxResults   (default 30, max 50)
//   pageToken    (for pagination)
//   labelName    (override; defaults to gmail_label_name setting)
router.get('/inbox', async (req, res) => {
  const { pageToken, labelName: queryLabel } = req.query;
  const maxResults = Math.min(parseInt(req.query.maxResults || '30'), 50);

  const labelName = queryLabel || getSetting('gmail_label_name') || 'VernonTM';

  try {
    const auth  = await getAuthenticatedClient();
    const gmail = google.gmail({ version: 'v1', auth });

    // Resolve label name → ID (creates label if missing)
    const labelId = await getLabelId(labelName);
    if (!labelId) {
      return res.status(404).json({ error: `Label "${labelName}" not found` });
    }

    // List threads carrying this label
    const listRes = await gmail.users.threads.list({
      userId:     'me',
      labelIds:   [labelId],
      maxResults,
      ...(pageToken ? { pageToken } : {}),
    });

    const threads = listRes.data.threads || [];

    // Fetch thread metadata in parallel (each gives us subject / from / date / snippet)
    const detailed = await Promise.all(
      threads.map(t =>
        gmail.users.threads.get({
          userId:          'me',
          id:              t.id,
          format:          'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        }).catch(() => null)
      )
    );

    const result = detailed
      .filter(Boolean)
      .map(d => {
        const msgs    = d.data.messages || [];
        const last    = msgs[msgs.length - 1]; // most recent message in thread
        const first   = msgs[0];
        return {
          threadId:     d.data.id,
          messageCount: msgs.length,
          subject:      getHeader(first,  'Subject') || '(no subject)',
          from:         getHeader(last,   'From'),
          to:           getHeader(first,  'To'),
          date:         getHeader(last,   'Date'),
          snippet:      last?.snippet || '',
          labelIds:     last?.labelIds || [],
          hasReply:     msgs.length > 1, // thread has back-and-forth
          // Link to open directly in Gmail
          gmailUrl:     `https://mail.google.com/mail/u/0/#label/${encodeURIComponent(labelName)}/${d.data.id}`,
        };
      });

    res.json({
      threads:       result,
      labelName,
      nextPageToken: listRes.data.nextPageToken || null,
      resultCount:   result.length,
    });
  } catch (err) {
    console.error('Gmail inbox error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
