const { supaFetch } = require('../_lib/supabase.js');
const { missingTable } = require('../_lib/followups.js');

// Every few minutes (New/vercel.json): send every follow-up whose time has
// come. The text is drafted fresh by the assistant model (first name and the
// meeting it refers to), with a plain template if the model is unavailable,
// and queued as an outbound iMessage for the bridge to deliver.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ASSISTANT_MODEL || 'claude-sonnet-5';
const FALLBACK_MODEL = 'claude-sonnet-4-5';
const stripDashes = (t) => String(t || '').replace(/[–—]/g, '-');
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

async function thankYouText(f, person) {
  const name = firstName(person?.owner_name || person?.business_name);
  const business = person?.business_name && person.business_name !== person.owner_name ? person.business_name : '';
  const about = f.meeting_title ? ` about "${f.meeting_title}"` : '';
  const fallback = `${name ? `Hey ${name}, ` : 'Hey, '}thanks again for meeting up yesterday${about}. Really enjoyed it. If any questions come up, just text me here.`;
  if (!ANTHROPIC_API_KEY) return fallback;
  const system = 'You write short, warm iMessages from Ray at Vernon Tech & Media, a Katy, Texas web and media agency. One to three sentences, natural, no sign-off, no hashtags, no emoji, no placeholders. Reply with only the message text. Never use em dashes or en dashes.';
  const prompt = `Write the morning-after thank-you text for an in-person meetup we had yesterday.${name ? ` Their first name: ${name}.` : ''}${business ? ` Their business: ${business}.` : ''}${f.meeting_title ? ` The meeting was titled: ${f.meeting_title}.` : ''} Thank them for their time, mention you enjoyed it, and leave the door open for questions or next steps. Keep it human, not salesy.`;
  try { return stripDashes(await draft(MODEL, system, prompt)) || fallback; }
  catch (e) {
    if (/model/i.test(String(e.message))) { try { return stripDashes(await draft(FALLBACK_MODEL, system, prompt)) || fallback; } catch (_) {} }
    return fallback;
  }
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const now = new Date().toISOString();
    const due = await supaFetch(`crm_followups?status=eq.scheduled&send_at=lte.${encodeURIComponent(now)}&select=*&order=send_at.asc&limit=50`) || [];
    let sent = 0;
    for (const f of due) {
      // Claim it first so two overlapping runs never double-text.
      const claimed = await supaFetch(`crm_followups?id=eq.${f.id}&status=eq.scheduled`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'sending' }),
      });
      if (!claimed || !claimed.length) continue;
      let person = null;
      if (f.client_id) { try { [person] = await supaFetch(`crm_clients?id=eq.${f.client_id}&select=owner_name,business_name`); } catch (_) {} }
      const body = (await thankYouText(f, person)).slice(0, 600);
      const [msg] = await supaFetch('crm_sms_messages', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ client_id: f.client_id || null, direction: 'out', channel: 'imessage', phone: f.phone, body, status: 'queued' }),
      }) || [];
      await supaFetch(`crm_followups?id=eq.${f.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'sent', body, sent_at: new Date().toISOString(), message_id: msg?.id || null }),
      });
      sent++;
    }
    return res.json({ ok: true, due: due.length, sent });
  } catch (err) {
    if (missingTable(err)) return res.json({ ok: true, skipped: 'crm_followups not created yet' });
    console.error('followups-cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
