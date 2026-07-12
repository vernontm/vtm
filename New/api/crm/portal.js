const { setCors, supaFetch } = require('../_lib/supabase.js');

// Client-facing onboarding portal. Auth is the per-client portal_token in the
// URL (unguessable uuid) — no login required. This endpoint ONLY ever exposes a
// client's own onboarding survey + tasks + platform status. It never returns the
// credential vault or other clients' data.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columns the onboarding wizard is allowed to write.
const SAVE_FIELDS = new Set([
  'business_name', 'owner_name', 'contact_email', 'contact_phone', 'business_type',
  'website_url', 'industry', 'services', 'campaign_goals', 'target_audience',
  'instagram', 'tiktok', 'unique_selling_points', 'outreach_tone', 'notes',
]);

// Columns we return to the portal so the wizard can prefill.
const CLIENT_SELECT = [
  'id', 'business_name', 'owner_name', 'logo_url', 'stage', 'onboarding_completed_at',
  'contact_email', 'contact_phone', 'business_type', 'website_url', 'industry',
  'services', 'campaign_goals', 'target_audience', 'instagram', 'tiktok',
  'unique_selling_points', 'outreach_tone', 'notes',
].join(',');

async function clientForToken(token) {
  if (!token || !UUID_RE.test(token)) return null;
  const rows = await supaFetch(`crm_clients?portal_token=eq.${token}&select=${CLIENT_SELECT}`);
  return rows && rows[0] ? rows[0] : null;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { token, task_id, action } = req.query;

  try {
    const client = await clientForToken(token);
    if (!client) return res.status(404).json({ error: 'Portal not found' });

    // GET — profile + checklist + access status
    if (req.method === 'GET') {
      const tasks = await supaFetch(
        `crm_client_tasks?client_id=eq.${client.id}&select=id,title,description,category,assigned_to,status&order=created_at.asc`
      );
      const platforms = await supaFetch(
        `crm_client_platforms?client_id=eq.${client.id}&select=id,platform_name,access_type,access_status,access_process&order=created_at.asc`
      );
      return res.json({ client, tasks: tasks || [], platforms: platforms || [] });
    }

    // POST action=save — the onboarding wizard saves answers (partial or final)
    if (req.method === 'POST' && action === 'save') {
      const body = req.body || {};
      const fields = body.fields || {};
      const patch = {};
      for (const [k, v] of Object.entries(fields)) {
        if (SAVE_FIELDS.has(k)) patch[k] = (typeof v === 'string' ? v.trim() : v) || null;
      }

      if (body.complete) {
        patch.onboarding_completed_at = new Date().toISOString();
        if (!client.stage || client.stage === 'lead') patch.stage = 'awaiting_access';
      }
      patch.updated_at = new Date().toISOString();

      await supaFetch(`crm_clients?id=eq.${client.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });

      // Create platform rows for any newly selected tools (skip existing).
      if (Array.isArray(body.platforms) && body.platforms.length) {
        const existing = await supaFetch(`crm_client_platforms?client_id=eq.${client.id}&select=platform_name`);
        const have = new Set((existing || []).map(p => (p.platform_name || '').toLowerCase()));
        const toAdd = body.platforms
          .filter(name => name && !have.has(String(name).toLowerCase()))
          .map(name => ({ client_id: client.id, platform_name: String(name), access_type: 'admin_invite', access_status: 'needed' }));
        if (toAdd.length) {
          await supaFetch('crm_client_platforms', { method: 'POST', body: JSON.stringify(toAdd) });
        }
      }

      // Alert Ray when a client finishes the onboarding survey.
      if (body.complete) {
        await supaFetch('crm_client_alerts', {
          method: 'POST',
          body: JSON.stringify({
            client_id: client.id,
            type: 'onboarding_completed',
            message: `${patch.business_name || client.business_name} completed their onboarding survey`,
          }),
        }).catch((e) => console.error('alert insert failed:', e));
      }

      return res.json({ ok: true });
    }

    // PATCH — client checks a task off (or back on). Scoped to their own tasks.
    if (req.method === 'PATCH') {
      if (!task_id) return res.status(400).json({ error: 'task_id required' });
      const status = (req.body && req.body.status) === 'done' ? 'done' : 'todo';
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
      if (status === 'done' && prev.status !== 'done') {
        await supaFetch('crm_client_alerts', {
          method: 'POST',
          body: JSON.stringify({
            client_id: client.id,
            task_id,
            type: 'task_completed',
            message: `${client.business_name} completed "${prev.title}"`,
          }),
        }).catch((e) => console.error('alert insert failed:', e));
      }
      return res.json(rows[0]);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('portal error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
