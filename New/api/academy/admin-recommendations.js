import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const recommendations = await supaFetch('academy_recommendations?order=sort_order.asc');
      return res.json(recommendations);
    }

    if (req.method === 'POST') {
      const { title, description, url, image_url, category, sort_order } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });

      const data = {
        title,
        description,
        url,
        image_url,
        category,
        sort_order: sort_order || 0,
        created_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_recommendations', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT') {
      const { id, ...fields } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      fields.updated_at = new Date().toISOString();
      const result = await supaFetch(`academy_recommendations?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param is required' });
      await supaFetch(`academy_recommendations?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-recommendations error:', err);
    return res.status(500).json({ error: err.message });
  }
}
