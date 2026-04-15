const { setCors, supaFetch } = require('../_lib/supabase.js');
const { wrapEmailHtml } = require('../_lib/email-html.js');

// This endpoint is called by Vercel Cron every 15 minutes.
// It handles:
// 1. Sending scheduled campaigns that are due
// 2. Processing rollover emails from previous sends

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify cron secret (Vercel sends this header)
  const cronSecret = req.headers['authorization'];
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    // Also allow normal auth for manual triggers
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const now = new Date().toISOString();
  const results = { scheduledCampaigns: 0, rolloverSent: 0, rolloverFailed: 0, errors: [] };

  try {
    // ── 1. Process scheduled campaigns that are due ──
    const dueCampaigns = await supaFetch(
      `crm_email_campaigns?status=eq.scheduled&scheduled_at=lte.${now}&order=scheduled_at.asc`
    );

    for (const campaign of (dueCampaigns || [])) {
      try {
        // Load config
        const configs = await supaFetch(`crm_email_config?client_id=eq.${campaign.client_id}`);
        const config = configs?.[0];
        if (!config) {
          results.errors.push(`No config for campaign ${campaign.id}`);
          continue;
        }

        // Load contacts
        let contacts = await supaFetch(
          `crm_email_contacts?client_id=eq.${campaign.client_id}&status=eq.active&order=created_at.asc`
        );
        const tagFilter = campaign.tag_filter || [];
        if (tagFilter.length > 0) {
          contacts = (contacts || []).filter(c => {
            const tags = c.tags || [];
            return tagFilter.some(t => tags.includes(t));
          });
        }

        if (!contacts?.length) {
          await supaFetch(`crm_email_campaigns?id=eq.${campaign.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'sent', sent_at: now, sent_count: 0, updated_at: now }),
          });
          continue;
        }

        // Mark as sending
        await supaFetch(`crm_email_campaigns?id=eq.${campaign.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'sending', total_recipients: contacts.length, updated_at: now }),
        });

        // Send with daily limit + rollover
        const result = await sendBatchWithRollover(config, campaign, contacts, wrapEmailHtml);

        await supaFetch(`crm_email_campaigns?id=eq.${campaign.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: result.rolledOver > 0 ? 'partial' : 'sent',
            sent_count: result.sentCount,
            failed_count: result.failedCount,
            sent_at: now,
            updated_at: now,
          }),
        });

        results.scheduledCampaigns++;
      } catch (e) {
        results.errors.push(`Campaign ${campaign.id}: ${e.message}`);
      }
    }

    // ── 2. Process rollover (scheduled) email sends ──
    const dueRollovers = await supaFetch(
      `crm_email_sends?status=eq.scheduled&scheduled_at=lte.${now}&order=scheduled_at.asc&limit=200`
    );

    if (dueRollovers?.length) {
      // Group by campaign
      const byCampaign = {};
      for (const send of dueRollovers) {
        if (!byCampaign[send.campaign_id]) byCampaign[send.campaign_id] = [];
        byCampaign[send.campaign_id].push(send);
      }

      for (const [campaignId, sends] of Object.entries(byCampaign)) {
        try {
          const campaigns = await supaFetch(`crm_email_campaigns?id=eq.${campaignId}`);
          const campaign = campaigns?.[0];
          if (!campaign) continue;

          const configs = await supaFetch(`crm_email_config?client_id=eq.${campaign.client_id}`);
          const config = configs?.[0];
          if (!config) continue;

          // Check daily limit
          const today = new Date().toISOString().slice(0, 10);
          let usageRows = await supaFetch(`crm_email_daily_usage?config_id=eq.${config.id}&send_date=eq.${today}`);
          let usage = usageRows?.[0];
          if (!usage) {
            const created = await supaFetch('crm_email_daily_usage', {
              method: 'POST',
              body: JSON.stringify([{ config_id: config.id, send_date: today, send_count: 0 }]),
            });
            usage = created?.[0] || { send_count: 0 };
          }

          const dailyLimit = config.daily_limit || 100;
          const remaining = Math.max(0, dailyLimit - (usage.send_count || 0));
          const toSendNow = sends.slice(0, remaining);
          const toRolloverAgain = sends.slice(remaining);

          let sentCount = 0;
          for (const send of toSendNow) {
            try {
              // Fetch latest contact record for fresh discount_code
              let contactRow = null;
              try {
                const cRows = await supaFetch(`crm_email_contacts?id=eq.${send.contact_id}&limit=1`);
                contactRow = cRows?.[0] || null;
              } catch (_) {}
              const dCode = contactRow?.discount_code || '';
              const rawBody = (campaign.html_body || '')
                .replace(/\{\{name\}\}/g, send.name || 'there')
                .replace(/\{\{email\}\}/g, send.email)
                .replace(/\{\{discount_code\}\}/g, dCode);
              const subject = (campaign.subject || '')
                .replace(/\{\{name\}\}/g, send.name || 'there')
                .replace(/\{\{discount_code\}\}/g, dCode);
              const html = wrapEmailHtml(rawBody, { subject, fromName: config.from_name, previewText: campaign.preview_text });

              const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.resend_api_key}`,
                },
                body: JSON.stringify({
                  from: config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email,
                  to: [send.email],
                  subject,
                  html,
                }),
              });

              if (emailRes.ok) {
                const data = await emailRes.json();
                await supaFetch(`crm_email_sends?id=eq.${send.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: 'sent', sent_at: now, resend_id: data.id || '' }),
                });
                sentCount++;
                results.rolloverSent++;
              } else {
                const errText = await emailRes.text();
                await supaFetch(`crm_email_sends?id=eq.${send.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: 'failed', error: errText.slice(0, 500) }),
                });
                results.rolloverFailed++;
              }
            } catch (e) {
              await supaFetch(`crm_email_sends?id=eq.${send.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'failed', error: e.message.slice(0, 500) }),
              });
              results.rolloverFailed++;
            }
          }

          // Re-schedule remaining for another 24.5 hours
          if (toRolloverAgain.length > 0) {
            const nextRollover = new Date(Date.now() + 24.5 * 60 * 60 * 1000).toISOString();
            for (const send of toRolloverAgain) {
              await supaFetch(`crm_email_sends?id=eq.${send.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ scheduled_at: nextRollover }),
              });
            }
          }

          // Update daily usage
          await supaFetch(`crm_email_daily_usage?config_id=eq.${config.id}&send_date=eq.${today}`, {
            method: 'PATCH',
            body: JSON.stringify({ send_count: (usage.send_count || 0) + sentCount }),
          });

          // Update campaign counts
          if (sentCount > 0) {
            await supaFetch(`crm_email_campaigns?id=eq.${campaignId}`, {
              method: 'PATCH',
              body: JSON.stringify({
                sent_count: (campaign.sent_count || 0) + sentCount,
                status: toRolloverAgain.length > 0 ? 'partial' : 'sent',
                updated_at: now,
              }),
            });
          }
        } catch (e) {
          results.errors.push(`Rollover campaign ${campaignId}: ${e.message}`);
        }
      }
    }

    // ── 3. Process birthday campaigns ──
    // Fire at 8:00 AM America/Chicago (CST/CDT handled automatically).
    // Cron runs every 15 min; we only proceed when Chicago time is within the 08:00 hour.
    // Dedup via crm_email_birthday_sends prevents the 4 ticks in that hour from double-sending.
    results.birthdaySent = 0;
    results.birthdayFailed = 0;
    const chicagoParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(new Date()).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const curMonth = parseInt(chicagoParts.month, 10);
    const curDay = parseInt(chicagoParts.day, 10);
    const curYear = parseInt(chicagoParts.year, 10);
    const curHourCT = parseInt(chicagoParts.hour, 10);
    const birthdayWindowOpen = curHourCT === 8;
    results.birthdayWindow = birthdayWindowOpen ? 'open' : `closed (Chicago hour=${curHourCT})`;

    try {
      if (!birthdayWindowOpen) throw new Error('__skip_birthdays__');
      const birthdayCampaigns = await supaFetch(
        `crm_email_campaigns?trigger_type=eq.birthday&auto_trigger_enabled=eq.true`
      );
      for (const camp of (birthdayCampaigns || [])) {
        try {
          const configs = await supaFetch(`crm_email_config?client_id=eq.${camp.client_id}`);
          const config = configs?.[0];
          if (!config) continue;

          const birthdayContacts = await supaFetch(
            `crm_email_contacts?client_id=eq.${camp.client_id}&status=eq.active&birthday_month=eq.${curMonth}&birthday_day=eq.${curDay}`
          );
          if (!birthdayContacts?.length) continue;

          for (const contact of birthdayContacts) {
            try {
              // Skip if already sent this year
              const existing = await supaFetch(
                `crm_email_birthday_sends?campaign_id=eq.${camp.id}&contact_id=eq.${contact.id}&send_year=eq.${curYear}&limit=1`
              );
              if (existing?.length) continue;

              const rawBody = (camp.html_body || '')
                .replace(/\{\{name\}\}/g, contact.name || 'there')
                .replace(/\{\{email\}\}/g, contact.email)
                .replace(/\{\{discount_code\}\}/g, contact.discount_code || '');
              const subject = (camp.subject || '')
                .replace(/\{\{name\}\}/g, contact.name || 'there')
                .replace(/\{\{discount_code\}\}/g, contact.discount_code || '');
              const html = wrapEmailHtml(rawBody, { subject, fromName: config.from_name, previewText: camp.preview_text });

              const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${config.resend_api_key}`,
                },
                body: JSON.stringify({
                  from: config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email,
                  to: [contact.email],
                  subject,
                  html,
                }),
              });

              if (emailRes.ok) {
                const data = await emailRes.json();
                await supaFetch('crm_email_sends', {
                  method: 'POST',
                  body: JSON.stringify([{
                    campaign_id: camp.id,
                    contact_id: contact.id,
                    email: contact.email,
                    status: 'sent',
                    sent_at: new Date().toISOString(),
                    resend_id: data.id || '',
                  }]),
                });
                await supaFetch('crm_email_birthday_sends', {
                  method: 'POST',
                  body: JSON.stringify([{
                    campaign_id: camp.id,
                    contact_id: contact.id,
                    send_year: curYear,
                  }]),
                });
                results.birthdaySent++;
              } else {
                results.birthdayFailed++;
              }
            } catch (e) {
              results.birthdayFailed++;
              results.errors.push(`Birthday send ${contact.email}: ${e.message}`);
            }
          }
        } catch (e) {
          results.errors.push(`Birthday campaign ${camp.id}: ${e.message}`);
        }
      }
    } catch (e) {
      if (e.message !== '__skip_birthdays__') {
        results.errors.push(`Birthday processing: ${e.message}`);
      }
    }

    // ── 4. Process email sequences ──
    results.sequenceSent = 0;
    results.sequenceFailed = 0;
    results.sequenceCompleted = 0;
    try {
      const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const activeSeqs = await supaFetch(`crm_email_sequences?active=eq.true`);
      for (const seq of (activeSeqs || [])) {
        // Enroll new contacts matching trigger tag
        if (seq.trigger_tag) {
          try {
            const stepsList = await supaFetch(`crm_email_sequence_steps?sequence_id=eq.${seq.id}&order=step_order.asc&limit=1`);
            const firstStep = stepsList?.[0];
            if (firstStep) {
              const matching = await supaFetch(
                `crm_email_contacts?client_id=eq.${seq.client_id}&status=eq.active&tags=cs.["${seq.trigger_tag}"]`
              );
              const existing = await supaFetch(`crm_email_sequence_enrollments?sequence_id=eq.${seq.id}&select=contact_id`);
              const already = new Set((existing || []).map(e => e.contact_id));
              const toEnroll = (matching || []).filter(c => !already.has(c.id));
              if (toEnroll.length) {
                const delayMs = ((firstStep.delay_unit === 'hours' ? 3600_000 : firstStep.delay_unit === 'minutes' ? 60_000 : 86_400_000)) * (firstStep.delay_amount || 0);
                const firstSend = new Date(Date.now() + delayMs).toISOString();
                await supaFetch('crm_email_sequence_enrollments', {
                  method: 'POST',
                  headers: { 'Prefer': 'resolution=ignore-duplicates' },
                  body: JSON.stringify(toEnroll.map(c => ({
                    sequence_id: seq.id,
                    contact_id: c.id,
                    current_step: 0,
                    next_send_at: firstSend,
                    status: 'active',
                  }))),
                });
              }
            }
          } catch (e) {
            results.errors.push(`Sequence enrol ${seq.id}: ${e.message}`);
          }
        }

        // Check allowed send days
        const sendDays = Array.isArray(seq.send_days) ? seq.send_days : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        if (sendDays.length > 0 && sendDays.length < 7 && !sendDays.includes(dayNames[new Date().getDay()])) {
          continue;
        }

        const steps = await supaFetch(`crm_email_sequence_steps?sequence_id=eq.${seq.id}&order=step_order.asc`);
        if (!steps?.length) continue;

        const configs = await supaFetch(`crm_email_config?client_id=eq.${seq.client_id}`);
        const config = configs?.[0];
        if (!config?.resend_api_key) continue;

        const due = await supaFetch(
          `crm_email_sequence_enrollments?sequence_id=eq.${seq.id}&status=eq.active&next_send_at=lte.${now}&limit=100`
        );
        for (const enr of (due || [])) {
          try {
            const step = steps[enr.current_step];
            if (!step) {
              await supaFetch(`crm_email_sequence_enrollments?id=eq.${enr.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'completed', completed_at: now }),
              });
              results.sequenceCompleted++;
              continue;
            }
            const contactRows = await supaFetch(`crm_email_contacts?id=eq.${enr.contact_id}&limit=1`);
            const contact = contactRows?.[0];
            if (!contact || contact.status !== 'active') {
              await supaFetch(`crm_email_sequence_enrollments?id=eq.${enr.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'unsubscribed' }),
              });
              continue;
            }
            const rawBody = (step.html_body || '')
              .replace(/\{\{name\}\}/g, contact.name || 'there')
              .replace(/\{\{email\}\}/g, contact.email)
              .replace(/\{\{discount_code\}\}/g, contact.discount_code || '');
            const subject = (step.subject || '')
              .replace(/\{\{name\}\}/g, contact.name || 'there')
              .replace(/\{\{discount_code\}\}/g, contact.discount_code || '');
            const html = wrapEmailHtml(rawBody, { subject, fromName: config.from_name, previewText: step.preview_text });

            const emailRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.resend_api_key}`,
              },
              body: JSON.stringify({
                from: config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email,
                to: [contact.email],
                subject,
                html,
              }),
            });

            if (emailRes.ok) {
              const data = await emailRes.json();
              await supaFetch('crm_email_sequence_sends', {
                method: 'POST',
                body: JSON.stringify([{
                  sequence_id: seq.id,
                  step_id: step.id,
                  contact_id: contact.id,
                  email: contact.email,
                  status: 'sent',
                  sent_at: now,
                  resend_id: data.id || '',
                }]),
              });
              const nextIdx = enr.current_step + 1;
              const nextStep = steps[nextIdx];
              if (!nextStep) {
                await supaFetch(`crm_email_sequence_enrollments?id=eq.${enr.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: 'completed', current_step: nextIdx, completed_at: now }),
                });
                results.sequenceCompleted++;
              } else {
                const delayMs = ((nextStep.delay_unit === 'hours' ? 3600_000 : nextStep.delay_unit === 'minutes' ? 60_000 : 86_400_000)) * (nextStep.delay_amount || 0);
                const nextAt = new Date(Date.now() + delayMs).toISOString();
                await supaFetch(`crm_email_sequence_enrollments?id=eq.${enr.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ current_step: nextIdx, next_send_at: nextAt }),
                });
              }
              results.sequenceSent++;
            } else {
              const errText = await emailRes.text();
              await supaFetch('crm_email_sequence_sends', {
                method: 'POST',
                body: JSON.stringify([{
                  sequence_id: seq.id,
                  step_id: step.id,
                  contact_id: contact.id,
                  email: contact.email,
                  status: 'failed',
                  error: errText.slice(0, 500),
                }]),
              });
              results.sequenceFailed++;
            }
          } catch (e) {
            results.sequenceFailed++;
            results.errors.push(`Seq enrollment ${enr.id}: ${e.message}`);
          }
        }
      }
    } catch (e) {
      results.errors.push(`Sequence processing: ${e.message}`);
    }

    return res.json({ ok: true, processed_at: now, ...results });
  } catch (err) {
    console.error('Email cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// Duplicated from email-campaigns.js for the cron context
async function sendBatchWithRollover(config, campaign, contacts, wrap = null) {
  const configId = config.id;
  const dailyLimit = config.daily_limit || 100;
  const today = new Date().toISOString().slice(0, 10);

  let usageRows = await supaFetch(`crm_email_daily_usage?config_id=eq.${configId}&send_date=eq.${today}`);
  let usage = usageRows?.[0];
  if (!usage) {
    const created = await supaFetch('crm_email_daily_usage', {
      method: 'POST',
      body: JSON.stringify([{ config_id: configId, send_date: today, send_count: 0 }]),
    });
    usage = created?.[0] || { send_count: 0 };
  }

  const remaining = Math.max(0, dailyLimit - (usage.send_count || 0));
  const toSendNow = contacts.slice(0, remaining);
  const toRollover = contacts.slice(remaining);

  let sentCount = 0;
  let failedCount = 0;

  for (const contact of toSendNow) {
    try {
      const rawBody = (campaign.html_body || '')
        .replace(/\{\{name\}\}/g, contact.name || 'there')
        .replace(/\{\{email\}\}/g, contact.email)
        .replace(/\{\{discount_code\}\}/g, contact.discount_code || '');
      const subject = (campaign.subject || '')
        .replace(/\{\{name\}\}/g, contact.name || 'there')
        .replace(/\{\{discount_code\}\}/g, contact.discount_code || '');
      const html = wrap ? wrap(rawBody, { subject, fromName: config.from_name }) : rawBody;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.resend_api_key}`,
        },
        body: JSON.stringify({
          from: config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email,
          to: [contact.email],
          subject,
          html,
        }),
      });

      if (emailRes.ok) {
        const data = await emailRes.json();
        await supaFetch('crm_email_sends', {
          method: 'POST',
          body: JSON.stringify([{
            campaign_id: campaign.id,
            contact_id: contact.id,
            email: contact.email,
            status: 'sent',
            sent_at: new Date().toISOString(),
            resend_id: data.id || '',
          }]),
        });
        sentCount++;
      } else {
        const errText = await emailRes.text();
        await supaFetch('crm_email_sends', {
          method: 'POST',
          body: JSON.stringify([{
            campaign_id: campaign.id,
            contact_id: contact.id,
            email: contact.email,
            status: 'failed',
            error: errText.slice(0, 500),
          }]),
        });
        failedCount++;
      }
    } catch (e) {
      failedCount++;
    }
  }

  if (toRollover.length > 0) {
    const rolloverTime = new Date(Date.now() + 24.5 * 60 * 60 * 1000).toISOString();
    await supaFetch('crm_email_sends', {
      method: 'POST',
      body: JSON.stringify(toRollover.map(c => ({
        campaign_id: campaign.id,
        contact_id: c.id,
        email: c.email,
        status: 'scheduled',
        scheduled_at: rolloverTime,
      }))),
    });
  }

  await supaFetch(`crm_email_daily_usage?config_id=eq.${configId}&send_date=eq.${today}`, {
    method: 'PATCH',
    body: JSON.stringify({ send_count: (usage.send_count || 0) + sentCount }),
  });

  return { sentCount, failedCount, rolledOver: toRollover.length };
}
