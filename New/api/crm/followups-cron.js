const { supaFetch } = require('../_lib/supabase.js');
const { missingTable } = require('../_lib/followups.js');
const { getAutomations, fillTemplate } = require('../_lib/automations.js');
const { sendDueNudges } = require('../_lib/nudges.js');

// Every few minutes (New/vercel.json): send every follow-up whose time has
// come. The text is drafted fresh by the assistant model (first name and the
// meeting it refers to), with a plain template if the model is unavailable,
// and queued as an outbound iMessage for the bridge to deliver. Scheduled
// nudges (crm/nudges.js) ride on the same run, as their own pass.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ASSISTANT_MODEL || 'claude-sonnet-5';
const FALLBACK_MODEL = 'claude-sonnet-4-5';
const stripDashes = (t) => String(t || '').replace(/[\u2013\u2014]/g, '-');
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

async function draft(model, system, prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 300, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
}

async function thankYouText(f, person, auto) {
  const name = firstName(person?.owner_name || person?.business_name);
  const business = person?.business_name && person.business_name !== person.owner_name ? person.business_name : '';
  const vars = { first_name: name, business, meeting_title: f.meeting_title || '', meeting_clause: f.meeting_title ? ` about ${f.meeting_title}` : '' };
  // The template is the message (template mode) or the style guide (assistant mode).
  const templated = fillTemplate(auto.thank_you.template, vars).replace(/^Hey\s*,/i, 'Hey,');
  if (auto.thank_you.mode !== 'assistant' || !ANTHROPIC_API_KEY) return templated;
  const system = 'You write short, warm iMessages from Ray at Vernon Tech & Media, a Katy, Texas web and media agency. One to three sentences, natural, no sign-off, no hashtags, no emoji, no placeholders. Reply with only the message text. Never use em dashes or en dashes.';
  const prompt = `Write the morning-after thank-you text for an in-person meetup we had yesterday.${name ? ` Their first name: ${name}.` : ''}${business ? ` Their business: ${business}.` : ''}${f.meeting_title ? ` The meeting was titled: ${f.meeting_title}.` : ''} Match the tone and length of this example, without copying it: "${templated}". Thank them for their time and leave the door open for questions or next steps. Keep it human, not salesy.`;
  try { return stripDashes(await draft(MODEL, system, prompt)) || templated; }
  catch (e) {
    if (/model/i.test(String(e.message))) { try { return stripDashes(await draft(FALLBACK_MODEL, system, prompt)) || templated; } catch (_) {} }
    return templated;
  }
}

// The follow-up pass: returns what the cron used to answer with.
async function sendDueFollowups() {
  const now = new Date().toISOString();
  const due = await supaFetch(`crm_followups?status=eq.scheduled&send_at=lte.${encodeURIComponent(now)}&select=*&order=send_at.asc&limit=50`) || [];
  const auto = await getAutomations();
  let sent = 0;
  for (const f of due) {
    // Switched off on the Automations page since it was scheduled: let it go quietly.
    if (auto.thank_you.enabled === false) {
      await supaFetch(`crm_followups?id=eq.${f.id}&status=eq.scheduled`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      continue;
    }
    // Claim it first so two overlapping runs never double-text.
    const claimed = await supaFetch(`crm_followups?id=eq.${f.id}&status=eq.scheduled`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'sending' }),
    });
    if (!claimed || !claimed.length) continue;
    let person = null;
    if (f.client_id) { try { [person] = await supaFetch(`crm_clients?id=eq.${f.client_id}&select=owner_name,business_name`); } catch (_) {} }
    const body = (await thankYouText(f, person, auto)).slice(0, 600);
    const [msg] = await supaFetch('crm_sms_messages', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ client_id: f.client_id || null, direction: 'out', channel: 'imessage', phone: f.phone, body, status: 'queued' }),
    }) || [];
    await supaFetch(`crm_followups?id=eq.${f.id}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'sent', body, sent_at: new Date().toISOString(), message_id: msg?.id || null }),
    });
    sent++;
  }
  return { due: due.length, sent };
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  const out = { ok: true };
  try {
    Object.assign(out, await sendDueFollowups());
  } catch (err) {
    if (missingTable(err)) out.skipped = 'crm_followups not created yet';
    else {
      console.error('followups-cron error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // Scheduled nudges are a separate pass so one table's trouble never blocks the other.
  try {
    out.nudges = await sendDueNudges();
  } catch (err) {
    console.error('nudges pass failed:', err);
    out.nudges = { error: err.message };
  }
  return res.json(out);
};
