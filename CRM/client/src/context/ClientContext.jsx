// Global multi-tenant context. Loads { user, clients } from /api/crm/me on
// mount (after auth) and provides a selectedClientId that persists to
// localStorage so every page reads the same "current client."
//
// Admins see every client in the switcher. Non-admin users only see the
// clients they have been granted access to. Page gating is driven by
// allowed_pages on each client grant.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getMe, setCurrentClientId } from '../api';
import { useAuth } from './AuthContext';
import { useRefresh } from './RefreshContext';

const STORAGE_KEY = 'vtm.crm.selectedClientId';
const VIEW_AS_KEY = 'vtm.crm.viewingAs';

const ClientContext = createContext({
  loading: true,
  error: null,
  user: null,
  clients: [],
  selectedClientId: null,
  selectedClient: null,
  isAdmin: false,
  allowedPages: [],
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
      const data = await getMe();
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

  return (
    <ClientContext.Provider value={{
      loading, error,
      // Effective identity (may be a view-as preview)
      user: effectiveUser,
      clients: effectiveClients,
      selectedClientId, selectedClient,
      isAdmin, isRestrictedAdmin, allowedPagesGlobal,
      allowedPages, canAccess,
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
