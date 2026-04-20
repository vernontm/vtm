import React, { createContext, useContext, useState, useEffect } from 'react';

const UiContext = createContext({
  leadPanelOpen: false, setLeadPanelOpen: () => {},
  pageActions: null, setPageActions: () => {},
});

export function UiProvider({ children }) {
  const [leadPanelOpen, setLeadPanelOpen] = useState(false);
  const [pageActions, setPageActions] = useState(null);
  return (
    <UiContext.Provider value={{ leadPanelOpen, setLeadPanelOpen, pageActions, setPageActions }}>
      {children}
    </UiContext.Provider>
  );
}

export const useUi = () => useContext(UiContext);

/**
 * Register action buttons for the persistent Header.
 * `factory` is called whenever `deps` change; return JSX (or null).
 * Clears automatically on unmount.
 */
export function usePageActions(factory, deps) {
  const { setPageActions } = useUi();
  useEffect(() => {
    setPageActions(factory());
    return () => setPageActions(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
