import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    if (req.method === 'GET') {
      const notifications = await supaFetch(
        `academy_notifications?user_id=eq.${user.id}&order=created_at.desc`
      );
      const unread = notifications.filter(n => !n.read).length;
      return res.json({ notifications, unread });
    }

    if (req.method === 'PUT') {
      if (action === 'read-all') {
        const result = await supaFetch(
          `academy_notifications?user_id=eq.${user.id}&read=eq.false`,
          { method: 'PATCH', body: JSON.stringify({ read: true }) }
        );
        return res.json({ success: true, updated: result?.length || 0 });
      }
      if (id) {
        const result = await supaFetch(
          `academy_notifications?id=eq.${id}&user_id=eq.${user.id}`,
          { method: 'PATCH', body: JSON.stringify({ read: true }) }
        );
        return res.json(result[0] || { success: true });
      }
      return res.status(400).json({ error: 'id or action=read-all is required' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy notifications error:', err);
    return res.status(500).json({ error: err.message });
  }
}
