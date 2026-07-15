import { setCors, requireAuth } from '../_lib/supabase.js';
import { sendEmail, createDraft } from '../_lib/gmail.js';
import { stripDashes } from '../_lib/text.js';

// Turn a plain-text email body into tidy HTML: escape, hyperlink bare URLs,
// and preserve line breaks. Keeps the wording; just makes links clickable.
function bodyToHtml(text) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb;font-weight:600">$1</a>')
    .replace(/\n/g, '<br>');
  return `<div style="max-width:560px;margin:0 auto;padding:10px 4px;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d21">${html}</div>`;
}

// Send (or save as a Gmail draft) the cover email that goes to a client after
// their agreement is sent — driven from the lead pipeline's Send step.
//   POST /api/crm/client-email  { to, subject, body, mode: 'send' | 'draft' }
export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { to, subject, body: rawBody, mode } = req.body || {};
    if (!to || !to.trim()) return res.status(400).json({ error: 'Recipient email required' });
    if (!rawBody || !rawBody.trim()) return res.status(400).json({ error: 'Email body is empty' });
    const body = stripDashes(rawBody);
    const subj = stripDashes((subject || '').trim()) || 'A note from Vernon Tech & Media';
    const html = bodyToHtml(body);

    if (mode === 'draft') {
      const d = await createDraft({ to: to.trim(), subject: subj, body, html });
      return res.json({ ok: true, mode: 'draft', id: d?.id || null });
    }
    await sendEmail({ to: to.trim(), subject: subj, body, html });
    return res.json({ ok: true, mode: 'send' });
  } catch (err) {
    console.error('client-email error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send' });
  }
}
