import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  try {
    if (req.method === 'GET') {
      // Build notifications from data state
      const [leads, deals, emailQueue, dismissed] = await Promise.all([
        supaFetch('crm_leads?select=id,name,status,last_reply_at,created_at&order=created_at.desc&limit=50'),
        supaFetch('crm_deals?select=id,name,stage,payment_status,value&order=created_at.desc&limit=50'),
        supaFetch('crm_email_queue?select=id,status&status=eq.draft'),
        supaFetch('crm_dismissed_notifications?select=id'),
      ]);

      const dismissedSet = new Set(dismissed.map(d => d.id));
      const notifications = [];

      // New leads in last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      leads.filter(l => l.status === 'New Lead' && l.created_at > weekAgo).forEach(l => {
        const nId = `new-lead-${l.id}`;
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'new_lead', title: `New lead: ${l.name}`, entity_id: l.id, entity_type: 'lead' });
        }
      });

      // Leads with unread replies
      leads.filter(l => l.last_reply_at).forEach(l => {
        const nId = `reply-${l.id}`;
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'reply', title: `Reply from ${l.name}`, entity_id: l.id, entity_type: 'lead' });
        }
      });

      // Unpaid deals
      deals.filter(d => d.stage === 'Won' && d.payment_status !== 'Paid').forEach(d => {
        const nId = `unpaid-${d.id}`;
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'unpaid', title: `Unpaid deal: ${d.name}`, entity_id: d.id, entity_type: 'deal' });
        }
      });

      // Draft emails pending
      if (emailQueue.length > 0) {
        const nId = 'drafts-pending';
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'drafts', title: `${emailQueue.length} draft emails pending review` });
        }
      }

      return res.json({ notifications, total: notifications.length });
    }

    // POST /api/crm/notifications?action=dismiss
    if (req.method === 'POST' && action === 'dismiss') {
      const { id, dismissAll, ids } = req.body;
      if (dismissAll && Array.isArray(ids)) {
        for (const nId of ids) {
          await supaFetch('crm_dismissed_notifications', {
            method: 'POST', body: JSON.stringify({ id: nId }),
          }).catch(() => {}); // ignore dupes
        }
      } else if (id) {
        await supaFetch('crm_dismissed_notifications', {
          method: 'POST', body: JSON.stringify({ id }),
        }).catch(() => {});
      }
      return res.json({ success: true });
    }

    // DELETE /api/crm/notifications?action=reset
    if (req.method === 'DELETE' && action === 'reset') {
      await supaFetch('crm_dismissed_notifications?id=neq.none', { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM notifications error:', err);
    return res.status(500).json({ error: err.message });
  }
}
