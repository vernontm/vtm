const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // GET — fetch config for a client
  if (req.method === 'GET') {
    try {
      const { client_id } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch(`crm_email_config?client_id=eq.${client_id}`);
      const cfg = rows?.[0] || null;
      // Mask the API key for frontend display
      if (cfg?.resend_api_key) {
        cfg.resend_api_key_masked = cfg.resend_api_key.slice(0, 8) + '...' + cfg.resend_api_key.slice(-4);
      }
      return res.json(cfg);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create or update config
  if (req.method === 'POST') {
    try {
      const { client_id, resend_api_key, from_email, from_name, daily_limit } = req.body;
      if (!client_id || !resend_api_key || !from_email) {
        return res.status(400).json({ error: 'client_id, resend_api_key, and from_email required' });
      }

      // Check existing
      const existing = await supaFetch(`crm_email_config?client_id=eq.${client_id}`);
      if (existing?.length) {
        // Update
        const rows = await supaFetch(`crm_email_config?client_id=eq.${client_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            resend_api_key,
            from_email,
            from_name: from_name || '',
            daily_limit: daily_limit || 100,
            updated_at: new Date().toISOString(),
          }),
        });
        return res.json(rows?.[0] || { updated: true });
      } else {
        // Create
        const rows = await supaFetch('crm_email_config', {
          method: 'POST',
          body: JSON.stringify([{
            client_id,
            resend_api_key,
            from_email,
            from_name: from_name || '',
            daily_limit: daily_limit || 100,
          }]),
        });
        return res.json(rows?.[0] || { created: true });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method' });
};
