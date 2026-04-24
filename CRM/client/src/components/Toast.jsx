// Lightweight toast system for transient feedback (success/error/info).
// Replaces the browser alert() pattern that was scattered across pages.
//
// Usage:
//   const toast = useToast();
//   toast.success('Saved');
//   toast.error('Something went wrong');
//   toast.info('Heads up');
//
// Mount <ToastProvider> once near the top of the app.
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const ToastContext = createContext({
  success: () => {},
  error: () => {},
  info: () => {},
  dismiss: () => {},
});

let _nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((kind, message, opts = {}) => {
    const id = _nextId++;
    const ttl = opts.ttl ?? (kind === 'error' ? 6000 : 3500);
    setToasts(prev => [...prev, { id, kind, message }]);
    if (ttl > 0) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  const api = {
    success: (msg, opts) => push('success', msg, opts),
    error: (msg, opts) => push('error', msg, opts),
    info: (msg, opts) => push('info', msg, opts),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// Safe helper for non-React call sites (e.g. plain async functions). Falls
// back to console when no provider is mounted.
let _globalToast = null;
export function installGlobalToast(api) { _globalToast = api; }
export function toast(kind, msg) {
  if (_globalToast && _globalToast[kind]) _globalToast[kind](msg);
  else console[kind === 'error' ? 'error' : 'log']('[toast]', kind, msg);
}

function ToastViewport({ toasts, onDismiss }) {
  // Register the mounted provider as the global singleton once.
  const api = useContext(ToastContext);
  useEffect(() => { installGlobalToast(api); }, [api]);

  if (!toasts.length) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 10000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 'calc(100vw - 40px)',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

function ToastItem({ toast, onDismiss }) {
  const { id, kind, message } = toast;
  const palette = kind === 'success'
    ? { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)', icon: <CheckCircle2 size={16} color="#22c55e" /> }
    : kind === 'error'
      ? { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', icon: <AlertCircle size={16} color="#ef4444" /> }
      : { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.35)', icon: <Info size={16} color="#3b82f6" /> };

  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${palette.border}`,
      boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
      borderRadius: 12,
      padding: '12px 14px',
      minWidth: 280,
      maxWidth: 420,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      color: 'var(--text)',
      fontSize: 13,
      fontFamily: 'var(--font-display)',
      pointerEvents: 'auto',
      animation: 'vtmToastIn 180ms ease-out',
    }}>
      <div style={{ flexShrink: 0, background: palette.bg, borderRadius: 8, padding: 6, display: 'flex' }}>
        {palette.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-word', lineHeight: 1.45 }}>{message}</div>
      <button
        onClick={() => onDismiss(id)}
        style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
      <style>{`
        @keyframes vtmToastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
