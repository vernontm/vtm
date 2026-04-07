import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  try {
    if (req.method === 'GET') {
      // Build notifications from data state
      const [leads, deals, emailQueue, dismissed, meetings, subscriptions] = await Promise.all([
        supaFetch('crm_leads?select=id,name,status,last_reply_at,created_at&order=created_at.desc&limit=50'),
        supaFetch('crm_deals?select=id,name,stage,payment_status,value&order=created_at.desc&limit=50'),
        supaFetch('crm_email_queue?select=id,status&status=eq.draft'),
        supaFetch('crm_dismissed_notifications?select=id'),
        supaFetch('crm_meetings?select=id,title,start_time&order=start_time.asc&limit=10').catch(() => []),
        supaFetch('crm_subscriptions?select=id,service,next_renewal,amount,status&status=eq.active&order=next_renewal.asc').catch(() => []),
      ]);

      const dismissedSet = new Set(dismissed.map(d => d.id));
      const notifications = [];

      // New leads in last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      leads.filter(l => l.status === 'New Lead' && l.created_at > weekAgo).forEach(l => {
        const nId = `new-lead-${l.id}`;
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'new_lead', priority: 'high', title: `New lead: ${l.name}`, entity_id: l.id, entity_type: 'lead' });
        }
      });

      // Leads with unread replies
      leads.filter(l => l.last_reply_at).forEach(l => {
        const nId = `reply-${l.id}`;
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'reply', priority: 'high', title: `Reply from ${l.name}`, entity_id: l.id, entity_type: 'lead' });
        }
      });

      // Unpaid deals
      deals.filter(d => d.stage === 'Won' && d.payment_status !== 'Paid').forEach(d => {
        const nId = `unpaid-${d.id}`;
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'unpaid', priority: 'medium', title: `Unpaid deal: ${d.name}`, message: `$${d.value?.toLocaleString() || 0} outstanding`, entity_id: d.id, entity_type: 'deal' });
        }
      });

      // Draft emails pending
      if (emailQueue.length > 0) {
        const nId = 'drafts-pending';
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'drafts', priority: 'medium', title: `${emailQueue.length} draft email${emailQueue.length > 1 ? 's' : ''} pending review` });
        }
      }

      // Upcoming meetings in next 24 hours
      const dayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();
      (meetings || []).filter(m => m.start_time > now && m.start_time < dayFromNow).forEach(m => {
        const nId = `meeting-soon-${m.id}`;
        if (!dismissedSet.has(nId)) {
          const startTime = new Date(m.start_time);
          const hoursAway = Math.round((startTime - Date.now()) / 3600000);
          notifications.push({
            id: nId, type: 'meeting', priority: 'high',
            title: `Meeting: ${m.title}`,
            message: hoursAway <= 1 ? 'Starting soon' : `In ${hoursAway} hours`,
            entity_id: m.id, entity_type: 'meeting',
          });
        }
      });

      // Subscription renewals in next 7 days
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      (subscriptions || []).filter(s => s.next_renewal && s.next_renewal < weekFromNow && s.next_renewal > now).forEach(s => {
        const nId = `renewal-${s.id}`;
        if (!dismissedSet.has(nId)) {
          const renewDate = new Date(s.next_renewal);
          const daysAway = Math.ceil((renewDate - Date.now()) / 86400000);
          notifications.push({
            id: nId, type: 'subscription', priority: daysAway <= 2 ? 'high' : 'medium',
            title: `${s.service} renewal ${daysAway <= 1 ? 'tomorrow' : `in ${daysAway} days`}`,
            message: s.amount ? `$${s.amount}` : '',
            entity_id: s.id, entity_type: 'subscription',
          });
        }
      });

      // Leads needing follow-up (no activity in 5+ days, status not Won/Lost)
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      leads.filter(l => l.status !== 'Won' && l.status !== 'Lost' && l.created_at < fiveDaysAgo && !l.last_reply_at).forEach(l => {
        const nId = `followup-${l.id}`;
        if (!dismissedSet.has(nId)) {
          notifications.push({ id: nId, type: 'follow_up', priority: 'low', title: `Follow up with ${l.name}`, message: 'No activity in 5+ days', entity_id: l.id, entity_type: 'lead' });
        }
      });

      // Sort by priority
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      notifications.sort((a, b) => (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2));

      return res.json({ notifications, total: notifications.length });
    }

    // POST /api/crm/notifications?action=dismiss
    if (req.method === 'POST' && action === 'dismiss') {
      const { id, dismissAll, ids } = req.body;
      if (dismissAll && Array.isArray(ids)) {
        for (const nId of ids) {
          await supaFetch('crm_dismissed_notifications', {
            method: 'POST', body: JSON.stringify({ id: nId }),
          }).catch(() => {});
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
