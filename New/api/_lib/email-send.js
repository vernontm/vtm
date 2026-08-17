// Shared helpers for sending a crm_email_queue item through Gmail. Used by both
// the manual send path (email-queue.js) and the scheduled-send cron
// (email-queue-cron.js) so rendering is identical no matter who triggers it.
const { sendEmail } = require('./gmail.js');

/** Strip em dashes (—) and en dashes (–), replace with hyphens. */
function stripDashes(text) {
  if (!text) return text;
  return text.replace(/—/g, '-').replace(/–/g, '-');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Turn a plain-text body into an HTML email: markdown links [text](url) and
 *  bare URLs become anchors, line breaks are preserved. Returns null when there's
 *  nothing worth upgrading (no links), so we keep sending plain text as before. */
function bodyToHtml(text) {
  if (!text) return null;
  const hasLink = /\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/\S+/.test(text);
  if (!hasLink) return null;
  const tokenRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
  let html = '', last = 0, m;
  while ((m = tokenRegex.exec(text)) !== null) {
    if (m.index > last) html += escapeHtml(text.slice(last, m.index));
    const label = m[1] && m[2] ? m[1] : m[3];
    const url = m[1] && m[2] ? m[2] : m[3];
    html += `<a href="${escapeHtml(url)}" style="color:#2563eb">${escapeHtml(label)}</a>`;
    last = tokenRegex.lastIndex;
  }
  if (last < text.length) html += escapeHtml(text.slice(last));
  html = html.replace(/\r?\n/g, '<br>');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#222">${html}</div>`;
}

/** Plain-text fallback: strip markdown link syntax to "text (url)". */
function stripMarkdownLinks(text) {
  if (!text) return text;
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => (t === u ? u : `${t} (${u})`));
}

/** Fetch a queue item's attachments (public Supabase Storage URLs) as base64. */
async function fetchQueueAttachments(item) {
  if (!Array.isArray(item.attachments) || !item.attachments.length) return [];
  const out = await Promise.all(item.attachments.map(async a => {
    try {
      const r = await fetch(a.url);
      if (!r.ok) throw new Error(`fetch ${a.url} → ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      return { filename: a.name || 'attachment', mimeType: a.mime || 'application/octet-stream', data_base64: buf.toString('base64') };
    } catch (e) {
      console.error('attachment fetch failed:', e.message);
      return null;
    }
  }));
  return out.filter(Boolean);
}

/** Send one queue item through Gmail. Returns the Gmail send result ({ id, threadId }). */
async function sendQueueItem(item) {
  const toEmail = item.to_email || item.lead_email;
  if (!toEmail) throw new Error('No email address');

  const subject = stripDashes(item.subject || '(no subject)');
  const rawBody = stripDashes(item.body || item.generated_body || '');
  const html = bodyToHtml(rawBody);          // clickable links + preserved breaks (null if no links)
  const body = stripMarkdownLinks(rawBody);  // plain-text fallback
  const attachments = await fetchQueueAttachments(item);

  return sendEmail({
    to: toEmail,
    subject,
    body,
    html: html || undefined,
    threadId: item.reply_thread_id || undefined,
    inReplyTo: item.reply_rfc_message_id || undefined,
    references: item.reply_rfc_message_id || undefined,
    attachments: attachments.length ? attachments : undefined,
  });
}

module.exports = { stripDashes, escapeHtml, bodyToHtml, stripMarkdownLinks, fetchQueueAttachments, sendQueueItem };
