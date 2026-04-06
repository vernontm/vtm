import React, { createContext, useContext, useState, useCallback } from 'react';

const RefreshContext = createContext({ refreshKey: 0, triggerRefresh: () => {} });

export function RefreshProvider({ children }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), []);
  return (
    <RefreshContext.Provider value={{ refreshKey, triggerRefresh }}>
      {children}
    </RefreshContext.Provider>
  );
}

export const useRefresh = () => useContext(RefreshContext);
