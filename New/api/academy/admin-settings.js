import { setCors, requireAdminAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireAdminAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const settings = await supaFetch('academy_settings?select=*');
      return res.json(settings);
    }

    if (req.method === 'PUT') {
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'key is required' });

      const data = {
        key,
        value,
        updated_at: new Date().toISOString(),
      };
      const result = await supaFetch('academy_settings', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Prefer': 'return=representation,resolution=merge-duplicates',
        },
      });
      return res.json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy admin-settings error:', err);
    return res.status(500).json({ error: err.message });
  }
}
