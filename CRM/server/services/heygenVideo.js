// HeyGen v3 Image-to-Video generation for Photo Avatars + external audio URL.
// Submits a job, then polls until `completed` and returns the video URL.

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const HG_BASE = 'https://api.heygen.com';

function apiKey() {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error('HEYGEN_API_KEY not set in CRM/server/.env');
  return k;
}

// Submit a lip-sync job. Returns `{ video_id }`.
async function submitVideo({ photoAvatarId, audioUrl, title = '', aspect = '9:16', resolution = '1080p' }) {
  const body = {
    type: 'avatar',
    avatar_id: photoAvatarId,
    audio_url: audioUrl,
    title,
    resolution,
    aspect_ratio: aspect,
  };
  const res = await fetch(`${HG_BASE}/v3/videos`, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey(),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`HeyGen submit ${res.status}: ${text}`);
  const videoId = json?.data?.video_id || json?.video_id || json?.data?.id || json?.id;
  if (!videoId) throw new Error(`HeyGen submit: no video_id in response: ${text}`);
  return { videoId, raw: json };
}

// Poll until completed or failed. Resolves `{ status, video_url, error }`.
async function waitForVideo(videoId, { intervalMs = 10_000, timeoutMs = 10 * 60_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`${HG_BASE}/v3/videos/${videoId}`, {
      headers: { 'X-Api-Key': apiKey(), 'Accept': 'application/json' },
    });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!res.ok) throw new Error(`HeyGen status ${res.status}: ${text}`);
    const data = json?.data || json;
    const status = data?.status;
    if (status === 'completed') {
      return { status, video_url: data.video_url || data.url };
    }
    if (status === 'failed' || status === 'error') {
      return { status: 'failed', error: data?.error || data?.message || 'HeyGen reported failure' };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`HeyGen timed out waiting for video ${videoId}`);
}

// Stream a URL to a local file.
async function downloadTo(url, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status} for ${url}`);
  const ab = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(ab));
  return destPath;
}

module.exports = { submitVideo, waitForVideo, downloadTo };
