const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

// Live MailerLite subscribers for a client's account — the real marketing
// audience shown on the Marketing > Contacts page.
//   GET /api/crm/mailerlite-subscribers?client_id=<uuid>&group_id=<optional>&limit=200
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const refClient = req.query?.client_id;
  if (refClient) {
    const chk = await assertClientAccess(user, refClient);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
  }

  try {
    const { client_id, group_id } = req.query;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 500);

    const rows = await supaFetch(`crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key`);
    const apiKey = rows?.[0]?.mailerlite_api_key;
    if (!apiKey) return res.status(400).json({ error: 'No MailerLite API key configured for this workspace.' });

    const path = group_id
      ? `groups/${encodeURIComponent(group_id)}/subscribers?limit=${limit}`
      : `subscribers?limit=${limit}`;
    const mlRes = await fetch(`https://connect.mailerlite.com/api/${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!mlRes.ok) {
      const txt = await mlRes.text();
      return res.status(502).json({ error: `MailerLite returned ${mlRes.status}: ${txt.slice(0, 300)}` });
    }
    const data = await mlRes.json();
    const subscribers = (data?.data || []).map(s => ({
      id: String(s.id),
      email: s.email,
      name: s.fields?.name || [s.fields?.name, s.fields?.last_name].filter(Boolean).join(' ') || '',
      status: s.status,                              // active | unsubscribed | unconfirmed | bounced | junk
      subscribed_at: s.subscribed_at || s.created_at || null,
      opens: s.opens_count ?? null,
      clicks: s.clicks_count ?? null,
      groups: (s.groups || []).map(g => (typeof g === 'object' ? g.name : g)).filter(Boolean),
    }));
    // MailerLite paginates via cursor; the true count is under meta.total.
    const grandTotal = data?.total ?? data?.meta?.total ?? subscribers.length;
    return res.json({ subscribers, total: grandTotal });
  } catch (err) {
    console.error('mailerlite-subscribers error:', err);
    return res.status(500).json({ error: err.message });
  }
};
