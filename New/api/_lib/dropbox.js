// Dropbox storage for client files. Uses VTM's own Dropbox account: every
// client gets a folder under /Clients/<Business Name>/.
//
// Needs three env vars (see DROPBOX-SETUP.md):
//   DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN
// Short-lived access tokens are minted from the refresh token and cached in
// module memory for the life of the warm lambda.

const KEY = process.env.DROPBOX_APP_KEY || '';
const SECRET = process.env.DROPBOX_APP_SECRET || '';
const REFRESH = process.env.DROPBOX_REFRESH_TOKEN || '';
const ROOT = process.env.DROPBOX_ROOT || '/Clients';

let cached = { token: null, exp: 0 };

// SECRET is optional: a refresh token issued through the PKCE flow refreshes
// with the app key alone.
function configured() { return !!(KEY && REFRESH); }

async function token() {
  if (!configured()) throw new Error('Dropbox is not configured');
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const form = { grant_type: 'refresh_token', refresh_token: REFRESH };
  if (SECRET) headers.Authorization = 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64');
  else form.client_id = KEY;
  const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers,
    body: new URLSearchParams(form),
  });
  if (!res.ok) throw new Error(`Dropbox auth failed: ${await res.text()}`);
  const d = await res.json();
  cached = { token: d.access_token, exp: Date.now() + (d.expires_in || 14400) * 1000 };
  return cached.token;
}

// Dropbox rejects these in path components.
const safe = (s) => String(s || '').replace(/[\\/:?*<>"|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

// Full Dropbox path for a client file: /Clients/<Business>/<folder>/<name>
function pathFor(business, parentPath, name) {
  const parts = [ROOT, safe(business)];
  for (const seg of String(parentPath || '').split('/').filter(Boolean)) parts.push(safe(seg));
  if (name) parts.push(safe(name));
  return parts.join('/');
}

async function rpc(endpoint, body) {
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    // "already exists" on folder create is fine, everything else is real.
    if (endpoint === 'files/create_folder_v2' && text.includes('path/conflict')) return null;
    throw new Error(`Dropbox ${endpoint}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

// Create every missing level of a folder path.
async function ensureFolder(business, parentPath) {
  const segs = [safe(business), ...String(parentPath || '').split('/').filter(Boolean).map(safe)];
  let cur = ROOT;
  await rpc('files/create_folder_v2', { path: cur, autorename: false }).catch(() => {});
  for (const seg of segs) {
    cur = `${cur}/${seg}`;
    await rpc('files/create_folder_v2', { path: cur, autorename: false }).catch(() => {});
  }
  return cur;
}

// Upload bytes. Dropbox's simple endpoint takes up to 150MB in one shot.
async function upload(business, parentPath, filename, buffer) {
  await ensureFolder(business, parentPath);
  const path = pathFor(business, parentPath, filename);
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await token()}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path, mode: 'add', autorename: true, mute: true }),
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Dropbox upload failed: ${(await res.text()).slice(0, 300)}`);
  const meta = await res.json();
  return { path: meta.path_lower, id: meta.id, name: meta.name, size: meta.size };
}

// A 4-hour direct link, minted on demand so nothing is ever public.
async function tempLink(path) {
  const d = await rpc('files/get_temporary_link', { path });
  return d?.link || null;
}

async function move(fromPath, toPath) {
  return rpc('files/move_v2', { from_path: fromPath, to_path: toPath, autorename: true });
}
async function remove(path) {
  return rpc('files/delete_v2', { path });
}
async function sharedLink(path) {
  try {
    const d = await rpc('sharing/create_shared_link_with_settings', { path });
    return d?.url || null;
  } catch (e) {
    if (String(e.message).includes('shared_link_already_exists')) {
      const d = await rpc('sharing/list_shared_links', { path, direct_only: true });
      return d?.links?.[0]?.url || null;
    }
    throw e;
  }
}

module.exports = { configured, pathFor, ensureFolder, upload, tempLink, move, remove, sharedLink, ROOT, safe };
