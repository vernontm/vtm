/**
 * Gmail utility for Vercel serverless functions.
 * Uses Gmail REST API directly (no googleapis dependency).
 * Stores/reads OAuth tokens from crm_app_settings in Supabase.
 */

const { SUPABASE_URL, SERVICE_KEY } = require('./supabase.js');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI || 'https://vernontm.com/api/crm/auth-gmail?callback=true';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ── Supabase settings helpers ────────────────────────────────────────────────

async function getSetting(key) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/crm_app_settings?key=eq.${encodeURIComponent(key)}&select=value`,
    {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    }
  );
  if (!res.ok) return '';
  const rows = await res.json();
  return rows[0]?.value || '';
}

async function setSetting(key, value) {
  // Upsert: try update first, then insert if no rows affected
  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/crm_app_settings?key=eq.${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ value }),
    }
  );
  const updated = await patchRes.json().catch(() => []);
  if (Array.isArray(updated) && updated.length === 0) {
    // Row doesn't exist — insert
    await fetch(`${SUPABASE_URL}/rest/v1/crm_app_settings`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ key, value }),
    });
  }
}

// ── OAuth helpers ────────────────────────────────────────────────────────────

function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/contacts.other.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ].join(' '),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return res.json();
}

/**
 * Get a valid access token, auto-refreshing if needed.
 * Returns { accessToken, email }
 */
async function getGmailAuth() {
  const accessToken  = await getSetting('gmail_access_token');
  const refreshToken = await getSetting('gmail_refresh_token');
  const expiry       = await getSetting('gmail_token_expiry');
  const email        = await getSetting('gmail_connected_email');

  if (!accessToken || !refreshToken) {
    throw new Error('Gmail not connected. Please connect Gmail in Settings.');
  }

  // Auto-refresh if expiring within 5 minutes
  const expiryNum = expiry ? parseInt(expiry) : 0;
  if (expiryNum && Date.now() > expiryNum - 300000) {
    const tokens = await refreshAccessToken(refreshToken);
    await setSetting('gmail_access_token', tokens.access_token);
    if (tokens.expires_in) {
      await setSetting('gmail_token_expiry', String(Date.now() + tokens.expires_in * 1000));
    }
    return { accessToken: tokens.access_token, email };
  }

  return { accessToken, email };
}

// ── Gmail API helpers ────────────────────────────────────────────────────────

async function gmailFetch(path, accessToken, options = {}) {
  const url = `${GMAIL_API}${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── RFC 2822 email building ──────────────────────────────────────────────────

function rfc2047(str) {
  if (!/[^\x00-\x7F]/.test(str)) return str;
  return `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
}

function buildRawEmail({ to, from, subject, body, inReplyTo, references }) {
  const encodedBody = Buffer.from(body, 'utf-8').toString('base64');
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${rfc2047(subject)}`,
  ];
  if (inReplyTo)  lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push(
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodedBody,
  );
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

// ── Labels ──────────────────────────────────────────────────────────────────

// Cache labels per request to avoid repeated API calls
let _labelCache = null;
let _labelCacheTime = 0;

async function getOrCreateLabel(accessToken, labelName) {
  // Refresh cache every 60s
  if (!_labelCache || Date.now() - _labelCacheTime > 60000) {
    const labelsRes = await gmailFetch('/labels', accessToken);
    _labelCache = labelsRes.labels || [];
    _labelCacheTime = Date.now();
  }

  // Check if label already exists
  const existing = _labelCache.find(l => l.name === labelName);
  if (existing) return existing.id;

  // If nested (e.g. "Clients/Acme"), ensure parent exists first
  const parts = labelName.split('/');
  if (parts.length > 1) {
    const parentName = parts[0];
    const parentExists = _labelCache.find(l => l.name === parentName);
    if (!parentExists) {
      const parentLabel = await gmailFetch('/labels', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          name: parentName,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        }),
      });
      _labelCache.push(parentLabel);
    }
  }

  // Create the label
  const newLabel = await gmailFetch('/labels', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
    }),
  });
  _labelCache.push(newLabel);
  return newLabel.id;
}

// List real Gmail labels. `type: 'user'` excludes system labels (INBOX,
// SENT, UNREAD, etc.) — those aren't user-manageable and clutter a picker.
async function listLabels() {
  const { accessToken } = await getGmailAuth();
  const res = await gmailFetch('/labels', accessToken);
  return (res.labels || []).filter(l => l.type === 'user');
}

