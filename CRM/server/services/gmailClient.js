/**
 * gmailClient.js
 * Wraps googleapis OAuth2 for Gmail send + draft operations.
 * Reads/writes tokens from app_settings in lowdb.
 */

const { google } = require('googleapis');
const { db, now } = require('../db');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

function getSetting(key) {
  return db.get('app_settings').find({ key }).value()?.value || '';
}

function setSetting(key, value) {
  const existing = db.get('app_settings').find({ key }).value();
  if (!existing) {
    db.get('app_settings').push({ key, value }).write();
  } else {
    db.get('app_settings').find({ key }).assign({ value }).write();
  }
}

let _isRefreshing = false;

async function getAuthenticatedClient() {
  const accessToken  = getSetting('gmail_access_token');
  const refreshToken = getSetting('gmail_refresh_token');
  const expiry       = getSetting('gmail_token_expiry');

  if (!accessToken || !refreshToken) {
    throw new Error('Gmail not connected. Please connect Gmail in Settings.');
  }

  const client = getOAuth2Client();
  client.setCredentials({
    access_token:  accessToken,
    refresh_token: refreshToken,
    expiry_date:   expiry ? parseInt(expiry) : undefined,
  });

  // Auto-refresh if expiring within 5 minutes
  const expiryNum = expiry ? parseInt(expiry) : 0;
  if (expiryNum && Date.now() > expiryNum - 300000 && !_isRefreshing) {
    _isRefreshing = true;
    try {
      const { credentials } = await client.refreshAccessToken();
      setSetting('gmail_access_token', credentials.access_token);
      if (credentials.expiry_date) {
        setSetting('gmail_token_expiry', String(credentials.expiry_date));
      }
      client.setCredentials(credentials);
      console.log('Gmail token refreshed');
    } catch (err) {
      console.error('Token refresh failed:', err.message);
    } finally {
      _isRefreshing = false;
    }
  }

  return client;
}

// ── Label helpers ─────────────────────────────────────────────────────────────

/** In-memory cache so we only look up label IDs once per server session. */
const _labelCache = {};

/**
 * Look up a Gmail label by name and return its ID.
 * If the label doesn't exist in the account, it's created automatically.
 * Results are cached in memory so subsequent calls cost zero API quota.
 */
async function getLabelId(labelName) {
  if (!labelName) return null;
  if (_labelCache[labelName]) return _labelCache[labelName];

  const auth  = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const res    = await gmail.users.labels.list({ userId: 'me' });
  const labels = res.data.labels || [];
  let   label  = labels.find(l => l.name === labelName);

  if (!label) {
    // Create the label if it doesn't exist yet
    const createRes = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name:                  labelName,
        messageListVisibility: 'show',
        labelListVisibility:   'labelShow',
      },
    });
    label = createRes.data;
    console.log(`📌 Created Gmail label: "${labelName}" (id: ${label.id})`);
  }

  _labelCache[labelName] = label.id;
  return label.id;
}

/**
 * Apply a Gmail label to a specific message ID.
 * Errors are logged but never thrown — label application is non-critical.
 */
async function applyLabelToMessage(messageId, labelName) {
  if (!messageId || !labelName) return;
  try {
    const auth    = await getAuthenticatedClient();
    const gmail   = google.gmail({ version: 'v1', auth });
    const labelId = await getLabelId(labelName);
    if (!labelId) return;
    await gmail.users.messages.modify({
      userId: 'me',
      id:     messageId,
      requestBody: { addLabelIds: [labelId] },
    });
  } catch (err) {
    console.error(`Failed to apply label "${labelName}" to ${messageId}:`, err.message);
  }
}

// ── RFC helpers ───────────────────────────────────────────────────────────────

/**
 * RFC 2047 encode a header value so non-ASCII chars (em dash, curly quotes, etc.)
 * are transmitted safely through email infrastructure.
 */
function rfc2047(str) {
  if (!/[^\x00-\x7F]/.test(str)) return str; // pure ASCII — no encoding needed
  return `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`;
}

/**
 * Encode a plain-text email to RFC 2822 base64url format required by Gmail API.
 * Body is base64-encoded (Content-Transfer-Encoding: base64) so non-ASCII
 * characters in the body are also handled correctly.
 *
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.from
 * @param {string} opts.subject
 * @param {string} opts.body
 * @param {string} [opts.inReplyTo]  - RFC 2822 Message-ID of the email being replied to
 * @param {string} [opts.references] - Space-separated Message-ID chain (for full thread awareness)
 */
