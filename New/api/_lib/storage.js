const { SUPABASE_URL, SERVICE_KEY } = require('./supabase.js');

// Supabase Storage helpers for media that rides along with texts. Uploads
// never pass through Vercel (its request cap is small): the API hands out a
// signed upload URL and the phone or the Mac bridge PUTs the file straight
// into the bucket.
const BUCKET = 'crm-media';
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 52428800 }),
  });
  // 400/409 means it already exists; anything else is a real problem.
  if (r.ok || r.status === 400 || r.status === 409) { bucketReady = true; return; }
  throw new Error(`storage bucket: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

const safeName = (n) => String(n || 'file').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);

// { uploadUrl, publicUrl, path }: PUT the bytes to uploadUrl with the file's
// Content-Type; the file is then readable at publicUrl.
async function signedUpload(prefix, name) {
  await ensureBucket();
  const now = new Date();
  const path = `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}-${safeName(name)}`;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${path}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`signed upload: ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  // j.url is relative to /storage/v1 and already carries the token.
  const uploadUrl = `${SUPABASE_URL}/storage/v1${j.url.startsWith('/') ? '' : '/'}${j.url}`;
  return { uploadUrl, path, publicUrl: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` };
}

const kindOf = (mime, name) => {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  if (m.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/.test(n)) return 'image';
  if (m.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/.test(n)) return 'video';
  if (m.startsWith('audio/') || /\.(m4a|caf|mp3|aac)$/.test(n)) return 'audio';
  return 'file';
};

// Keep only what the app needs to render, whatever the caller sent.
function cleanAttachments(list) {
  return (Array.isArray(list) ? list : []).slice(0, 10).map(a => ({
    url: String(a?.url || '').slice(0, 600),
    type: ['image', 'video', 'audio', 'file'].includes(a?.type) ? a.type : kindOf(a?.mime, a?.name),
    name: safeName(a?.name),
    mime: String(a?.mime || '').slice(0, 80),
    size: Number(a?.size) || 0,
    width: Number(a?.width) || null,
    height: Number(a?.height) || null,
  })).filter(a => /^https?:\/\//.test(a.url));
}

module.exports = { BUCKET, ensureBucket, signedUpload, kindOf, cleanAttachments };
