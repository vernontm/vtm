const { setCors, supaFetch } = require('../_lib/supabase.js');

// Vercel cron (every 15 min). Fires recurring email-blast automations
// (crm_email_automations) — e.g. the Wednesday in-person meetup reminder and
// the Monday webinar blast. For each active automation it checks the current
// time IN THE AUTOMATION'S TIMEZONE; when it's the right weekday and at/after
// the send hour, and it hasn't already gone out today, it creates + sends a
// MailerLite campaign to the configured group. `last_sent_period` (the tz date
// string) guards against double-sends within the same day.

// Current weekday (0=Sun..6=Sat), hour (0-23) and YYYY-MM-DD in a timezone.
function tzParts(timeZone, now) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', hour: '2-digit', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map(x => [x.type, x.value]));
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { weekday: WD[p.weekday], hour: parseInt(p.hour, 10) % 24, date: `${p.year}-${p.month}-${p.day}` };
}

// Create + instantly send a MailerLite campaign for one automation.
async function sendCampaign(apiKey, a) {
  const H = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' };
  const ml = (method, path, body) => fetch(`https://connect.mailerlite.com/api/${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });

  const looksHtml = /<[a-z][\s\S]*>/i.test(a.body);
  const inner = looksHtml
    ? a.body
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111">${a.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`;
  const content = `${inner}<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#888;margin-top:28px">You're receiving this because you subscribed to ${(a.from_name || 'us').replace(/</g, '&lt;')}.<br><a href="{$unsubscribe}" style="color:#888">Unsubscribe</a></p>`;

  const createRes = await ml('POST', 'campaigns', {
    name: `Auto: ${a.name} ${new Date().toISOString().slice(0, 10)}`.slice(0, 120),
    type: 'regular',
    groups: [String(a.group_id)],
    emails: [{ subject: a.subject, from_name: (a.from_name || 'Vernon Tech & Media'), from: a.from_email, content }],
  });
  const cj = await createRes.json().catch(() => ({}));
  if (!createRes.ok || !cj?.data?.id) throw new Error(cj?.message || `create failed ${createRes.status}`);
  const schedRes = await ml('POST', `campaigns/${cj.data.id}/schedule`, { delivery: 'instant' });
  if (!schedRes.ok) { const sj = await schedRes.json().catch(() => ({})); throw new Error(sj?.message || `schedule failed ${schedRes.status}`); }
  return cj.data.id;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cron auth (matches the other cron endpoints).
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers['authorization'] !== `Bearer ${expected}`) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const results = [];
  try {
    const autos = await supaFetch('crm_email_automations?active=eq.true&select=*') || [];
    for (const a of autos) {
      try {
        const { weekday, hour, date } = tzParts(a.timezone || 'America/Chicago', now);
        if (weekday !== a.weekday) continue;          // wrong day
        if (hour < a.send_hour) continue;             // not time yet
        if (a.last_sent_period === date) continue;    // already went out today

        const cfg = await supaFetch(`crm_email_config?client_id=eq.${a.client_id}&select=mailerlite_api_key`);
        const apiKey = cfg?.[0]?.mailerlite_api_key;
        if (!apiKey) { results.push({ id: a.id, skipped: 'no MailerLite key' }); continue; }

        const campaignId = await sendCampaign(apiKey, a);
        await supaFetch(`crm_email_automations?id=eq.${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ last_sent_period: date, last_sent_at: new Date().toISOString() }),
        });
        results.push({ id: a.id, name: a.name, sent: true, campaignId });
      } catch (err) {
        console.error('automation send error', a.id, err.message);
        results.push({ id: a.id, name: a.name, error: err.message });
      }
    }
    return res.json({ ok: true, ran: results.length, results, timestamp: now.toISOString() });
  } catch (err) {
    console.error('email-cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
