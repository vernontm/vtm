import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTeam } from '../context/TeamContext';
import { getContentClients } from '../api';

// ─── Permission definitions ───────────────────────────────────────────────────
const ALL_PAGES = [
  // Workspace
  { slug: 'dashboard',          label: 'Dashboard',          group: 'Workspace' },
  { slug: 'leads',              label: 'Leads',               group: 'Workspace' },
  { slug: 'contacts',           label: 'Contacts',            group: 'Workspace' },
  { slug: 'projects',           label: 'Projects',            group: 'Workspace' },
  { slug: 'blog',               label: 'Blog',                group: 'Workspace' },
  { slug: 'portfolio',          label: 'Portfolio',           group: 'Workspace' },
  { slug: 'content-scheduler',  label: 'Content Scheduler',   group: 'Workspace' },
  { slug: 'email-marketing',    label: 'Email Marketing',     group: 'Workspace' },
  // Tools
  { slug: 'email',              label: 'Email',               group: 'Tools' },
  { slug: 'meetings',           label: 'Meetings',            group: 'Tools' },
  { slug: 'invoices',           label: 'Invoices',            group: 'Tools' },
  { slug: 'subscriptions',      label: 'Subscriptions',       group: 'Tools' },
  { slug: 'quick-notes',        label: 'Quick Notes',         group: 'Tools' },
  { slug: 'notifications',      label: 'Notifications',       group: 'Tools' },
  { slug: 'settings',           label: 'Settings',            group: 'Tools' },
  { slug: 'training',           label: 'Training Videos',     group: 'Tools' },
  { slug: 'scripts',            label: 'Call Scripts',        group: 'Tools' },
  // Academy
  { slug: 'academy',                  label: 'Academy Dashboard',  group: 'Academy' },
  { slug: 'academy-courses',          label: 'Courses',            group: 'Academy' },
  { slug: 'academy-students',         label: 'Students',           group: 'Academy' },
  { slug: 'academy-homework',         label: 'Homework',           group: 'Academy' },
  { slug: 'academy-messages',         label: 'Messages',           group: 'Academy' },
  { slug: 'academy-community',        label: 'Community',          group: 'Academy' },
  { slug: 'academy-recommendations',  label: 'Recommendations',    group: 'Academy' },
  { slug: 'academy-settings',         label: 'Academy Settings',   group: 'Academy' },
];

const GROUPS = ['Workspace', 'Tools', 'Academy'];

