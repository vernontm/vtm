const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, avatar_id } = req.query;

  if (req.method === 'GET') {
    if (!avatar_id) return res.status(400).json({ error: 'avatar_id required' });
    const rows = await supaFetch(
      `crm_avatar_outfits?avatar_id=eq.${avatar_id}&order=sort_order.asc,created_at.asc`
    );
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (!body.avatar_id || !body.name) return res.status(400).json({ error: 'avatar_id and name required' });
    const rows = await supaFetch('crm_avatar_outfits', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.json(rows[0] || rows);
  }

  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const rows = await supaFetch(`crm_avatar_outfits?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(req.body || {}),
    });
    return res.json(rows[0] || null);
  }

  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_avatar_outfits?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
