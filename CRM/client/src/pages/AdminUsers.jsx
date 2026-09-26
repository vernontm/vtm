// Admin-only page to manage CRM user accounts + per-client page access.
// Non-admins see a friendly "not authorized" card instead.
import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, Trash2, Shield, ShieldOff, Plus, X, Check, Lock, Eye, KeyRound, Bell, Smartphone, Mail, Copy, LayoutDashboard, BarChart2, UserCog, Pencil } from 'lucide-react';
import {
  useClient, ACCESS_INFO, DEFAULT_ACCESS_ROLES, normalizeAccessRoles, samePages, roleKeyFor,
} from '../context/ClientContext';
import { useToast } from '../components/Toast';
import {
  getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
  upsertUserGrant, revokeUserGrant, resetUserPassword,
  getPushPrefs, setPushPrefs, inviteUser,
  getHomeRoles, setHomeRoles, getAppEvents,
  getAccessRoles, setAccessRoles,
} from '../api';

// Which home the iPhone app opens to. Stored in the settings key home_roles as
// { <auth user id>: role }; a missing entry is "Auto" (admins get the CEO home,
// everyone else is resolved from their roster title on the server).
const HOME_ROLES = [
  { key: '',          name: 'Auto' },
  { key: 'ceo',       name: 'CEO' },
  { key: 'hr',        name: 'HR' },
  { key: 'assistant', name: 'Assistant' },
  { key: 'sales',     name: 'Sales' },
  { key: 'general',   name: 'General' },
];
const USAGE_DAYS = 30;

