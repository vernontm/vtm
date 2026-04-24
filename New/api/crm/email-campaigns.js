const { setCors, requireCrmUser, supaFetch, assertClientAccess } = require('../_lib/supabase.js');
const { wrapEmailHtml } = require('../_lib/email-html.js');
const ML = require('../_lib/mailerlite.js');

// ─────────────────────────────────────────────────────────────
// Campaign endpoint — delegates to MailerLite for delivery.
// Flow per action:
//   create     → draft in local DB
//   send       → create in ML with groups matching tag_filter, schedule instant
//   schedule   → create in ML if needed, schedule for scheduled_at
//   cancel     → ML cancel + local status=draft
//   delete     → ML delete + local cascade
//   refresh-stats → poll ML, backfill sent/opened/clicked counts
// ─────────────────────────────────────────────────────────────

async function loadMailerliteConfig(client_id) {
  const rows = await supaFetch(
    `crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key,from_email,from_name`
  );
  const cfg = rows?.[0];
  if (!cfg?.mailerlite_api_key) throw new Error('No MailerLite API key configured for this client');
  if (!cfg.from_email) throw new Error('No from_email configured for this client');
  return cfg;
}

// Resolve an array of tag filters to MailerLite group IDs (creating groups if
// they don't exist yet). If no tag_filter supplied, returns [] — caller should
// fall back to the General List group.
async function resolveGroupIds(apiKey, client_id, tagFilter = []) {
  const ids = [];
  for (const entry of tagFilter) {
    if (!entry) continue;
    // Direct MailerLite group id passthrough (new groups-dropdown flow)
    if (typeof entry === 'string' && entry.startsWith('ml:')) {
      ids.push(entry.slice(3));
      continue;
    }
    try {
      const g = await ML.getOrCreateGroup(apiKey, client_id, entry);
      if (g?.group_id) ids.push(g.group_id);
    } catch (e) {
      console.error(`resolve group "${entry}" failed:`, e.message);
    }
  }
  // Always add the canonical General List as a safety net if nothing resolved
  if (!ids.length) {
    const g = await ML.getOrCreateGroup(apiKey, client_id, ML.GENERAL_LIST_GROUP_NAME);
    if (g?.group_id) ids.push(g.group_id);
  }
  return ids;
}

