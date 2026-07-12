const { setCors, supaFetch } = require('../_lib/supabase.js');

// Client-facing onboarding portal. Auth is the per-client portal_token in the
// URL (unguessable uuid) — no login required. This endpoint ONLY ever exposes a
// client's own onboarding tasks + platform/access status. It never returns the
// credential vault or other clients' data.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function clientForToken(token) {
  if (!token || !UUID_RE.test(token)) return null;
  const rows = await supaFetch(
    `crm_clients?portal_token=eq.${token}&select=id,business_name,owner_name,logo_url,stage`
  );
  return rows && rows[0] ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, task_id } = req.query;

  try {
    const client = await clientForToken(token);
    if (!client) return res.status(404).json({ error: 'Portal not found' });

    // GET — the client's checklist + access status
    if (req.method === 'GET') {
      const tasks = await supaFetch(
        `crm_client_tasks?client_id=eq.${client.id}&select=id,title,description,category,assigned_to,status&order=created_at.asc`
      );
      const platforms = await supaFetch(
        `crm_client_platforms?client_id=eq.${client.id}&select=id,platform_name,access_type,access_status,access_process&order=created_at.asc`
      );
      return res.json({ client, tasks: tasks || [], platforms: platforms || [] });
    }

    // PATCH — client checks a task off (or back on). Scoped to their own tasks.
    if (req.method === 'PATCH') {
      if (!task_id) return res.status(400).json({ error: 'task_id required' });
      const status = (req.body && req.body.status) === 'done' ? 'done' : 'todo';
      // Verify the task belongs to this client before touching it.
      const owned = await supaFetch(`crm_client_tasks?id=eq.${task_id}&client_id=eq.${client.id}&select=id,title,status`);
      if (!owned || owned.length === 0) return res.status(403).json({ error: 'Not your task' });
      const prev = owned[0];
      const rows = await supaFetch(`crm_client_tasks?id=eq.${task_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          completed_at: status === 'done' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }),
      });
      // Alert Ray only on the todo -> done transition (not on re-checks/unchecks).
      if (status === 'done' && prev.status !== 'done') {
        await supaFetch('crm_client_alerts', {
          method: 'POST',
          body: JSON.stringify({
            client_id: client.id,
            task_id,
            type: 'task_completed',
            message: `${client.business_name} completed "${prev.title}"`,
          }),
        }).catch((e) => console.error('alert insert failed:', e)); // never block the client
      }
      return res.json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('portal error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
