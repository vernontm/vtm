const { setCors, requireAuth, supaFetch } = require('../_lib/supabase');

function generateSlug(name) {
  if (!name) return null;
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const rows = await supaFetch('resource_categories?order=sort_order.asc,created_at.asc');
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.slug && body.name) body.slug = generateSlug(body.name);
      const row = await supaFetch('resource_categories', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const data = { ...req.body, updated_at: new Date().toISOString() };
      delete data.id;
      delete data.created_at;
      const row = await supaFetch(`resource_categories?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.status(200).json(row);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`resource_categories?id=eq.${id}`, { method: 'DELETE' });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Resource categories error:', err);
    return res.status(500).json({ error: err.message });
  }
}
