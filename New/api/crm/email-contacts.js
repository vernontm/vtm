const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// Send welcome email via Resend
async function sendWelcomeEmail(config, template, contact) {
  if (!config?.resend_api_key || !template) return null;

  const html = template.html_body
    .replace(/\{\{name\}\}/g, contact.name || 'there')
    .replace(/\{\{email\}\}/g, contact.email);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.resend_api_key}`,
    },
    body: JSON.stringify({
      from: config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email,
      to: [contact.email],
      subject: template.subject.replace(/\{\{name\}\}/g, contact.name || 'there'),
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Welcome email failed:', err);
    return null;
  }
  return res.json();
}

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

      // Load config and welcome template
      const configs = await supaFetch(`crm_email_config?client_id=eq.${client_id}`);
      const config = configs?.[0];
      const templates = await supaFetch(`crm_email_templates?client_id=eq.${client_id}&template_type=eq.welcome&limit=1`);
      const welcomeTemplate = templates?.[0];

      const results = [];
      for (const c of contacts) {
        if (!c.email) continue;
        try {
          // Upsert contact
          const rows = await supaFetch('crm_email_contacts', {
            method: 'POST',
            headers: { 'Prefer': 'return=representation,resolution=merge-duplicates' },
            body: JSON.stringify([{
              client_id,
              email: c.email.toLowerCase().trim(),
              name: c.name || '',
              tags: c.tags || [],
              status: 'active',
            }]),
          });
          const contact = rows?.[0];
          results.push(contact);

          // Send welcome email if not already welcomed
          if (contact && !contact.welcomed_at && welcomeTemplate && config) {
            const sent = await sendWelcomeEmail(config, welcomeTemplate, contact);
            if (sent) {
              await supaFetch(`crm_email_contacts?id=eq.${contact.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ welcomed_at: new Date().toISOString() }),
              });
            }
          }
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
