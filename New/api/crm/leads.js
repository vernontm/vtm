import { setCors, supaFetch, requireClientScope } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const { clientId, all } = scope;

  const { id, action } = req.query;
  // Used to filter GET list + verify PUT/DELETE targets. When admin has no
  // client selected (all=true) we skip tenant filtering entirely.
  const scopeFilter = all ? '' : `&client_id=eq.${clientId}`;

  try {
    // POST /api/crm/leads?action=bulk
    if (req.method === 'POST' && action === 'bulk') {
      if (!clientId) return res.status(400).json({ error: 'X-Client-Id header required for bulk import' });
      const { leads: rows } = req.body;
      if (!Array.isArray(rows) || rows.length === 0)
        return res.status(400).json({ error: 'No leads provided' });

      const SURVEY_FIELDS = [
        'submission_date','budget','time_available','location','tiktok_handle',
        'has_business','website','social_media','current_situation','financial_goal',
        'why_now','skills_story','previous_attempts','biggest_fear','tech_comfort',
        'content_preference','work_style','biggest_wish',
      ];

      // Dedup within the current tenant only
      const existing = await supaFetch(`crm_leads?select=id,email&client_id=eq.${clientId}`);
      const emailMap = {};
      existing.forEach(l => { if (l.email) emailMap[l.email.toLowerCase()] = l.id; });

      let created = 0, updated = 0, skipped = 0;
      for (const row of rows) {
        if (!row.name) continue;
        const emailKey = (row.email || '').trim().toLowerCase();
        const existingId = emailKey ? emailMap[emailKey] : null;

        if (existingId) {
          const updates = {};
          [...['name','email','phone','company','title','lead_source','notes'], ...SURVEY_FIELDS].forEach(f => {
            const v = (row[f] || '').toString().trim();
            if (v) updates[f] = v;
          });
          if (Object.keys(updates).length > 0) {
            updates.updated_at = new Date().toISOString();
            await supaFetch(`crm_leads?id=eq.${existingId}&client_id=eq.${clientId}`, {
              method: 'PATCH', body: JSON.stringify(updates),
            });
            updated++;
          } else skipped++;
        } else {
          const lead = { name: row.name.trim(), status: row.status || 'New Lead', client_id: clientId };
          ['email','phone','company','title','lead_source','notes', ...SURVEY_FIELDS].forEach(f => {
            lead[f] = (row[f] || '').toString().trim();
          });
          await supaFetch('crm_leads', { method: 'POST', body: JSON.stringify(lead) });
          created++;
        }
      }
      return res.status(201).json({ created, updated, skipped, total: created + updated + skipped });
    }

    // POST /api/crm/leads?id=xxx&action=convert
    if (req.method === 'POST' && action === 'convert' && id) {
      const [lead] = await supaFetch(`crm_leads?id=eq.${id}${scopeFilter}`);
      if (!lead) return res.status(404).json({ error: 'Not found' });
      const contact = {
        name: lead.name, email: lead.email, phone: lead.phone,
        company: lead.company, title: lead.title, notes: lead.notes,
        client_id: lead.client_id,
      };
      const [newContact] = await supaFetch('crm_contacts', { method: 'POST', body: JSON.stringify(contact) });
      await supaFetch(`crm_leads?id=eq.${id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'Converted', updated_at: new Date().toISOString() }),
      });
      return res.json({ contact: newContact, message: 'Converted to contact' });
    }

    // GET /api/crm/leads or GET /api/crm/leads?id=xxx
    if (req.method === 'GET') {
      if (id) {
        const [lead] = await supaFetch(`crm_leads?id=eq.${id}${scopeFilter}`);
        return lead ? res.json(lead) : res.status(404).json({ error: 'Not found' });
      }
      const filter = all ? '' : `client_id=eq.${clientId}&`;
      const leads = await supaFetch(`crm_leads?${filter}order=created_at.desc`);
      return res.json(leads);
    }

    // POST /api/crm/leads (create)
    if (req.method === 'POST') {
      if (!clientId) return res.status(400).json({ error: 'X-Client-Id header required for create' });
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const payload = { ...req.body, client_id: clientId };
      const lead = await supaFetch('crm_leads', { method: 'POST', body: JSON.stringify(payload) });
      return res.status(201).json(lead[0] || lead);
    }

    // PUT /api/crm/leads?id=xxx
    if (req.method === 'PUT' && id) {
      const { id: _, client_id: __, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const lead = await supaFetch(`crm_leads?id=eq.${id}${scopeFilter}`, { method: 'PATCH', body: JSON.stringify(data) });
      if (!lead || (Array.isArray(lead) && lead.length === 0)) return res.status(404).json({ error: 'Not found' });
      return res.json(lead[0] || lead);
    }

    // DELETE /api/crm/leads?id=xxx
    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_leads?id=eq.${id}${scopeFilter}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM leads error:', err);
    return res.status(500).json({ error: err.message });
  }
}
