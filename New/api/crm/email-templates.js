const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  // GET — list templates
  if (req.method === 'GET') {
    try {
      const { client_id, template_type } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      let query = `crm_email_templates?client_id=eq.${client_id}&order=created_at.desc`;
      if (template_type) query += `&template_type=eq.${template_type}`;
      const rows = await supaFetch(query);
      return res.json(rows || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create template
  if (req.method === 'POST') {
    try {
      const { client_id, name, subject, html_body, template_type } = req.body;
      if (!client_id || !name || !subject) {
        return res.status(400).json({ error: 'client_id, name, and subject required' });
      }
      const rows = await supaFetch('crm_email_templates', {
        method: 'POST',
        body: JSON.stringify([{
          client_id,
          name,
          subject,
          html_body: html_body || '',
          template_type: template_type || 'blast',
        }]),
      });
      return res.json(rows?.[0] || { created: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT — update template
  if (req.method === 'PUT') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const { name, subject, html_body, template_type } = req.body;
      const update = { updated_at: new Date().toISOString() };
      if (name !== undefined) update.name = name;
      if (subject !== undefined) update.subject = subject;
      if (html_body !== undefined) update.html_body = html_body;
      if (template_type !== undefined) update.template_type = template_type;
      const rows = await supaFetch(`crm_email_templates?id=eq.${id}`, {
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
      await supaFetch(`crm_email_templates?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method' });
};
