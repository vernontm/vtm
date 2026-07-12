const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// Per-client credential vault. Secrets are encrypted at rest with pgcrypto
// (pgp_sym_encrypt) via the cred_list / cred_upsert RPCs. The passphrase never
// touches the DB at rest — it lives only in the serverless env. Set a dedicated
// CRM_CRED_KEY in Vercel; we fall back to the service key so it works out of box.
const CRED_KEY =
  process.env.CRM_CRED_KEY ||
  process.env.CRM_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, client_id } = req.query;

  try {
    // GET — list a client's credentials (secret decrypted server-side)
    if (req.method === 'GET') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch('rpc/cred_list', {
        method: 'POST',
        body: JSON.stringify({ p_client_id: client_id, p_key: CRED_KEY }),
      });
      return res.json(rows || []);
    }

    // POST — create
    if (req.method === 'POST') {
      const d = req.body || {};
      if (!d.client_id) return res.status(400).json({ error: 'client_id required' });
      if (!d.label) return res.status(400).json({ error: 'label required' });
      const newId = await supaFetch('rpc/cred_upsert', {
        method: 'POST',
        body: JSON.stringify({
          p_id: null,
          p_client_id: d.client_id,
          p_label: d.label,
          p_category: d.category || 'login',
          p_username: d.username || null,
          p_url: d.url || null,
          p_secret: d.secret || null,
          p_notes: d.notes || null,
          p_key: CRED_KEY,
        }),
      });
      return res.status(201).json({ id: newId });
    }

    // PUT — update. Omit `secret` in the body to leave it unchanged;
    // send '' to clear it.
    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const d = req.body || {};
      const hasSecret = Object.prototype.hasOwnProperty.call(d, 'secret');
      await supaFetch('rpc/cred_upsert', {
        method: 'POST',
        body: JSON.stringify({
          p_id: id,
          p_client_id: d.client_id,
          p_label: d.label,
          p_category: d.category || 'login',
          p_username: d.username || null,
          p_url: d.url || null,
          p_secret: hasSecret ? d.secret : null, // null = leave unchanged
          p_notes: d.notes || null,
          p_key: CRED_KEY,
        }),
      });
      return res.json({ id });
    }

    // DELETE
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_client_credentials?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('client-credentials error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
