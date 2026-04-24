import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // GET: list all custom label definitions
    if (req.method === 'GET') {
      const labels = await supaFetch('crm_label_defs?order=name.asc');
      return res.json(labels);
    }

    // POST: create a new label definition
    if (req.method === 'POST') {
      const { name, color } = req.body;
      if (!name) return res.status(400).json({ error: 'name required' });

      // Generate a slug key from name
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      const result = await supaFetch('crm_label_defs', {
        method: 'POST',
        body: JSON.stringify({ name, key, color: color || '#4a6cf7' }),
      });
      return res.status(201).json(result[0] || result);
    }

    // DELETE: remove a label definition
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_label_defs?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Label defs error:', err);
    return res.status(500).json({ error: err.message });
  }
}
