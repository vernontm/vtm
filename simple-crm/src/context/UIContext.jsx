import { createContext, useContext, useState } from 'react'

const UIContext = createContext(null)

// Small shared UI state: the header search box and the header "New" button both
// live outside the page components, so pages read/subscribe to them here.
export function UIProvider({ children }) {
  const [search, setSearch] = useState('')
  const [newNonce, setNewNonce] = useState(0)

  const triggerNew = () => setNewNonce((n) => n + 1)

  return (
    <UIContext.Provider value={{ search, setSearch, newNonce, triggerNew }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside a UIProvider')
  return ctx
}
