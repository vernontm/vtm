// TeamContext — legacy permission system.
//
// This file used to fetch /api/crm/team?action=me and maintain its own
// isOwner / hasPermission / viewingAs state. That system has been superseded
// by ClientContext (per-client grants + admin flag), so to prevent drift
// between two sources of truth, TeamContext is now a thin shim that delegates
// to ClientContext. Existing call sites (Sidebar, Scripts, Training, Team)
// keep compiling without changes.
//
// "View as" (impersonation) is deprecated — admins who need to preview a
// non-admin experience should use the /admin-users page. The setters are
// kept as no-ops for back-compat.
import React, { useMemo } from 'react';
import { useClient } from './ClientContext';

export function TeamProvider({ children }) {
  // No state of its own anymore; ClientProvider (mounted higher) is the
  // source of truth. Just render children.
  return <>{children}</>;
}

export function useTeam() {
  const { isAdmin, user, loading, canAccess } = useClient();
  return useMemo(() => ({
    currentMember:        user,
    isOwner:              isAdmin,
    viewingAs:            null,
    effectivePermissions: isAdmin ? null : [],
    allowedClientIds:     null,
    defaultClientId:      null,
    loading,
    hasPermission:        canAccess || (() => true),
    setViewingAs:         () => {},
    clearViewingAs:       () => {},
  }), [isAdmin, user, loading, canAccess]);
}
