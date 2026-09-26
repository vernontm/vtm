const { setCors, requireStaff, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

// Minimal MailerLite groups listing — used by the broadcast composer's
// "Send to" dropdown. Returns [{ id, name, total }, ...] for the client's key.
//
// GET /api/crm/mailerlite-groups?client_id=<uuid>
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });

  const user = await requireStaff(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tenant guard on any referenced client_id
  const client_id = req.query?.client_id || req.body?.client_id;
  if (client_id) {
    const chk = await assertClientAccess(user, client_id);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
  }

  try {
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    const rows = await supaFetch(
      `crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key`
    );
    const apiKey = rows?.[0]?.mailerlite_api_key;
    if (!apiKey) return res.status(400).json({ error: 'No MailerLite API key configured' });

    // ── POST — create a new group ──────────────────────────────────────────
    if (req.method === 'POST') {
      const name = (req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Group name required' });
      const createRes = await fetch('https://connect.mailerlite.com/api/groups', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const createJson = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        const msg = createJson?.message || JSON.stringify(createJson).slice(0, 200);
        return res.status(502).json({ error: `Couldn't create group: ${msg}` });
      }
      const g = createJson?.data || {};
      return res.status(201).json({ group: { id: String(g.id), name: g.name, total: 0, active: 0 } });
    }

    // Fetch first 100 groups — plenty for any sane setup
    const mlRes = await fetch('https://connect.mailerlite.com/api/groups?limit=100&sort=name', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });
    if (!mlRes.ok) {
      const txt = await mlRes.text();
      return res.status(502).json({ error: `MailerLite returned ${mlRes.status}: ${txt.slice(0, 300)}` });
    }
    const data = await mlRes.json();
    const groups = (data?.data || []).map(g => ({
      id: String(g.id),
      name: g.name,
      // MailerLite doesn't return a plain `total`; active_count is the real number.
      total: g.total ?? g.active_count ?? 0,
      active: g.active_count || 0,
    }));
    return res.json({ groups });
  } catch (err) {
    console.error('mailerlite-groups error:', err);
    return res.status(500).json({ error: err.message });
  }
};
