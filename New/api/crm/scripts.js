import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const rows = await supaFetch('crm_scripts?order=position.asc,created_at.asc');
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const { title, content = '', category = 'General' } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });
      const existing = await supaFetch('crm_scripts?select=position&order=position.desc&limit=1').catch(() => []);
      const position = ((existing || [])[0]?.position ?? -1) + 1;
      const result = await supaFetch('crm_scripts', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ title, content, category, position }),
      });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PATCH' && id) {
      const { id: _, ...data } = req.body;
      const result = await supaFetch(`crm_scripts?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(data),
      });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_scripts?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Scripts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
