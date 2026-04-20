// Public read-only API for resources + categories.
//   GET /api/resources                 → { categories: [...] }
//   GET /api/resources?category=traders → { category: {...}, resources: [...] }
const SUPABASE_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const sbHeaders = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
};

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { category } = req.query;

  try {
    if (category) {
      const cats = await sb(`resource_categories?slug=eq.${encodeURIComponent(category)}&published=eq.true&limit=1`);
      if (!cats.length) return res.status(404).json({ error: 'Category not found' });
      const resources = await sb(
        `resources?category_slug=eq.${encodeURIComponent(category)}&published=eq.true&order=sort_order.asc,created_at.desc`
      );
      return res.status(200).json({ category: cats[0], resources });
    }

    const categories = await sb('resource_categories?published=eq.true&order=sort_order.asc,created_at.asc');
    return res.status(200).json({ categories });
  } catch (err) {
    console.error('Public resources error:', err);
    return res.status(500).json({ error: err.message });
  }
}
