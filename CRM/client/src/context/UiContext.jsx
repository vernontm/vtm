import React, { createContext, useContext, useState } from 'react';

const UiContext = createContext({ leadPanelOpen: false, setLeadPanelOpen: () => {} });

export function UiProvider({ children }) {
  const [leadPanelOpen, setLeadPanelOpen] = useState(false);
  return (
    <UiContext.Provider value={{ leadPanelOpen, setLeadPanelOpen }}>
      {children}
    </UiContext.Provider>
  );
}

export const useUi = () => useContext(UiContext);
