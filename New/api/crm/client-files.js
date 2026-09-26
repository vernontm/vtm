import { setCors, requireStaff, supaFetch, SUPABASE_URL, SERVICE_KEY } from '../_lib/supabase.js';
import dropbox from '../_lib/dropbox.js';
import { signedUpload, BUCKET as MEDIA_BUCKET } from '../_lib/storage.js';

// Per-client file manager: folders, uploads, drag-to-organize.
//   GET  ?action=list&client_id=&path=        list one folder
//   GET  ?action=tree&client_id=              all folders (for the move menu)
//   POST ?action=upload  {client_id, path, filename, content_type, data_base64}
//   POST ?action=mkdir   {client_id, path, name}
//   POST ?action=rename  {id, name}
//   POST ?action=move    {id, to_path}
//   POST ?action=delete  {id}
//   POST ?action=upload-url {client_id, name}     phone: a signed upload spot
//   POST ?action=create  {client_id, name, url, mime, size}   phone: record it
//
// Storage keys stay flat (`<client_id>/<ts>_<rand>_<name>`); folder structure is
// logical and lives in `parent_path`, so moving/renaming never touches storage.

const BUCKET = 'client-documents';
const MAX_BYTES = 25 * 1024 * 1024;        // legacy base64 path (Vercel body cap ~4.5MB)
const MAX_DIRECT = 500 * 1024 * 1024;      // direct-to-storage path
const T = 'crm_client_files';

const clean = (s) => String(s || '').replace(/[\\/]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);
const normPath = (p) => String(p || '').split('/').map(x => x.trim()).filter(Boolean).join('/');
const q = encodeURIComponent;
const fullPath = (r) => (r.parent_path ? `${r.parent_path}/${r.name}` : r.name);

// Append " (2)", " (3)"… when a name already exists in the destination folder.
async function uniqueName(clientId, path, name) {
  const rows = await supaFetch(`${T}?client_id=eq.${clientId}&parent_path=eq.${q(path)}&select=name`) || [];
  const taken = new Set(rows.map(r => r.name));
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 500; i++) if (!taken.has(`${base} (${i})${ext}`)) return `${base} (${i})${ext}`;
  return `${base} (${Date.now()})${ext}`;
}

// Ensure every segment of a path exists as a folder row (for folder uploads).
async function ensureFolders(clientId, path, who) {
  const segs = normPath(path).split('/').filter(Boolean);
  let parent = '';
  for (const seg of segs) {
    const found = await supaFetch(`${T}?client_id=eq.${clientId}&parent_path=eq.${q(parent)}&name=eq.${q(seg)}&is_folder=eq.true&select=id&limit=1`);
    if (!found || !found.length) {
      await supaFetch(T, {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ client_id: clientId, name: seg, parent_path: parent, is_folder: true, uploaded_by: who }),
      }).catch(() => {});
    }
    parent = parent ? `${parent}/${seg}` : seg;
  }
  return parent;
}

async function removeStorage(keys, bucket = BUCKET) {
  const list = (keys || []).filter(Boolean);
  if (!list.length) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: list }),
  }).catch(() => {});
}

