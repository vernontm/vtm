const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// Per-contact send stats and send history
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'GET') return res.status(400).json({ error: 'Invalid method' });

  const { action, client_id, contact_id } = req.query;

  // GET ?action=contact-sends&contact_id=... — list sends for one contact
  if (action === 'contact-sends') {
    try {
      if (!contact_id) return res.status(400).json({ error: 'contact_id required' });
      const sends = await supaFetch(`crm_email_sends?contact_id=eq.${contact_id}&order=created_at.desc&limit=200`);
      // Attach campaign subjects
      const campaignIds = [...new Set((sends || []).map(s => s.campaign_id).filter(Boolean))];
      let campaigns = [];
      if (campaignIds.length) {
        campaigns = await supaFetch(`crm_email_campaigns?id=in.(${campaignIds.join(',')})&select=id,subject`);
      }
      const subjMap = {};
      for (const c of (campaigns || [])) subjMap[c.id] = c.subject;
      const enriched = (sends || []).map(s => ({ ...s, subject: subjMap[s.campaign_id] || '' }));
      return res.json(enriched);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET ?action=contact-stats&client_id=... — per-contact aggregate counts
  if (action === 'contact-stats') {
    try {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      // Get all sends for this client's campaigns
      const campaigns = await supaFetch(`crm_email_campaigns?client_id=eq.${client_id}&select=id`);
      const campaignIds = (campaigns || []).map(c => c.id);
      if (!campaignIds.length) return res.json({});
      const sends = await supaFetch(`crm_email_sends?campaign_id=in.(${campaignIds.join(',')})&select=contact_id,status,opened_at`);
      const stats = {};
      for (const s of (sends || [])) {
        if (!s.contact_id) continue;
        if (!stats[s.contact_id]) stats[s.contact_id] = { sent: 0, failed: 0, opened: 0 };
        if (s.status === 'sent') stats[s.contact_id].sent++;
        if (s.status === 'failed') stats[s.contact_id].failed++;
        if (s.opened_at) stats[s.contact_id].opened++;
      }
      return res.json(stats);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
};
