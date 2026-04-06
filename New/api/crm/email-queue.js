import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action, status, lead_id } = req.query;

  try {
    if (req.method === 'GET') {
      let query = 'crm_email_queue?order=created_at.desc';
      if (status) query += `&status=eq.${status}`;
      if (lead_id) query += `&lead_id=eq.${lead_id}`;
      return res.json(await supaFetch(query));
    }

    if (req.method === 'POST' && !action) {
      const result = await supaFetch('crm_email_queue', { method: 'POST', body: JSON.stringify(req.body) });
      return res.status(201).json(result[0] || result);
    }

    // Send/Draft actions - Gmail integration Phase 2
    if (req.method === 'POST' && (action === 'send' || action === 'draft') && id) {
      const newStatus = action === 'send' ? 'sent' : 'draft';
      const updates = { status: newStatus, updated_at: new Date().toISOString() };
      if (action === 'send') updates.sent_at = new Date().toISOString();
      if (action === 'draft') updates.approved_at = new Date().toISOString();
      await supaFetch(`crm_email_queue?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      return res.json({ success: true, status: newStatus });
    }

    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      data.updated_at = new Date().toISOString();
      const result = await supaFetch(`crm_email_queue?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    if (req.method === 'DELETE' && id) {
      await supaFetch(`crm_email_queue?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM email-queue error:', err);
    return res.status(500).json({ error: err.message });
  }
}
