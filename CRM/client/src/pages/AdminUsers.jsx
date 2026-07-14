// Admin-only page to manage CRM user accounts + per-client page access.
// Non-admins see a friendly "not authorized" card instead.
import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Trash2, Shield, ShieldOff, Plus, X, Check, Lock, Eye } from 'lucide-react';
import { useClient } from '../context/ClientContext';
import { useToast } from '../components/Toast';
import {
  getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
  upsertUserGrant, revokeUserGrant,
} from '../api';

// Canonical list of page slugs that can be toggled per grant — only the pages
// the CRM actually has now. Keep in sync with Sidebar.jsx nav + supabase.js
// ALL_PAGES. (Legacy pages — Contacts, Resources, Content, Avatars, Email
// Marketing, Blog, Portfolio, Deals, Scripts, Training, Products… — purged.)
const PAGE_GROUPS = [
  { label: 'Workspace', pages: [
    { slug: 'dashboard',    name: 'Dashboard' },
    { slug: 'leads',        name: 'Leads' },
    { slug: 'clients',      name: 'Clients' },
    { slug: 'projects',     name: 'Projects' },
    { slug: 'appointments', name: 'Appointments' },
  ]},
  { label: 'Team', pages: [
    { slug: 'employees',    name: 'Employees' },
    { slug: 'time',         name: 'Time' },
    { slug: 'employee-resources', name: 'Resources' },
  ]},
  { label: 'Marketing', pages: [
    { slug: 'contacts', name: 'Contacts' },
  ]},
  { label: 'Tools', pages: [
    { slug: 'email',    name: 'Email' },
    { slug: 'settings', name: 'Settings' },
  ]},
];

// Pages that only make sense for admins (VA admins can be granted these via
// allowed_pages_global). Not shown on the per-client grant editor.
const ADMIN_PAGE_GROUPS = [
  { label: 'Admin', pages: [
    { slug: 'admin-users', name: 'Users & Access' },
  ]},
];

// Role presets — one-click bundles of page access. "Custom" = whatever's
// checked. Roles are a convenience on top of the per-page checkboxes below.
const ROLES = [
  { key: 'full',            name: 'Full access',     pages: ['dashboard','leads','clients','projects','appointments','employees','time','employee-resources','contacts','email','settings'] },
  { key: 'sales_assistant', name: 'Sales Assistant', pages: ['leads','appointments','time','employee-resources'] },
  { key: 'project_manager', name: 'Project Manager', pages: ['dashboard','clients','projects','appointments','time','employee-resources'] },
  { key: 'custom',          name: 'Custom',          pages: null },
];
const roleForPages = (pages = []) => {
  const set = [...pages].sort().join(',');
  const match = ROLES.find(r => r.pages && [...r.pages].sort().join(',') === set);
  return match ? match.key : 'custom';
};

const DEFAULT_PAGES = ['leads','appointments'];
// Flat list of every toggle-able slug (mirrors PAGE_GROUPS).
const ALL_SLUGS = PAGE_GROUPS.flatMap(g => g.pages.map(p => p.slug));

const card = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 20, fontFamily: 'var(--font-display)',
};
const btnPrimary = {
  padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))',
  color: '#fff', fontSize: 13, fontWeight: 700, display: 'inline-flex',
  alignItems: 'center', gap: 6,
};
const btnGhost = {
  padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)',
  border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
};
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13,
  fontFamily: 'var(--font-display)', boxSizing: 'border-box',
};

