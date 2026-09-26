const { setCors, requireStaff, supaFetch, assertClientAccess } = require('../_lib/supabase.js');

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

  const user = await requireStaff(req);
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
      // Full recent-campaigns feed for the Campaigns tab: sent, draft, and
      // scheduled — all categorized on the client. Stats come straight from
      // MailerLite so counts are always the source of truth.
      let all = [];
      try {
        const camps = (await (await ml('GET', 'campaigns?limit=100')).json())?.data || [];
        all = camps
          .filter(c => !/^TEST:/i.test(c.name || ''))
          .map(c => {
            const emailBlock = c.emails?.[0] || {};
            const stats     = emailBlock?.stats || {};
            const sent      = stats.sent || 0;
            const opens     = stats.opens_count || 0;
            const clicks    = stats.clicks_count || 0;
            return {
              id: String(c.id),
              status: c.status || 'draft',                          // sent | draft | ready | queued
              subject: emailBlock.subject || c.name || '(no subject)',
              from_name: emailBlock.from_name || '',
              from_email: emailBlock.from || '',
              recipients: sent,
              opens,
              clicks,
              open_rate:  sent ? +((opens / sent) * 100).toFixed(2) : 0,
              click_rate: sent ? +((clicks / sent) * 100).toFixed(2) : 0,
              ctor:       opens ? +((clicks / opens) * 100).toFixed(2) : 0,
              scheduled_for: c.scheduled_for || null,
              sent_at: c.finished_at || null,
              created_at: c.created_at || null,
              date: c.finished_at || c.scheduled_for || c.created_at || null,
            };
          })
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      } catch { /* best-effort */ }

      const recent = all.filter(c => c.status === 'sent').slice(0, 6);

      return res.json({
        from_name: cfg.from_name || 'Vernon Tech & Media',
        from_email: cfg.from_email || user.email || '',
        recent,
        campaigns: all,
      });
    }

    // ── DELETE — cancel a scheduled campaign, then delete it ────────────────
    // MailerLite won't delete a campaign that's still queued to send, so we
    // cancel it first (returns it to draft), then delete.
    if (req.method === 'DELETE') {
      const campaign_id = req.query?.campaign_id || req.body?.campaign_id;
      if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
      // Best-effort cancel (ignores 4xx if it's a draft / already sent).
      await ml('POST', `campaigns/${campaign_id}/cancel`).catch(() => {});
      const delRes = await ml('DELETE', `campaigns/${campaign_id}`);
      if (!delRes.ok && delRes.status !== 404) {
        const t = await delRes.text();
        return res.status(502).json({ error: `Couldn't delete campaign: ${t.slice(0, 200)}` });
      }
      return res.json({ ok: true, deleted: true });
    }

    // ── PUT — reschedule (and optionally re-time) a scheduled campaign ──────
    if (req.method === 'PUT') {
      const { campaign_id, scheduled_at, subject: newSubject } = req.body || {};
      if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
      const when = scheduled_at ? new Date(scheduled_at) : null;
      if (!when || isNaN(when.getTime()) || when.getTime() <= Date.now() + 60_000) {
        return res.status(400).json({ error: 'scheduled_at must be a valid future time (at least 1 minute out).' });
      }
      // Optionally update the subject line before re-scheduling.
      if (newSubject && newSubject.trim()) {
        await ml('PUT', `campaigns/${campaign_id}`, {
          emails: [{ subject: newSubject.trim() }],
        }).catch(() => {});
      }
      // Cancel the current schedule so we can set a new one.
      await ml('POST', `campaigns/${campaign_id}/cancel`).catch(() => {});
      const schedRes = await ml('POST', `campaigns/${campaign_id}/schedule`, {
        delivery: 'scheduled',
        schedule: {
          date:    when.toISOString().slice(0, 10),
          hours:   String(when.getUTCHours()).padStart(2, '0'),
          minutes: String(when.getUTCMinutes()).padStart(2, '0'),
          timezone_id: 116, // UTC
        },
      });
      const schedJson = await schedRes.json().catch(() => ({}));
      if (!schedRes.ok) {
        return res.status(502).json({ error: `Couldn't reschedule: ${schedJson?.message || 'unknown error'}` });
      }
      return res.json({ ok: true, rescheduled: true, scheduled_at: when.toISOString() });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { group_id, subject, from_name, from_email, body, test_email, scheduled_at } = req.body || {};
    const isTest = !!(test_email && test_email.trim());
    // Optional scheduled delivery: ISO string in the future. Tests always send now.
    const scheduleISO = !isTest && scheduled_at ? String(scheduled_at) : null;
    const scheduleDate = scheduleISO ? new Date(scheduleISO) : null;
    if (scheduleDate && (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now() + 60_000)) {
      return res.status(400).json({ error: 'scheduled_at must be a valid future timestamp (at least 1 minute out).' });
    }
    if (!isTest && !group_id) return res.status(400).json({ error: 'group_id required' });
    // "all" targets every group at once (deduped by MailerLite).
    const sendToAll = !isTest && group_id === 'all';
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'subject required' });
    if (!from_email || !from_email.trim()) return res.status(400).json({ error: 'from_email required' });
    if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });

    // Plain text -> simple HTML; leave real HTML untouched. Always append an
    // unsubscribe footer (MailerLite requires an unsubscribe link).
    // Markdown links [text](url) become real anchors, and bare URLs are linked,
    // so a blast can carry an uploaded file/link with custom clickable text.
    const looksHtml = /<[a-z][\s\S]*>/i.test(body);
    const mdToHtml = (text) => {
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
      let out = '', last = 0, m;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) out += esc(text.slice(last, m.index));
        const label = m[1] && m[2] ? m[1] : m[3];
        const url = m[1] && m[2] ? m[2] : m[3];
        out += `<a href="${esc(url)}" style="color:#2563eb;text-decoration:underline">${esc(label)}</a>`;
        last = re.lastIndex;
      }
      if (last < text.length) out += esc(text.slice(last));
      return out.replace(/\r?\n/g, '<br>');
    };
    const inner = looksHtml
      ? body
      : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">${mdToHtml(body)}</div>`;
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

    // Resolve the target groups. "all" = every group in the account (MailerLite
    // dedupes subscribers who belong to more than one).
    let targetGroups;
    if (sendToAll) {
      const allGroups = (await (await ml('GET', 'groups?limit=500')).json())?.data || [];
      targetGroups = allGroups
        .filter(g => g.name !== 'CRM · Test Send')   // never blast the test group
        .map(g => String(g.id));
      if (!targetGroups.length) return res.status(400).json({ error: 'No groups to send to.' });
    } else {
      targetGroups = [String(targetGroupId)];
    }

    // 1) Create the regular campaign targeting the group(s).
    const namePrefix = isTest ? 'TEST' : (scheduleDate ? 'Scheduled' : 'Blast');
    const createRes = await ml('POST', 'campaigns', {
      name: `${namePrefix}: ${subject.trim().slice(0, 120)}`,
      type: 'regular',
      groups: targetGroups,
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

    // 2) Schedule it — either for immediate delivery or a specific future time.
    const scheduleBody = scheduleDate
      ? {
          delivery: 'scheduled',
          schedule: {
            // MailerLite expects LOCAL wall-clock components + timezone_id, but
            // for cross-account portability we ship UTC parts and let ML infer.
            date:    scheduleDate.toISOString().slice(0, 10),
            hours:   String(scheduleDate.getUTCHours()).padStart(2, '0'),
            minutes: String(scheduleDate.getUTCMinutes()).padStart(2, '0'),
            timezone_id: 116, // UTC
          },
        }
      : { delivery: 'instant' };
    const schedRes = await ml('POST', `campaigns/${campaignId}/schedule`, scheduleBody);
    const schedJson = await schedRes.json().catch(() => ({}));
    if (!schedRes.ok) {
      const msg = schedJson?.message || JSON.stringify(schedJson).slice(0, 300);
      // Common cause: unverified sender email/domain.
      return res.status(502).json({ error: `Campaign created but sending failed: ${msg}`, campaignId });
    }

    return res.json({
      ok: true,
      test: isTest,
      campaignId,
      scheduled: !!scheduleDate,
      scheduled_at: scheduleDate ? scheduleDate.toISOString() : null,
      status: schedJson?.data?.status || (scheduleDate ? 'scheduled' : 'sending'),
    });
  } catch (err) {
    console.error('mailerlite-campaign error:', err);
    return res.status(500).json({ error: err.message });
  }
};
