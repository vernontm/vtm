const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // GET — list contacts for a client
  if (req.method === 'GET') {
    try {
      const { client_id, tag } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      let query = `crm_email_contacts?client_id=eq.${client_id}&order=created_at.desc`;
      if (tag) query += `&tags=cs.["${tag}"]`;
      const rows = await supaFetch(query);
      return res.json(rows || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — add contact(s) + auto-welcome
  if (req.method === 'POST' && action !== 'update-tags') {
    try {
      const { client_id, contacts } = req.body;
      if (!client_id || !contacts?.length) {
        return res.status(400).json({ error: 'client_id and contacts array required' });
      }

      // Onboarding is handled exclusively by email sequences (see email-cron.js).
      // No welcome template or auto-trigger campaign sending here — sequences are
      // the single source of truth for onboarding flows.

      const results = [];
      for (const c of contacts) {
        if (!c.email) continue;
        try {
          // Upsert contact
          const row = {
            client_id,
            email: c.email.toLowerCase().trim(),
            name: c.name || '',
            tags: c.tags || [],
            status: 'active',
            signed_up_at: c.signed_up_at || new Date().toISOString(),
          };
          if (c.birthday_month) row.birthday_month = parseInt(c.birthday_month) || null;
          if (c.birthday_day) row.birthday_day = parseInt(c.birthday_day) || null;
          if (c.discount_code !== undefined) row.discount_code = c.discount_code || null;
          if (c.city !== undefined) row.city = c.city || null;
          if (c.state !== undefined) row.state = c.state || null;
          if (c.country !== undefined) row.country = c.country || null;
          const rows = await supaFetch('crm_email_contacts', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
            body: JSON.stringify([row]),
          });
          const contact = rows?.[0];
          results.push(contact);
        } catch (e) {
          console.error(`Failed to add contact ${c.email}:`, e.message);
          results.push({ email: c.email, error: e.message });
        }
      }

      return res.json({ added: results.length, contacts: results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — update tags
  if (req.method === 'POST' && action === 'update-tags') {
    try {
      const { contact_id, tags } = req.body;
      if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
      const rows = await supaFetch(`crm_email_contacts?id=eq.${contact_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ tags: tags || [], updated_at: new Date().toISOString() }),
      });
      return res.json(rows?.[0] || { updated: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — update contact fields (name, birthday, discount code, etc.)
  if (req.method === 'POST' && action === 'update-contact') {
    try {
      const { contact_id, name, birthday_month, birthday_day, tags, discount_code, signed_up_at, city, state, country } = req.body;
      if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
      const update = { updated_at: new Date().toISOString() };
      if (name !== undefined) update.name = name;
      if (tags !== undefined) update.tags = tags;
      if (birthday_month !== undefined) update.birthday_month = birthday_month ? parseInt(birthday_month) : null;
      if (birthday_day !== undefined) update.birthday_day = birthday_day ? parseInt(birthday_day) : null;
      if (discount_code !== undefined) update.discount_code = discount_code || null;
      if (signed_up_at !== undefined) update.signed_up_at = signed_up_at || null;
      if (city !== undefined) update.city = city || null;
      if (state !== undefined) update.state = state || null;
      if (country !== undefined) update.country = country || null;
      const rows = await supaFetch(`crm_email_contacts?id=eq.${contact_id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
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
      await supaFetch(`crm_email_contacts?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method or action' });
};