export default function AdminUsers() {
  const { isAdmin, clients, viewAsUser, realUser } = useClient();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    try { setUsers(await getAdminUsers()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ ...card, maxWidth: 440, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>Admin only</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>You need admin access to manage users.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-display)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Users &amp; Access</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Create CRM accounts and control which clients + pages each user can see.
          </div>
        </div>
        <button style={btnPrimary} onClick={() => setShowCreate(true)}>
          <UserPlus size={14} /> New user
        </button>
      </div>

      {error && (
        <div style={{ ...card, borderColor: '#ef4444', color: '#ef4444', marginBottom: 14 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div style={{ ...card, color: 'var(--muted)' }}>Loading users…</div>}
        {!loading && users.length === 0 && <div style={{ ...card, color: 'var(--muted)' }}>No users yet.</div>}
        {!loading && users.map(u => (
          <UserRow
            key={u.id}
            user={u}
            clients={clients}
            expanded={expandedId === u.id}
            onToggle={() => setExpandedId(expandedId === u.id ? null : u.id)}
            onChanged={load}
            onViewAs={() => viewAsUser(u)}
            isSelf={u.id === realUser?.id}
          />
        ))}
      </div>

      {showCreate && (
        <CreateUserModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function UserRow({ user, clients, expanded, onToggle, onChanged, onViewAs, isSelf }) {
  const toast = useToast();
  const isRestricted = user.is_admin && Array.isArray(user.allowed_pages_global) && user.allowed_pages_global.length > 0;
  async function toggleAdmin(e) {
    e.stopPropagation();
    if (!confirm(`${user.is_admin ? 'Revoke' : 'Grant'} admin for ${user.email}?`)) return;
    try {
      await updateAdminUser(user.id, { is_admin: !user.is_admin });
      toast.success(`${user.is_admin ? 'Revoked' : 'Granted'} admin for ${user.email}`);
      onChanged();
    } catch (err) { toast.error(err.message); }
  }
  async function remove(e) {
    e.stopPropagation();
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(user.id);
      toast.success(`Deleted ${user.email}`);
      onChanged();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{user.email}</div>
            {user.is_admin && !isRestricted && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(37,99,235,0.15)', color: 'var(--orange)', fontWeight: 700 }}>ADMIN</span>
            )}
            {isRestricted && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Lock size={9} /> VA ADMIN
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
            {user.is_admin
              ? (isRestricted
                  ? `Cross-client admin · limited to ${user.allowed_pages_global.length} page${user.allowed_pages_global.length === 1 ? '' : 's'}`
                  : 'Full admin · all clients, all pages')
              : (user.grants.length === 0 ? 'No client grants' :
                  `${user.grants.length} client${user.grants.length === 1 ? '' : 's'}: ${user.grants.map(g => g.client_name).filter(Boolean).join(', ')}`)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isSelf && (
            <button
              style={btnGhost}
              onClick={e => { e.stopPropagation(); onViewAs?.(); }}
              title={`See the CRM as ${user.email}`}
            >
              <Eye size={13} /> View as
            </button>
          )}
          <button style={btnGhost} onClick={toggleAdmin} title={user.is_admin ? 'Revoke admin' : 'Grant admin'}>
            {user.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}
            {user.is_admin ? 'Revoke admin' : 'Make admin'}
          </button>
          <button style={{ ...btnGhost, color: '#ef4444' }} onClick={remove}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {expanded && (
        user.is_admin
          ? <GlobalPagesEditor user={user} onChanged={onChanged} />
          : <GrantsEditor user={user} clients={clients} onChanged={onChanged} />
      )}
    </div>
  );
}

// Global-pages editor for admins. Toggles user_metadata.allowed_pages_global.
// Empty list = unrestricted admin. Any subset = VA admin.
function GlobalPagesEditor({ user, onChanged }) {
  const toast = useToast();
  const isInitiallyRestricted = Array.isArray(user.allowed_pages_global) && user.allowed_pages_global.length > 0;
  const [restrict, setRestrict] = useState(isInitiallyRestricted);
  const [pages, setPages] = useState(
    isInitiallyRestricted ? user.allowed_pages_global : [...DEFAULT_PAGES, 'admin-users']
  );
  const [saving, setSaving] = useState(false);

  function togglePage(slug) {
    setPages(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  const dirty = useMemo(() => {
    const wasRestricted = isInitiallyRestricted;
    if (wasRestricted !== restrict) return true;
    if (!restrict) return false; // both unrestricted
    const a = [...(user.allowed_pages_global || [])].sort().join(',');
    const b = [...pages].sort().join(',');
    return a !== b;
  }, [pages, restrict, isInitiallyRestricted, user.allowed_pages_global]);

  async function save() {
    setSaving(true);
    try {
      await updateAdminUser(user.id, {
        allowed_pages_global: restrict ? pages : null,
      });
      toast.success(restrict ? 'VA page access updated' : 'Admin restrictions removed');
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
        <input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} />
        <span style={{ fontWeight: 700 }}>Restrict to specific pages (VA admin)</span>
      </label>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
        {restrict
          ? 'Admin sees every client, but only the pages you select below. Leave unchecked for full access like yours.'
          : 'Full access: every client, every page. Check the box above to turn this admin into a VA with limited page access.'}
      </div>

      {restrict && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
          {[...PAGE_GROUPS, ...ADMIN_PAGE_GROUPS].map(group => (
            <div key={group.label} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{group.label}</div>
              <div className="access-pill-group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {group.pages.map(p => (
                  <button
                    key={p.slug}
                    onClick={() => togglePage(p.slug)}
                    style={{
                      padding: '5px 10px', borderRadius: 20,
                      background: pages.includes(p.slug) ? 'var(--orange)' : 'var(--surface)',
                      color: pages.includes(p.slug) ? '#fff' : 'var(--text)',
                      border: `1px solid ${pages.includes(p.slug) ? 'var(--orange)' : 'var(--border)'}`,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button style={btnPrimary} onClick={save} disabled={saving}>
            <Check size={13} /> {saving ? 'Saving…' : 'Save access'}
          </button>
        </div>
      )}
    </div>
  );
}

function GrantsEditor({ user, clients, onChanged }) {
  const toast = useToast();
  // Clients the user doesn't yet have a grant for → candidates for the
  // "add grant" dropdown.
  const granted = new Set(user.grants.map(g => g.client_id));
  const available = clients.filter(c => !granted.has(c.id));
  const [addingClient, setAddingClient] = useState(available[0]?.id || '');
  const [saving, setSaving] = useState(false);

  async function addGrant() {
    if (!addingClient) return;
    setSaving(true);
    try {
      await upsertUserGrant(user.id, {
        client_id: addingClient,
        allowed_pages: DEFAULT_PAGES,
        role: 'viewer',
      });
      toast.success('Grant added');
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      {user.grants.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>No client grants yet.</div>
      )}
      {user.grants.map(g => (
        <GrantRow key={g.client_id} user={user} grant={g} onChanged={onChanged} />
      ))}

      {available.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
          <select
            value={addingClient}
            onChange={e => setAddingClient(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: 220 }}
          >
            {available.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button style={btnPrimary} onClick={addGrant} disabled={saving}>
            <Plus size={13} /> {saving ? 'Adding…' : 'Add grant'}
          </button>
        </div>
      )}
    </div>
  );
}

function GrantRow({ user, grant, onChanged }) {
  const toast = useToast();
  const [pages, setPages] = useState(grant.allowed_pages || []);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dirty = useMemo(() => {
    const a = [...(grant.allowed_pages || [])].sort().join(',');
    const b = [...pages].sort().join(',');
    return a !== b;
  }, [pages, grant.allowed_pages]);

  const currentRole = roleForPages(pages);

  function togglePage(slug) {
    setPages(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }
  function applyRole(key) {
    const r = ROLES.find(x => x.key === key);
    if (r && r.pages) setPages(r.pages);
  }

  async function save() {
    setSaving(true);
    try {
      await upsertUserGrant(user.id, { client_id: grant.client_id, allowed_pages: pages, role: currentRole });
      toast.success('Access updated');
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function revoke() {
    if (!confirm(`Revoke ${user.email}'s access to ${grant.client_name}?`)) return;
    setRemoving(true);
    try {
      await revokeUserGrant(user.id, grant.client_id);
      toast.success('Access revoked');
      onChanged();
    } catch (e) { toast.error(e.message); setRemoving(false); }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--surface-2)' }}>
      <div className="grant-row-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{grant.client_name || grant.client_id}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {dirty && (
            <button style={btnPrimary} onClick={save} disabled={saving}>
              <Check size={13} /> {saving ? 'Saving…' : 'Save'}
            </button>
          )}
          <button style={{ ...btnGhost, color: '#ef4444' }} onClick={revoke} disabled={removing}>
            <X size={13} /> Revoke
          </button>
        </div>
      </div>

      {/* Role preset — one-click bundle; still fully overridable below */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Role</span>
        <select value={currentRole} onChange={e => applyRole(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 170, padding: '6px 10px' }}>
          {ROLES.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>or tick individual pages below</span>
      </div>

      {PAGE_GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{group.label}</div>
          <div className="access-pill-group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {group.pages.map(p => (
              <button
                key={p.slug}
                onClick={() => togglePage(p.slug)}
                style={{
                  padding: '5px 10px', borderRadius: 20,
                  background: pages.includes(p.slug) ? 'var(--orange)' : 'var(--surface)',
                  color: pages.includes(p.slug) ? '#fff' : 'var(--text)',
                  border: `1px solid ${pages.includes(p.slug) ? 'var(--orange)' : 'var(--border)'}`,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateUserModal({ clients, onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [restrictAdmin, setRestrictAdmin] = useState(false);
  const [adminPages, setAdminPages] = useState(['admin-users', ...DEFAULT_PAGES]);
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [role, setRole] = useState('sales_assistant');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function toggleAdminPage(slug) {
    setAdminPages(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      const rolePages = ROLES.find(r => r.key === role)?.pages || DEFAULT_PAGES;
      const grants = (!isAdmin && clientId)
        ? [{ client_id: clientId, allowed_pages: rolePages, role }]
        : [];
      const payload = { email, password, is_admin: isAdmin, grants };
      if (isAdmin && restrictAdmin && adminPages.length) {
        payload.allowed_pages_global = adminPages;
      }
      await createAdminUser(payload);
      onCreated();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{ ...card, width: 440, maxWidth: '92vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>New user</div>
          <button type="button" style={btnGhost} onClick={onClose}><X size={13} /></button>
        </div>

        {err && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12 }}>{err}</div>}

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, marginTop: 4, marginBottom: 10 }} />

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Temporary password</label>
        <input type="text" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, marginTop: 4, marginBottom: 10 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
          Make admin (access every client)
        </label>

        {isAdmin && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={restrictAdmin} onChange={e => setRestrictAdmin(e.target.checked)} />
              Restrict to specific pages (VA admin)
            </label>
            {restrictAdmin && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 12, background: 'var(--surface-2)', maxHeight: 260, overflowY: 'auto' }}>
                {[...PAGE_GROUPS, ...ADMIN_PAGE_GROUPS].map(group => (
                  <div key={group.label} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{group.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {group.pages.map(p => (
                        <button
                          key={p.slug}
                          type="button"
                          onClick={() => toggleAdminPage(p.slug)}
                          style={{
                            padding: '4px 9px', borderRadius: 20,
                            background: adminPages.includes(p.slug) ? 'var(--orange)' : 'var(--surface)',
                            color: adminPages.includes(p.slug) ? '#fff' : 'var(--text)',
                            border: `1px solid ${adminPages.includes(p.slug) ? 'var(--orange)' : 'var(--border)'}`,
                            fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          }}
                        >{p.name}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!isAdmin && (
          <>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inputStyle, marginTop: 4, marginBottom: 10 }}>
              {ROLES.filter(r => r.key !== 'custom').map(r => <option key={r.key} value={r.key}>{r.name}</option>)}
            </select>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Starting client</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ ...inputStyle, marginTop: 4, marginBottom: 10 }}>
              <option value="">— None (assign later) —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              This role grants: {(ROLES.find(r => r.key === role)?.pages || []).join(', ')}. You can fine-tune the checkboxes after creating the user.
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Creating…' : 'Create user'}</button>
        </div>
      </form>
    </div>
  );
}
