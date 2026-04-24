const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

// Tag context — descriptions per tag for AI awareness
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

  // GET — list tag contexts for a client (joined with contact counts)
  if (req.method === 'GET') {
    try {
      const { client_id } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const contexts = await supaFetch(`crm_email_tag_context?client_id=eq.${client_id}&order=tag.asc`);

      // Compute counts from contacts
      const contacts = await supaFetch(`crm_email_contacts?client_id=eq.${client_id}&select=tags`);
      const counts = {};
      for (const c of (contacts || [])) {
        for (const t of (c.tags || [])) counts[t] = (counts[t] || 0) + 1;
      }

      // Merge in tags that exist on contacts but have no context yet
      const existingTags = new Set((contexts || []).map(c => c.tag));
      const untrackedTags = Object.keys(counts).filter(t => !existingTags.has(t));
      const merged = [
        ...(contexts || []).map(c => ({ ...c, contact_count: counts[c.tag] || 0 })),
        ...untrackedTags.map(t => ({ id: null, client_id, tag: t, description: '', contact_count: counts[t] })),
      ];
      return res.json(merged);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — upsert tag context
  if (req.method === 'POST') {
    try {
      const { client_id, tag, description } = req.body;
      if (!client_id || !tag) return res.status(400).json({ error: 'client_id and tag required' });
      const rows = await supaFetch('crm_email_tag_context', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify([{ client_id, tag, description: description || '' }]),
      });
      return res.json(rows?.[0] || { updated: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_email_tag_context?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method' });
};
