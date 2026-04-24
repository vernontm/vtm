const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tenant guard on any referenced client_id
  {
    const refClient = req.query?.client_id || req.body?.client_id;
    if (refClient) {
      const chk = await assertClientAccess(user, refClient);
      if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    }
  }

  try {
    const { id, client_id } = req.query;

    // GET — get config by client_id (single object or null)
    if (req.method === 'GET') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch(
        `crm_auto_schedule_config?client_id=eq.${client_id}&limit=1`
      );
      return res.json(rows && rows.length ? rows[0] : null);
    }

    // POST — upsert config for a client
    if (req.method === 'POST') {
      const { client_id: cid, time_slots, timezone } = req.body;
      if (!cid) return res.status(400).json({ error: 'client_id required' });

      // Check if config already exists for this client
      const existing = await supaFetch(
        `crm_auto_schedule_config?client_id=eq.${cid}&limit=1`
      );

      if (existing && existing.length > 0) {
        // Update existing config
        const data = { time_slots, timezone };
        const rows = await supaFetch(`crm_auto_schedule_config?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
        return res.json(rows && rows[0] ? rows[0] : { ok: true });
      }

      // Insert new config
      const rows = await supaFetch('crm_auto_schedule_config', {
        method: 'POST',
        body: JSON.stringify({ client_id: cid, time_slots: time_slots || ['10:00', '14:00', '18:00', '22:00'], timezone: timezone || 'America/Chicago' }),
      });
      return res.json(rows && rows[0] ? rows[0] : { ok: true });
    }

    // DELETE — by id
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const rows = await supaFetch(`crm_auto_schedule_config?id=eq.${id}`, {
        method: 'DELETE',
      });
      return res.json(rows && rows[0] ? rows[0] : null);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('schedule-config error:', err);
    return res.status(500).json({ error: err.message });
  }
};
