import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
import { getGmailAuth } from '../_lib/gmail.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messageId } = req.body;
    if (!messageId) return res.status(400).json({ error: 'messageId required' });

    const accessToken = await getGmailAuth();

    // Move to trash via Gmail API
    const gmailRes = await fetch(`${GMAIL_API}/messages/${messageId}/trash`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!gmailRes.ok) {
      const err = await gmailRes.text();
      throw new Error(`Gmail API ${gmailRes.status}: ${err}`);
    }

    // Remove from cache
    try {
      await supaFetch(`crm_gmail_cache?gmail_id=eq.${messageId}`, { method: 'DELETE' });
    } catch (e) { /* cache cleanup optional */ }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Gmail trash error:', err);
    return res.status(500).json({ error: err.message });
  }
}
