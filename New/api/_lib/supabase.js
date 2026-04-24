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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  return {
    id: user.id,
    email: user.email,
    is_admin: !!user?.user_metadata?.is_admin || !!user?.app_metadata?.is_admin,
  };
}

// Load { is_admin, clients: [{ id, name, role, allowed_pages, ... }] } for a user.
// Admins get ALL clients regardless of access table.
async function loadUserAccess(userId, isAdmin) {
  if (isAdmin) {
    const clients = await supaFetch(`crm_content_clients?select=id,business_name,brand_primary_color,logo_url&order=business_name.asc`);
    const ALL_PAGES = [
      'dashboard','leads','contacts','projects','blog','portfolio','resources',
      'content-scheduler','avatars','email-marketing','email','meetings','invoices',
      'subscriptions','quick-notes','notifications','settings','deals','scripts',
      'training','team','products','accounts',
    ];
    return {
      is_admin: true,
      clients: (clients || []).map(c => ({
        id: c.id,
        name: c.business_name,
        logo_url: c.logo_url || null,
        brand_primary_color: c.brand_primary_color || null,
        role: 'admin',
        allowed_pages: ALL_PAGES,
      })),
    };
  }
  const rows = await supaFetch(
    `crm_user_access?user_id=eq.${userId}&select=role,allowed_pages,client:crm_content_clients(id,business_name,brand_primary_color,logo_url)`
  );
  const clients = (rows || []).map(r => ({
    id: r.client?.id,
    name: r.client?.business_name,
    logo_url: r.client?.logo_url || null,
    brand_primary_color: r.client?.brand_primary_color || null,
    role: r.role,
    allowed_pages: r.allowed_pages || [],
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

module.exports = { SUPABASE_URL, SERVICE_KEY, ANON_KEY, headers, setCors, requireAuth, requireCrmUser, requireStudentAuth, requireAdminAuth, supaFetch, loadUserAccess, assertClientAccess };
