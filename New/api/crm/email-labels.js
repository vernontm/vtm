import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { gmail_message_id, label } = req.query;

  try {
    // GET: list labels (optionally filtered)
    if (req.method === 'GET') {
      let query = 'crm_email_labels?order=created_at.desc';
      if (label) query += `&label=eq.${label}`;
      if (gmail_message_id) query += `&gmail_message_id=eq.${gmail_message_id}`;
      return res.json(await supaFetch(query));
    }

    // POST: add a label to a message
    if (req.method === 'POST') {
      const { gmail_message_id: msgId, gmail_thread_id, label: lbl, from_email, to_email, subject, snippet, date } = req.body;
      if (!msgId || !lbl) return res.status(400).json({ error: 'gmail_message_id and label required' });

      // Upsert — don't duplicate same label on same message
      const existing = await supaFetch(`crm_email_labels?gmail_message_id=eq.${msgId}&label=eq.${lbl}`);
      if (existing.length > 0) {
        return res.json(existing[0]);
      }

      const result = await supaFetch('crm_email_labels', {
        method: 'POST',
        body: JSON.stringify({ gmail_message_id: msgId, gmail_thread_id, label: lbl, from_email, to_email, subject, snippet, date }),
      });
      return res.status(201).json(result[0] || result);
    }

    // DELETE: remove a label from a message
    if (req.method === 'DELETE') {
      if (gmail_message_id && label) {
        await supaFetch(`crm_email_labels?gmail_message_id=eq.${gmail_message_id}&label=eq.${label}`, { method: 'DELETE' });
      } else if (req.query.id) {
        await supaFetch(`crm_email_labels?id=eq.${req.query.id}`, { method: 'DELETE' });
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM email-labels error:', err);
    return res.status(500).json({ error: err.message });
  }
}