// A storage_key says where the bytes actually live: "dropbox:<path>" (handled
// by the caller), "crm-media:<path>" for a phone upload, or a bare key in the
// client-documents bucket. Delete each group from the bucket that holds it.
async function removeByKeys(keys) {
  const list = (keys || []).filter(Boolean);
  const prefix = `${MEDIA_BUCKET}:`;
  await removeStorage(list.filter(k => !k.startsWith(prefix) && !k.startsWith('dropbox:')), BUCKET);
  await removeStorage(list.filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)), MEDIA_BUCKET);
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  // requireStaff (not requireAuth) so `uploaded_by` records the person who
  // actually sent the file instead of a flat "Team".
  const user = await requireStaff(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const who = user.email || 'Team';
  const action = req.query?.action || (req.method === 'GET' ? 'list' : '');

  try {
    if (req.method === 'GET' && action === 'list') {
      const { client_id } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const path = normPath(req.query.path);
      const rows = await supaFetch(`${T}?client_id=eq.${client_id}&parent_path=eq.${q(path)}&select=*&order=is_folder.desc,name.asc`) || [];
      return res.json({ ok: true, path, items: rows });
    }

    if (req.method === 'GET' && action === 'tree') {
      const { client_id } = req.query;
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch(`${T}?client_id=eq.${client_id}&is_folder=eq.true&select=id,name,parent_path&order=parent_path.asc,name.asc`) || [];
      return res.json({ ok: true, folders: rows.map(r => ({ ...r, path: fullPath(r) })) });
    }

    if (req.method === 'POST' && action === 'mkdir') {
      const { client_id, name } = req.body || {};
      if (!client_id || !name) return res.status(400).json({ error: 'client_id and name required' });
      const path = normPath((req.body || {}).path);
      const safe = clean(name) || 'New folder';
      const finalName = await uniqueName(client_id, path, safe);
      const row = await supaFetch(T, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ client_id, name: finalName, parent_path: path, is_folder: true, uploaded_by: who }),
      });
      return res.json({ ok: true, item: row?.[0] || null });
    }

    if (req.method === 'POST' && action === 'upload') {
      const { client_id, filename, content_type, data_base64 } = req.body || {};
      if (!client_id || !filename || !data_base64) return res.status(400).json({ error: 'client_id, filename, data_base64 required' });
      const b64 = data_base64.includes(',') ? data_base64.split(',')[1] : data_base64;
      const buffer = Buffer.from(b64, 'base64');
      if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'File too large (max 25MB)' });

      // A folder drop sends "Sub/Dir/file.png" in `path`; create those folders.
      let path = normPath((req.body || {}).path);
      if (path) path = await ensureFolders(client_id, path, who);

      const mime = content_type || 'application/octet-stream';
      const display = clean(filename) || 'file';
      const storageSafe = display.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
      const key = `${client_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${storageSafe}`;

      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': mime, 'x-upsert': 'true' },
        body: buffer,
      });
      if (!up.ok) return res.status(500).json({ error: `Upload failed: ${await up.text()}` });

      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
      const finalName = await uniqueName(client_id, path, display);
      const row = await supaFetch(T, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ client_id, name: finalName, parent_path: path, is_folder: false, storage_key: key, url, mime, size: buffer.length, uploaded_by: who }),
      });
      return res.json({ ok: true, item: row?.[0] || null });
    }

    // --- Direct-to-storage upload (bypasses the 4.5MB function body limit) ---
    // 1. client asks for a signed URL, 2. browser PUTs the bytes straight to
    // storage, 3. client calls `register` so we record the row.
    if (req.method === 'POST' && action === 'sign-upload') {
      const { client_id, filename, size } = req.body || {};
      if (!client_id || !filename) return res.status(400).json({ error: 'client_id and filename required' });
      if (Number(size) > MAX_DIRECT) return res.status(413).json({ error: 'File too large (max 500MB)' });

      let path = normPath((req.body || {}).path);
      if (path) path = await ensureFolders(client_id, path, who);

      const display = clean(filename) || 'file';
      const storageSafe = display.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
      const key = `${client_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${storageSafe}`;

      const signRes = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/${BUCKET}/${key}`, {
        method: 'POST',
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: '{}',   // storage rejects an empty body when content-type is JSON
      });
      if (!signRes.ok) return res.status(500).json({ error: `Could not sign upload: ${await signRes.text()}` });
      const signed = await signRes.json();
      const rel = signed.url || signed.signedURL || '';
      return res.json({
        ok: true,
        key,
        path,
        name: display,
        upload_url: rel.startsWith('http') ? rel : `${SUPABASE_URL}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`,
      });
    }

    // --- Phone upload (the iPhone app) ----------------------------------
    // Same two steps the iMessage composer uses: ask for a signed spot, PUT
    // the bytes straight to storage, then record the row. The bytes land in
    // the public crm-media bucket, so the app can draw a thumbnail with no
    // auth header, and the storage_key is namespaced to that bucket.
    if (req.method === 'POST' && action === 'upload-url') {
      const { client_id, name } = req.body || {};
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      if (!/^[\w-]{1,64}$/.test(String(client_id))) return res.status(400).json({ error: 'bad client_id' });
      const spot = await signedUpload(`clients/${client_id}`, name);
      return res.json({ ok: true, bucket: MEDIA_BUCKET, ...spot });
    }

    if (req.method === 'POST' && action === 'create') {
      const { client_id, name, url, mime, size } = req.body || {};
      if (!client_id || !url) return res.status(400).json({ error: 'client_id and url required' });
      // Only our own storage may be recorded as a client file, so a caller can
      // never point a row at somebody else's host.
      const publicBase = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/`;
      if (!String(url).startsWith(publicBase)) return res.status(400).json({ error: 'url must come from action=upload-url' });
      if (Number(size) > MAX_DIRECT) return res.status(413).json({ error: 'File too large (max 500MB)' });

      const path = normPath((req.body || {}).path);
      const finalName = await uniqueName(client_id, path, clean(name) || 'file');
      const row = await supaFetch(T, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          client_id, name: finalName, parent_path: path, is_folder: false,
          storage_key: `${MEDIA_BUCKET}:${String(url).slice(publicBase.length)}`,
          url, mime: mime || 'application/octet-stream',
          size: Number(size) || 0, uploaded_by: who,
        }),
      });
      return res.json({ ok: true, item: row?.[0] || null });
    }

    if (req.method === 'POST' && action === 'register') {
      const { client_id, filename, key, mime, size } = req.body || {};
      if (!client_id || !filename || !key) return res.status(400).json({ error: 'client_id, filename, key required' });
      const path = normPath((req.body || {}).path);
      const finalName = await uniqueName(client_id, path, clean(filename) || 'file');
      const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`;
      const row = await supaFetch(T, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          client_id, name: finalName, parent_path: path, is_folder: false,
          storage_key: key, url, mime: mime || 'application/octet-stream',
          size: Number(size) || 0, uploaded_by: who,
        }),
      });
      return res.json({ ok: true, item: row?.[0] || null });
    }

    // --- Dropbox upload -------------------------------------------------
    // Sends the bytes to VTM's Dropbox under /Clients/<Business>/ and stores a
    // pointer row. Falls back nowhere: if Dropbox is not configured the client
    // keeps using the Supabase path, so this is purely additive.
    if (req.method === 'POST' && action === 'upload-dropbox') {
      if (!dropbox.configured()) {
        return res.status(503).json({ error: 'Dropbox is not connected yet. Add DROPBOX_APP_KEY, DROPBOX_APP_SECRET and DROPBOX_REFRESH_TOKEN.' });
      }
      const { client_id, filename, content_type, data_base64 } = req.body || {};
      if (!client_id || !filename || !data_base64) return res.status(400).json({ error: 'client_id, filename, data_base64 required' });

      const [cl] = await supaFetch(`crm_clients?id=eq.${client_id}&select=business_name`) || [];
      if (!cl) return res.status(404).json({ error: 'Client not found' });

      const b64 = data_base64.includes(',') ? data_base64.split(',')[1] : data_base64;
      const buffer = Buffer.from(b64, 'base64');

      let path = normPath((req.body || {}).path);
      if (path) path = await ensureFolders(client_id, path, who);

      const up = await dropbox.upload(cl.business_name, path, filename, buffer);
      const finalName = await uniqueName(client_id, path, clean(filename) || 'file');
      const row = await supaFetch(T, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          client_id, name: finalName, parent_path: path, is_folder: false,
          storage_key: `dropbox:${up.path}`, url: null,
          mime: content_type || 'application/octet-stream',
          size: up.size || buffer.length, uploaded_by: who,
        }),
      });
      return res.json({ ok: true, item: row?.[0] || null, dropbox_path: up.path });
    }

    // Dropbox files have no public URL, so mint a short-lived one on click.
    if (req.method === 'GET' && action === 'link') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id required' });
      const [row] = await supaFetch(`${T}?id=eq.${id}&select=storage_key,url`) || [];
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.storage_key && row.storage_key.startsWith('dropbox:')) {
        if (!dropbox.configured()) return res.status(503).json({ error: 'Dropbox is not connected' });
        const link = await dropbox.tempLink(row.storage_key.slice(8));
        return res.json({ ok: true, url: link });
      }
      return res.json({ ok: true, url: row.url });
    }

    if (req.method === 'POST' && action === 'rename') {
      const { id, name } = req.body || {};
      if (!id || !name) return res.status(400).json({ error: 'id and name required' });
      const [row] = await supaFetch(`${T}?id=eq.${id}&select=*`) || [];
      if (!row) return res.status(404).json({ error: 'Not found' });
      const safe = clean(name);
      if (!safe) return res.status(400).json({ error: 'Invalid name' });
      if (safe === row.name) return res.json({ ok: true, item: row });
      const finalName = await uniqueName(row.client_id, row.parent_path, safe);

      // Renaming a folder re-points every descendant's parent_path.
      if (row.is_folder) {
        const oldFull = fullPath(row);
        const newFull = row.parent_path ? `${row.parent_path}/${finalName}` : finalName;
        const kids = await supaFetch(`${T}?client_id=eq.${row.client_id}&or=(parent_path.eq.${q(oldFull)},parent_path.like.${q(oldFull + '/')}*)&select=id,parent_path`) || [];
        for (const k of kids) {
          const next = newFull + k.parent_path.slice(oldFull.length);
          await supaFetch(`${T}?id=eq.${k.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ parent_path: next, updated_at: new Date().toISOString() }) });
        }
      }
      const updated = await supaFetch(`${T}?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name: finalName, updated_at: new Date().toISOString() }),
      });
      return res.json({ ok: true, item: updated?.[0] || null });
    }

    if (req.method === 'POST' && action === 'move') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const toPath = normPath((req.body || {}).to_path);
      const [row] = await supaFetch(`${T}?id=eq.${id}&select=*`) || [];
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (row.parent_path === toPath) return res.json({ ok: true, item: row });

      const oldFull = fullPath(row);
      // Guard: never drop a folder inside itself or its own descendants.
      if (row.is_folder && (toPath === oldFull || toPath.startsWith(oldFull + '/'))) {
        return res.status(400).json({ error: 'Cannot move a folder into itself' });
      }
      const finalName = await uniqueName(row.client_id, toPath, row.name);
      if (row.is_folder) {
        const newFull = toPath ? `${toPath}/${finalName}` : finalName;
        const kids = await supaFetch(`${T}?client_id=eq.${row.client_id}&or=(parent_path.eq.${q(oldFull)},parent_path.like.${q(oldFull + '/')}*)&select=id,parent_path`) || [];
        for (const k of kids) {
          const next = newFull + k.parent_path.slice(oldFull.length);
          await supaFetch(`${T}?id=eq.${k.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ parent_path: next, updated_at: new Date().toISOString() }) });
        }
      }
      const updated = await supaFetch(`${T}?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ parent_path: toPath, name: finalName, updated_at: new Date().toISOString() }),
      });
      return res.json({ ok: true, item: updated?.[0] || null });
    }

    if (req.method === 'POST' && action === 'delete') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const [row] = await supaFetch(`${T}?id=eq.${id}&select=*`) || [];
      if (!row) return res.status(404).json({ error: 'Not found' });

      if (row.is_folder) {
        const full = fullPath(row);
        const kids = await supaFetch(`${T}?client_id=eq.${row.client_id}&or=(parent_path.eq.${q(full)},parent_path.like.${q(full + '/')}*)&select=id,storage_key`) || [];
        await removeByKeys(kids.map(k => k.storage_key));
        for (const k of kids) await supaFetch(`${T}?id=eq.${k.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      } else if (row.storage_key && row.storage_key.startsWith('dropbox:')) {
        if (dropbox.configured()) await dropbox.remove(row.storage_key.slice(8)).catch(() => {});
      } else {
        await removeByKeys([row.storage_key]);
      }
      await supaFetch(`${T}?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return res.json({ ok: true, deleted: id });
    }

    return res.status(405).json({ error: 'Unsupported action' });
  } catch (err) {
    console.error('client-files error:', err);
    return res.status(500).json({ error: err.message });
  }
}
