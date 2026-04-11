import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const messages = await supaFetch(
        `academy_messages?or=(sender_id.eq.${user.id},recipient_id.eq.${user.id})&order=created_at.asc`
      );
      return res.json(messages);
    }

    if (req.method === 'POST') {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: 'message is required' });

      // Find first admin as recipient
      const admins = await supaFetch('academy_profiles?role=eq.admin&limit=1');
      const recipientId = admins[0]?.user_id;
      if (!recipientId) return res.status(500).json({ error: 'No admin available' });

      const msg = {
        sender_id: user.id,
        recipient_id: recipientId,
        message,
        created_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_messages', {
        method: 'POST',
        body: JSON.stringify(msg),
      });
      return res.status(201).json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy messages error:', err);
    return res.status(500).json({ error: err.message });
  }
}
