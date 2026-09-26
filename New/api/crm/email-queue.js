import { setCors, requireStaff, supaFetch } from '../_lib/supabase.js';
import { sendEmail, createDraft } from '../_lib/gmail.js';
import emailSend from '../_lib/email-send.js';

// Shared email rendering (dash-strip, markdown-link → HTML, plain-text fallback).
const { stripDashes, bodyToHtml, stripMarkdownLinks } = emailSend;

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireStaff(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action, status, lead_id } = req.query;

  try {
    // ── GET: list email queue ────────────────────────────────────────────
    if (req.method === 'GET') {
      let query = 'crm_email_queue?order=created_at.desc';
      if (status) query += `&status=eq.${status}`;
      if (lead_id) query += `&lead_id=eq.${lead_id}`;
      return res.json(await supaFetch(query));
    }

    // ── POST: create new queue item ──────────────────────────────────────
    if (req.method === 'POST' && !action) {
      const data = { ...req.body };
      if (data.subject) data.subject = stripDashes(data.subject);
      if (data.body) data.body = stripDashes(data.body);
      const result = await supaFetch('crm_email_queue', { method: 'POST', body: JSON.stringify(data) });
      return res.status(201).json(result[0] || result);
    }

    // ── POST action=send: send via Gmail API ─────────────────────────────
    if (req.method === 'POST' && action === 'send' && id) {
      // Fetch the queue item
      const items = await supaFetch(`crm_email_queue?id=eq.${id}`);
      const item = items[0];
      if (!item) return res.status(404).json({ error: 'Not found' });

      const toEmail = item.to_email || item.lead_email;
      if (!toEmail) return res.status(400).json({ error: 'No email address' });

      const subject = stripDashes(item.subject || '(no subject)');
      const rawBody = stripDashes(item.body || item.generated_body || '');
      const html = bodyToHtml(rawBody);          // clickable links + preserved breaks (null if no links)
      const body = stripMarkdownLinks(rawBody);  // plain-text fallback

      // Fetch attachments (public Supabase Storage URLs) and inline as base64.
      let attachments = [];
      if (Array.isArray(item.attachments) && item.attachments.length) {
        attachments = await Promise.all(item.attachments.map(async a => {
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
        attachments = attachments.filter(Boolean);
      }

      try {
        const result = await sendEmail({
          to: toEmail,
          subject,
          body,
          html: html || undefined,
          threadId: item.reply_thread_id || undefined,
          inReplyTo: item.reply_rfc_message_id || undefined,
          references: item.reply_rfc_message_id || undefined,
          attachments: attachments.length ? attachments : undefined,
        });

        // Update queue item as sent
        await supaFetch(`crm_email_queue?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'sent',
            sent_at: new Date().toISOString(),
            gmail_message_id: result.id,
            updated_at: new Date().toISOString(),
          }),
        });

        return res.json({ success: true, message_id: result.id });
      } catch (err) {
        console.error('Gmail send error:', err.message);
        // If Gmail fails (not connected), fall back to just marking as sent
        if (err.message.includes('not connected')) {
          await supaFetch(`crm_email_queue?id=eq.${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          });
          return res.json({ success: true, note: 'Marked as sent (Gmail not connected)' });
        }
        throw err;
      }
    }

    // ── POST action=draft: save to Gmail Drafts ──────────────────────────
    if (req.method === 'POST' && action === 'draft' && id) {
      const items = await supaFetch(`crm_email_queue?id=eq.${id}`);
      const item = items[0];
      if (!item) return res.status(404).json({ error: 'Not found' });

      const toEmail = item.to_email || item.lead_email;
      if (!toEmail) return res.status(400).json({ error: 'No email address' });

      try {
        const draftRaw = stripDashes(item.body || item.generated_body || '');
        const draft = await createDraft({
          to: toEmail,
          subject: stripDashes(item.subject || '(no subject)'),
          body: stripMarkdownLinks(draftRaw),
          html: bodyToHtml(draftRaw) || undefined,
          threadId: item.reply_thread_id || undefined,
          inReplyTo: item.reply_rfc_message_id || undefined,
          references: item.reply_rfc_message_id || undefined,
        });

        await supaFetch(`crm_email_queue?id=eq.${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            gmail_draft_id: draft.id,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });

        return res.json({ success: true, draft_id: draft.id });
      } catch (err) {
        console.error('Gmail draft error:', err.message);
        if (err.message.includes('not connected')) {
          await supaFetch(`crm_email_queue?id=eq.${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              approved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          });
          return res.json({ success: true, note: 'Approved (Gmail not connected for draft sync)' });
        }
        throw err;
      }
    }

    // ── PUT: update queue item ───────────────────────────────────────────
    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_email_queue?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    // ── DELETE: remove queue item ────────────────────────────────────────
    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_email_queue?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM email-queue error:', err);
    return res.status(500).json({ error: err.message });
  }
}
