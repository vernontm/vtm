import { setCors, supaFetch, requireClientScope, assertClientAccess } from '../_lib/supabase.js';

// Activities are a timeline for leads/contacts. We scope by verifying the
// parent lead/contact belongs to the caller's client, and (where present)
// by client_id on the activity row itself.
export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { user, clientId, all } = scope;

  const { id, lead_id, contact_id } = req.query;

  // Helper: confirm the caller may touch this parent lead/contact.
  async function parentAllowed({ lead_id, contact_id }) {
    if (lead_id) {
      const rows = await supaFetch(`crm_leads?id=eq.${lead_id}&select=client_id`);
      const row = rows?.[0];
      if (!row) return { ok: false, status: 404, error: 'Lead not found' };
      const chk = await assertClientAccess(user, row.client_id);
      if (!chk.ok) return chk;
      return { ok: true, client_id: row.client_id };
    }
    if (contact_id) {
      const rows = await supaFetch(`crm_contacts?id=eq.${contact_id}&select=client_id`);
      const row = rows?.[0];
      if (!row) return { ok: false, status: 404, error: 'Contact not found' };
      const chk = await assertClientAccess(user, row.client_id);
      if (!chk.ok) return chk;
      return { ok: true, client_id: row.client_id };
    }
    return { ok: false, status: 400, error: 'lead_id or contact_id required' };
  }

  try {
    if (req.method === 'GET') {
      // Must specify a parent; admin w/o client scope still needs to verify ownership implicitly.
      if (!lead_id && !contact_id) {
        return res.status(400).json({ error: 'lead_id or contact_id required' });
      }
      const pa = await parentAllowed({ lead_id, contact_id });
      if (!pa.ok) return res.status(pa.status).json({ error: pa.error });

      let query = 'crm_activities?order=created_at.desc';
      if (lead_id) query += `&lead_id=eq.${lead_id}`;
      if (contact_id) query += `&contact_id=eq.${contact_id}`;
      return res.json(await supaFetch(query));
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const pa = await parentAllowed({ lead_id: body.lead_id, contact_id: body.contact_id });
      if (!pa.ok) return res.status(pa.status).json({ error: pa.error });
      // Stamp client_id from the verified parent; never trust body.client_id.
      const payload = { ...body, client_id: pa.client_id };
      const result = await supaFetch('crm_activities', { method: 'POST', body: JSON.stringify(payload) });
      return res.status(201).json(result?.[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      // Verify the activity's parent before deleting.
      const rows = await supaFetch(`crm_activities?id=eq.${id}&select=lead_id,contact_id,client_id`);
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.client_id) {
        const chk = await assertClientAccess(user, row.client_id);
        if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
      } else {
        const pa = await parentAllowed({ lead_id: row.lead_id, contact_id: row.contact_id });
        if (!pa.ok) return res.status(pa.status).json({ error: pa.error });
      }
      await supaFetch(`crm_activities?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM activities error:', err);
    return res.status(500).json({ error: err.message });
  }
}