// Canonical list of page slugs that can be toggled per grant, only the pages
// the CRM actually has now. Keep in sync with Sidebar.jsx nav + supabase.js
// ALL_PAGES. (Legacy pages purged: Contacts, Resources, Content, Avatars, Email
// Marketing, Blog, Portfolio, Deals, Scripts, Training, Products…)
const PAGE_GROUPS = [
  { label: 'Workspace', pages: [
    { slug: 'dashboard',    name: 'Dashboard' },
    { slug: 'leads',        name: 'Leads' },
    { slug: 'clients',      name: 'Clients' },
    { slug: 'projects',     name: 'Projects' },
    { slug: 'money',        name: 'Money' },
    { slug: 'appointments', name: 'Appointments' },
    { slug: 'assistant',    name: 'Assistant' },
    { slug: 'tasks',        name: 'Tasks' },
    { slug: 'todos',        name: 'To-Do' },
    { slug: 'routines',     name: 'Routines' },
    { slug: 'email',        name: 'Email' },
  ]},
  { label: 'Team', pages: [
    { slug: 'employees',    name: 'Employees' },
    { slug: 'time',         name: 'Time' },
    { slug: 'employee-resources', name: 'Resources' },
  ]},
  { label: 'Marketing', pages: [
    { slug: 'marketing', name: 'Marketing' },
    { slug: 'contacts', name: 'Contacts' },
    { slug: 'inbox', name: 'Inbox' },
  ]},
  { label: 'Tools', pages: [
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

// Access roles are editable and live in the settings key access_roles. The
// shape, the seed, the information switches and roleKeyFor (which role a
// person is in) all come from ClientContext, so this editor and the gating in
// App and Sidebar cannot drift. Pages that match no role read as Custom.

// A stable key for a new role, from its name. "Sales Assistant" -> sales_assistant
const keyFromName = (name, taken = {}) => {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'role';
  if (!taken[base]) return base;
  let n = 2;
  while (taken[`${base}_${n}`]) n += 1;
  return `${base}_${n}`;
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
const labelStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '0.1em',
};
// Every toggleable page, flattened out of PAGE_GROUPS for the invite form.
const ALL_PAGES = PAGE_GROUPS.flatMap(g => g.pages);

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
  background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13,
  fontFamily: 'var(--font-display)', boxSizing: 'border-box',
};

export default function AdminUsers() {
  const { isAdmin, clients, viewAsUser, realUser, refresh } = useClient();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [pushData, setPushData] = useState(null);   // { prefs, devices } for the notification toggles
  const [roleMap, setRoleMap] = useState({});       // home_roles: { user id: role }
  const [usage, setUsage] = useState(null);         // { rows, days } | { error, needsMigration }
  const [roles, setRoles] = useState(DEFAULT_ACCESS_ROLES);   // access_roles

  async function load() {
    setLoading(true); setError(null);
    try { setUsers(await getAdminUsers()); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  async function loadRoles() {
    try { setRoles(normalizeAccessRoles(await getAccessRoles())); }
    catch (_) { setRoles(DEFAULT_ACCESS_ROLES); }   // editor still works off the seed
  }
  // One write for the whole map, same settings key every time.
  async function saveRoles(next) {
    const clean = normalizeAccessRoles(next);
    await setAccessRoles(clean);
    setRoles(clean);
    refresh?.();          // so this admin's own sidebar and routes re-read them
  }
  async function loadPrefs() {
    try { setPushData(await getPushPrefs()); } catch (_) { /* toggles just hide */ }
  }
  async function loadHomeRoles() {
    try { setRoleMap(await getHomeRoles()); } catch (_) { /* select shows Auto */ }
  }
  async function loadUsage() {
    try { setUsage(await getAppEvents(USAGE_DAYS)); }
    catch (e) { setUsage({ error: e.message, needsMigration: !!e.needs_migration || e.status === 503 }); }
  }

  // Change one person's home layout; empty role means back to Auto.
  async function changeHomeRole(userId, role) {
    if (!userId) return;
    const prev = roleMap;
    const next = { ...roleMap };
    if (role) next[userId] = role; else delete next[userId];
    setRoleMap(next);
    try {
      await setHomeRoles(next);
      const who = users.find(u => u.id === userId)?.email || 'user';
      toast.success(`${who} now opens to the ${role ? HOME_ROLES.find(r => r.key === role)?.name : 'Auto'} home`);
    } catch (e) { setRoleMap(prev); toast.error(e.message); }
  }

  useEffect(() => { if (isAdmin) { load(); loadPrefs(); loadHomeRoles(); loadUsage(); loadRoles(); } }, [isAdmin]);

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
            Create logins for your team and choose which pages each person can access.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnPrimary} onClick={() => setShowInvite(true)}>
            <Mail size={14} /> Invite teammate
          </button>
          <button style={btnGhost} onClick={() => setShowCreate(true)}>
            <UserPlus size={14} /> New user
          </button>
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: '#ef4444', color: '#ef4444', marginBottom: 14 }}>{error}</div>
      )}

      <AccessRolesEditor roles={roles} onSave={saveRoles} />

      <div style={{ ...labelStyle, margin: '20px 0 8px' }}>People</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div style={{ ...card, color: 'var(--muted)' }}>Loading users…</div>}
        {!loading && users.length === 0 && <div style={{ ...card, color: 'var(--muted)' }}>No users yet.</div>}
        {!loading && users.map(u => (
          <UserRow
            key={u.id}
            user={u}
            clients={clients}
            roles={roles}
            expanded={expandedId === u.id}
            onToggle={() => setExpandedId(expandedId === u.id ? null : u.id)}
            onChanged={load}
            onViewAs={() => viewAsUser(u)}
            isSelf={u.id === realUser?.id}
            pushData={pushData}
            onPrefsSaved={loadPrefs}
            homeRole={roleMap[u.id] || ''}
            onHomeRoleChange={(role) => changeHomeRole(u.id, role)}
          />
        ))}
      </div>

      <AppUsageTable usage={usage} users={users} />

      {showInvite && (
        <InviteUserModal
          onClose={() => setShowInvite(false)}
          onInvited={() => { setShowInvite(false); load(); }}
        />
      )}
      {showCreate && (
        <CreateUserModal
          clients={clients}
          roles={roles}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// A row of page pills, the same grid the per-person editor uses.
function PagePicker({ groups, pages, onToggle }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
      {groups.map(group => (
        <div key={group.label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>{group.label}</div>
          <div className="access-pill-group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {group.pages.map(p => {
              const on = pages.includes(p.slug);
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => onToggle(p.slug)}
                  style={{
                    padding: '5px 10px', borderRadius: 20,
                    background: on ? 'var(--orange)' : 'var(--surface)',
                    color: on ? '#fff' : 'var(--text)',
                    border: `1px solid ${on ? 'var(--orange)' : 'var(--border)'}`,
                    fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// What a role can see, beside the pages. Honest about its reach: these
// switches shape the web interface, the server is what actually holds the
// line. See the note under the switches.
function InfoSwitches({ info, onToggle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ACCESS_INFO.map(m => (
        <label key={m.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!info[m.key]}
            onChange={() => onToggle(m.key)}
            style={{ marginTop: 2 }}
          />
          <span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{m.name}</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{m.hint}</span>
          </span>
        </label>
      ))}
      <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        These switches shape the web interface: they decide what the CRM puts on
        screen for this role. They are not a security control. The server holds
        the real line separately. Only staff can reach CRM endpoints at all, and
        the inbox is scoped server side, so a non admin only ever receives their
        own and unassigned conversations no matter what is ticked here.
      </div>
    </div>
  );
}

// Define a role once: its name, the pages it opens, and the information it
// can see. Everything lives in the settings key access_roles, so there is no
// new table and no new endpoint. People are put in a role further down.
function AccessRolesEditor({ roles, onSave }) {
  const toast = useToast();
  const [draft, setDraft] = useState(roles);
  const [openKey, setOpenKey] = useState(null);
  const [saving, setSaving] = useState(false);

  // Re-seed whenever the saved roles change under us (first load, or a save).
  useEffect(() => { setDraft(roles); }, [roles]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(roles), [draft, roles]);
  const entries = Object.entries(draft);

  const patch = (key, changes) => setDraft(d => ({ ...d, [key]: { ...d[key], ...changes } }));
  const togglePage = (key, slug) => setDraft(d => {
    const pages = d[key].pages.includes(slug) ? d[key].pages.filter(s => s !== slug) : [...d[key].pages, slug];
    return { ...d, [key]: { ...d[key], pages } };
  });
  const toggleInfo = (key, infoKey) => setDraft(d => ({
    ...d, [key]: { ...d[key], info: { ...d[key].info, [infoKey]: !d[key].info[infoKey] } },
  }));
  function addRole() {
    const key = keyFromName('new role', draft);
    setDraft(d => ({ ...d, [key]: { name: 'New role', pages: [...DEFAULT_PAGES], info: Object.fromEntries(ACCESS_INFO.map(m => [m.key, false])) } }));
    setOpenKey(key);
  }
  function removeRole(key) {
    if (!confirm(`Delete the ${draft[key]?.name || key} role? People already in it keep the pages they have, their role just reads as Custom.`)) return;
    setDraft(d => { const n = { ...d }; delete n[key]; return n; });
    if (openKey === key) setOpenKey(null);
  }
  async function save() {
    const blank = entries.find(([, r]) => !String(r.name || '').trim());
    if (blank) { toast.error('Give every role a name first'); return; }
    setSaving(true);
    try { await onSave(draft); toast.success('Access roles saved'); }
    catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ ...card, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <UserCog size={15} color="var(--orange)" />
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Access roles</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={btnGhost} onClick={addRole}><Plus size={13} /> New role</button>
          {dirty && (
            <button style={btnPrimary} onClick={save} disabled={saving}>
              <Check size={13} /> {saving ? 'Saving…' : 'Save roles'}
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, marginBottom: 12, lineHeight: 1.6 }}>
        Define a role once: the pages it opens and the information it can see.
        Then put people in it below. Changing a role does not move anyone by
        itself, re-apply it to a person to push the new page list onto them.
      </div>

      {entries.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>No roles yet. Add one to get started.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([key, role]) => {
          const open = openKey === key;
          const onCount = ACCESS_INFO.filter(m => role.info[m.key]).length;
          return (
            <div key={key} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)' }}>
              <div
                onClick={() => setOpenKey(open ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{role.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {role.pages.length} page{role.pages.length === 1 ? '' : 's'} · {onCount} of {ACCESS_INFO.length} information switch{onCount === 1 ? '' : 'es'} on
                  </div>
                </div>
                <button style={btnGhost} onClick={e => { e.stopPropagation(); setOpenKey(open ? null : key); }}>
                  <Pencil size={12} /> {open ? 'Done' : 'Edit'}
                </button>
                <button style={{ ...btnGhost, color: '#ef4444' }} onClick={e => { e.stopPropagation(); removeRole(key); }}>
                  <Trash2 size={12} /> Delete
                </button>
              </div>

              {open && (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ ...labelStyle, display: 'block', marginBottom: 4 }}>Role name</label>
                    <input
                      style={{ ...inputStyle, maxWidth: 320 }}
                      value={role.name}
                      onChange={e => patch(key, { name: e.target.value })}
                      placeholder="e.g. Project Manager"
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Pages this role opens</label>
                    <PagePicker groups={PAGE_GROUPS} pages={role.pages} onToggle={slug => togglePage(key, slug)} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'block', marginBottom: 6 }}>Information this role can see</label>
                    <InfoSwitches info={role.info} onToggle={infoKey => toggleInfo(key, infoKey)} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Invite a teammate by email. Creates the login with NO password and returns a
// one-time link they use to set their own, so nobody ever handles someone
// else's password. Preferred over New user for onboarding a real person.
function InviteUserModal({ onClose, onInvited }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [rate, setRate] = useState('');
  const [pages, setPages] = useState(['time']);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState(null);

  const togglePage = (slug) => setPages(p => p.includes(slug) ? p.filter(x => x !== slug) : [...p, slug]);

  async function send() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error('Enter a valid email address'); return; }
    setSaving(true);
    try {
      const r = await inviteUser({
        email: email.trim(),
        is_admin: isAdmin,
        allowed_pages_global: isAdmin ? null : pages,
        hourly_rate: rate === '' ? null : Number(rate),
      });
      setLink(r.action_link || null);
      toast.success(`${email} can now be sent their set-up link`);
      onInvited();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast.success('Link copied'); } catch { /* ignore */ } };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: 460, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Invite teammate</div>
          <button style={btnGhost} onClick={onClose}><X size={14} /></button>
        </div>
        {!link ? (
          <>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              They set their own password from the link, so you never have to send one.
            </div>
            <label style={labelStyle}>Email</label>
            <input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" autoFocus />
            <label style={{ ...labelStyle, marginTop: 12, display: 'block' }}>Hourly rate (optional)</label>
            <input style={inputStyle} type="number" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 30.00" />
            <label style={{ ...labelStyle, marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} /> Full admin access
            </label>
            {!isAdmin && (
              <>
                <label style={{ ...labelStyle, marginTop: 12, display: 'block' }}>Pages they can see</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {ALL_PAGES.map(pg => (
                    <button key={pg.slug} onClick={() => togglePage(pg.slug)}
                      style={{ ...btnGhost, padding: '5px 10px', fontSize: 12, borderColor: pages.includes(pg.slug) ? 'var(--accent)' : 'var(--border)', color: pages.includes(pg.slug) ? 'var(--accent)' : 'var(--muted)' }}>
                      {pages.includes(pg.slug) && <Check size={11} />} {pg.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginTop: 18 }} onClick={send} disabled={saving}>
              <Mail size={13} /> {saving ? 'Creating...' : 'Create invite link'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
              Send this to <strong style={{ color: 'var(--text)' }}>{email}</strong>. It is single use and lets them set their own password.
            </div>
            <div style={{ ...inputStyle, wordBreak: 'break-all', fontSize: 11.5, lineHeight: 1.5, background: 'var(--bg)' }}>{link}</div>
            <button style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={copy}>
              <Copy size={13} /> Copy link
            </button>
            <button style={{ ...btnGhost, width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={onClose}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);

  function generate() {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setPw(s);
  }
  async function save() {
    if (pw.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try { await resetUserPassword(user.id, pw); toast.success(`Password reset for ${user.email}`); onClose(); }
    catch (e) { toast.error(e.message); setSaving(false); }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(pw); toast.success('Password copied'); } catch { /* ignore */ } };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: 420, maxWidth: '92vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Reset password</div>
          <button type="button" style={btnGhost} onClick={onClose}><X size={13} /></button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Set a new password for <strong style={{ color: 'var(--text)' }}>{user.email}</strong>, then share it with them. They'll use it to log in immediately.
        </div>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>New password</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, marginBottom: 12 }}>
          <input type="text" value={pw} onChange={e => setPw(e.target.value)} minLength={8} placeholder="At least 8 characters" style={{ ...inputStyle }} />
          <button type="button" style={btnGhost} onClick={generate} title="Generate">Generate</button>
          {pw && <button type="button" style={btnGhost} onClick={copy} title="Copy">Copy</button>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="button" style={btnPrimary} onClick={save} disabled={saving || pw.length < 8}>
            <KeyRound size={13} /> {saving ? 'Saving…' : 'Set password'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, clients, roles = {}, expanded, onToggle, onChanged, onViewAs, isSelf, pushData, onPrefsSaved, homeRole = '', onHomeRoleChange }) {
  const toast = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const isRestricted = user.is_admin && Array.isArray(user.allowed_pages_global) && user.allowed_pages_global.length > 0;
  // Which access role this person is in, or Custom. Admins are not in a role,
  // they pass everything.
  const grant = user.grants[0] || null;
  const roleKey = user.is_admin ? null : roleKeyFor(roles, grant?.role, grant?.allowed_pages || []);
  const roleLabel = user.is_admin ? null : (roleKey ? roles[roleKey].name : 'Custom');
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
            <div className="pii-name" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{user.email}</div>
            {user.is_admin && !isRestricted && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(37,99,235,0.15)', color: 'var(--orange)', fontWeight: 700 }}>ADMIN</span>
            )}
            {isRestricted && (
              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Lock size={9} /> VA ADMIN
              </span>
            )}
            {roleLabel && (
              <span
                title={roleKey ? 'The access role this person is in' : 'Their pages match no role, so they are on a one-off list'}
                style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <UserCog size={9} /> {roleLabel.toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
            {user.is_admin
              ? (isRestricted
                  ? `Admin · limited to ${user.allowed_pages_global.length} page${user.allowed_pages_global.length === 1 ? '' : 's'}`
                  : 'Full admin · every page')
              : (() => {
                  const n = (grant?.allowed_pages || []).length;
                  return n === 0 ? 'Employee · no page access yet' : `Employee · ${n} page${n === 1 ? '' : 's'}`;
                })()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Home layout in the iPhone app (settings key home_roles, keyed by auth user id) */}
          {user.id && onHomeRoleChange && (
            <label
              onClick={e => e.stopPropagation()}
              title="Which home the app opens to for this person. Auto picks from admin status and roster title."
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'default' }}
            >
              <LayoutDashboard size={12} /> Home
              <select
                value={homeRole}
                onChange={e => onHomeRoleChange(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ ...inputStyle, width: 'auto', minWidth: 96, padding: '5px 8px', fontSize: 12, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}
              >
                {HOME_ROLES.map(r => <option key={r.key || 'auto'} value={r.key}>{r.name}</option>)}
              </select>
            </label>
          )}
          {!isSelf && (
            <button
              style={btnGhost}
              onClick={e => { e.stopPropagation(); onViewAs?.(); }}
              title={`See the CRM as ${user.email}`}
            >
              <Eye size={13} /> View as
            </button>
          )}
          <button style={btnGhost} onClick={e => { e.stopPropagation(); setResetOpen(true); }} title="Set a new password">
            <KeyRound size={13} /> Reset password
          </button>
          <button style={btnGhost} onClick={toggleAdmin} title={user.is_admin ? 'Revoke admin' : 'Grant admin'}>
            {user.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}
            {user.is_admin ? 'Revoke admin' : 'Make admin'}
          </button>
          <button style={{ ...btnGhost, color: '#ef4444' }} onClick={remove}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      {resetOpen && <ResetPasswordModal user={user} onClose={() => setResetOpen(false)} />}

      {expanded && (
        <>
          {user.is_admin
            ? <GlobalPagesEditor user={user} onChanged={onChanged} />
            : <PageAccessEditor user={user} workspace={clients[0]} roles={roles} onChanged={onChanged} />}
          <NotificationPrefsEditor user={user} pushData={pushData} onSaved={onPrefsSaved} />
        </>
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
          ? 'This admin can only open the pages you select below. Leave unchecked for full access like yours.'
          : 'Full access: every page. Check the box above to limit this admin to specific pages (e.g. a VA).'}
      </div>

      {restrict && (
        <PagePicker groups={[...PAGE_GROUPS, ...ADMIN_PAGE_GROUPS]} pages={pages} onToggle={togglePage} />
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

// Per-employee page access. Single-account CRM, so there's no "client" to
// pick, this just edits which pages the employee can open. Under the hood it
// writes one grant on the single workspace.
function PageAccessEditor({ user, workspace, roles = {}, onChanged }) {
  const toast = useToast();
  const grant = user.grants[0] || null;                 // the one workspace grant
  const clientId = workspace?.id || grant?.client_id;
  const [pages, setPages] = useState(grant?.allowed_pages || []);
  // The role picked in this editing session. Ticking a page by hand clears
  // it, which is how someone drops back to Custom.
  const [picked, setPicked] = useState(() => (grant?.role && roles[grant.role]) ? grant.role : null);
  const [saving, setSaving] = useState(false);

  // Dirty when the pages moved, or when a role was actively picked that is
  // not the one already stored. A legacy grant whose role column holds
  // something we no longer know about is not treated as an edit on its own.
  const dirty = useMemo(() => {
    const a = [...(grant?.allowed_pages || [])].sort().join(',');
    const b = [...pages].sort().join(',');
    if (a !== b) return true;
    return !!picked && picked !== (grant?.role || null);
  }, [pages, picked, grant]);

  // What the select shows: the picked role while its pages still line up,
  // else whatever role the current page list matches, else Custom.
  const currentRole = useMemo(() => {
    if (picked && roles[picked] && samePages(roles[picked].pages, pages)) return picked;
    return roleKeyFor(roles, grant?.role, pages) || 'custom';
  }, [picked, roles, pages, grant]);

  const currentInfo = roles[currentRole]?.info || null;

  function togglePage(slug) {
    setPicked(null);
    setPages(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }
  // Putting someone in a role copies that role's pages onto them. Custom is
  // a state you land in by ticking pages yourself, not something to pick.
  function applyRole(key) {
    const r = roles[key];
    if (!r) return;
    setPicked(key);
    setPages([...r.pages]);
  }

  async function save() {
    if (!clientId) { toast.error('No workspace found'); return; }
    setSaving(true);
    try {
      await upsertUserGrant(user.id, { client_id: clientId, allowed_pages: pages, role: currentRole });
      toast.success(currentRole === 'custom'
        ? 'Access updated'
        : `${user.email} is now in ${roles[currentRole]?.name || currentRole}`);
      onChanged();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      {/* Put them in a role, or tick pages for a one-off list */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Role</span>
        <select value={currentRole} onChange={e => applyRole(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: 170, padding: '6px 10px' }}>
          {Object.entries(roles).map(([key, r]) => <option key={key} value={key}>{r.name}</option>)}
          {currentRole === 'custom' && <option value="custom">Custom</option>}
        </select>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>or tick individual pages below</span>
        {dirty && (
          <button style={{ ...btnPrimary, marginLeft: 'auto' }} onClick={save} disabled={saving}>
            <Check size={13} /> {saving ? 'Saving…' : 'Save access'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
        {currentRole === 'custom'
          ? 'Custom: a one-off page list, and none of the information switches. Edit the roles at the top of this page to change what a role carries.'
          : `Sees: ${ACCESS_INFO.filter(m => currentInfo?.[m.key]).map(m => m.name.toLowerCase()).join(', ') || 'pages only, no extra information'}.`}
      </div>

      <PagePicker groups={PAGE_GROUPS} pages={pages} onToggle={togglePage} />
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Untick everything to remove this employee's access.</div>
    </div>
  );
}

// Which push notifications this person's phone gets (mobile app). Saved prefs
// win; without one the default is: admins get everything, employees nothing.
const PUSH_EVENT_META = [
  { key: 'booking', name: 'New call booked 📅', hint: 'someone books on /book-call' },
  { key: 'signed',  name: 'Agreement signed 🎉', hint: 'a client signs' },
  { key: 'paid',    name: 'Payment received 💰', hint: 'a deposit is paid' },
];

function NotificationPrefsEditor({ user, pushData, onSaved }) {
  const toast = useToast();
  const saved = pushData?.prefs?.find(p => p.user_id === user.id)?.prefs || {};
  const deviceCount = pushData?.devices?.[user.id] || 0;
  const effective = (key) => (typeof saved[key] === 'boolean' ? saved[key] : !!user.is_admin);
  const [vals, setVals] = useState({});
  const [saving, setSaving] = useState(false);

  // Re-seed the toggles whenever the prefs payload (or target user) changes.
  useEffect(() => {
    setVals(Object.fromEntries(PUSH_EVENT_META.map(m => [m.key, effective(m.key)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushData, user.id]);

  const dirty = PUSH_EVENT_META.some(m => vals[m.key] !== effective(m.key));

  async function save() {
    setSaving(true);
    try {
      await setPushPrefs(user.id, vals);
      toast.success(`Notifications updated for ${user.email}`);
      onSaved?.();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  if (!pushData) return null;   // prefs endpoint unavailable, hide quietly

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Bell size={11} /> Phone notifications
        </span>
        <span style={{ fontSize: 11, color: deviceCount ? '#34d399' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Smartphone size={11} />
          {deviceCount
            ? `${deviceCount} phone${deviceCount === 1 ? '' : 's'} connected`
            : 'No phone yet. Starts working once they log into the mobile app'}
        </span>
        {dirty && (
          <button style={{ ...btnPrimary, marginLeft: 'auto', padding: '6px 12px' }} onClick={save} disabled={saving}>
            <Check size={13} /> {saving ? 'Saving…' : 'Save notifications'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
        Choose which alerts land on {user.email}'s phone.
      </div>
      <div className="access-pill-group" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PUSH_EVENT_META.map(m => {
          const on = !!vals[m.key];
          return (
            <button
              key={m.key}
              onClick={() => setVals(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
              title={`Sent when ${m.hint}`}
              style={{
                padding: '5px 10px', borderRadius: 20,
                background: on ? 'var(--orange)' : 'var(--surface)',
                color: on ? '#fff' : 'var(--text)',
                border: `1px solid ${on ? 'var(--orange)' : 'var(--border)'}`,
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {m.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// What the team actually uses in the iPhone app: per person, screen views and
// actions over the last 30 days, their top screens and actions, and a small
// per-day sparkline. Names only; message bodies are never logged.
const dayKeys = (days) => {
  // Days are Chicago dates (YYYY-MM-DD) from the rollup view; walk back from
  // today's Chicago date with UTC arithmetic so DST cannot skip a day.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t) => Number(parts.find(p => p.type === t)?.value || 0);
  const today = Date.UTC(get('year'), get('month') - 1, get('day'));
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(new Date(today - i * 86400000).toISOString().slice(0, 10));
  return out;
};
const topN = (counts, n = 3) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n);
const prettyName = (s) => String(s || '').replace(/_/g, ' ');

function Sparkline({ days, byDay }) {
  const keys = useMemo(() => dayKeys(days), [days]);
  const vals = keys.map(k => byDay[k] || 0);
  const max = Math.max(1, ...vals);
  return (
    <div title="Events per day, oldest to newest" style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 22, width: keys.length * 4 }}>
      {vals.map((v, i) => (
        <div key={keys[i]} title={`${keys[i]}: ${v}`} style={{ width: 3, height: Math.max(2, Math.round((v / max) * 22)), borderRadius: 1, background: v ? 'var(--orange)' : 'var(--border)', opacity: v ? 0.85 : 1 }} />
      ))}
    </div>
  );
}

function AppUsageTable({ usage, users }) {
  const people = useMemo(() => {
    const rows = Array.isArray(usage?.rows) ? usage.rows : [];
    const byUser = {};
    for (const r of rows) {
      const u = byUser[r.user_id] || (byUser[r.user_id] = { user_id: r.user_id, name: r.user_name || '', screens: 0, actions: 0, topScreens: {}, topActions: {}, byDay: {} });
      if (!u.name && r.user_name) u.name = r.user_name;
      const n = Number(r.n) || 0;
      if (r.event === 'action') { u.actions += n; u.topActions[r.name] = (u.topActions[r.name] || 0) + n; }
      else { u.screens += n; u.topScreens[r.name] = (u.topScreens[r.name] || 0) + n; }
      if (r.day) u.byDay[r.day] = (u.byDay[r.day] || 0) + n;
    }
    return Object.values(byUser)
      .map(u => ({ ...u, name: u.name || users.find(x => x.id === u.user_id)?.email || u.user_id }))
      .sort((a, b) => (b.screens + b.actions) - (a.screens + a.actions));
  }, [usage, users]);

  const th = { ...labelStyle, textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const td = { padding: '10px 10px', fontSize: 13, color: 'var(--text)', verticalAlign: 'top', borderBottom: '1px solid var(--border)' };
  const days = usage?.days || USAGE_DAYS;

  return (
    <div style={{ ...card, marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <BarChart2 size={15} color="var(--orange)" />
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>App usage (last {days} days)</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>What each person opens and does in the iPhone app. Screen and action names only, never what was typed.</div>

      {!usage ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Loading usage…</div>
      ) : usage.error ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {usage.needsMigration ? 'App usage tracking is not set up yet (run docs/sql/app-events.sql in Supabase).' : usage.error}
        </div>
      ) : people.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>No app activity in the last {days} days.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Person</th>
                <th style={{ ...th, textAlign: 'right' }}>Screen views</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                <th style={th}>Top screens</th>
                <th style={th}>Top actions</th>
                <th style={th}>Per day</th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => (
                <tr key={p.user_id}>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }} className="pii-name">{p.name}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.screens.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.actions.toLocaleString()}</td>
                  <td style={{ ...td, fontSize: 12, color: 'var(--muted)' }}>
                    {topN(p.topScreens).map(([n, c]) => <div key={n}><span style={{ color: 'var(--text)' }}>{prettyName(n)}</span> · {c}</div>)}
                    {!Object.keys(p.topScreens).length && <span>none</span>}
                  </td>
                  <td style={{ ...td, fontSize: 12, color: 'var(--muted)' }}>
                    {topN(p.topActions).map(([n, c]) => <div key={n}><span style={{ color: 'var(--text)' }}>{prettyName(n)}</span> · {c}</div>)}
                    {!Object.keys(p.topActions).length && <span>none</span>}
                  </td>
                  <td style={td}><Sparkline days={days} byDay={p.byDay} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateUserModal({ clients, roles = {}, onClose, onCreated }) {
  const roleKeys = Object.keys(roles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [restrictAdmin, setRestrictAdmin] = useState(false);
  const [adminPages, setAdminPages] = useState(['admin-users', ...DEFAULT_PAGES]);
  const workspace = clients[0] || null;                  // single-account: one workspace
  const [role, setRole] = useState(() => (roles.sales_assistant ? 'sales_assistant' : (roleKeys[0] || '')));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  function toggleAdminPage(slug) {
    setAdminPages(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try {
      const rolePages = roles[role]?.pages || DEFAULT_PAGES;
      const grants = (!isAdmin && workspace)
        ? [{ client_id: workspace.id, allowed_pages: rolePages, role: role || 'custom' }]
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} style={{ ...card, width: 440, maxWidth: '92vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>New user</div>
          <button type="button" style={btnGhost} onClick={onClose}><X size={13} /></button>
        </div>

        {err && <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: 'rgba(37,99,235,0.1)', color: '#2563eb', fontSize: 12 }}>{err}</div>}

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Email</label>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, marginTop: 4, marginBottom: 10 }} />

        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Temporary password</label>
        <input type="text" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, marginTop: 4, marginBottom: 10 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
          Make admin (full access to everything)
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
              {roleKeys.map(k => <option key={k} value={k}>{roles[k].name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
              This role grants: {(roles[role]?.pages || DEFAULT_PAGES).join(', ')}. You can fine-tune the pages after creating the user.
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
