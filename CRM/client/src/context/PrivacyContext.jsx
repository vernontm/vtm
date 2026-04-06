import React, { createContext, useContext, useState } from 'react';

const PrivacyContext = createContext({ privacyMode: false, togglePrivacy: () => {} });

export function PrivacyProvider({ children }) {
  const [privacyMode, setPrivacyMode] = useState(false);
  return (
    <PrivacyContext.Provider value={{ privacyMode, togglePrivacy: () => setPrivacyMode(p => !p) }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export const usePrivacy = () => useContext(PrivacyContext);
