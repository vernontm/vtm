// Global multi-tenant context. Loads { user, clients } from /api/crm/me on
// mount (after auth) and provides a selectedClientId that persists to
// localStorage so every page reads the same "current client."
//
// Admins see every client in the switcher. Non-admin users only see the
// clients they have been granted access to. Page gating is driven by
// allowed_pages on each client grant.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getMe, getAccessRoles, setCurrentClientId } from '../api';
import { useAuth } from './AuthContext';
import { useRefresh } from './RefreshContext';

const STORAGE_KEY = 'vtm.crm.selectedClientId';
const VIEW_AS_KEY = 'vtm.crm.viewingAs';

// ── Access roles ──────────────────────────────────────────────────────────
// A role is a named bundle of two things: the pages it can open, and the
// information switches it carries. Roles live in the settings key
// access_roles (the same store automations and home_roles use) shaped as:
//
//   { <role key>: { name: 'Sales Assistant',
//                   pages: ['leads', 'appointments', ...],
//                   info:  { money: false, inbox_all: false, team_pay: false } } }
//
// A person is put in a role from the Users and Access page, which writes the
// role key onto their grant and copies the role's pages onto them.

// The information switches every role carries. These shape what the WEB
// renders. They are not the security boundary: the server decides who may
// call a CRM endpoint at all, and it scopes the inbox on its own.
export const ACCESS_INFO = [
  {
    key: 'money',
    name: 'See money',
    hint: 'The Money page and the money tiles on the dashboard.',
  },
  {
    key: 'inbox_all',
    name: "See everyone's conversations",
    hint: 'A team wide inbox instead of only the threads assigned to them.',
  },
  {
    key: 'team_pay',
    name: 'See team pay and hours',
    hint: 'The Employees roster with hourly rates, team totals on Time, and the payroll tile.',
  },
];
export const ACCESS_INFO_KEYS = ACCESS_INFO.map(i => i.key);

// The roles the CRM shipped with, used to seed access_roles the first time an
// admin opens the editor and as the fallback when the settings read fails.
// Day one these reproduce the old hardcoded presets exactly: Full access gets
// every switch because it is the closest thing to an admin, and it still
// cannot reach Money (not in its page list) or Employees (admin only route),
// so nothing a person sees today changes.
export const DEFAULT_ACCESS_ROLES = {
  full: {
    name: 'Full access',
    pages: ['dashboard', 'leads', 'clients', 'projects', 'appointments', 'todos', 'tasks', 'routines', 'employees', 'time', 'employee-resources', 'contacts', 'marketing', 'inbox', 'email', 'settings'],
    info: { money: true, inbox_all: true, team_pay: true },
  },
  sales_assistant: {
    name: 'Sales Assistant',
    pages: ['leads', 'appointments', 'todos', 'routines', 'time', 'employee-resources'],
    info: { money: false, inbox_all: false, team_pay: false },
  },
  project_manager: {
    name: 'Project Manager',
    pages: ['dashboard', 'clients', 'projects', 'appointments', 'todos', 'routines', 'time', 'employee-resources'],
    info: { money: false, inbox_all: false, team_pay: false },
  },
};

// Clean whatever came back from settings into the shape above. Anything
// unreadable falls back to the seed so the app never boots without roles.
export function normalizeAccessRoles(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_ACCESS_ROLES };
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!key || !val || typeof val !== 'object' || Array.isArray(val)) continue;
    const info = {};
    for (const k of ACCESS_INFO_KEYS) info[k] = !!(val.info && val.info[k]);
    out[key] = {
      name: typeof val.name === 'string' && val.name.trim() ? val.name.trim() : key,
      pages: Array.isArray(val.pages) ? val.pages.filter(p => typeof p === 'string') : [],
      info,
    };
  }
  return Object.keys(out).length ? out : { ...DEFAULT_ACCESS_ROLES };
}

// Which role a page list belongs to, or null for Custom. Used for the label
// on a person who was never explicitly put in a role.
export function matchAccessRole(roles, pages = []) {
  const want = [...(pages || [])].sort().join(',');
  const hit = Object.entries(roles || {})
    .find(([, r]) => Array.isArray(r?.pages) && [...r.pages].sort().join(',') === want);
  return hit ? hit[0] : null;
}

export const samePages = (a = [], b = []) => [...a].sort().join(',') === [...b].sort().join(',');

