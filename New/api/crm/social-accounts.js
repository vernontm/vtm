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

  const { id, client_id } = req.query;

  // GET — list by client_id
  if (req.method === 'GET') {
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const rows = await supaFetch(
      `crm_client_social_accounts?client_id=eq.${client_id}&order=created_at.asc`
    );
    return res.json(rows);
  }

  // POST — create new social account
  if (req.method === 'POST') {
    const { client_id: cid, platform, account_id, account_name } = req.body;
    if (!cid || !platform) {
      return res.status(400).json({ error: 'client_id and platform required' });
    }
    const rows = await supaFetch('crm_client_social_accounts', {
      method: 'POST',
      body: JSON.stringify({ client_id: cid, platform, account_id, account_name }),
    });
    return res.json(rows[0]);
  }

  // PUT — update by id
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = { ...req.body, updated_at: new Date().toISOString() };
    const rows = await supaFetch(`crm_client_social_accounts?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0] || null);
  }

  // DELETE — by id
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const rows = await supaFetch(`crm_client_social_accounts?id=eq.${id}`, {
      method: 'DELETE',
    });
    return res.json(rows[0] || null);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