// Create (or update) the MailerLite campaign backing a local campaign row.
// Returns the remote campaign id.
async function pushCampaignToMailerlite(campaign, cfg) {
  const apiKey = cfg.mailerlite_api_key;
  const tagFilter = campaign.tag_filter || [];
  const groupIds = await resolveGroupIds(apiKey, campaign.client_id, tagFilter);

  const html = wrapEmailHtml(campaign.html_body || '', {
    subject: campaign.subject,
    fromName: cfg.from_name,
    previewText: campaign.preview_text,
  });

  const payload = {
    name: campaign.subject || 'Untitled',
    subject: campaign.subject,
    from: cfg.from_email,
    from_name: cfg.from_name || '',
    html,
    preview_text: campaign.preview_text || undefined,
    groupIds,
  };

  let remoteId = campaign.mailerlite_campaign_id;
  if (remoteId) {
    try {
      await ML.updateCampaign(apiKey, remoteId, {
        name: payload.name,
        emails: [{
          subject: payload.subject,
          from_name: payload.from_name,
          from: payload.from,
          content: payload.html,
          ...(payload.preview_text ? { preview_text: payload.preview_text } : {}),
        }],
        groups: groupIds.map(String),
      });
    } catch (e) {
      console.error('ML updateCampaign failed, creating new:', e.message);
      remoteId = null;
    }
  }
  if (!remoteId) {
    const created = await ML.createCampaign(apiKey, payload);
    remoteId = created?.id ? String(created.id) : null;
    if (!remoteId) throw new Error('MailerLite createCampaign returned no id');
    await supaFetch(`crm_email_campaigns?id=eq.${campaign.id}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({ mailerlite_campaign_id: remoteId, updated_at: new Date().toISOString() }),
    });
  }
  return remoteId;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tenant guard: any referenced client_id must be one the caller can see.
  const referencedClient = req.query?.client_id || req.body?.client_id;
  if (referencedClient) {
    const chk = await assertClientAccess(user, referencedClient);
    if (!chk.ok) return res.status(chk.status).json({ error: chk.error });
  }

  const { action } = req.query;

  // ─── GET — list campaigns ───
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

  // ─── POST action=create — create draft (and schedule in MailerLite if scheduled_at) ───
  if (req.method === 'POST' && action === 'create') {
    try {
      const { client_id, subject, html_body, preview_text, tag_filter, scheduled_at, trigger_on_tag, auto_trigger_enabled, trigger_type } = req.body;
      if (!client_id || !subject) return res.status(400).json({ error: 'client_id and subject required' });
      const status = auto_trigger_enabled ? 'draft' : (scheduled_at ? 'scheduled' : 'draft');
      const rows = await supaFetch('crm_email_campaigns', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify([{
          client_id,
          subject,
          html_body: html_body || '',
          preview_text: preview_text || null,
          tag_filter: tag_filter || [],
          status,
          scheduled_at: scheduled_at || null,
          trigger_on_tag: trigger_on_tag || null,
          auto_trigger_enabled: !!auto_trigger_enabled,
          trigger_type: trigger_type || 'tag',
        }]),
      });
      const created = rows?.[0];

      // If scheduled, immediately push to MailerLite + schedule the send there.
      // Keeps the local record in sync (writes mailerlite_campaign_id on success).
      if (created && scheduled_at && !auto_trigger_enabled) {
        try {
          const cfg = await loadMailerliteConfig(client_id);
          const remoteId = await pushCampaignToMailerlite(created, cfg);
          await ML.scheduleCampaign(cfg.mailerlite_api_key, remoteId, scheduled_at);
          created.mailerlite_campaign_id = remoteId;
        } catch (e) {
          console.error('Schedule-on-create failed:', e.message);
          // Keep local row, but bubble up the error so the UI can surface it
          return res.status(200).json({ ...created, schedule_warning: e.message });
        }
      }

      return res.json(created || { created: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─── POST action=send — send now via MailerLite ───
  if (req.method === 'POST' && action === 'send') {
    try {
      const { campaign_id } = req.body;
      if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

      const campaigns = await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`);
      const campaign = campaigns?.[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const cfg = await loadMailerliteConfig(campaign.client_id);
      const remoteId = await pushCampaignToMailerlite(campaign, cfg);
      await ML.scheduleCampaign(cfg.mailerlite_api_key, remoteId, null); // instant

      await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'sending',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });

      return res.json({ ok: true, status: 'sending', mailerlite_campaign_id: remoteId });
    } catch (err) {
      console.error('Send campaign error:', err);
      return res.status(500).json({ error: 'Send failed: ' + err.message });
    }
  }

  // ─── POST action=schedule — schedule for future send ───
  if (req.method === 'POST' && action === 'schedule') {
    try {
      const { campaign_id, scheduled_at } = req.body;
      if (!campaign_id || !scheduled_at) return res.status(400).json({ error: 'campaign_id and scheduled_at required' });

      const campaigns = await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`);
      const campaign = campaigns?.[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const cfg = await loadMailerliteConfig(campaign.client_id);
      const remoteId = await pushCampaignToMailerlite(campaign, cfg);
      await ML.scheduleCampaign(cfg.mailerlite_api_key, remoteId, scheduled_at);

      const rows = await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_at,
          updated_at: new Date().toISOString(),
        }),
      });
      return res.json(rows?.[0] || { scheduled: true });
    } catch (err) {
      return res.status(500).json({ error: 'Schedule failed: ' + err.message });
    }
  }

  // ─── POST action=cancel — cancel a scheduled campaign ───
  if (req.method === 'POST' && action === 'cancel') {
    try {
      const { campaign_id } = req.body;
      if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
      const campaigns = await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`);
      const campaign = campaigns?.[0];
      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
      if (!campaign.mailerlite_campaign_id) {
        // Nothing remote to cancel — just flip status back to draft
        await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'draft', updated_at: new Date().toISOString() }),
        });
        return res.json({ ok: true, status: 'draft' });
      }
      const cfg = await loadMailerliteConfig(campaign.client_id);
      try { await ML.cancelCampaign(cfg.mailerlite_api_key, campaign.mailerlite_campaign_id); }
      catch (e) { console.error('ML cancel non-fatal:', e.message); }

      await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'draft', scheduled_at: null, updated_at: new Date().toISOString() }),
      });
      return res.json({ ok: true, status: 'draft' });
    } catch (err) {
      return res.status(500).json({ error: 'Cancel failed: ' + err.message });
    }
  }

  // ─── POST action=refresh-stats — poll MailerLite for open/click counts ───
  if (req.method === 'POST' && action === 'refresh-stats') {
    try {
      const { campaign_id } = req.body;
      if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
      const campaigns = await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`);
      const campaign = campaigns?.[0];
      if (!campaign?.mailerlite_campaign_id) return res.status(400).json({ error: 'No MailerLite campaign id on record' });

      const cfg = await loadMailerliteConfig(campaign.client_id);
      const { summary } = await ML.getCampaignActivity(cfg.mailerlite_api_key, campaign.mailerlite_campaign_id);
      const stats = summary?.stats || summary || {};
      const update = {
        total_recipients: stats.sent ?? campaign.total_recipients ?? 0,
        sent_count: stats.sent ?? 0,
        opened_count: stats.opens_count ?? stats.opens ?? 0,
        clicked_count: stats.clicks_count ?? stats.clicks ?? 0,
        failed_count: (stats.hard_bounces ?? 0) + (stats.soft_bounces ?? 0),
        status: summary?.status || campaign.status,
        updated_at: new Date().toISOString(),
      };
      await supaFetch(`crm_email_campaigns?id=eq.${campaign_id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
      });
      return res.json({ ok: true, ...update });
    } catch (err) {
      return res.status(500).json({ error: 'Refresh failed: ' + err.message });
    }
  }

  // ─── PUT — update draft ───
  if (req.method === 'PUT') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id query param required' });
      const { subject, html_body, preview_text, tag_filter, scheduled_at, trigger_on_tag, auto_trigger_enabled, trigger_type } = req.body;
      const update = { updated_at: new Date().toISOString() };
      if (subject !== undefined) update.subject = subject;
      if (html_body !== undefined) update.html_body = html_body;
      if (preview_text !== undefined) update.preview_text = preview_text;
      if (tag_filter !== undefined) update.tag_filter = tag_filter;
      if (trigger_on_tag !== undefined) update.trigger_on_tag = trigger_on_tag;
      if (auto_trigger_enabled !== undefined) update.auto_trigger_enabled = !!auto_trigger_enabled;
      if (trigger_type !== undefined) update.trigger_type = trigger_type;
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

  // ─── DELETE ───
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const campaigns = await supaFetch(`crm_email_campaigns?id=eq.${id}`);
      const campaign = campaigns?.[0];
      // Best-effort remote delete
      if (campaign?.mailerlite_campaign_id) {
        try {
          const cfg = await loadMailerliteConfig(campaign.client_id);
          await ML.deleteCampaign(cfg.mailerlite_api_key, campaign.mailerlite_campaign_id);
        } catch (e) { console.error('ML deleteCampaign non-fatal:', e.message); }
      }
      await supaFetch(`crm_email_sends?campaign_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await supaFetch(`crm_email_campaigns?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Invalid method or action' });
};