// The one rule for "which role is this person in", used by the gating here
// and by the label on the Users and Access page so the two cannot disagree.
// Their stored role key counts while it still lines up with the pages they
// hold; hand-ticked pages that match no role are Custom (null), which carries
// none of the information switches.
export function roleKeyFor(roles, storedKey, pages = []) {
  if (storedKey && roles?.[storedKey] && samePages(roles[storedKey].pages, pages)) return storedKey;
  return matchAccessRole(roles, pages);
}

const ClientContext = createContext({
  loading: true,
  error: null,
  user: null,
  clients: [],
  selectedClientId: null,
  selectedClient: null,
  isAdmin: false,
  allowedPages: [],
  accessRoles: DEFAULT_ACCESS_ROLES,
  accessRoleKey: null,
  accessRoleName: 'Custom',
  can: () => true,
  setSelectedClientId: () => {},
  refresh: () => {},
});

export function ClientProvider({ children }) {
  const { session } = useAuth();
  const { triggerRefresh } = useRefresh();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [accessRoles, setAccessRoles] = useState(DEFAULT_ACCESS_ROLES);
  const [selectedClientId, setSelectedClientIdState] = useState(null);
  // Admin impersonation. When set, the CRM pretends the signed-in account is
  // this user — same sidebar, same clients, same allowed_pages as they'd see.
  // Survives reloads via localStorage; cleared explicitly via "Exit view as".
  const [viewingAs, setViewingAsState] = useState(() => {
    try {
      const raw = localStorage.getItem(VIEW_AS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const load = useCallback(async () => {
    if (!session) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      // Access roles ride along with /me so the sidebar and the routes never
      // render a frame with the wrong answer. A failed read is not fatal:
      // we fall back to the seeded roles.
      const [data, roles] = await Promise.all([
        getMe(),
        getAccessRoles().catch(() => null),
      ]);
      setAccessRoles(normalizeAccessRoles(roles));
      setUser(data.user || null);
      const list = data.clients || [];
      setClients(list);
      // Pick the active client: stored preference → first accessible client
      const stored = localStorage.getItem(STORAGE_KEY);
      const pickable = list.find(c => c.id === stored) || list[0] || null;
      setSelectedClientIdState(pickable?.id || null);
      setCurrentClientId(pickable?.id || null);
      if (pickable?.id) localStorage.setItem(STORAGE_KEY, pickable.id);
    } catch (e) {
      setError(e.message || 'Failed to load user access');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  // Safety: if we have a persisted view-as but the real signed-in user isn't
  // an admin (token changed, session switched, etc.), drop the impersonation.
  useEffect(() => {
    if (!loading && viewingAs && user && !user.is_admin) {
      setViewingAsState(null);
      try { localStorage.removeItem(VIEW_AS_KEY); } catch {}
    }
  }, [loading, user, viewingAs]);

  // Build a "view-as" payload from a user object (from getAdminUsers).
  // `target` shape: { id, email, is_admin, allowed_pages_global, grants: [...] }
  // We compose an effective user + effective clients list using Ray's real
  // clients list (we already know their enabled_pages, logos, etc.) so the
  // preview matches what that user would see after loadUserAccess ran.
  const viewAsUser = useCallback((target) => {
    if (!target) return;
    const scope = (userPages, clientEnabled) => {
      if (!Array.isArray(clientEnabled) || clientEnabled.length === 0) return userPages;
      const set = new Set(clientEnabled);
      return userPages.filter(p => set.has(p));
    };
    let effClients;
    if (target.is_admin) {
      const base = Array.isArray(target.allowed_pages_global) && target.allowed_pages_global.length
        ? target.allowed_pages_global
        : null; // null = unrestricted admin
      effClients = clients.map(c => ({
        ...c,
        role: 'admin',
        allowed_pages: scope(base || c.allowed_pages, c.enabled_pages),
      }));
    } else {
      const byClient = new Map((target.grants || []).map(g => [g.client_id, g]));
      effClients = clients
        .filter(c => byClient.has(c.id))
        .map(c => {
          const g = byClient.get(c.id);
          return {
            ...c,
            role: g.role || 'viewer',
            allowed_pages: scope(g.allowed_pages || [], c.enabled_pages),
          };
        });
    }
    const payload = {
      user: {
        id: target.id,
        email: target.email,
        is_admin: !!target.is_admin,
        allowed_pages_global: target.allowed_pages_global || null,
      },
      clients: effClients,
      label: target.email,
    };
    setViewingAsState(payload);
    try { localStorage.setItem(VIEW_AS_KEY, JSON.stringify(payload)); } catch {}
    // Snap to a client they can actually see.
    const first = effClients[0]?.id || null;
    setSelectedClientIdState(first);
    setCurrentClientId(first);
    if (first) localStorage.setItem(STORAGE_KEY, first);
    triggerRefresh();
  }, [clients, triggerRefresh]);

  const clearViewingAs = useCallback(() => {
    setViewingAsState(null);
    try { localStorage.removeItem(VIEW_AS_KEY); } catch {}
    triggerRefresh();
  }, [triggerRefresh]);

  const setSelectedClientId = useCallback((id) => {
    setSelectedClientIdState(prev => {
      // Fire a global refresh whenever the active client actually changes so
      // every mounted page re-fetches its data against the new scope (not just
      // whatever page the user happens to be on).
      if (prev !== id) triggerRefresh();
      return id;
    });
    setCurrentClientId(id || null);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, [triggerRefresh]);

  // ── Effective identity ────────────────────────────────────────────────
  // Ray's real identity from /me OR, if impersonating, the preview identity
  // we constructed when "View as" was clicked.
  const effectiveUser = viewingAs?.user || user;
  const effectiveClients = viewingAs?.clients || clients;
  const selectedClient = effectiveClients.find(c => c.id === selectedClientId) || null;
  const isAdmin = !!effectiveUser?.is_admin;
  // VA admins: cross-client admin BUT restricted to a subset of pages.
  // Empty/null = unrestricted admin (Ray).
  const allowedPagesGlobal = Array.isArray(effectiveUser?.allowed_pages_global) && effectiveUser.allowed_pages_global.length
    ? effectiveUser.allowed_pages_global
    : null;
  const isRestrictedAdmin = isAdmin && !!allowedPagesGlobal;
  // Active page list = pages allowed for the currently selected client.
  // For restricted admins this is already intersected server-side.
  const allowedPages = selectedClient?.allowed_pages || [];

  // Imperative access check (usable inside arrays/filters without a hook).
  // Full admins (no global restriction) bypass. Restricted admins and
  // regular users go through the allow-list. Some pages are always available
  // (login-adjacent + global user-level pages).
  // Login-adjacent / personal pages everyone can reach. Dashboard is NOT here
  // — it now respects the per-employee page grant like every other page.
  const ALWAYS_ALLOWED = ['notifications', 'settings'];
  const canAccess = useCallback((slug) => {
    if (!slug) return true;
    if (ALWAYS_ALLOWED.includes(slug)) return true;
    if (isAdmin && !allowedPagesGlobal) return true;
    return allowedPages.includes(slug);
  }, [isAdmin, allowedPagesGlobal, allowedPages]);

  // ── Which access role this person is in ─────────────────────────────────
  // The grant's role column holds the key once someone has been put in a
  // role. Grants written before roles existed fall back to matching their
  // page list against the roles, and a list that matches nothing is Custom.
  const accessRoleKey = useMemo(
    () => roleKeyFor(accessRoles, selectedClient?.role, allowedPages),
    [selectedClient, accessRoles, allowedPages],
  );
  const accessRoleName = accessRoleKey ? (accessRoles[accessRoleKey]?.name || accessRoleKey) : 'Custom';
  // Custom carries no switches, so it sees none of the gated information.
  const accessInfo = useMemo(
    () => (accessRoleKey && accessRoles[accessRoleKey]?.info) || {},
    [accessRoleKey, accessRoles],
  );

  // Sibling of canAccess for the information switches rather than the pages.
  // Admins always pass. Everyone else gets what their role carries.
  const can = useCallback((infoKey) => {
    if (!infoKey) return true;
    if (isAdmin) return true;
    return !!accessInfo[infoKey];
  }, [isAdmin, accessInfo]);

  return (
    <ClientContext.Provider value={{
      loading, error,
      // Effective identity (may be a view-as preview)
      user: effectiveUser,
      clients: effectiveClients,
      selectedClientId, selectedClient,
      isAdmin, isRestrictedAdmin, allowedPagesGlobal,
      allowedPages, canAccess,
      // Access roles: the page bundle plus the information switches
      accessRoles, accessRoleKey, accessRoleName, can,
      setSelectedClientId,
      // Impersonation
      viewingAs,
      realUser: user,
      viewAsUser, clearViewingAs,
      refresh: load,
    }}>
      {children}
    </ClientContext.Provider>
  );
}

export const useClient = () => useContext(ClientContext);

// Helper: returns true if the current user+client can see this page slug.
// Admins pass for everything.
export function useCanAccess(pageSlug) {
  const { canAccess } = useClient();
  return canAccess(pageSlug);
}

// Helper: returns true if the current user's role carries this information
// switch (one of ACCESS_INFO_KEYS). Admins pass for everything.
export function useCan(infoKey) {
  const { can } = useClient();
  return can(infoKey);
}
