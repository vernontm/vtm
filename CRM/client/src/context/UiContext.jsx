import React, { createContext, useContext, useState, useEffect } from 'react';

const UiContext = createContext({
  leadPanelOpen: false, setLeadPanelOpen: () => {},
  pageActions: null, setPageActions: () => {},
  contentContext: null, setContentContext: () => {},
});

export function UiProvider({ children }) {
  const [leadPanelOpen, setLeadPanelOpen] = useState(false);
  const [pageActions, setPageActions] = useState(null);
  // { client, scripts } published by ContentScheduler so the GlobalAgent can
  // offer @mention of posts + route edits to the right client.
  const [contentContext, setContentContext] = useState(null);
  return (
    <UiContext.Provider value={{
      leadPanelOpen, setLeadPanelOpen,
      pageActions, setPageActions,
      contentContext, setContentContext,
    }}>
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
