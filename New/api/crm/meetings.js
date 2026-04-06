import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    // GET meetings
    if (req.method === 'GET') {
      if (action === 'upcoming') {
        const now = new Date().toISOString();
        return res.json(await supaFetch(`crm_meetings?start_time=gte.${now}&order=start_time.asc`));
      }
      if (action === 'past') {
        const now = new Date().toISOString();
        return res.json(await supaFetch(`crm_meetings?start_time=lt.${now}&order=start_time.desc&limit=50`));
      }
      if (action === 'lead-links') {
        return res.json(await supaFetch('crm_meeting_lead_links?order=created_at.desc'));
      }
      if (action === 'detail' && id) {
        const [meeting] = await supaFetch(`crm_meetings?id=eq.${id}`);
        if (!meeting) return res.status(404).json({ error: 'Not found' });
        const [summary] = await supaFetch(`crm_meeting_summaries?meeting_id=eq.${id}&order=created_at.desc&limit=1`);
        const chatHistory = await supaFetch(`crm_meeting_chat_history?meeting_id=eq.${id}&order=created_at.asc`);
        const leadLinks = await supaFetch(`crm_meeting_lead_links?meeting_id=eq.${id}`);
        return res.json({ ...meeting, summary: summary || null, chatHistory, leadLinks });
      }
      // Default: all meetings
      return res.json(await supaFetch('crm_meetings?order=start_time.desc'));
    }

    // POST actions
    if (req.method === 'POST') {
      if (action === 'sync') {
        // Calendar sync placeholder - Phase 4
        return res.json({ message: 'Calendar sync will be available after Google OAuth setup', synced: 0 });
      }
      if (action === 'create') {
        // Calendar event creation placeholder - Phase 4
        const result = await supaFetch('crm_meetings', { method: 'POST', body: JSON.stringify(req.body) });
        return res.status(201).json(result[0] || result);
      }
      if (action === 'lead-link') {
        const result = await supaFetch('crm_meeting_lead_links', { method: 'POST', body: JSON.stringify(req.body) });
        return res.status(201).json(result[0] || result);
      }
      if (action === 'summarize' && id) {
        // AI summary placeholder - Phase 4
        return res.json({ message: 'Meeting summarization will be available in Phase 4' });
      }
      if (action === 'ask' && id) {
        // AI sidekick placeholder - Phase 4
        return res.json({ message: 'Meeting AI assistant will be available in Phase 4' });
      }
    }

    // PATCH notes
    if (req.method === 'PATCH' && id && action === 'notes') {
      const { notes } = req.body;
      await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
      return res.json({ success: true });
    }

    // PUT meeting
    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      const result = await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    // DELETE
    if (req.method === 'DELETE' && id) {
      if (action === 'lead-link') {
        await supaFetch(`crm_meeting_lead_links?id=eq.${id}`, { method: 'DELETE' });
      } else if (action === 'chat') {
        await supaFetch(`crm_meeting_chat_history?meeting_id=eq.${id}`, { method: 'DELETE' });
      } else {
        await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'DELETE' });
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM meetings error:', err);
    return res.status(500).json({ error: err.message });
  }
}
