import { setCors, requireStudentAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireStudentAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const rows = await supaFetch(`academy_profiles?id=eq.${user.id}`);
      return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: 'Profile not found' });
    }

    if (req.method === 'PUT') {
      const { full_name, avatar_url } = req.body;
      const updates = {};
      if (full_name !== undefined) updates.full_name = full_name;
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;
      const result = await supaFetch(`academy_profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      return res.json(result[0] || result);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Academy profile error:', err);
    return res.status(500).json({ error: err.message });
  }
}
