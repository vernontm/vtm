const { setCors, requireCrmUser, supaFetch } = require('../_lib/supabase.js');

// Authenticated client portal data. The client logs in (Supabase auth) and we
// resolve their client record via crm_clients.portal_user_id. Returns ONLY their
// own checklist + access status + agreement summary — never the vault.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const rows = await supaFetch(`crm_clients?portal_user_id=eq.${user.id}&select=id,business_name,owner_name,stage,onboarding_completed_at`);
    const client = rows && rows[0];
    if (!client) return res.status(403).json({ error: 'No client workspace for this account' });

    // PATCH — client checks a task off (scoped to their own tasks)
    if (req.method === 'PATCH') {
      const { task_id } = req.query;
      if (!task_id) return res.status(400).json({ error: 'task_id required' });
      const status = (req.body && req.body.status) === 'done' ? 'done' : 'todo';
      const owned = await supaFetch(`crm_client_tasks?id=eq.${task_id}&client_id=eq.${client.id}&select=id,title,status`);
      if (!owned || owned.length === 0) return res.status(403).json({ error: 'Not your task' });
      const prev = owned[0];
      const rows = await supaFetch(`crm_client_tasks?id=eq.${task_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, completed_at: status === 'done' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }),
      });
      if (status === 'done' && prev.status !== 'done') {
        await supaFetch('crm_client_alerts', { method: 'POST', body: JSON.stringify({ client_id: client.id, task_id, type: 'task_completed', message: `${client.business_name} completed "${prev.title}"` }) }).catch(() => {});
      }
      return res.json(rows[0]);
    }

    const tasks = await supaFetch(`crm_client_tasks?client_id=eq.${client.id}&select=id,title,description,category,status&order=created_at.asc`);
    const platforms = await supaFetch(`crm_client_platforms?client_id=eq.${client.id}&select=platform_name,access_status,access_process&order=created_at.asc`);
    const agr = await supaFetch(`crm_agreements?client_id=eq.${client.id}&select=title,status,total_amount,signed_at&order=created_at.desc&limit=1`);

    return res.json({ client, tasks: tasks || [], platforms: platforms || [], agreement: (agr && agr[0]) || null });
  } catch (err) {
    console.error('portal-auth error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
