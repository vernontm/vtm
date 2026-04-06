import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, type } = req.query;
  // type=groups for group operations, otherwise todo items

  try {
    if (type === 'groups') {
      if (req.method === 'GET') {
        return res.json(await supaFetch('crm_todo_groups?order=position.asc'));
      }
      if (req.method === 'POST') {
        const result = await supaFetch('crm_todo_groups', { method: 'POST', body: JSON.stringify(req.body) });
        return res.status(201).json(result[0] || result);
      }
      if (req.method === 'PUT' && id) {
        const { id: _, ...data } = req.body;
        const result = await supaFetch(`crm_todo_groups?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
        return res.json(result[0] || result);
      }
      if (req.method === 'DELETE' && id) {
        await supaFetch(`crm_todo_groups?id=eq.${id}`, { method: 'DELETE' });
        return res.json({ success: true });
      }
    }

    // Todo items
    if (req.method === 'GET') {
      return res.json(await supaFetch('crm_todos?order=position.asc'));
    }

    if (req.method === 'POST') {
      const result = await supaFetch('crm_todos', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_todos?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_todos?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM todos error:', err);
    return res.status(500).json({ error: err.message });
  }
}
