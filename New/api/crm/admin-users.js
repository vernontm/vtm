// Admin-only CRUD for CRM users + their (client, allowed_pages) grants.
// All routes require the caller to be flagged is_admin in auth.users
// (raw_user_meta_data / app_metadata).
//
//   GET    /api/crm/admin-users                    -> list users with grants
//   POST   /api/crm/admin-users                    -> create user { email, password, is_admin?, grants? }
//   PUT    /api/crm/admin-users?id=<uid>           -> update user { is_admin? }
//   DELETE /api/crm/admin-users?id=<uid>           -> delete auth user (cascades grants)
//   POST   /api/crm/admin-users?id=<uid>&action=grant   -> upsert { client_id, allowed_pages, role? }
//   DELETE /api/crm/admin-users?id=<uid>&client_id=<c>&action=grant -> revoke grant

const { setCors, requireCrmUser, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

async function adminFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(body?.msg || body?.error || `auth admin error ${res.status}`);
  return body;
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });

  const { id, action, client_id } = req.query;

  try {
    // ── Grant management ────────────────────────────────────────────────
    if (action === 'grant' && id) {
      if (req.method === 'POST') {
        const { client_id: cid, allowed_pages = [], role = 'viewer' } = req.body || {};
        if (!cid) return res.status(400).json({ error: 'client_id required' });
        // Upsert (user_id, client_id) grant
        const existing = await supaFetch(`crm_user_access?user_id=eq.${id}&client_id=eq.${cid}&select=user_id`);
        if (existing && existing.length) {
          const updated = await supaFetch(`crm_user_access?user_id=eq.${id}&client_id=eq.${cid}`, {
            method: 'PATCH',
            body: JSON.stringify({ allowed_pages, role, updated_at: new Date().toISOString() }),
          });
          return res.json(updated?.[0] || updated);
        }
        const created = await supaFetch('crm_user_access', {
          method: 'POST',
          body: JSON.stringify({ user_id: id, client_id: cid, allowed_pages, role }),
        });
        return res.status(201).json(created?.[0] || created);
      }
      if (req.method === 'DELETE') {
        if (!client_id) return res.status(400).json({ error: 'client_id required' });
        await supaFetch(`crm_user_access?user_id=eq.${id}&client_id=eq.${client_id}`, { method: 'DELETE' });
        return res.json({ success: true });
      }
      return res.status(405).json({ error: 'Method not allowed for action=grant' });
    }

    // ── User CRUD ───────────────────────────────────────────────────────
    if (req.method === 'GET') {
      // List auth users via admin API, then join grants
      const authResp = await adminFetch('users?per_page=200');
      const authUsers = Array.isArray(authResp?.users) ? authResp.users : [];
      const grants = await supaFetch(
        `crm_user_access?select=user_id,client_id,role,allowed_pages,client:crm_content_clients(id,business_name)`
      );
      const byUser = {};
      for (const g of grants || []) {
        (byUser[g.user_id] = byUser[g.user_id] || []).push({
          client_id: g.client_id,
          client_name: g.client?.business_name || null,
          role: g.role,
          allowed_pages: g.allowed_pages || [],
        });
      }
      const out = authUsers.map(u => {
        const gRaw = u.user_metadata?.allowed_pages_global ?? u.app_metadata?.allowed_pages_global;
        return {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          is_admin: !!(u.user_metadata?.is_admin || u.app_metadata?.is_admin),
          allowed_pages_global: Array.isArray(gRaw) && gRaw.length ? gRaw : null,
          grants: byUser[u.id] || [],
        };
      });
      return res.json(out);
    }

    if (req.method === 'POST') {
      const { email, password, is_admin = false, allowed_pages_global = null, grants = [] } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });
      const meta = {};
      if (is_admin) meta.is_admin = true;
      if (is_admin && Array.isArray(allowed_pages_global) && allowed_pages_global.length) {
        meta.allowed_pages_global = allowed_pages_global;
      }
      const created = await adminFetch('users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: meta,
        }),
      });
      const uid = created?.id;
      if (uid && Array.isArray(grants) && grants.length) {
        const rows = grants
          .filter(g => g?.client_id)
          .map(g => ({
            user_id: uid,
            client_id: g.client_id,
            role: g.role || 'viewer',
            allowed_pages: Array.isArray(g.allowed_pages) ? g.allowed_pages : [],
          }));
        if (rows.length) {
          await supaFetch('crm_user_access', { method: 'POST', body: JSON.stringify(rows) });
        }
      }
      return res.status(201).json({ id: uid, email });
    }

    if (req.method === 'PUT' && id) {
      const { is_admin, allowed_pages_global } = req.body || {};
      // Fetch existing metadata so we can do a partial merge instead of
      // blowing other fields away.
      const existing = await adminFetch(`users/${id}`);
      const currentMeta = existing?.user_metadata || {};
      const nextMeta = { ...currentMeta };
      if (typeof is_admin === 'boolean') {
        nextMeta.is_admin = is_admin;
        // Demoting to non-admin? Clear the global page restriction (it only
        // applies to admins).
        if (!is_admin) delete nextMeta.allowed_pages_global;
      }
      if (allowed_pages_global !== undefined) {
        if (Array.isArray(allowed_pages_global) && allowed_pages_global.length) {
          nextMeta.allowed_pages_global = allowed_pages_global;
        } else {
          // null / [] → unrestricted admin
          delete nextMeta.allowed_pages_global;
        }
      }
      if (typeof is_admin !== 'boolean' && allowed_pages_global === undefined) {
        return res.status(400).json({ error: 'is_admin (bool) or allowed_pages_global (array|null) required' });
      }
      await adminFetch(`users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ user_metadata: nextMeta }),
      });
      return res.json({ success: true });
    }

    if (req.method === 'DELETE' && id) {
      // crm_user_access is ON DELETE CASCADE on auth.users(id)
      await adminFetch(`users/${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM admin-users error:', err);
    return res.status(500).json({ error: err.message });
  }
};
