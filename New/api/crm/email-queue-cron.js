const { setCors, supaFetch } = require('../_lib/supabase.js');
const { sendQueueItem } = require('../_lib/email-send.js');
const { buildContractFollowup, nextIntervalDays, MAX_FOLLOWUPS } = require('../_lib/contract-followups.js');
const { buildDepositReminder, nextIntervalDays: nextReminderDays, MAX_REMINDERS } = require('../_lib/deposit-reminders.js');

// Vercel cron (every 15 min). Sends personal 1:1 queue emails that were
// scheduled for a future time. A row is eligible when status='scheduled' and
// scheduled_for <= now(). Auto-approved drafts land here with approved_at set;
// this cron is what actually delivers them at the chosen time. On success the
// row flips to status='sent'; on failure it goes to 'failed' with the error so
// it isn't retried forever.
//
// Contract follow-ups (email_type='contract_followup') drive a recurring drip:
// after each one sends, if the client still hasn't signed, the next follow-up is
// auto-scheduled ~2-3 days out and an activity is logged on the client. Once the
// agreement is signed (or the cap is hit) the sequence stops on its own.

// Latest agreement for a client → { signed_at, sign_token } (or null).
async function latestAgreement(clientId) {
  const rows = await supaFetch(
    `crm_agreements?client_id=eq.${clientId}&order=sent_at.desc.nullslast&limit=1&select=sign_token,signed_at`
  );
  return rows?.[0] || null;
}

async function logActivity(clientId, fields) {
  try {
    await supaFetch('crm_client_activity', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ client_id: clientId, author: 'Automation', ...fields }),
    });
  } catch (e) {
    console.error('activity log failed', clientId, e.message);
  }
}

// After a contract follow-up sends: log it, and if still unsigned + under the
// cap, schedule the next one.
async function afterContractFollowup(item, agreement) {
  const clientId = item.lead_id;
  const seq = item.followup_seq || 1;

  await logActivity(clientId, {
    type: 'email',
    direction: 'outbound',
    tag: 'Follow-up',
    title: `Automated follow-up sent (#${seq})`,
    body: `Subject: ${item.subject || ''}\nTo: ${item.to_email || item.lead_email || ''}`,
  });

  if (seq >= MAX_FOLLOWUPS) {
    await logActivity(clientId, {
      type: 'note',
      tag: 'Follow-up',
      title: `Follow-up sequence paused after ${seq} touches`,
      body: 'Reached the automatic follow-up limit without a signature. Worth a personal reach-out.',
    });
    return;
  }

  const [client] = await supaFetch(
    `crm_clients?id=eq.${clientId}&select=id,business_name,owner_name,contact_email`
  ) || [];
  if (!client || !agreement?.sign_token) return;

  const nextSeq = seq + 1;
  const days = nextIntervalDays(seq);
  const base = item.scheduled_for ? new Date(item.scheduled_for).getTime() : Date.now();
  const nextAt = new Date(base + days * 86400000).toISOString();
  const { subject, body } = buildContractFollowup(client, agreement.sign_token, nextSeq);

  await supaFetch('crm_email_queue', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      lead_id: clientId,
      lead_name: client.owner_name || '',
      to_email: item.to_email || item.lead_email || client.contact_email,
      email_type: 'contract_followup',
      followup_seq: nextSeq,
      subject,
      body,
      status: 'scheduled',
      scheduled_for: nextAt,
      approved_at: new Date().toISOString(),
      auto_generated: true,
    }),
  });
}

// Client's deposit status → true once they've paid (paid handlers set this).
async function depositPaid(clientId) {
  const [c] = await supaFetch(`crm_clients?id=eq.${clientId}&select=payment_received`) || [];
  return !!(c && c.payment_received);
}

// Per-lead master switch for the automated email drips. Defaults ON.
async function autoFollowupsEnabled(clientId) {
  const [c] = await supaFetch(`crm_clients?id=eq.${clientId}&select=auto_followups_enabled`) || [];
  return !c || c.auto_followups_enabled !== false;
}

