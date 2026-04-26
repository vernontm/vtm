const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');
const ML = require('../_lib/mailerlite.js');

// Per-contact send stats and send history
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tenant guard on any referenced client_id
  {
    const refClient = req.query?.client_id || req.body?.client_id;
    if (refClient) {
      const chk = await assertClientAccess(user, refClient);
      if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
    }
  }

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

      // (Local sequence sends were removed — MailerLite Automations handle drips.)
      const combined = [...campaignHistory].sort((a, b) => {
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
  // pulled live from MailerLite. We fetch every subscriber visible to the
  // client's API key (cached for 5 min in mailerlite.js) and join on email
  // OR mailerlite_subscriber_id, whichever the local contact has.
  // Returned shape: { [contact_id]: { sent, opened, clicked, failed } }
  if (action === 'contact-stats') {
    try {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });

      const cfgRows = await supaFetch(
        `crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key`
      );
      const apiKey = cfgRows?.[0]?.mailerlite_api_key;
      const stats = {};
      if (!apiKey) return res.json(stats); // no key configured → empty stats

      const contacts = await supaFetch(
        `crm_email_contacts?client_id=eq.${client_id}&select=id,email,mailerlite_subscriber_id`
      );
      if (!contacts?.length) return res.json(stats);

      const { byEmail, bySubId } = await ML.getContactStatsFromMailerlite(apiKey, client_id);
      for (const c of contacts) {
        const stat =
          (c.mailerlite_subscriber_id && bySubId.get(String(c.mailerlite_subscriber_id))) ||
          (c.email && byEmail.get(String(c.email).toLowerCase())) ||
          null;
        if (stat) stats[c.id] = stat;
      }
      return res.json(stats);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
};
