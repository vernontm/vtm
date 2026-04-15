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
      // Campaign sends
      const sends = await supaFetch(`crm_email_sends?contact_id=eq.${contact_id}&order=created_at.desc&limit=200`);
      const campaignIds = [...new Set((sends || []).map(s => s.campaign_id).filter(Boolean))];
      let campaigns = [];
      if (campaignIds.length) {
        campaigns = await supaFetch(`crm_email_campaigns?id=in.(${campaignIds.join(',')})&select=id,subject`);
      }
      const subjMap = {};
      for (const c of (campaigns || [])) subjMap[c.id] = c.subject;
      const campaignHistory = (sends || []).map(s => ({
        ...s,
        subject: subjMap[s.campaign_id] || '',
        source: 'campaign',
      }));

      // Sequence sends
      const seqSends = await supaFetch(`crm_email_sequence_sends?contact_id=eq.${contact_id}&order=created_at.desc&limit=200`);
      const stepIds = [...new Set((seqSends || []).map(s => s.step_id).filter(Boolean))];
      let steps = [];
      if (stepIds.length) {
        steps = await supaFetch(`crm_email_sequence_steps?id=in.(${stepIds.join(',')})&select=id,subject,step_order,sequence_id`);
      }
      const stepMap = {};
      for (const st of (steps || [])) stepMap[st.id] = st;
      const sequenceHistory = (seqSends || []).map(s => ({
        ...s,
        subject: stepMap[s.step_id]?.subject || '',
        step_order: stepMap[s.step_id]?.step_order || null,
        source: 'sequence',
      }));

      const combined = [...campaignHistory, ...sequenceHistory].sort((a, b) => {
        const da = new Date(a.sent_at || a.created_at || 0).getTime();
        const db = new Date(b.sent_at || b.created_at || 0).getTime();
        return db - da;
      });
      return res.json(combined);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // GET ?action=contact-stats&client_id=... — per-contact aggregate counts
  // Aggregates both campaign sends (crm_email_sends) AND sequence sends
  // (crm_email_sequence_sends) so a contact who only got sequence emails still
  // has a non-zero SENT/OPENED on the contacts table.
  if (action === 'contact-stats') {
    try {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const stats = {};
      const bump = (contactId, key) => {
        if (!contactId) return;
        if (!stats[contactId]) stats[contactId] = { sent: 0, failed: 0, opened: 0, clicked: 0 };
        stats[contactId][key]++;
      };

      // Campaign sends scoped by client's campaigns
      const campaigns = await supaFetch(`crm_email_campaigns?client_id=eq.${client_id}&select=id`);
      const campaignIds = (campaigns || []).map(c => c.id);
      if (campaignIds.length) {
        const sends = await supaFetch(
          `crm_email_sends?campaign_id=in.(${campaignIds.join(',')})&select=contact_id,status,opened_at,clicked_at`
        );
        for (const s of (sends || [])) {
          if (s.status === 'sent' || s.status === 'delivered') bump(s.contact_id, 'sent');
          if (s.status === 'failed' || s.status === 'bounced') bump(s.contact_id, 'failed');
          if (s.opened_at) bump(s.contact_id, 'opened');
          if (s.clicked_at) bump(s.contact_id, 'clicked');
        }
      }

      // Sequence sends scoped by client's sequences
      const sequences = await supaFetch(`crm_email_sequences?client_id=eq.${client_id}&select=id`);
      const sequenceIds = (sequences || []).map(s => s.id);
      if (sequenceIds.length) {
        const seqSends = await supaFetch(
          `crm_email_sequence_sends?sequence_id=in.(${sequenceIds.join(',')})&select=contact_id,status,opened_at,clicked_at`
        );
        for (const s of (seqSends || [])) {
          if (s.status === 'sent' || s.status === 'delivered') bump(s.contact_id, 'sent');
          if (s.status === 'failed' || s.status === 'bounced') bump(s.contact_id, 'failed');
          if (s.opened_at) bump(s.contact_id, 'opened');
          if (s.clicked_at) bump(s.contact_id, 'clicked');
        }
      }

      return res.json(stats);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
};
