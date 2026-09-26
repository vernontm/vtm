const { setCors, requireStaff, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

// Live MailerLite subscribers for a client's account — the real marketing
// audience shown on the Marketing > Contacts page.
//   GET /api/crm/mailerlite-subscribers?client_id=<uuid>&group_id=<optional>&limit=200
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ error: 'GET or PUT only' });

  const user = await requireStaff(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const refClient = req.query?.client_id || req.body?.client_id;
  if (refClient) {
    const chk = await assertClientAccess(user, refClient);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
  }

  try {
    // ── PUT — edit a subscriber (name, email, phone, notes) ────────────────
    if (req.method === 'PUT') {
      if (!user.is_admin) return res.status(403).json({ error: 'Admins only' });
      const { client_id, subscriber_id, email, name, last_name, phone, company, notes } = req.body || {};
      if (!client_id || !subscriber_id) return res.status(400).json({ error: 'client_id and subscriber_id required' });
      const cfg = await supaFetch(`crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key`);
      const key = cfg?.[0]?.mailerlite_api_key;
      if (!key) return res.status(400).json({ error: 'No MailerLite API key configured.' });

      // Build the fields object — only include what was provided.
      const fields = {};
      if (name !== undefined)      fields.name = name;
      if (last_name !== undefined) fields.last_name = last_name;
      if (phone !== undefined)     fields.phone = phone;
      if (company !== undefined)   fields.company = company;
      const payload = { fields };
      if (email && email.trim()) payload.email = email.trim().toLowerCase();

      const upRes = await fetch(`https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(subscriber_id)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const upJson = await upRes.json().catch(() => ({}));
      if (!upRes.ok) {
        const msg = upJson?.message || Object.values(upJson?.errors || {}).flat().join('; ') || `MailerLite ${upRes.status}`;
        return res.status(502).json({ error: `Couldn't update contact: ${msg}` });
      }
      const s = upJson?.data || {};
      // Mirror into the CRM contacts table if the email exists there.
      try {
        const patchBody = {};
        if (name !== undefined) patchBody.name = name;
        if (phone !== undefined) patchBody.phone = phone;
        if (Object.keys(patchBody).length) {
          await supaFetch(`crm_email_contacts?client_id=eq.${client_id}&email=eq.${encodeURIComponent(s.email || email || '')}`, {
            method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patchBody),
          }).catch(() => {});
        }
      } catch {}
      return res.json({
        subscriber: {
          id: String(s.id), email: s.email, name: s.fields?.name || '', phone: s.fields?.phone || '',
          company: s.fields?.company || '', status: s.status,
        },
      });
    }

    const { client_id, group_id } = req.query;
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    // Hard cap so a huge list can't run forever; 5000 covers any real audience.
    const maxTotal = Math.min(parseInt(req.query.limit || '5000', 10) || 5000, 10000);

    const rows = await supaFetch(`crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key`);
    const apiKey = rows?.[0]?.mailerlite_api_key;
    if (!apiKey) return res.status(400).json({ error: 'No MailerLite API key configured for this workspace.' });

    const mlHeaders = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };
    const base = group_id
      ? `groups/${encodeURIComponent(group_id)}/subscribers`
      : `subscribers`;

    // Walk cursor pagination until we've pulled every subscriber (or hit the cap).
    // The old code fetched only the first page, so "All contacts" was stuck at
    // ~200 even when a single group had 265.
    const allData = [];
    let cursor = null;
    let firstStatus = null;
    for (let page = 0; page < 200 && allData.length < maxTotal; page++) {
      const url = `https://connect.mailerlite.com/api/${base}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const pageRes = await fetch(url, { headers: mlHeaders });
      firstStatus = pageRes.status;
      if (!pageRes.ok) {
        if (page === 0) {
          const txt = await pageRes.text();
          return res.status(502).json({ error: `MailerLite returned ${pageRes.status}: ${txt.slice(0, 300)}` });
        }
        break; // partial results are better than none
      }
      const j = await pageRes.json();
      const batch = j?.data || [];
      allData.push(...batch);
      cursor = j?.meta?.next_cursor;
      if (!cursor || batch.length === 0) break;
    }
    const data = { data: allData };

    // MailerLite's list endpoint omits group membership (only the single-
    // subscriber GET has it). Build a subscriber_id -> [group names] map by
    // walking each group's members, then attach it. Cheap for a handful of
    // groups; skipped when already filtered to one group.
    let groupMap = {};
    const returnedIds = new Set((data?.data || []).map(s => String(s.id)));
    if (!group_id && returnedIds.size) {
      const groups = (await (await fetch(`https://connect.mailerlite.com/api/groups?limit=500`, { headers: mlHeaders })).json())?.data || [];
      for (const g of groups) {
        let cursor = null;
        for (;;) {
          const url = `https://connect.mailerlite.com/api/groups/${g.id}/subscribers?limit=100${cursor ? `&cursor=${cursor}` : ''}`;
          const j = await (await fetch(url, { headers: mlHeaders })).json();
          for (const s of (j?.data || [])) {
            const sid = String(s.id);
            if (returnedIds.has(sid)) (groupMap[sid] = groupMap[sid] || []).push(g.name);
          }
          cursor = j?.meta?.next_cursor;
          if (!cursor || !(j?.data || []).length) break;
        }
      }
    }

    const subscribers = (data?.data || []).map(s => ({
      id: String(s.id),
      email: s.email,
      name: s.fields?.name || [s.fields?.name, s.fields?.last_name].filter(Boolean).join(' ') || '',
      last_name: s.fields?.last_name || '',
      phone: s.fields?.phone || '',
      company: s.fields?.company || '',
      status: s.status,                              // active | unsubscribed | unconfirmed | bounced | junk
      subscribed_at: s.subscribed_at || s.created_at || null,
      opens: s.opens_count ?? null,
      clicks: s.clicks_count ?? null,
      groups: groupMap[String(s.id)] || (s.groups || []).map(g => (typeof g === 'object' ? g.name : g)).filter(Boolean),
    }));
    // We paginated through everything, so the real count is what we collected.
    return res.json({ subscribers, total: subscribers.length });
  } catch (err) {
    console.error('mailerlite-subscribers error:', err);
    return res.status(500).json({ error: err.message });
  }
};
