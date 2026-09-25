const { setCors, requireCrmUser } = require('../_lib/supabase.js');
const N = require('../_lib/nudges.js');

// Nudges: remind a client about money or a signature they are sitting on.
//
//   POST /api/crm/nudges?action=draft   { kind, id }
//        -> { target, channels, template_key, message, email_subject, history }
//   POST /api/crm/nudges                { kind, id, channels:['text','email'], message, email_subject?, schedule_at? }
//        -> { ok, sent, skipped, nudge_id }   (a future schedule_at is stored and followups-cron.js sends it)
//   GET  /api/crm/nudges?kind=&id=      -> { history: [...] }
//
// kind is invoice | manual_invoice | payment | agreement | plan. A text goes
// out as a queued iMessage (the Mac bridge delivers it), an email through
// Gmail. Every send is logged in crm_nudges (docs/sql/role-homes.sql): sends
// answer 503 with needs_migration until that table exists, reads simply
// carry no history yet.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const action = String(req.query.action || '');

  // History is a nice-to-have on reads: no table yet means an empty list.
  const historyFor = async (kind, id) => {
    try { return { history: await N.history(kind, id) }; }
    catch (e) { if (N.missingNudges(e)) return { history: [], needs_migration: true }; throw e; }
  };

  try {
    if (req.method === 'GET') {
      const { kind, id } = req.query;
      if (!N.KINDS.includes(kind) || !N.safeId(id)) return res.status(400).json({ error: 'kind and id required' });
      return res.json(await historyFor(kind, id));
    }

    if (req.method === 'POST' && action === 'draft') {
      const { kind, id } = req.body || {};
      const target = await N.resolveTarget(kind, id);
      if (!target) return res.status(404).json({ error: 'Nothing to nudge about: that record was not found.' });
      const draft = await N.buildDraft(target);
      return res.json({ target, channels: N.channelsFor(target), ...draft, ...(await historyFor(kind, id)) });
    }

    if (req.method === 'POST') {
      const { kind, id, channels, message, email_subject, schedule_at } = req.body || {};
      const chans = [...new Set((Array.isArray(channels) ? channels : []).filter(c => c === 'text' || c === 'email'))];
      if (!chans.length) return res.status(400).json({ error: 'Pick text, email, or both.' });
      const text = String(message || '').trim();
      if (!text) return res.status(400).json({ error: 'message required' });
      const target = await N.resolveTarget(kind, id);
      if (!target) return res.status(404).json({ error: 'Nothing to nudge about: that record was not found.' });
      const subject = String(email_subject || '').trim().slice(0, 200) || N.defaultSubject(target);
      const row = {
        kind, target_id: String(id), client_id: target.client_id || null,
        channels: chans, message: text, email_subject: chans.includes('email') ? subject : null,
        sent_by: user.id, sent_by_name: await N.nameForUser(user),
      };

      // Later than a minute from now: park it for the cron.
      if (schedule_at) {
        const when = new Date(schedule_at);
        if (isNaN(when)) return res.status(400).json({ error: 'schedule_at must be a date' });
        if (when.getTime() > Date.now() + 60 * 1000) {
          const saved = await N.logNudge({ ...row, status: 'scheduled', scheduled_at: when.toISOString() });
          return res.status(201).json({ ok: true, sent: [], skipped: [], scheduled_at: when.toISOString(), nudge_id: saved && saved.id });
        }
      }

      // Log first, so a missing table stops us before anything goes out.
      const saved = await N.logNudge({ ...row, status: 'sending' });
      const { sent, skipped } = await N.deliver({ target, channels: chans, message: text, subject });
      await N.updateNudge(saved.id, { status: sent.length ? 'sent' : 'failed', channels: sent.length ? sent : chans, sent_at: new Date().toISOString() });
      return res.json({ ok: sent.length > 0, sent, skipped, nudge_id: saved.id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (N.missingNudges(err)) return res.status(503).json({ error: N.MIGRATION_MSG, needs_migration: true });
    console.error('nudges error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
