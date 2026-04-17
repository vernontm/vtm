import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

const UP_BASE = 'https://api.upload-post.com/api';
const UP_KEY  = process.env.UPLOADPOST_API_KEY;

function upHeaders(extra = {}) {
  return { 'Authorization': `Apikey ${UP_KEY}`, 'Content-Type': 'application/json', ...extra };
}

async function upFetch(path, options = {}) {
  const res = await fetch(`${UP_BASE}${path}`, options);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw Object.assign(new Error(body?.error || body?.message || text), { status: res.status, body });
  return body;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (!UP_KEY) return res.status(500).json({ error: 'UPLOADPOST_API_KEY not configured' });

  const { action } = req.query;

  try {

    // ── GET user profiles ─────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'profiles') {
      const data = await upFetch('/uploadposts/users', { headers: upHeaders() });
      return res.json(data);
    }

    // ── Publish / schedule a post ─────────────────────────────────────────────
    if (req.method === 'POST' && action === 'publish') {
      const {
        script_id, client_id,
        user, platforms, title, caption, hashtags, description,
        media_urls, media_type,          // 'video' | 'photo' | 'text'
        scheduled_date, timezone,
        first_comment,
        // platform-specific
        tiktok_privacy, instagram_media_type,
        facebook_page_id, youtube_privacy,
      } = req.body;

      if (!user)       return res.status(400).json({ error: 'user required' });
      if (!platforms?.length) return res.status(400).json({ error: 'platforms required' });

      const fullCaption = [caption, hashtags].filter(Boolean).join('\n\n');
      const postTitle   = title || fullCaption.slice(0, 100);
      const mediaUrl    = (media_urls || [])[0] || null;

      // Build multipart/form-data body
      const form = new URLSearchParams();
      form.append('user', user);
      (platforms || []).forEach(p => form.append('platform[]', p));
      if (postTitle)      form.append('title', postTitle);
      if (fullCaption)    form.append('description', fullCaption);
      if (scheduled_date) form.append('scheduled_date', scheduled_date);
      if (timezone)       form.append('timezone', timezone);
      if (first_comment)  form.append('first_comment', first_comment);
      form.append('async_upload', 'true');

      // Platform-specific
      if (tiktok_privacy)          form.append('privacy_level', tiktok_privacy);
      if (instagram_media_type)    form.append('media_type', instagram_media_type);
      if (facebook_page_id)        form.append('facebook_page_id', facebook_page_id);
      if (youtube_privacy)         form.append('privacyStatus', youtube_privacy);

      let endpoint;
      if (media_type === 'video' && mediaUrl) {
        form.append('video', mediaUrl);
        endpoint = '/upload';
      } else if (media_type === 'photo' && mediaUrl) {
        form.append('photo', mediaUrl);
        endpoint = '/uploadposts/photo';
      } else {
        endpoint = '/uploadposts/text';
      }

      const upRes = await fetch(`${UP_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Apikey ${UP_KEY}` },
        body: form,
      });
      const upText = await upRes.text();
      let upBody; try { upBody = JSON.parse(upText); } catch { upBody = { raw: upText }; }
      if (!upRes.ok) return res.status(upRes.status).json({ error: upBody?.error || upText });

      const requestId = upBody.request_id || upBody.requestId;

      // Save request_id + status to script record
      if (script_id) {
        await supaFetch(`crm_content_scripts?id=eq.${script_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            uploadpost_request_id: requestId,
            publish_status: scheduled_date ? 'scheduled' : 'publishing',
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }

      return res.json({ ...upBody, request_id: requestId });
    }

    // ── Check upload status ───────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'status') {
      const { request_id, job_id } = req.query;
      const qs = request_id ? `request_id=${request_id}` : `job_id=${job_id}`;
      const data = await upFetch(`/uploadposts/status?${qs}`, { headers: upHeaders() });

      // Auto-update script status if complete/failed
      if (request_id) {
        const status = data.status;
        if (status === 'completed' || status === 'failed') {
          const scripts = await supaFetch(
            `crm_content_scripts?uploadpost_request_id=eq.${encodeURIComponent(request_id)}&select=id`
          ).catch(() => []);
          if (scripts?.[0]?.id) {
            await supaFetch(`crm_content_scripts?id=eq.${scripts[0].id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                publish_status: status,
                updated_at: new Date().toISOString(),
              }),
            }).catch(() => {});
          }
        }
      }

      return res.json(data);
    }

    // ── Instagram Comments ────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'comments') {
      const { user, post_url, post_id } = req.query;
      const qs = new URLSearchParams({ platform: 'instagram', user });
      if (post_url) qs.set('post_url', post_url);
      if (post_id)  qs.set('post_id', post_id);
      const data = await upFetch(`/uploadposts/comments?${qs}`, { headers: upHeaders() });
      return res.json(data);
    }

    if (req.method === 'POST' && action === 'comments-reply') {
      const { user, comment_id, message } = req.body;
      const data = await upFetch('/uploadposts/comments/reply', {
        method: 'POST',
        headers: upHeaders(),
        body: JSON.stringify({ platform: 'instagram', user, comment_id, message }),
      });
      return res.json(data);
    }

    if (req.method === 'POST' && action === 'comments-public-reply') {
      const { user, comment_id, message } = req.body;
      const data = await upFetch('/uploadposts/comments/public-reply', {
        method: 'POST',
        headers: upHeaders(),
        body: JSON.stringify({ platform: 'instagram', user, comment_id, message }),
      });
      return res.json(data);
    }

    // ── Instagram DMs ─────────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'dm-send') {
      const { user, recipient_id, message } = req.body;
      const data = await upFetch('/uploadposts/dms/send', {
        method: 'POST',
        headers: upHeaders(),
        body: JSON.stringify({ platform: 'instagram', user, recipient_id, message }),
      });
      return res.json(data);
    }

    if (req.method === 'GET' && action === 'dm-conversations') {
      const { user } = req.query;
      const data = await upFetch(`/uploadposts/dms/conversations?platform=instagram&user=${user}`, {
        headers: upHeaders(),
      });
      return res.json(data);
    }

    // ── AutoDM Monitors ───────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'autodm-start') {
      const { user, post_url, reply_message, monitoring_interval, trigger_keywords } = req.body;
      const body = { profile_username: user, post_url, reply_message };
      if (monitoring_interval) body.monitoring_interval = monitoring_interval;
      if (trigger_keywords)    body.trigger_keywords    = trigger_keywords;
      const data = await upFetch('/uploadposts/autodms/start', {
        method: 'POST', headers: upHeaders(), body: JSON.stringify(body),
      });
      return res.json(data);
    }

    if (req.method === 'GET' && action === 'autodm-status') {
      const data = await upFetch('/uploadposts/autodms/status', { headers: upHeaders() });
      return res.json(data);
    }

    if (req.method === 'GET' && action === 'autodm-logs') {
      const { monitor_id } = req.query;
      const data = await upFetch(`/uploadposts/autodms/logs?monitor_id=${monitor_id}`, { headers: upHeaders() });
      return res.json(data);
    }

    if (req.method === 'POST' && action === 'autodm-pause') {
      const data = await upFetch('/uploadposts/autodms/pause', {
        method: 'POST', headers: upHeaders(), body: JSON.stringify({ monitor_id: req.body.monitor_id }),
      });
      return res.json(data);
    }

    if (req.method === 'POST' && action === 'autodm-resume') {
      const data = await upFetch('/uploadposts/autodms/resume', {
        method: 'POST', headers: upHeaders(), body: JSON.stringify({ monitor_id: req.body.monitor_id }),
      });
      return res.json(data);
    }

    if (req.method === 'POST' && action === 'autodm-stop') {
      const data = await upFetch('/uploadposts/autodms/stop', {
        method: 'POST', headers: upHeaders(), body: JSON.stringify({ monitor_id: req.body.monitor_id }),
      });
      return res.json(data);
    }

    if (req.method === 'POST' && action === 'autodm-delete') {
      const data = await upFetch('/uploadposts/autodms/delete', {
        method: 'POST', headers: upHeaders(), body: JSON.stringify({ monitor_id: req.body.monitor_id }),
      });
      return res.json(data);
    }

    // ── Analytics ─────────────────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'analytics') {
      const { user, platforms, period, start_date, end_date } = req.query;
      const qs = new URLSearchParams({ platforms: platforms || 'instagram,tiktok' });
      if (period)     qs.set('period', period);
      if (start_date) qs.set('start_date', start_date);
      if (end_date)   qs.set('end_date', end_date);
      const data = await upFetch(`/analytics/${user}?${qs}`, { headers: upHeaders() });
      return res.json(data);
    }

    if (req.method === 'GET' && action === 'total-impressions') {
      const { user, period, breakdown } = req.query;
      const qs = new URLSearchParams();
      if (period)    qs.set('period', period || 'last_month');
      if (breakdown) qs.set('breakdown', 'true');
      const data = await upFetch(`/uploadposts/total-impressions/${user}?${qs}`, { headers: upHeaders() });
      return res.json(data);
    }

    if (req.method === 'GET' && action === 'post-analytics') {
      const { request_id } = req.query;
      const data = await upFetch(`/uploadposts/post-analytics/${request_id}`, { headers: upHeaders() });
      return res.json(data);
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });

  } catch (err) {
    console.error('UploadPost error:', err);
    return res.status(err.status || 500).json({ error: err.message, details: err.body });
  }
}
