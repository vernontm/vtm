import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const { student_id } = req.query;

      // Full conversation with a specific student
      if (student_id) {
        const messages = await supaFetch(
          `academy_direct_messages?or=(and(sender_id.eq.${student_id},recipient_id.eq.${user.id}),and(sender_id.eq.${user.id},recipient_id.eq.${student_id}))&order=created_at.asc`
        );

        // Mark unread messages from this student as read
        await supaFetch(
          `academy_direct_messages?sender_id=eq.${student_id}&recipient_id=eq.${user.id}&read=eq.false`,
          {
            method: 'PATCH',
            body: JSON.stringify({ read: true }),
          }
        ).catch(() => {}); // Ignore if no rows to update

        return res.json(messages);
      }

      // List all message threads
      const allMessages = await supaFetch(
        `academy_direct_messages?or=(sender_id.eq.${user.id},recipient_id.eq.${user.id})&order=created_at.desc`
      );

      // Group by student and build thread summaries
      const threadMap = {};
      for (const msg of allMessages) {
        const studentId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
        if (!threadMap[studentId]) {
          threadMap[studentId] = {
            student_id: studentId,
            latest_message: msg.message,
            latest_at: msg.created_at,
            unread_count: 0,
          };
        }
        if (msg.recipient_id === user.id && !msg.read) {
          threadMap[studentId].unread_count++;
        }
      }

      // Fetch student names
      const studentIds = Object.keys(threadMap);
      if (studentIds.length > 0) {
        const profiles = await supaFetch(
          `academy_profiles?id=in.(${studentIds.join(',')})&select=id,full_name,avatar_url`
        );
        for (const p of profiles) {
          if (threadMap[p.id]) {
            threadMap[p.id].student_name = p.full_name;
            threadMap[p.id].avatar_url = p.avatar_url;
          }
        }
      }

      const threads = Object.values(threadMap).sort(
        (a, b) => new Date(b.latest_at) - new Date(a.latest_at)
      );
      return res.json(threads);
    }

    if (req.method === 'POST') {
      const { student_id, content, message: msgText } = req.body;
      const messageBody = msgText || content;
      if (!student_id || !messageBody) {
        return res.status(400).json({ error: 'student_id and message are required' });
      }

      const msg = {
        sender_id: user.id,
        recipient_id: student_id,
        message: messageBody,
        read: false,
        created_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_direct_messages', {
        method: 'POST',
        body: JSON.stringify(msg),
      });

      // Create notification for the student
      await supaFetch('academy_notifications', {
        method: 'POST',
        body: JSON.stringify({
          user_id: student_id,
          type: 'new_message',
          title: 'New message from admin',
          body: messageBody.substring(0, 100),
          read: false,
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {}); // Don't fail if notification insert fails

      return res.status(201).json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-messages error:', err);
    return res.status(500).json({ error: err.message });
  }
}
