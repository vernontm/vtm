// CRM uses its own Supabase project; falls back to shared env vars
const SUPABASE_URL = process.env.CRM_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const ANON_KEY = process.env.CRM_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// Lock CORS to production + local dev origins. Extra origins can be added
// via CRM_ALLOWED_ORIGINS (comma-separated). Requests from unknown origins
// receive no ACAO header, which the browser will reject.
const DEFAULT_ORIGINS = [
  'https://vernontm.com',
  'https://www.vernontm.com',
  'https://vtm-new.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];
const EXTRA_ORIGINS = (process.env.CRM_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = new Set([...DEFAULT_ORIGINS, ...EXTRA_ORIGINS]);

// Backwards-compatible: if called with just (res), falls back to wildcard so
// legacy endpoints keep working. If called with (res, req), enforces the
// allowlist — unlisted origins get NO ACAO header and are blocked by the
// browser. New and security-critical endpoints should pass req.
function setCors(res, req) {
  const origin = req?.headers?.origin;
  if (req) {
    // Strict mode: only allow listed origins.
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  } else {
    // Legacy mode (TODO: migrate all endpoints to pass req).
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Id');
}

async function requireAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  // Verify JWT against Supabase
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': ANON_KEY || SERVICE_KEY,
      'Authorization': `Bearer ${token}`,
    },
  });
  return res.ok;
}

// Like requireAuth, but returns the resolved user ({ id, email, is_admin }) or null.
// Use this when the endpoint needs to know WHO is calling (for client scoping).
async function requireCrmUser(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': ANON_KEY || SERVICE_KEY,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  // allowed_pages_global restricts an admin to a subset of pages across ALL
  // clients (for VAs who need cross-client admin power but only for e.g.
  // contacts + email). Empty/missing = unrestricted (Ray).
  const gRaw = user?.user_metadata?.allowed_pages_global ?? user?.app_metadata?.allowed_pages_global;
  const allowed_pages_global = Array.isArray(gRaw) && gRaw.length ? gRaw : null;
  return {
    id: user.id,
    email: user.email,
    is_admin: !!user?.user_metadata?.is_admin || !!user?.app_metadata?.is_admin,
    allowed_pages_global,
  };
}

// Canonical list of page slugs. Keep in sync with AdminUsers.jsx PAGE_GROUPS.
// Only the pages the CRM actually has now (legacy pages purged) + admin-users.
const ALL_PAGES = [
  'dashboard','leads','clients','projects','appointments','employees',
  'contacts','email','settings','admin-users',
];

// Load { is_admin, clients: [{ id, name, role, allowed_pages, ... }] } for a user.
// Admins get ALL clients regardless of access table. If allowedPagesGlobal is
// passed (VA admin tier), every synthesized client entry gets that restricted
// page set instead of the full ALL_PAGES list.
async function loadUserAccess(userId, isAdmin, allowedPagesGlobal = null) {
  // Helper: intersect user's allowed_pages with the client's enabled_pages
  // (if the client has a whitelist). Null/empty client whitelist = no filter.
  const scope = (userPages, clientEnabled) => {
    if (!Array.isArray(clientEnabled) || clientEnabled.length === 0) return userPages;
    const set = new Set(clientEnabled);
    return userPages.filter(p => set.has(p));
  };

  if (isAdmin) {
    const clients = await supaFetch(`crm_content_clients?select=id,business_name,brand_primary_color,logo_url,enabled_pages&order=business_name.asc`);
    const base = Array.isArray(allowedPagesGlobal) && allowedPagesGlobal.length
      ? allowedPagesGlobal
      : ALL_PAGES;
    return {
      is_admin: true,
      clients: (clients || []).map(c => ({
        id: c.id,
        name: c.business_name,
        logo_url: c.logo_url || null,
        brand_primary_color: c.brand_primary_color || null,
        role: 'admin',
        allowed_pages: scope(base, c.enabled_pages),
        enabled_pages: Array.isArray(c.enabled_pages) ? c.enabled_pages : null,
      })),
    };
  }
  const rows = await supaFetch(
    `crm_user_access?user_id=eq.${userId}&select=role,allowed_pages,client:crm_content_clients(id,business_name,brand_primary_color,logo_url,enabled_pages)`
  );
  const clients = (rows || []).map(r => ({
    id: r.client?.id,
    name: r.client?.business_name,
    logo_url: r.client?.logo_url || null,
    brand_primary_color: r.client?.brand_primary_color || null,
    role: r.role,
    allowed_pages: scope(r.allowed_pages || [], r.client?.enabled_pages),
    enabled_pages: Array.isArray(r.client?.enabled_pages) ? r.client.enabled_pages : null,
  })).filter(c => c.id);
  return { is_admin: false, clients };
}

// Assert that a user can access a given client_id. Admins bypass.
// Returns { ok: true } or { ok: false, status, error }.
async function assertClientAccess(user, clientId) {
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  if (user.is_admin) return { ok: true };
  if (!clientId) return { ok: false, status: 400, error: 'client_id required' };
  const rows = await supaFetch(`crm_user_access?user_id=eq.${user.id}&client_id=eq.${clientId}&select=role`);
  if (!rows || rows.length === 0) return { ok: false, status: 403, error: 'Forbidden (no access to this client)' };
  return { ok: true, role: rows[0].role };
}

// One-stop helper for tenant-scoped endpoints. Returns:
//   { ok: true,  user, clientId,  all }  — call filtering/writes with clientId
//   { ok: false, status, error }         — send this back to the caller
// Rules:
//   - missing/invalid auth              -> 401
//   - admin + no X-Client-Id header     -> all=true, clientId=null (legacy "see everything")
//   - admin + X-Client-Id               -> clientId scoped, all=false
//   - non-admin + no X-Client-Id        -> 400
//   - non-admin + X-Client-Id           -> verify grant; 403 if missing
async function requireClientScope(req) {
  const user = await requireCrmUser(req);
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' };
  const raw = req.headers['x-client-id'] || req.headers['X-Client-Id'];
  const clientId = (typeof raw === 'string' && raw.trim()) ? raw.trim() : null;
  if (!clientId) {
    if (user.is_admin) return { ok: true, user, clientId: null, all: true };
    return { ok: false, status: 400, error: 'X-Client-Id header required' };
  }
  const check = await assertClientAccess(user, clientId);
  if (!check.ok) return check;
  return { ok: true, user, clientId, all: false, role: check.role };
}

async function requireStudentAuth(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': ANON_KEY || SERVICE_KEY,
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  // Fetch academy profile for role
  const profiles = await supaFetch(`academy_profiles?id=eq.${user.id}&select=role`);
  const role = profiles?.[0]?.role || 'student';
  return { id: user.id, email: user.email, role };
}

async function requireAdminAuth(req) {
  const user = await requireStudentAuth(req);
  if (!user || user.role !== 'admin') return null;
  return user;
}

async function supaFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const mergedHeaders = { ...headers, ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers: mergedHeaders });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

module.exports = { SUPABASE_URL, SERVICE_KEY, ANON_KEY, headers, setCors, requireAuth, requireCrmUser, requireStudentAuth, requireAdminAuth, supaFetch, loadUserAccess, assertClientAccess, requireClientScope, ALL_PAGES };
