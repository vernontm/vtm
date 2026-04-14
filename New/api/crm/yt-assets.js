const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // ── List assets ──
  if (req.method === 'GET') {
    try {
      let query = 'crm_yt_assets?order=created_at.desc';
      if (req.query.client_id) query += `&client_id=eq.${req.query.client_id}`;
      if (req.query.asset_type) query += `&asset_type=eq.${req.query.asset_type}`;

      const rows = await supaFetch(query);
      return res.json(rows);
    } catch (err) {
      console.error('List assets error:', err);
      return res.status(500).json({ error: 'Failed to list assets: ' + err.message });
    }
  }

  // ── Create an asset ──
  if (req.method === 'POST') {
    try {
      const { client_id, asset_type, label, storage_url } = req.body;
      if (!client_id || !asset_type || !storage_url) {
        return res.status(400).json({ error: 'client_id, asset_type, and storage_url required' });
      }

      const rows = await supaFetch('crm_yt_assets', {
        method: 'POST',
        body: JSON.stringify([{
          client_id,
          asset_type,
          label: label || null,
          storage_url,
        }]),
      });

      return res.json(rows?.[0] || { created: true });
    } catch (err) {
      console.error('Create asset error:', err);
      return res.status(500).json({ error: 'Failed to create asset: ' + err.message });
    }
  }

  // ── Delete an asset ──
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });

      await supaFetch(`crm_yt_assets?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      console.error('Delete asset error:', err);
      return res.status(500).json({ error: 'Delete failed: ' + err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method' });
};
