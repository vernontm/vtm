// Global multi-tenant context. Loads { user, clients } from /api/crm/me on
// mount (after auth) and provides a selectedClientId that persists to
// localStorage so every page reads the same "current client."
//
// Admins see every client in the switcher. Non-admin users only see the
// clients they have been granted access to. Page gating is driven by
// allowed_pages on each client grant.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getMe } from '../api';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'vtm.crm.selectedClientId';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientIdState] = useState(null);

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
      if (pickable?.id) localStorage.setItem(STORAGE_KEY, pickable.id);
    } catch (e) {
      setError(e.message || 'Failed to load user access');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => { load(); }, [load]);

  const setSelectedClientId = useCallback((id) => {
    setSelectedClientIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const selectedClient = clients.find(c => c.id === selectedClientId) || null;
  const isAdmin = !!user?.is_admin;
  // Active page list = pages allowed for the currently selected client
  const allowedPages = selectedClient?.allowed_pages || [];

  return (
    <ClientContext.Provider value={{
      loading, error, user, clients,
      selectedClientId, selectedClient,
      isAdmin, allowedPages,
      setSelectedClientId,
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
  const { isAdmin, allowedPages } = useClient();
  if (isAdmin) return true;
  return allowedPages.includes(pageSlug);
}
