import { setCors, requireAuth } from '../_lib/supabase.js';
import { sendEmail, createDraft } from '../_lib/gmail.js';

// Send (or save as a Gmail draft) the cover email that goes to a client after
// their agreement is sent — driven from the lead pipeline's Send step.
//   POST /api/crm/client-email  { to, subject, body, mode: 'send' | 'draft' }
export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { to, subject, body, mode } = req.body || {};
    if (!to || !to.trim()) return res.status(400).json({ error: 'Recipient email required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'Email body is empty' });
    const subj = (subject || '').trim() || 'A note from Vernon Tech & Media';

    if (mode === 'draft') {
      const d = await createDraft({ to: to.trim(), subject: subj, body });
      return res.json({ ok: true, mode: 'draft', id: d?.id || null });
    }
    await sendEmail({ to: to.trim(), subject: subj, body });
    return res.json({ ok: true, mode: 'send' });
  } catch (err) {
    console.error('client-email error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send' });
  }
}
