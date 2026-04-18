import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const TeamContext = createContext({
  currentMember:        null,
  isOwner:              false,
  viewingAs:            null,
  effectivePermissions: null,
  allowedClientIds:     null,
  defaultClientId:      null,
  loading:              true,
  hasPermission:        () => true,
  setViewingAs:         () => {},
  clearViewingAs:       () => {},
});

const LS_KEY = 'vtm_viewing_as';

export function TeamProvider({ children }) {
  const [currentMember, setCurrentMember] = useState(null);
  const [loading,        setLoading]       = useState(true);

  // Initialise viewingAs from localStorage so it survives page refreshes
  const [viewingAs, setViewingAsState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // ── Fetch the current user's team record on mount ─────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchMe() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setLoading(false);
          return;
        }

        const token = session.access_token;
        const res   = await fetch('/api/crm/team?action=me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`team/me returned ${res.status}`);
        const member = await res.json();

        if (!cancelled) setCurrentMember(member);
      } catch (err) {
        console.error('TeamContext fetchMe error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMe();

    // Re-fetch when auth state changes (e.g. token refresh, sign-in)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchMe();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const isOwner = !currentMember || currentMember.role === 'owner';

  /**
   * effectivePermissions:
   *   - null      → full access (owner not viewing as anyone)
   *   - string[]  → explicit list of allowed page slugs
   *
   * allowedClientIds:
   *   - null      → all clients visible
   *   - string[]  → only these client UUIDs are accessible
   */
  const effectivePermissions = viewingAs
    ? (viewingAs.permissions ?? [])
    : isOwner
      ? null
      : (currentMember?.permissions ?? []);

  const allowedClientIds = viewingAs
    ? (viewingAs.allowed_client_ids?.length ? viewingAs.allowed_client_ids : null)
    : isOwner
      ? null
      : (currentMember?.allowed_client_ids?.length ? currentMember.allowed_client_ids : null);

  const defaultClientId = viewingAs
    ? (viewingAs.default_client_id || null)
    : isOwner
      ? null
      : (currentMember?.default_client_id || null);

  // ── Permission helper ─────────────────────────────────────────────────────
  const hasPermission = useCallback(
    (slug) => effectivePermissions === null || effectivePermissions.includes(slug),
    [effectivePermissions],
  );

  // ── viewingAs setters ─────────────────────────────────────────────────────
  const setViewingAs = useCallback((member) => {
    const record = {
      id:                 member.id,
      email:              member.email,
      name:               member.name,
      permissions:        member.permissions ?? [],
      allowed_client_ids: member.allowed_client_ids ?? [],
      default_client_id:  member.default_client_id ?? null,
    };
    setViewingAsState(record);
    try { localStorage.setItem(LS_KEY, JSON.stringify(record)); } catch {}
  }, []);

  const clearViewingAs = useCallback(() => {
    setViewingAsState(null);
    try { localStorage.removeItem(LS_KEY); } catch {}
  }, []);

  const value = useMemo(() => ({
    currentMember,
    isOwner,
    viewingAs,
    effectivePermissions,
    allowedClientIds,
    defaultClientId,
    loading,
    hasPermission,
    setViewingAs,
    clearViewingAs,
  }), [currentMember, isOwner, viewingAs, effectivePermissions, allowedClientIds, defaultClientId, loading, hasPermission, setViewingAs, clearViewingAs]);

  return (
    <TeamContext.Provider value={value}>
      {children}
    </TeamContext.Provider>
  );
}

export const useTeam = () => useContext(TeamContext);
