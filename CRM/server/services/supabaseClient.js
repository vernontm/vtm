// Minimal Supabase REST + Storage client used by the local render worker.
// Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from env (or CRM_SUPABASE_* overrides).

const fs   = require('fs');
const path = require('path');

const SUPABASE_URL  = process.env.CRM_SUPABASE_URL  || process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;

function ensureConfigured() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Supabase not configured for render worker. Add SUPABASE_URL and SUPABASE_SERVICE_KEY to CRM/server/.env');
  }
}

function authHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
  };
}

async function supaFetch(restPath, options = {}) {
  ensureConfigured();
  const url = `${SUPABASE_URL}/rest/v1/${restPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// Upload a local file to Supabase Storage and return its public URL.
// Defaults to `blog-media` bucket with an `avatars/` prefix. Retries up to
// 3 times with backoff, since large MP4s occasionally hit transient socket
// errors (fetch failed) mid-upload.
async function uploadFile(localPath, {
  bucket = 'blog-media',
  keyPrefix = 'avatars',
  contentType,
} = {}) {
  ensureConfigured();
  const buf  = fs.readFileSync(localPath);
  const sizeMb = (buf.length / 1024 / 1024).toFixed(1);
  const ext  = path.extname(localPath).replace('.', '') || 'bin';
  const key  = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const guess = {
    mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  }[ext.toLowerCase()] || 'application/octet-stream';

  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${key}`;
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': contentType || guess,
          'Content-Length': String(buf.length),
        },
        body: buf,
        // Disable keep-alive reuse on retries to avoid stale sockets
        duplex: 'half',
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err}`);
      }
      return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}`;
    } catch (err) {
      const cause = err?.cause?.message || err?.cause?.code || '';
      lastErr = new Error(`upload attempt ${attempt}/3 failed (${sizeMb} MB): ${err.message}${cause ? ` — ${cause}` : ''}`);
      console.error(`[uploadFile] ${lastErr.message}`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
  throw lastErr;
}

async function getRender(id) {
  const rows = await supaFetch(`crm_avatar_renders?id=eq.${id}`);
  return rows[0] || null;
}

async function updateRender(id, patch) {
  const rows = await supaFetch(`crm_avatar_renders?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return rows[0] || null;
}

async function claimNextPendingRender() {
  // Grab the oldest pending render. Using a two-step claim (read + conditional update)
  // to avoid multiple workers grabbing the same row — practical for a single Mac.
  const rows = await supaFetch(
    `crm_avatar_renders?status=eq.pending&order=created_at.asc&limit=1`
  );
  const row = rows[0];
  if (!row) return null;
  const claimed = await supaFetch(
    `crm_avatar_renders?id=eq.${row.id}&status=eq.pending`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'generating_audio', error: null }),
    },
  );
  if (!claimed || !claimed[0]) return null; // someone else grabbed it
  return claimed[0];
}

// Append a log line onto the render row via the append_render_log RPC.
// Fails silently — we never want a DB hiccup to kill a render.
async function appendLog(renderId, message) {
  try {
    ensureConfigured();
    const entry = { t: new Date().toISOString(), m: String(message) };
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/append_render_log`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_id: renderId, p_entry: entry }),
    });
  } catch (err) {
    console.error('[appendLog] failed:', err.message);
  }
}

async function getAvatar(id) {
  const rows = await supaFetch(`crm_avatars?id=eq.${id}`);
  return rows[0] || null;
}

async function getLook(id) {
  const rows = await supaFetch(`crm_avatar_looks?id=eq.${id}`);
  return rows[0] || null;
}

module.exports = {
  SUPABASE_URL, SERVICE_KEY,
  supaFetch, uploadFile,
  getRender, updateRender, claimNextPendingRender,
  getAvatar, getLook,
  appendLog,
};
