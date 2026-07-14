import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';

// A Deal is the billable/legal container for a client (crm_clients): one
// agreement + one combined invoice, holding one or more projects. Projects
// point at a deal via crm_projects.deal_id; the combined invoice
// (deal-invoice.js) sums the deal's projects into a single Stripe invoice.
// NOTE: client_id here is a crm_clients.id (the rich client file), NOT the
// multi-tenant crm_content_clients id — so this endpoint is admin-scoped and
// filters by the client_id query param rather than requireClientScope.
export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id, client_id } = req.query;
  // Embed the deal's projects (FK crm_projects.deal_id -> crm_deals.id).
  const SELECT = 'select=*,projects:crm_projects(id,name,value,recurring_amount,billing_type,status,invoice_status)';

  try {
    if (req.method === 'GET') {
      if (id) {
        const [deal] = await supaFetch(`crm_deals?id=eq.${id}&${SELECT}`);
        return deal ? res.json(deal) : res.status(404).json({ error: 'Not found' });
      }
      const filter = client_id ? `client_id=eq.${client_id}&` : '';
      return res.json(await supaFetch(`crm_deals?${filter}archived=eq.false&${SELECT}&order=created_at.desc`));
    }

    if (req.method === 'POST') {
      const { project_ids, projects, ...body } = req.body || {};
      if (!body.client_id) return res.status(400).json({ error: 'client_id required' });
      const [deal] = await supaFetch('crm_deals', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
      });
      if (Array.isArray(project_ids) && project_ids.length && deal?.id) {
        const inList = project_ids.map(p => `"${p}"`).join(',');
        await supaFetch(`crm_projects?id=in.(${inList})`, { method: 'PATCH', body: JSON.stringify({ deal_id: deal.id }) }).catch(() => {});
      }
      const [full] = await supaFetch(`crm_deals?id=eq.${deal.id}&${SELECT}`);
      return res.status(201).json(full || deal);
    }

    if (req.method === 'PUT' && id) {
      const { id: _, project_ids, projects, ...data } = req.body || {};
      data.updated_at = new Date().toISOString();
      await supaFetch(`crm_deals?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      // Sync project membership when a project_ids set is supplied: attach these,
      // detach any previously-linked project not in the set (projects survive).
      if (Array.isArray(project_ids)) {
        const current = await supaFetch(`crm_projects?deal_id=eq.${id}&select=id`).catch(() => []);
        const keep = new Set(project_ids);
        const toDetach = (current || []).map(p => p.id).filter(pid => !keep.has(pid));
        if (project_ids.length) {
          const inList = project_ids.map(p => `"${p}"`).join(',');
          await supaFetch(`crm_projects?id=in.(${inList})`, { method: 'PATCH', body: JSON.stringify({ deal_id: id }) }).catch(() => {});
        }
        if (toDetach.length) {
          const inList = toDetach.map(p => `"${p}"`).join(',');
          await supaFetch(`crm_projects?id=in.(${inList})`, { method: 'PATCH', body: JSON.stringify({ deal_id: null }) }).catch(() => {});
        }
      }
      const [full] = await supaFetch(`crm_deals?id=eq.${id}&${SELECT}`);
      return res.json(full || {});
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_projects?deal_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ deal_id: null }) }).catch(() => {});
      await supaFetch(`crm_deals?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM deals error:', err);
    return res.status(500).json({ error: err.message });
  }
}
