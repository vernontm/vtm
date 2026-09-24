const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, contact_id } = req.query;

  // GET — list all, by id, or by contact_id
  if (req.method === 'GET') {
    if (id) {
      const rows = await supaFetch(`crm_clients?id=eq.${id}`);
      return res.json(rows[0] || null);
    }
    if (contact_id) {
      const rows = await supaFetch(`crm_clients?contact_id=eq.${contact_id}`);
      return res.json(rows[0] || null);
    }
    // Team members (employees/contractors who signed through the CRM) live in
    // the same table so their agreement history is preserved, but they are not
    // clients. `?record_type=team` opts in to seeing them.
    const wantType = req.query?.record_type;
    const filter = wantType
      ? `&record_type=eq.${encodeURIComponent(wantType)}`
      : '&or=(record_type.is.null,record_type.eq.client)';
    const rows = await supaFetch(`crm_clients?order=created_at.desc${filter}`);
    return res.json(rows);
  }

  // POST — create (optionally linked to a contact)
  if (req.method === 'POST') {
    const data = req.body;
    // If contact_id provided, check if a client already exists for this contact
    if (data.contact_id) {
      const existing = await supaFetch(`crm_clients?contact_id=eq.${data.contact_id}`);
      if (existing && existing.length > 0) {
        return res.json(existing[0]); // Return existing client
      }
    }
    const rows = await supaFetch('crm_clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.json(rows[0]);
  }

  // PUT — update
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = { ...req.body, updated_at: new Date().toISOString() };
    const rows = await supaFetch(`crm_clients?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0]);
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_clients?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