// After a deposit reminder sends: log it, and if still unpaid + under the cap,
// schedule the next one.
async function afterDepositReminder(item, agreement) {
  const clientId = item.lead_id;
  const seq = item.followup_seq || 1;

  await logActivity(clientId, {
    type: 'email', direction: 'outbound', tag: 'Payment',
    title: `Deposit reminder sent (#${seq})`,
    body: `Subject: ${item.subject || ''}\nTo: ${item.to_email || item.lead_email || ''}`,
  });

  if (seq >= MAX_REMINDERS) {
    await logActivity(clientId, {
      type: 'note', tag: 'Payment',
      title: `Deposit reminders paused after ${seq} sends`,
      body: 'Reached the automatic reminder limit without a deposit. Worth a personal reach-out.',
    });
    return;
  }

  const [client] = await supaFetch(`crm_clients?id=eq.${clientId}&select=id,business_name,owner_name,contact_email`) || [];
  if (!client || !agreement?.sign_token) return;

  const nextSeq = seq + 1;
  const days = nextReminderDays(seq);
  const base = item.scheduled_for ? new Date(item.scheduled_for).getTime() : Date.now();
  const nextAt = new Date(base + days * 86400000).toISOString();
  const { subject, body } = buildDepositReminder(client, agreement.sign_token, nextSeq);

  await supaFetch('crm_email_queue', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      lead_id: clientId, lead_name: client.owner_name || '',
      to_email: item.to_email || item.lead_email || client.contact_email,
      email_type: 'deposit_reminder', followup_seq: nextSeq,
      subject, body, status: 'scheduled', scheduled_for: nextAt,
      approved_at: new Date().toISOString(), auto_generated: true,
    }),
  });
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

  const nowIso = new Date().toISOString();
  const results = [];
  try {
    const due = await supaFetch(
      `crm_email_queue?status=eq.scheduled&scheduled_for=lte.${encodeURIComponent(nowIso)}&order=scheduled_for.asc&limit=50`
    ) || [];

    for (const item of due) {
      const isFollowup = item.email_type === 'contract_followup' && item.lead_id;
      const isReminder = item.email_type === 'deposit_reminder' && item.lead_id;
      try {
        // For contract follow-ups, stop the moment they've signed.
        let agreement = null;
        if (isFollowup) {
          agreement = await latestAgreement(item.lead_id);
          if (agreement?.signed_at) {
            await supaFetch(`crm_email_queue?id=eq.${item.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
            });
            await logActivity(item.lead_id, {
              type: 'note', tag: 'Won',
              title: 'Agreement signed - follow-up sequence stopped',
              body: 'The client signed, so the automated follow-ups were turned off.',
            });
            results.push({ id: item.id, stopped: 'signed' });
            continue;
          }
        }

        // For deposit reminders, stop the moment they've paid.
        if (isReminder) {
          agreement = await latestAgreement(item.lead_id);
          if (await depositPaid(item.lead_id)) {
            await supaFetch(`crm_email_queue?id=eq.${item.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'cancelled', updated_at: new Date().toISOString() }),
            });
            await logActivity(item.lead_id, {
              type: 'note', tag: 'Payment',
              title: 'Deposit paid - reminders stopped',
              body: 'The client paid, so the automated deposit reminders were turned off.',
            });
            results.push({ id: item.id, stopped: 'paid' });
            continue;
          }
        }

        // Per-lead master switch: if automated follow-ups are turned OFF for this
        // client, leave the item scheduled (paused) and skip. Flipping the switch
        // back ON resumes it on the next tick, so nothing is lost.
        if ((isFollowup || isReminder) && !(await autoFollowupsEnabled(item.lead_id))) {
          results.push({ id: item.id, skipped: 'followups_off' });
          continue;
        }

        const result = await sendQueueItem(item);
        await supaFetch(`crm_email_queue?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'sent',
            sent_at: new Date().toISOString(),
            gmail_message_id: result.id,
            updated_at: new Date().toISOString(),
          }),
        });

        if (isFollowup) await afterContractFollowup(item, agreement);
        if (isReminder) await afterDepositReminder(item, agreement);
        results.push({ id: item.id, to: item.to_email || item.lead_email, sent: true, followup: isFollowup, reminder: isReminder });
      } catch (err) {
        console.error('scheduled send error', item.id, err.message);
        // Gmail not connected is transient — leave it scheduled to retry next tick.
        if (/not connected/i.test(err.message)) {
          results.push({ id: item.id, retry: true, error: err.message });
          continue;
        }
        await supaFetch(`crm_email_queue?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() }),
        });
        results.push({ id: item.id, error: err.message });
      }
    }
    return res.json({ ok: true, ran: results.length, results, timestamp: nowIso });
  } catch (err) {
    console.error('email-queue-cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
