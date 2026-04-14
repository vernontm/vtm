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
              const rawBody = (campaign.html_body || '')
                .replace(/\{\{name\}\}/g, send.name || 'there')
                .replace(/\{\{email\}\}/g, send.email);
              const subject = (campaign.subject || '').replace(/\{\{name\}\}/g, send.name || 'there');
              const html = wrapEmailHtml(rawBody, { subject, fromName: config.from_name });

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
        .replace(/\{\{email\}\}/g, contact.email);
      const subject = (campaign.subject || '').replace(/\{\{name\}\}/g, contact.name || 'there');
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
