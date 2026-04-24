// Admin-only page to manage CRM user accounts + per-client page access.
// Non-admins see a friendly "not authorized" card instead.
import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Trash2, Shield, ShieldOff, Plus, X, Check } from 'lucide-react';
import { useClient } from '../context/ClientContext';
import {
  getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
  upsertUserGrant, revokeUserGrant,
} from '../api';

// Canonical list of page slugs that can be toggled per client grant.
// Keep in sync with Sidebar.jsx / supabase.js ALL_PAGES.
const PAGE_GROUPS = [
  { label: 'Workspace', pages: [
    { slug: 'dashboard',         name: 'Dashboard' },
    { slug: 'leads',             name: 'Leads' },
    { slug: 'contacts',          name: 'Contacts' },
    { slug: 'projects',          name: 'Projects' },
    { slug: 'blog',              name: 'Blog' },
    { slug: 'portfolio',         name: 'Portfolio' },
    { slug: 'resources',         name: 'Resources' },
    { slug: 'content-scheduler', name: 'Content' },
    { slug: 'avatars',           name: 'Avatars' },
    { slug: 'email-marketing',   name: 'Email Marketing' },
  ]},
  { label: 'Tools', pages: [
    { slug: 'email',         name: 'Email' },
    { slug: 'meetings',      name: 'Meetings' },
    { slug: 'invoices',      name: 'Invoices' },
    { slug: 'subscriptions', name: 'Subscriptions' },
    { slug: 'quick-notes',   name: 'Quick Notes' },
    { slug: 'notifications', name: 'Notifications' },
    { slug: 'settings',      name: 'Settings' },
    { slug: 'deals',         name: 'Deals' },
  ]},
  { label: 'Training', pages: [
    { slug: 'scripts',  name: 'Call Scripts' },
    { slug: 'training', name: 'Training Videos' },
    { slug: 'products', name: 'Products & Services' },
  ]},
];

const DEFAULT_PAGES = ['leads','contacts','content-scheduler','avatars','email-marketing'];

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
  const { isAdmin, clients } = useClient();
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

function UserRow({ user, clients, expanded, onToggle, onChanged }) {
  async function toggleAdmin(e) {
    e.stopPropagation();
    if (!confirm(`${user.is_admin ? 'Revoke' : 'Grant'} admin for ${user.email}?`)) return;
    try { await updateAdminUser(user.id, { is_admin: !user.is_admin }); onChanged(); }
    catch (err) { alert(err.message); }
  }
  async function remove(e) {
    e.stopPropagation();
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    try { await deleteAdminUser(user.id); onChanged(); }
    catch (err) { alert(err.message); }
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={onToggle}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{user.email}</div>
            {user.is_admin && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,155,38,0.15)', color: 'var(--orange)', fontWeight: 700 }}>ADMIN</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
            {user.grants.length === 0 ? 'No client grants' :
              `${user.grants.length} client${user.grants.length === 1 ? '' : 's'}: ${user.grants.map(g => g.client_name).filter(Boolean).join(', ')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
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
        <GrantsEditor user={user} clients={clients} onChanged={onChanged} />
      )}
    </div>
  );
}

function GrantsEditor({ user, clients, onChanged }) {
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
      onChanged();
    } catch (e) { alert(e.message); }
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
  const [pages, setPages] = useState(grant.allowed_pages || []);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const dirty = useMemo(() => {
    const a = [...(grant.allowed_pages || [])].sort().join(',');
    const b = [...pages].sort().join(',');
    return a !== b;
  }, [pages, grant.allowed_pages]);

  function togglePage(slug) {
    setPages(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  async function save() {
    setSaving(true);
    try {
      await upsertUserGrant(user.id, { client_id: grant.client_id, allowed_pages: pages, role: grant.role });
      onChanged();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function revoke() {
    if (!confirm(`Revoke ${user.email}'s access to ${grant.client_name}?`)) return;
    setRemoving(true);
    try { await revokeUserGrant(user.id, grant.client_id); onChanged(); }
    catch (e) { alert(e.message); setRemoving(false); }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10, background: 'var(--surface-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
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

      {PAGE_GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{group.label}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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
  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      const grants = (!isAdmin && clientId)
        ? [{ client_id: clientId, allowed_pages: DEFAULT_PAGES, role: 'viewer' }]
        : [];
      await createAdminUser({ email, password, is_admin: isAdmin, grants });
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
          Make admin (full access to all clients)
        </label>

        {!isAdmin && (
          <>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Starting client</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ ...inputStyle, marginTop: 4, marginBottom: 10 }}>
              <option value="">— None (assign later) —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
              Defaults to: leads, contacts, content, avatars, email marketing. You can adjust after creation.
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
