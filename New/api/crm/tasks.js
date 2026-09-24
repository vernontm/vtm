const { setCors, supaFetch, requireClientScope } = require('../_lib/supabase.js');

// Client-assignable tasks / priorities. Each task can be tied to a client (who
// it's for) and optionally a team member (who does it), with a priority and due
// date. Automation-ready via the `source` field (manual | automation).
const SELECT = 'select=*,client:crm_clients(id,business_name)';

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { clientId, all } = scope;
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const filter = all ? '' : `client_id=eq.${clientId}&`;
      const status = req.query.status ? `status=eq.${req.query.status}&` : '';
      const rows = await supaFetch(`crm_tasks?${filter}${status}${SELECT}&order=created_at.desc`);
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title is required' });
      const payload = {
        title: String(b.title).trim(),
        notes: b.notes || null,
        client_id: b.client_id || (all ? null : clientId) || null,
        assigned_to: b.assigned_to || null,
        assigned_to_name: b.assigned_to_name || null,
        priority: b.priority || 'normal',
        due_date: b.due_date || null,
        status: 'open',
        source: 'manual',
        created_by: scope.user?.id || null,
        created_by_name: scope.user?.email || null,
      };
      const result = await supaFetch(`crm_tasks?${SELECT}`, { method: 'POST', body: JSON.stringify(payload) });
      return res.status(201).json(Array.isArray(result) ? result[0] : result);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const b = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      for (const k of ['title', 'notes', 'client_id', 'assigned_to', 'assigned_to_name', 'priority', 'due_date', 'status']) {
        if (k in b) patch[k] = b[k];
      }
      if (b.status === 'done') patch.done_at = new Date().toISOString();
      if (b.status === 'open') patch.done_at = null;
      const result = await supaFetch(`crm_tasks?id=eq.${id}&${SELECT}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return res.json(Array.isArray(result) ? result[0] : result);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_tasks?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
