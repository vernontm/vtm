const SUPABASE_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const url = `${SUPABASE_URL}/rest/v1/trader_resources?published=eq.true&order=sort_order.asc,created_at.desc`;
    const response = await fetch(url, {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: 'Database error', details: err });
    }
    const rows = await response.json();
    return res.status(200).json(rows);
  } catch (err) {
    console.error('Public trader-resources error:', err);
    return res.status(500).json({ error: err.message });
  }
}
