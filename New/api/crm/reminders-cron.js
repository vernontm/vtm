const { supaFetch } = require('../_lib/supabase.js');
const { pushUser } = require('../_lib/push.js');

// Every few minutes (New/vercel.json): push every reminder whose time has
// come to the person it is for, then mark it sent. Idempotent: a reminder is
// only ever pushed from the scheduled state.
module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const now = new Date().toISOString();
    const due = await supaFetch(`crm_reminders?status=eq.scheduled&remind_at=lte.${encodeURIComponent(now)}&select=*&order=remind_at.asc&limit=200`) || [];
    let sent = 0;
    for (const r of due) {
      const from = r.created_by && r.created_by !== r.for_user && r.created_by_name ? ` · from ${r.created_by_name}` : '';
      await pushUser(r.for_user, { title: 'Reminder', body: `${r.title}${from}`, data: { type: 'reminder', id: r.id } });
      await supaFetch(`crm_reminders?id=eq.${r.id}&status=eq.scheduled`, {
        method: 'PATCH', body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
      });
      sent++;
    }
    return res.json({ ok: true, due: due.length, sent });
  } catch (err) {
    if (/crm_reminders|does not exist|schema cache/i.test(String(err.message))) return res.json({ ok: true, skipped: 'crm_reminders not created yet' });
    console.error('reminders-cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