const GROUP_COLORS = {
  Workspace: { bg: 'rgba(74,108,247,0.15)',  fg: '#7ba7ff' },
  Tools:     { bg: 'rgba(5,150,105,0.15)',   fg: '#34d399' },
  Academy:   { bg: 'rgba(180,83,9,0.15)',    fg: '#fb923c' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name = '') {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const AVATAR_COLORS = [
  'var(--orange)', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#9333ea',
];
function avatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function apiFetch(path, options = {}) {
  const token = await getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : '',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const PAGE_BG   = 'var(--bg)';
const CARD_BG   = 'var(--surface)';
const TEXT      = 'var(--text)';
const TEXT_MUTED= 'var(--muted)';
const ACCENT    = 'var(--orange)';
const BORDER    = 'var(--border)';

const INPUT_STYLE = {
  width: '100%', padding: '8px 12px', borderRadius: 7, fontSize: 14,
  color: TEXT, background: PAGE_BG, border: `1px solid ${BORDER}`,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-display)',
};

const BTN_PRIMARY = {
  padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: ACCENT, color: '#fff', fontSize: 14, fontWeight: 600,
  fontFamily: 'var(--font-display)',
};

const BTN_GHOST = {
  padding: '6px 12px', borderRadius: 7, border: `1px solid ${BORDER}`,
  cursor: 'pointer', background: 'transparent', color: TEXT, fontSize: 13,
  fontFamily: 'var(--font-display)',
};

const BTN_DANGER = {
  ...BTN_GHOST, border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', background: 'rgba(239,68,68,0.1)',
};

// ─── PermissionCheckboxes (shared by invite + edit modals) ───────────────────
function PermissionCheckboxes({ selected, onChange }) {
  function isGroupAllSelected(group) {
    const slugs = ALL_PAGES.filter(p => p.group === group).map(p => p.slug);
    return slugs.every(s => selected.includes(s));
  }

  function toggleGroup(group) {
    const slugs = ALL_PAGES.filter(p => p.group === group).map(p => p.slug);
    if (isGroupAllSelected(group)) {
      onChange(selected.filter(s => !slugs.includes(s)));
    } else {
      onChange([...new Set([...selected, ...slugs])]);
    }
  }

  function toggleSlug(slug) {
    if (selected.includes(slug)) onChange(selected.filter(s => s !== slug));
    else onChange([...selected, slug]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {GROUPS.map(group => {
        const pages = ALL_PAGES.filter(p => p.group === group);
        const allSel = isGroupAllSelected(group);
        const gc = GROUP_COLORS[group];
        return (
          <div key={group}>
            {/* Group header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: gc.fg, background: gc.bg, padding: '2px 8px', borderRadius: 4,
              }}>{group}</span>
              <button
                type="button"
                onClick={() => toggleGroup(group)}
                style={{ fontSize: 12, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {allSel ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            {/* Checkboxes grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 12px' }}>
              {pages.map(p => (
                <label key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: TEXT }}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.slug)}
                    onChange={() => toggleSlug(p.slug)}
                    style={{ accentColor: ACCENT, width: 15, height: 15, cursor: 'pointer' }}
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ClientAccessPicker ───────────────────────────────────────────────────────
function ClientAccessPicker({ allClients, selectedIds, defaultId, onChangeIds, onChangeDefault }) {
  const allSelected = selectedIds.length === 0; // empty = all clients

  function toggleClient(id) {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter(x => x !== id);
      onChangeIds(next);
      if (defaultId === id) onChangeDefault(next[0] || null);
    } else {
      onChangeIds([...selectedIds, id]);
    }
  }

  function toggleAll() {
    if (allSelected) {
      // restrict to none (means all) → no change needed; clicking when all means switch to restricted
    } else {
      onChangeIds([]);
      onChangeDefault(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Client Access</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: TEXT_MUTED, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            style={{ accentColor: ACCENT, cursor: 'pointer' }}
          />
          All clients
        </label>
      </div>
      {!allSelected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {allClients.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: TEXT }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(c.id)}
                onChange={() => toggleClient(c.id)}
                style={{ accentColor: ACCENT, width: 15, height: 15, cursor: 'pointer' }}
              />
              {c.business_name}
            </label>
          ))}
        </div>
      )}
      {selectedIds.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: TEXT_MUTED, marginBottom: 4 }}>
            Default client (loads first)
          </label>
          <select
            value={defaultId || ''}
            onChange={e => onChangeDefault(e.target.value || null)}
            style={{ ...INPUT_STYLE, fontSize: 13 }}
          >
            <option value="">— None —</option>
            {allClients.filter(c => selectedIds.includes(c.id)).map(c => (
              <option key={c.id} value={c.id}>{c.business_name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, footer }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: CARD_BG, borderRadius: 12, width: '100%', maxWidth: 540,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px', borderBottom: `1px solid ${BORDER}`,
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: TEXT }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: TEXT_MUTED, lineHeight: 1 }}>×</button>
        </div>
        {/* Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div style={{
            padding: '14px 24px', borderTop: `1px solid ${BORDER}`,
            display: 'flex', justifyContent: 'flex-end', gap: 10,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── InviteModal ──────────────────────────────────────────────────────────────
function InviteModal({ onClose, onSaved }) {
  const [name,              setName]              = useState('');
  const [email,             setEmail]             = useState('');
  const [permissions,       setPermissions]       = useState([]);
  const [allowedClientIds,  setAllowedClientIds]  = useState([]);
  const [defaultClientId,   setDefaultClientId]   = useState(null);
  const [allClients,        setAllClients]        = useState([]);
  const [saving,            setSaving]            = useState(false);
  const [error,             setError]             = useState('');

  useEffect(() => {
    getContentClients().then(d => setAllClients(d || [])).catch(() => {});
  }, []);

  async function handleSave() {
    if (!name.trim())  return setError('Name is required.');
    if (!email.trim()) return setError('Email is required.');
    setSaving(true);
    setError('');
    try {
      const member = await apiFetch('/api/crm/team', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          permissions,
          allowed_client_ids: allowedClientIds,
          default_client_id: defaultClientId,
        }),
      });
      onSaved(member);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Invite Admin"
      onClose={onClose}
      footer={
        <>
          <button style={BTN_GHOST} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Sending invite…' : 'Send Invite'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 5 }}>Name</label>
        <input style={INPUT_STYLE} value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" />
      </div>
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 5 }}>Email</label>
        <input style={INPUT_STYLE} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Permissions</label>
        <PermissionCheckboxes selected={permissions} onChange={setPermissions} />
      </div>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
        <ClientAccessPicker
          allClients={allClients}
          selectedIds={allowedClientIds}
          defaultId={defaultClientId}
          onChangeIds={setAllowedClientIds}
          onChangeDefault={setDefaultClientId}
        />
      </div>
    </Modal>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ member, onClose, onSaved }) {
  const [name,             setName]             = useState(member.name || '');
  const [permissions,      setPermissions]      = useState(member.permissions || []);
  const [allowedClientIds, setAllowedClientIds] = useState(member.allowed_client_ids || []);
  const [defaultClientId,  setDefaultClientId]  = useState(member.default_client_id || null);
  const [allClients,       setAllClients]       = useState([]);
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');

  useEffect(() => {
    getContentClients().then(d => setAllClients(d || [])).catch(() => {});
  }, []);

  async function handleSave() {
    if (!name.trim()) return setError('Name is required.');
    setSaving(true);
    setError('');
    try {
      const updated = await apiFetch(`/api/crm/team?id=${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          permissions,
          allowed_client_ids: allowedClientIds,
          default_client_id: defaultClientId,
        }),
      });
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Edit Permissions"
      onClose={onClose}
      footer={
        <>
          <button style={BTN_GHOST} onClick={onClose} disabled={saving}>Cancel</button>
          <button style={{ ...BTN_PRIMARY, opacity: saving ? 0.7 : 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      {error && (
        <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 5 }}>Name</label>
        <input style={INPUT_STYLE} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Permissions</label>
        <PermissionCheckboxes selected={permissions} onChange={setPermissions} />
      </div>
      <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 18 }}>
        <ClientAccessPicker
          allClients={allClients}
          selectedIds={allowedClientIds}
          defaultId={defaultClientId}
          onChangeIds={setAllowedClientIds}
          onChangeDefault={setDefaultClientId}
        />
      </div>
    </Modal>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onClose, loading }) {
  return (
    <Modal
      title="Confirm Removal"
      onClose={onClose}
      footer={
        <>
          <button style={BTN_GHOST} onClick={onClose} disabled={loading}>Cancel</button>
          <button style={{ ...BTN_DANGER, fontWeight: 600 }} onClick={onConfirm} disabled={loading}>
            {loading ? 'Removing…' : 'Remove Member'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14, color: TEXT }}>{message}</p>
    </Modal>
  );
}

// ─── MemberCard ───────────────────────────────────────────────────────────────
function MemberCard({ member, onEdit, onRemove, onViewAs, allClients }) {
  const isOwnerRole = member.role === 'owner';
  const perms = member.permissions || [];
  const restrictedClients = (member.allowed_client_ids || [])
    .map(id => allClients.find(c => c.id === id))
    .filter(Boolean);

  return (
    <div style={{
      background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`,
      padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: 14,
    }}>
      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        background: avatarColor(member.name || member.email),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-display)',
      }}>
        {getInitials(member.name || member.email)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{member.name || '—'}</span>
          {/* Role badge */}
          <span style={{
            fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
            padding: '2px 7px', borderRadius: 4,
            background: isOwnerRole ? 'rgba(180,83,9,0.15)' : 'rgba(74,108,247,0.15)',
            color:      isOwnerRole ? '#fb923c' : ACCENT,
          }}>
            {member.role || 'admin'}
          </span>
          {/* Invite status badge */}
          {member.invite_status && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
              background: member.invite_status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(253,171,61,0.15)',
              color:      member.invite_status === 'active' ? '#4ade80' : '#fdab3d',
            }}>
              {member.invite_status}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: TEXT_MUTED, marginBottom: perms.length > 0 ? 8 : 0 }}>
          {member.email}
        </div>

        {/* Permission chips */}
        {perms.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {perms.map(slug => {
              const page = ALL_PAGES.find(p => p.slug === slug);
              const gc = GROUP_COLORS[page?.group] || { bg: '#f1f5f9', fg: '#475569' };
              return (
                <span key={slug} style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 4,
                  background: gc.bg, color: gc.fg, fontWeight: 500,
                }}>
                  {page?.label || slug}
                </span>
              );
            })}
          </div>
        )}
        {perms.length === 0 && !isOwnerRole && (
          <span style={{ fontSize: 12, color: TEXT_MUTED, fontStyle: 'italic' }}>No permissions assigned</span>
        )}
        {isOwnerRole && (
          <span style={{ fontSize: 12, color: '#b45309', fontStyle: 'italic' }}>Full access (owner)</span>
        )}

        {/* Client access */}
        {!isOwnerRole && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: TEXT_MUTED, fontWeight: 600 }}>Clients:</span>
            {restrictedClients.length === 0
              ? <span style={{ fontSize: 11, color: TEXT_MUTED, fontStyle: 'italic' }}>All</span>
              : restrictedClients.map(c => (
                <span key={c.id} style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 4,
                  background: 'rgba(59,130,246,0.08)', color: 'var(--orange)', fontWeight: 500,
                }}>
                  {c.business_name}
                  {member.default_client_id === c.id && (
                    <span style={{ marginLeft: 3, color: 'var(--muted)' }}>★</span>
                  )}
                </span>
              ))
            }
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
        {/* View As */}
        <button
          style={{
            ...BTN_GHOST,
            opacity: isOwnerRole ? 0.4 : 1,
            cursor: isOwnerRole ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
          onClick={() => !isOwnerRole && onViewAs(member)}
          disabled={isOwnerRole}
          title={isOwnerRole ? 'Cannot view as an owner' : `View as ${member.name}`}
        >
          View As
        </button>
        {/* Edit */}
        <button
          style={{ ...BTN_GHOST, fontSize: 12 }}
          onClick={() => onEdit(member)}
          title="Edit permissions"
        >
          ✏️
        </button>
        {/* Remove */}
        <button
          style={{ ...BTN_DANGER, fontSize: 12 }}
          onClick={() => onRemove(member)}
          title="Remove member"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Team() {
  const navigate = useNavigate();
  const { isOwner, loading: teamLoading, setViewingAs } = useTeam();

  const [members,      setMembers]      = useState([]);
  const [loadingList,  setLoadingList]  = useState(true);
  const [fetchError,   setFetchError]   = useState('');
  const [allClients,   setAllClients]   = useState([]);

  const [showInvite,   setShowInvite]   = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);  // member to edit
  const [removeTarget, setRemoveTarget] = useState(null);  // member to remove
  const [removing,     setRemoving]     = useState(false);

  // ── Fetch member list ────────────────────────────────────────────────────
  const fetchMembers = useCallback(async () => {
    setLoadingList(true);
    setFetchError('');
    try {
      const data = await apiFetch('/api/crm/team');
      setMembers(Array.isArray(data) ? data : []);
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (!teamLoading) fetchMembers();
    getContentClients().then(d => setAllClients(d || [])).catch(() => {});
  }, [teamLoading, fetchMembers]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleInviteSaved(newMember) {
    setMembers(prev => [...prev, newMember]);
  }

  function handleEditSaved(updated) {
    setMembers(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
  }

  async function handleRemoveConfirm() {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await apiFetch(`/api/crm/team?id=${removeTarget.id}`, { method: 'DELETE' });
      setMembers(prev => prev.filter(m => m.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch (e) {
      alert('Failed to remove member: ' + e.message);
    } finally {
      setRemoving(false);
    }
  }

  function handleViewAs(member) {
    setViewingAs(member);
    // Navigate to first permitted page, not always dashboard
    const perms = member.permissions || [];
    const firstPage = ALL_PAGES.find(p => perms.includes(p.slug));
    const slugToRoute = {
      'dashboard': '/dashboard', 'leads': '/leads', 'contacts': '/contacts',
      'projects': '/projects', 'blog': '/blog',
      'portfolio': '/portfolio', 'outreach': '/outreach',
      'content-scheduler': '/content-scheduler', 'youtube': '/youtube',
      'email-marketing': '/email-marketing', 'email': '/email',
      'meetings': '/meetings', 'invoices': '/invoices',
      'subscriptions': '/subscriptions', 'quick-notes': '/quick-notes',
      'notifications': '/notifications', 'settings': '/settings', 'training': '/training', 'scripts': '/scripts',
      'academy': '/academy', 'academy-courses': '/academy/courses',
      'academy-students': '/academy/students', 'academy-homework': '/academy/homework',
      'academy-messages': '/academy/messages', 'academy-community': '/academy/community',
      'academy-recommendations': '/academy/recommendations', 'academy-settings': '/academy/settings',
    };
    const dest = firstPage ? (slugToRoute[firstPage.slug] || '/dashboard') : '/dashboard';
    navigate(dest);
  }

  // ── Loading / access guard ────────────────────────────────────────────────
  if (teamLoading) {
    return (
      <div style={{ minHeight: '100vh', background: PAGE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 15, color: TEXT_MUTED }}>Loading…</div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div style={{ minHeight: '100vh', background: PAGE_BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          background: CARD_BG, borderRadius: 12, padding: 40, textAlign: 'center',
          border: `1px solid ${BORDER}`, maxWidth: 380,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, color: TEXT }}>No Access</h2>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_MUTED }}>
            Team management is only available to owners.
          </p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: PAGE_BG, fontFamily: 'var(--font-display)' }}>
      {/* Page content */}
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEXT }}>Team &amp; Access</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: TEXT_MUTED }}>
              Manage admin team members and their page permissions.
            </p>
          </div>
          <button style={BTN_PRIMARY} onClick={() => setShowInvite(true)}>
            + Invite Admin
          </button>
        </div>

        {/* Error */}
        {fetchError && (
          <div style={{
            marginBottom: 20, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13,
          }}>
            Failed to load team: {fetchError}.{' '}
            <button onClick={fetchMembers} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700, padding: 0 }}>
              Retry
            </button>
          </div>
        )}

        {/* Member list */}
        {loadingList ? (
          <div style={{ padding: 40, textAlign: 'center', color: TEXT_MUTED, fontSize: 14 }}>
            Loading team members…
          </div>
        ) : members.length === 0 ? (
          <div style={{
            background: CARD_BG, borderRadius: 10, border: `1px solid ${BORDER}`,
            padding: 40, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
            <p style={{ margin: 0, fontSize: 14, color: TEXT_MUTED }}>
              No team members yet. Invite an admin to get started.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {members.map(m => (
              <MemberCard
                key={m.id}
                member={m}
                allClients={allClients}
                onEdit={setEditTarget}
                onRemove={setRemoveTarget}
                onViewAs={handleViewAs}
              />
            ))}
          </div>
        )}

        {/* Footer count */}
        {!loadingList && members.length > 0 && (
          <p style={{ marginTop: 16, fontSize: 12, color: TEXT_MUTED, textAlign: 'right' }}>
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSaved={handleInviteSaved}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          member={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* Remove confirmation modal */}
      {removeTarget && (
        <ConfirmModal
          message={`Remove ${removeTarget.name || removeTarget.email} from the team? This cannot be undone.`}
          loading={removing}
          onConfirm={handleRemoveConfirm}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
