import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, hasSupabase } from '../lib/supabase'

const AuthContext = createContext(null)

const DEMO_SESSION_KEY = 'crm_demo_session'

// A minimal fake session shaped like Supabase's so the rest of the app doesn't
// need to know whether it's running against a real backend or demo mode.
function makeDemoSession(email) {
  return {
    demo: true,
    user: { id: 'demo-user', email: email || 'demo@vtm.crm' },
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Demo mode: read the fake session out of localStorage.
    if (!hasSupabase) {
      try {
        const raw = localStorage.getItem(DEMO_SESSION_KEY)
        setSession(raw ? JSON.parse(raw) : null)
      } catch {
        setSession(null)
      }
      setLoading(false)
      return
    }

    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password) => {
    if (!hasSupabase) {
      const demo = makeDemoSession(email)
      localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demo))
      setSession(demo)
      return { error: null }
    }
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signOut = async () => {
    if (!hasSupabase) {
      localStorage.removeItem(DEMO_SESSION_KEY)
      setSession(null)
      return
    }
    return supabase.auth.signOut()
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    demoMode: !hasSupabase,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
