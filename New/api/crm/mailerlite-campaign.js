const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

// Send an email blast (regular campaign) to a MailerLite group.
//   GET  /api/crm/mailerlite-campaign?client_id=<uuid>
//        -> { from_name, from_email } defaults for pre-filling the composer
//   POST /api/crm/mailerlite-campaign
//        { client_id, group_id, subject, from_name, from_email, body, test_email? }
//        -> creates a regular campaign to that group and sends it instantly.
//
// Sending is admin-only — it emails real subscribers. The client confirms
// before this is ever called.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admins only' });

  const client_id = req.query?.client_id || req.body?.client_id;
  if (!client_id) return res.status(400).json({ error: 'client_id required' });
  const chk = await assertClientAccess(user, client_id);
  if (!chk.ok) return res.status(chk.status).json({ error: chk.error });

  const cfg = (await supaFetch(`crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key,from_name,from_email`))?.[0];
  const apiKey = cfg?.mailerlite_api_key;
  if (!apiKey) return res.status(400).json({ error: 'No MailerLite API key configured for this workspace.' });
  const H = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  const ml = (method, path, body) => fetch(`https://connect.mailerlite.com/api/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });

  try {
    if (req.method === 'GET') {
      // Recent real blasts (exclude drafts + our [TEST] sends) for the history panel.
      let recent = [];
      try {
        const camps = (await (await ml('GET', 'campaigns?limit=25')).json())?.data || [];
        recent = camps
          .filter(c => c.status === 'sent' && !/^TEST:/i.test(c.name || ''))
          .map(c => ({
            id: String(c.id),
            subject: c.emails?.[0]?.subject || c.name || '(no subject)',
            recipients: c.emails?.[0]?.stats?.sent ?? 0,
            opens: c.emails?.[0]?.stats?.opens_count ?? 0,
            date: c.finished_at || c.scheduled_for || c.created_at || null,
          }))
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
          .slice(0, 6);
      } catch { /* history is best-effort */ }

      return res.json({
        from_name: cfg.from_name || 'Vernon Tech & Media',
        from_email: cfg.from_email || user.email || '',
        recent,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { group_id, subject, from_name, from_email, body, test_email } = req.body || {};
    const isTest = !!(test_email && test_email.trim());
    if (!isTest && !group_id) return res.status(400).json({ error: 'group_id required' });
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'subject required' });
    if (!from_email || !from_email.trim()) return res.status(400).json({ error: 'from_email required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });

    // Plain text -> simple HTML; leave real HTML untouched. Always append an
    // unsubscribe footer (MailerLite requires an unsubscribe link).
    const looksHtml = /<[a-z][\s\S]*>/i.test(body);
    const inner = looksHtml
      ? body
      : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`;
    const content = `${inner}<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888;margin-top:28px">You're receiving this because you subscribed to ${(from_name || 'us').replace(/</g, '&lt;')}.<br><a href="{$unsubscribe}" style="color:#888">Unsubscribe</a></p>`;

    // MailerLite has no test-send API. For a test, send the real campaign to a
    // dedicated single-recipient group ("CRM · Test Send") holding only the
    // tester, so the preview is a true MailerLite render but reaches no one else.
    let targetGroupId = group_id;
    if (isTest) {
      const email = test_email.trim();
      // Ensure the tester exists as an (active) subscriber.
      const subRes = await ml('POST', 'subscribers', { email });
      const subJson = await subRes.json().catch(() => ({}));
      const subId = subJson?.data?.id;
      if (!subId) return res.status(502).json({ error: `Couldn't prepare test recipient: ${subJson?.message || 'unknown error'}` });

      // Find or create the test group.
      const groupsList = (await (await ml('GET', 'groups?limit=500')).json())?.data || [];
      let testGroup = groupsList.find(g => g.name === 'CRM · Test Send');
      if (!testGroup) {
        testGroup = (await (await ml('POST', 'groups', { name: 'CRM · Test Send' })).json())?.data;
      }
      if (!testGroup?.id) return res.status(502).json({ error: 'Could not create the test group.' });

      // Strip any stale members so ONLY the tester receives it.
      let cursor = null;
      do {
        const j = await (await ml('GET', `groups/${testGroup.id}/subscribers?limit=100${cursor ? `&cursor=${cursor}` : ''}`)).json();
        for (const s of (j?.data || [])) {
          if (String(s.id) !== String(subId)) await ml('DELETE', `subscribers/${s.id}/groups/${testGroup.id}`);
        }
        cursor = j?.meta?.next_cursor;
      } while (cursor);

      await ml('POST', `subscribers/${subId}/groups/${testGroup.id}`);
      targetGroupId = testGroup.id;
    }

    // 1) Create the regular campaign targeting the group.
    const createRes = await ml('POST', 'campaigns', {
      name: `${isTest ? 'TEST' : 'Blast'}: ${subject.trim().slice(0, 120)}`,
      type: 'regular',
      groups: [String(targetGroupId)],
      emails: [{
        subject: isTest ? `[TEST] ${subject.trim()}` : subject.trim(),
        from_name: (from_name || 'Vernon Tech & Media').trim(),
        from: from_email.trim(),
        content,
      }],
    });
    const createJson = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      const msg = createJson?.message || JSON.stringify(createJson).slice(0, 300);
      return res.status(502).json({ error: `MailerLite couldn't create the campaign: ${msg}` });
    }
    const campaignId = createJson?.data?.id;
    if (!campaignId) return res.status(502).json({ error: 'MailerLite did not return a campaign id.' });

    // 2) Schedule it for immediate delivery.
    const schedRes = await ml('POST', `campaigns/${campaignId}/schedule`, { delivery: 'instant' });
    const schedJson = await schedRes.json().catch(() => ({}));
    if (!schedRes.ok) {
      const msg = schedJson?.message || JSON.stringify(schedJson).slice(0, 300);
      // Common cause: unverified sender email/domain.
      return res.status(502).json({ error: `Campaign created but sending failed: ${msg}`, campaignId });
    }

    return res.json({ ok: true, test: isTest, campaignId, status: schedJson?.data?.status || 'sending' });
  } catch (err) {
    console.error('mailerlite-campaign error:', err);
    return res.status(500).json({ error: err.message });
  }
};
