import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { id, action } = req.query;

  // Public GET (no auth) for visible portfolio items
  if (req.method === 'GET' && action === 'public') {
    try {
      const items = await supaFetch('crm_portfolio?visible=eq.true&order=sort_order.asc,created_at.desc');
      return res.json(items);
    } catch (err) {
      console.error('Portfolio public error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // All other actions require auth
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // GET all portfolio items (admin)
    if (req.method === 'GET') {
      const items = await supaFetch('crm_portfolio?order=sort_order.asc,created_at.desc');
      return res.json(items);
    }

    // POST create
    if (req.method === 'POST') {
      const { title, description, category, media_url, media_type, thumbnail_url, visible } = req.body;
      if (!title) return res.status(400).json({ error: 'Title is required' });
      const data = {
        title,
        description: description || '',
        category: category || 'websites',
        media_url: media_url || '',
        media_type: media_type || 'image',
        thumbnail_url: thumbnail_url || '',
        visible: visible !== false,
      };
      const result = await supaFetch('crm_portfolio', { method: 'POST', body: JSON.stringify(data) });
      return res.status(201).json(result[0] || result);
    }

    // PUT update
    if (req.method === 'PUT' && id) {
      const { id: _, created_at, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_portfolio?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    // DELETE
    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_portfolio?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Portfolio error:', err);
    return res.status(500).json({ error: err.message });
  }
}
