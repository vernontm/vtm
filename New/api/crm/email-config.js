const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');
const { getAccount } = require('../_lib/mailerlite.js');

function maskKey(k) {
  if (!k) return null;
  return k.slice(0, 8) + '...' + k.slice(-4);
}

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

  const { action } = req.query;

  // POST action=test-mailerlite — verify API key works
  if (req.method === 'POST' && action === 'test-mailerlite') {
    try {
      const { api_key } = req.body || {};
      if (!api_key) return res.status(400).json({ error: 'api_key required' });
      const account = await getAccount(api_key);
      return res.json({ ok: true, account: account?.data || null });
    } catch (err) {
      return res.status(400).json({ ok: false, error: err.message });
    }
  }

  // GET — fetch config for a client
  if (req.method === 'GET') {
    try {
      const { client_id } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch(`crm_email_config?client_id=eq.${client_id}`);
      const cfg = rows?.[0] || null;
      if (cfg) {
        // Mask API keys for frontend display — never echo back raw
        if (cfg.resend_api_key) cfg.resend_api_key_masked = maskKey(cfg.resend_api_key);
        if (cfg.mailerlite_api_key) cfg.mailerlite_api_key_masked = maskKey(cfg.mailerlite_api_key);
        delete cfg.resend_api_key;
        delete cfg.mailerlite_api_key;
      }
      return res.json(cfg);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create or update config
  if (req.method === 'POST') {
    try {
      const { client_id, resend_api_key, mailerlite_api_key, from_email, from_name, daily_limit } = req.body;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      if (!from_email) return res.status(400).json({ error: 'from_email required' });

      const update = {
        from_email,
        from_name: from_name || '',
        daily_limit: daily_limit || 100,
        updated_at: new Date().toISOString(),
      };
      // Only overwrite API keys if a non-empty value was provided (so the UI can
      // submit the form without re-entering the key each time).
      if (resend_api_key) update.resend_api_key = resend_api_key;
      if (mailerlite_api_key) update.mailerlite_api_key = mailerlite_api_key;

      const existing = await supaFetch(`crm_email_config?client_id=eq.${client_id}`);
      if (existing?.length) {
        const rows = await supaFetch(`crm_email_config?client_id=eq.${client_id}`, {
          method: 'PATCH',
          body: JSON.stringify(update),
        });
        return res.json(rows?.[0] || { updated: true });
      } else {
        const rows = await supaFetch('crm_email_config', {
          method: 'POST',
          body: JSON.stringify([{ client_id, ...update }]),
        });
        return res.json(rows?.[0] || { created: true });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method' });
};
