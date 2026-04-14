const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// ── Send a batch of emails via Resend, respecting daily limit + rollover ──
async function sendBatch(config, campaign, contacts, supaFetchFn) {
  const configId = config.id;
  const dailyLimit = config.daily_limit || 100;
  const today = new Date().toISOString().slice(0, 10);

  // Get or create daily usage record
  let usageRows = await supaFetchFn(`crm_email_daily_usage?config_id=eq.${configId}&send_date=eq.${today}`);
  let usage = usageRows?.[0];
  if (!usage) {
    const created = await supaFetchFn('crm_email_daily_usage', {
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

  // Send immediate batch
  for (const contact of toSendNow) {
    try {
      const html = campaign.html_body
        .replace(/\{\{name\}\}/g, contact.name || 'there')
        .replace(/\{\{email\}\}/g, contact.email);

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.resend_api_key}`,
        },
        body: JSON.stringify({
          from: config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email,
          to: [contact.email],
          subject: campaign.subject.replace(/\{\{name\}\}/g, contact.name || 'there'),
          html,
        }),
      });

      if (emailRes.ok) {
        const data = await emailRes.json();
        await supaFetchFn('crm_email_sends', {
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
        await supaFetchFn('crm_email_sends', {
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
      await supaFetchFn('crm_email_sends', {
        method: 'POST',
        body: JSON.stringify([{
          campaign_id: campaign.id,
          contact_id: contact.id,
          email: contact.email,
          status: 'failed',
          error: e.message.slice(0, 500),
        }]),
      });
      failedCount++;
    }
  }

  // Schedule rollover batch — 24.5 hours from now
  if (toRollover.length > 0) {
    const rolloverTime = new Date(Date.now() + 24.5 * 60 * 60 * 1000).toISOString();
    const rolloverRows = toRollover.map(contact => ({
      campaign_id: campaign.id,
      contact_id: contact.id,
      email: contact.email,
      status: 'scheduled',
      scheduled_at: rolloverTime,
    }));
    await supaFetchFn('crm_email_sends', {
      method: 'POST',
      body: JSON.stringify(rolloverRows),
    });
    console.log(`Rolled over ${toRollover.length} emails to ${rolloverTime}`);
  }

  // Update daily usage
  await supaFetchFn(`crm_email_daily_usage?config_id=eq.${configId}&send_date=eq.${today}`, {
    method: 'PATCH',
    body: JSON.stringify({ send_count: (usage.send_count || 0) + sentCount }),
  });

  return { sentCount, failedCount, rolledOver: toRollover.length };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action } = req.query;

  // GET — list campaigns
  if (req.method === 'GET') {
    try {
      const { client_id } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch(`crm_email_campaigns?client_id=eq.${client_id}&order=created_at.desc`);
      return res.json(rows || []);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — create campaign
  if (req.method === 'POST' && action === 'create') {
    try {
      const { client_id, subject, html_body, tag_filter, scheduled_at } = req.body;
      if (!client_id || !subject) {
        return res.status(400).json({ error: 'client_id and subject required' });
      }
      const status = scheduled_at ? 'scheduled' : 'draft';
      const rows = await supaFetch('crm_email_campaigns', {
        method: 'POST',
        body: JSON.stringify([{
          client_id,
          subject,
          html_body: html_body || '',
          tag_filter: tag_filter || [],
          status,
          scheduled_at: scheduled_at || null,
        }]),
      });
      return res.json(rows?.[0] || { created: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // POST — send campaign now
  if (req.method === 'POST' && action === 'send') {
    try {
      const { campaign_id } = req.body;
      if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

      // Load campaign
      const campaigns = await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`);
      const campaign = campaigns?.[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      // Load config
      const configs = await supaFetch(`crm_email_config?client_id=eq.${campaign.client_id}`);
      const config = configs?.[0];
      if (!config) return res.status(400).json({ error: 'No email config for this client. Set up Resend API key first.' });

      // Load contacts matching tag filter
      let contactQuery = `crm_email_contacts?client_id=eq.${campaign.client_id}&status=eq.active&order=created_at.asc`;
      const tagFilter = campaign.tag_filter || [];
      const contacts = await supaFetch(contactQuery);
      let filteredContacts = contacts || [];

      // Filter by tags if specified
      if (tagFilter.length > 0) {
        filteredContacts = filteredContacts.filter(c => {
          const contactTags = c.tags || [];
          return tagFilter.some(t => contactTags.includes(t));
        });
      }

      if (!filteredContacts.length) {
        return res.status(400).json({ error: 'No matching contacts to send to' });
      }

      // Update campaign status
      await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'sending',
          total_recipients: filteredContacts.length,
          updated_at: new Date().toISOString(),
        }),
      });

      // Send with rollover
      const result = await sendBatch(config, campaign, filteredContacts, supaFetch);

      // Update campaign final status
      const finalStatus = result.rolledOver > 0 ? 'partial' : 'sent';
      await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: finalStatus,
          sent_count: result.sentCount,
          failed_count: result.failedCount,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });

      return res.json({
        sent: result.sentCount,
        failed: result.failedCount,
        rolled_over: result.rolledOver,
        status: finalStatus,
      });
    } catch (err) {
      console.error('Send campaign error:', err);
      return res.status(500).json({ error: 'Send failed: ' + err.message });
    }
  }

  // POST — schedule campaign
  if (req.method === 'POST' && action === 'schedule') {
    try {
      const { campaign_id, scheduled_at } = req.body;
      if (!campaign_id || !scheduled_at) {
        return res.status(400).json({ error: 'campaign_id and scheduled_at required' });
      }
      const rows = await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_at,
          updated_at: new Date().toISOString(),
        }),
      });
      return res.json(rows?.[0] || { scheduled: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // PUT — update campaign draft
  if (req.method === 'PUT') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const { subject, html_body, tag_filter, scheduled_at } = req.body;
      const update = { updated_at: new Date().toISOString() };
      if (subject !== undefined) update.subject = subject;
      if (html_body !== undefined) update.html_body = html_body;
      if (tag_filter !== undefined) update.tag_filter = tag_filter;
      if (scheduled_at !== undefined) {
        update.scheduled_at = scheduled_at;
        update.status = scheduled_at ? 'scheduled' : 'draft';
      }
      const rows = await supaFetch(`crm_email_campaigns?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      });
      return res.json(rows?.[0] || { updated: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      // Delete sends first
      await supaFetch(`crm_email_sends?campaign_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await supaFetch(`crm_email_campaigns?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method or action' });
};
