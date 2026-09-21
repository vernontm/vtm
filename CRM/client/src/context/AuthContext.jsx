import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({ session: null, loading: true, authError: '', retry: () => {}, signIn: async () => {}, signOut: async () => {} });

const AUTH_TIMEOUT_MS = 30000;

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let timeoutId;
    let cancelled = false;

    setLoading(true);
    setAuthError('');

    // Hard timeout — if Supabase auth is unreachable, surface an error
    // instead of spinning forever.
    timeoutId = setTimeout(() => {
      if (cancelled) return;
      setAuthError('Taking longer than expected to reach the server. Check your internet connection.');
      setLoading(false);
    }, AUTH_TIMEOUT_MS);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        setSession(session);
        setAuthError('');
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        setAuthError(err?.message || 'Could not reach authentication server.');
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      // Only propagate a session change when the signed-in USER actually changes
      // (sign in, sign out, account switch). Supabase also fires this on every
      // tab-focus token refresh with a brand-new session object; re-setting state
      // there would churn the session reference, re-run the workspace loader, and
      // remount the whole app — closing any open dialog and wiping typed work.
      // API calls always read the freshest token via getSession() at call time,
      // so we never need the refreshed object in React state.
      setSession(prev => (prev?.user?.id === newSession?.user?.id ? prev : newSession));
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [retryKey]);

  const retry = () => setRetryKey(k => k + 1);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, authError, retry, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