function buildRawEmail({ to, from, subject, body, inReplyTo, references }) {
  const encodedBody = Buffer.from(body, 'utf-8').toString('base64');
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${rfc2047(subject)}`,
  ];
  // Threading headers — included only when replying in an existing thread
  if (inReplyTo)  lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  lines.push(
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodedBody,
  );
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

/**
 * Build a multipart/mixed RFC 2822 email with optional file attachments.
 * Each attachment: { filename, content (base64 string), mimeType }
 */
function buildRawEmailWithAttachment({ to, from, subject, body, attachments = [] }) {
  const boundary = `crm_boundary_${Date.now()}`;
  const parts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${rfc2047(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    Buffer.from(body, 'utf-8').toString('base64'),
  ];
  for (const att of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      att.content,
    );
  }
  parts.push(`--${boundary}--`);
  return Buffer.from(parts.join('\r\n')).toString('base64url');
}

// ── Send + Draft ──────────────────────────────────────────────────────────────

/**
 * Send an email via Gmail API.
 * Automatically applies the configured gmail_label_name after sending.
 *
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.subject
 * @param {string}  opts.body
 * @param {string}  [opts.threadId]    - Gmail thread ID to reply into
 * @param {string}  [opts.inReplyTo]   - RFC 2822 Message-ID for In-Reply-To header
 * @param {string}  [opts.references]  - RFC 2822 Message-ID chain for References header
 */
async function sendEmail({ to, subject, body, threadId, inReplyTo, references }) {
  const auth  = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const from  = getSetting('gmail_connected_email');

  const raw         = buildRawEmail({ to, from, subject, body, inReplyTo, references });
  const requestBody = { raw };
  if (threadId) requestBody.threadId = threadId;

  const result = await gmail.users.messages.send({ userId: 'me', requestBody });

  // Apply label non-blocking — don't let a label failure break the send
  const labelName = getSetting('gmail_label_name');
  if (labelName && result.data.id) {
    applyLabelToMessage(result.data.id, labelName).catch(() => {});
  }

  return result.data; // { id, threadId, labelIds }
}

/**
 * Create a Gmail draft.
 * Automatically applies the configured gmail_label_name to the draft message.
 *
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.subject
 * @param {string}  opts.body
 * @param {string}  [opts.threadId]    - Gmail thread ID to attach the draft to
 * @param {string}  [opts.inReplyTo]   - RFC 2822 Message-ID for In-Reply-To header
 * @param {string}  [opts.references]  - RFC 2822 Message-ID chain for References header
 */
async function createDraft({ to, subject, body, threadId, inReplyTo, references }) {
  const auth  = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const from  = getSetting('gmail_connected_email');

  const raw     = buildRawEmail({ to, from, subject, body, inReplyTo, references });
  const message = { raw };
  if (threadId) message.threadId = threadId;

  const result = await gmail.users.drafts.create({ userId: 'me', requestBody: { message } });

  // Apply label to the draft's underlying message — non-blocking
  const labelName  = getSetting('gmail_label_name');
  const msgId      = result.data.message?.id;
  if (labelName && msgId) {
    applyLabelToMessage(msgId, labelName).catch(() => {});
  }

  return result.data; // { id, message: { id, threadId } }
}

/**
 * Create a Gmail draft with optional file attachments.
 * attachments: [{ filename, content (base64), mimeType }]
 */
async function createDraftWithAttachment({ to, subject, body, attachments = [] }) {
  const auth  = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  const from  = getSetting('gmail_connected_email');

  const raw     = buildRawEmailWithAttachment({ to, from, subject, body, attachments });
  const message = { raw };

  const result = await gmail.users.drafts.create({ userId: 'me', requestBody: { message } });

  const labelName = getSetting('gmail_label_name');
  const msgId     = result.data.message?.id;
  if (labelName && msgId) applyLabelToMessage(msgId, labelName).catch(() => {});

  return result.data;
}

module.exports = {
  getOAuth2Client, getAuthenticatedClient,
  getSetting, setSetting,
  getLabelId, applyLabelToMessage,
  sendEmail, createDraft, createDraftWithAttachment,
};
