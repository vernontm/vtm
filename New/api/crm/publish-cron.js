const { setCors, supaFetch } = require('../_lib/supabase.js');

// Vercel cron. Fires scheduled social posts (crm_content_scripts) that are
// due now and haven't been handed to upload-post yet, plus polls in-flight
// uploads and flips them to 'posted' when upload-post reports complete.

const UP_BASE = 'https://api.upload-post.com/api';
const UP_KEY  = process.env.UPLOADPOST_API_KEY;

function upAuthHeader() {
  return { 'Authorization': `Apikey ${UP_KEY}` };
}

async function publishScript(script, client) {
  const platforms = Array.isArray(client.uploadpost_platforms) && client.uploadpost_platforms.length
    ? client.uploadpost_platforms
    : ['instagram', 'tiktok'];

  const caption   = script.caption || '';
  const hashtags  = script.hashtags || '';
  const title     = script.title || '';
  const mediaType = script.media_type || 'video';
  const mediaUrl  = (script.media_urls || [])[0] || null;
  const fullCaption = [caption, hashtags].filter(Boolean).join('\n\n');

  const titlePlatforms = ['youtube', 'linkedin'];
  const needsTitle = platforms.some(p => titlePlatforms.includes(p));
  const hasTikTok  = platforms.includes('tiktok');

  const form = new URLSearchParams();
  form.append('user', client.uploadpost_user);
  platforms.forEach(p => form.append('platform[]', p));
  if (needsTitle && title) form.append('title', title);
  if (fullCaption)         form.append('description', fullCaption);
  if (hasTikTok && fullCaption) form.append('tiktok_title', fullCaption.slice(0, 2200));
  if (script.first_comment)     form.append('first_comment', script.first_comment);
  if (script.cover_timestamp != null) {
    form.append('cover_timestamp', String(script.cover_timestamp));
    form.append('thumb_offset', String(script.cover_timestamp));
    form.append('pinterest_cover_image_key_frame_time', String(script.cover_timestamp));
  }
  form.append('async_upload', 'true');

  let endpoint;
  if (mediaType === 'video' && mediaUrl) {
    form.append('video', mediaUrl);
    endpoint = '/upload';
  } else if (mediaType === 'photo' && mediaUrl) {
    form.append('photo', mediaUrl);
    endpoint = '/uploadposts/photo';
  } else {
    endpoint = '/uploadposts/text';
  }

  const res = await fetch(`${UP_BASE}${endpoint}`, {
    method: 'POST',
    headers: upAuthHeader(),
    body: form,
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    throw new Error(body?.error || body?.message || text.slice(0, 300));
  }
  return body.request_id || body.requestId || null;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cronSecret = req.headers['authorization'];
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && cronSecret !== `Bearer ${expectedSecret}`) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!UP_KEY) {
    return res.status(500).json({ error: 'UPLOADPOST_API_KEY not configured' });
  }

  const now = new Date().toISOString();
  const results = { published: 0, polled: 0, completed: 0, failed: 0, skipped: 0, errors: [] };

  try {
    // ── 1. Fire due scheduled posts that haven't been sent to upload-post ──
    const due = await supaFetch(
      `crm_content_scripts?status=eq.scheduled&publish_status=is.null&scheduled_datetime=lte.${encodeURIComponent(now)}&order=scheduled_datetime.asc&limit=50`
    );

    // Cache clients per run
    const clientCache = {};

    for (const script of (due || [])) {
      try {
        if (!script.client_id) { results.skipped++; continue; }
        if (!(script.media_urls || []).length && script.media_type !== 'text') {
          results.skipped++;
          await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ publish_status: 'failed', updated_at: now }),
          }).catch(() => {});
          results.errors.push(`Script ${script.id}: no media_url`);
          continue;
        }

        let client = clientCache[script.client_id];
        if (!client) {
          const rows = await supaFetch(
            `crm_content_clients?id=eq.${script.client_id}&select=id,uploadpost_user,uploadpost_platforms`
          );
          client = rows?.[0];
          clientCache[script.client_id] = client;
        }
        if (!client?.uploadpost_user) {
          results.skipped++;
          await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ publish_status: 'failed', updated_at: now }),
          }).catch(() => {});
          results.errors.push(`Script ${script.id}: client has no uploadpost_user`);
          continue;
        }

        // Mark as publishing before we fire so another tick doesn't double-send.
        await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ publish_status: 'publishing', updated_at: now }),
        });

        const requestId = await publishScript(script, client);

        await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            uploadpost_request_id: requestId,
            publish_status: 'publishing',
            updated_at: new Date().toISOString(),
          }),
        }).catch(() => {});

        results.published++;
      } catch (e) {
        results.errors.push(`Script ${script.id}: ${e.message}`);
        await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ publish_status: 'failed', updated_at: new Date().toISOString() }),
        }).catch(() => {});
      }
    }

    // ── 2. Poll in-flight uploads; flip to posted/failed when done ──
    const inFlight = await supaFetch(
      `crm_content_scripts?publish_status=in.(publishing,scheduled)&uploadpost_request_id=not.is.null&select=id,uploadpost_request_id&limit=100`
    );

    for (const script of (inFlight || [])) {
      try {
        const rid = script.uploadpost_request_id;
        if (!rid) continue;
        const r = await fetch(
          `${UP_BASE}/uploadposts/status?request_id=${encodeURIComponent(rid)}`,
          { headers: { ...upAuthHeader(), 'Content-Type': 'application/json' } }
        );
        const txt = await r.text();
        let data; try { data = JSON.parse(txt); } catch { data = {}; }
        if (!r.ok) continue;

        results.polled++;
        const s = data.status;
        if (s === 'completed' || s === 'failed') {
          const patch = {
            publish_status: s,
            updated_at: new Date().toISOString(),
          };
          if (s === 'completed') { patch.status = 'posted'; results.completed++; }
          else { results.failed++; }
          await supaFetch(`crm_content_scripts?id=eq.${script.id}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          }).catch(() => {});
        }
      } catch (e) {
        results.errors.push(`Poll ${script.id}: ${e.message}`);
      }
    }

    return res.json({ ok: true, processed_at: now, ...results });
  } catch (err) {
    console.error('Publish cron error:', err);
    return res.status(500).json({ error: err.message });
  }
};