async function deleteLabel(labelId) {
  const { accessToken } = await getGmailAuth();
  await gmailFetch(`/labels/${labelId}`, accessToken, { method: 'DELETE' });
  if (_labelCache) _labelCache = _labelCache.filter(l => l.id !== labelId);
}

async function modifyMessageLabels(messageId, { addLabelIds = [], removeLabelIds = [] } = {}) {
  const { accessToken } = await getGmailAuth();
  return gmailFetch(`/messages/${messageId}/modify`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}

// ── Send + Draft ─────────────────────────────────────────────────────────────

async function sendEmail({ to, from: fromOverride, subject, body, threadId, inReplyTo, references, labelName }) {
  const { accessToken, email: defaultFrom } = await getGmailAuth();
  const from = fromOverride || defaultFrom;
  const raw = buildRawEmail({ to, from, subject, body, inReplyTo, references });
  const requestBody = { raw };
  if (threadId) requestBody.threadId = threadId;

  const result = await gmailFetch('/messages/send', accessToken, {
    method: 'POST',
    body: JSON.stringify(requestBody),
  });

  // Apply label if specified
  if (labelName && result.id) {
    try {
      const labelId = await getOrCreateLabel(accessToken, labelName);
      await gmailFetch(`/messages/${result.id}/modify`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ addLabelIds: [labelId] }),
      });
    } catch (err) {
      console.error('Failed to apply label:', err.message);
      // Don't fail the send if labeling fails
    }
  }

  return result; // { id, threadId, labelIds }
}

async function createDraft({ to, subject, body, threadId, inReplyTo, references }) {
  const { accessToken, email: from } = await getGmailAuth();
  const raw = buildRawEmail({ to, from, subject, body, inReplyTo, references });
  const message = { raw };
  if (threadId) message.threadId = threadId;

  const result = await gmailFetch('/drafts', accessToken, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  return result; // { id, message: { id, threadId } }
}

// ── Inbox ────────────────────────────────────────────────────────────────────

function getHeader(message, name) {
  return (message.payload?.headers || []).find(
    h => h.name.toLowerCase() === name.toLowerCase()
  )?.value || '';
}

async function getInboxThreads({ maxResults = 30, pageToken, labelName } = {}) {
  const { accessToken } = await getGmailAuth();

  // Resolve label name to ID
  let labelIds;
  if (labelName) {
    const labelsRes = await gmailFetch('/labels', accessToken);
    const label = (labelsRes.labels || []).find(l => l.name === labelName);
    if (label) labelIds = [label.id];
  }

  // List threads
  const params = new URLSearchParams({ maxResults: String(Math.min(maxResults, 50)) });
  if (pageToken) params.set('pageToken', pageToken);
  if (labelIds) params.set('labelIds', labelIds.join(','));

  const listRes = await gmailFetch(`/threads?${params}`, accessToken);
  const threads = listRes.threads || [];

  // Fetch metadata for each thread
  const detailed = await Promise.all(
    threads.map(t =>
      gmailFetch(`/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, accessToken)
        .catch(() => null)
    )
  );

  return {
    threads: detailed.filter(Boolean).map(d => {
      const msgs = d.messages || [];
      const last = msgs[msgs.length - 1];
      const first = msgs[0];
      return {
        threadId: d.id,
        messageCount: msgs.length,
        subject: getHeader(first, 'Subject') || '(no subject)',
        from: getHeader(last, 'From'),
        to: getHeader(first, 'To'),
        date: getHeader(last, 'Date'),
        snippet: last?.snippet || '',
        hasReply: msgs.length > 1,
      };
    }),
    nextPageToken: listRes.nextPageToken || null,
  };
}

// ── Get Gmail Status ─────────────────────────────────────────────────────────

async function getGmailStatus() {
  const email  = await getSetting('gmail_connected_email');
  const expiry = await getSetting('gmail_token_expiry');
  const token  = await getSetting('gmail_access_token');
  return {
    connected: !!(email && token),
    email: email || null,
    tokenExpiry: expiry ? parseInt(expiry) : null,
  };
}

// ── Disconnect ───────────────────────────────────────────────────────────────

async function disconnectGmail() {
  await setSetting('gmail_access_token', '');
  await setSetting('gmail_refresh_token', '');
  await setSetting('gmail_token_expiry', '');
  await setSetting('gmail_connected_email', '');
}

module.exports = {
  getAuthUrl, exchangeCode, getGmailAuth, getSetting, setSetting,
  sendEmail, createDraft, getInboxThreads, getGmailStatus, disconnectGmail,
  getOrCreateLabel, listLabels, deleteLabel, modifyMessageLabels,
  GOOGLE_REDIRECT_URI,
};
