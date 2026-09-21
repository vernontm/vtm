import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Mail, Maximize2, X } from 'lucide-react';

// Global compose-email popover state. The full ComposePopup itself lives inside
// Email.jsx (it needs contacts, gmail contacts, uploadAttachment, etc. that are
// only fully wired there). This context owns:
//   • the DRAFT the user is composing (to / subject / body / attachments / labels / replyTo)
//   • whether the composer is currently OPEN or MINIMIZED
// Draft state is persisted to localStorage so navigation across CRM pages, and
// even a browser refresh, doesn't lose your work. When the composer is
// minimized (or when the user is on any page other than Email while a draft
// exists), a floating pill appears in the bottom-right corner — clicking it
// restores you to Email and pops the composer back open with the draft intact.

const LS_KEY = 'vtm-compose-draft-v1';
const ComposeCtx = createContext(null);

export function useCompose() {
  const ctx = useContext(ComposeCtx);
  if (!ctx) throw new Error('useCompose must be used inside <ComposeProvider>');
  return ctx;
}

const EMPTY_DRAFT = {
  to: '',
  subject: '',
  body: '',
  attachments: [],
  labels: [],
  replyTo: null,
};

function readStored() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch { return null; }
}
function writeStored(state) {
  try {
    if (!state) localStorage.removeItem(LS_KEY);
    else localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

export function ComposeProvider({ children }) {
  // { draft, mode: 'open' | 'minimized' } — absence means the composer is closed.
  const [state, setStateInternal] = useState(() => readStored());

  const setState = useCallback((updater) => {
    setStateInternal(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      writeStored(next);
      return next;
    });
  }, []);

  // Public API
  const openCompose  = useCallback((replyTo) => setState({
    draft: { ...EMPTY_DRAFT, replyTo: replyTo || null },
    mode: 'open',
  }), [setState]);
  const restore      = useCallback(() => setState(s => s ? { ...s, mode: 'open' } : s), [setState]);
  const minimize     = useCallback(() => setState(s => s ? { ...s, mode: 'minimized' } : s), [setState]);
  const close        = useCallback(() => setState(null), [setState]);
  const updateDraft  = useCallback((patch) => setState(s => s ? { ...s, draft: { ...s.draft, ...patch } } : s), [setState]);

  const value = {
    // Reflect stored state
    hasDraft: !!state,
    isOpen: state?.mode === 'open',
    isMinimized: state?.mode === 'minimized',
    draft: state?.draft || null,
    // Actions
    openCompose, restore, minimize, close, updateDraft,
  };

  return (
    <ComposeCtx.Provider value={value}>
      {children}
      <ComposePill />
    </ComposeCtx.Provider>
  );
}

// Bottom-right floating pill. Visible when there's a draft AND either the user
// explicitly minimized it OR the user is on a page other than /email (where the
// popup normally lives). Click restores + navigates to /email.
function ComposePill() {
  const { hasDraft, isMinimized, draft, restore, close } = useCompose();
  const location = useLocation();
  const navigate = useNavigate();
  const onEmailPage = location.pathname.startsWith('/email');
  // Show the pill when minimized (anywhere) or when the user has an active
  // draft but is currently browsing another page.
  const show = hasDraft && (isMinimized || !onEmailPage);

  if (!show) return null;

  const previewSubject = draft?.subject?.trim() || draft?.replyTo?.subject
    ? `Re: ${(draft?.replyTo?.subject || '').replace(/^Re:\s*/i, '')}`
    : '';
  const previewTo = draft?.to || draft?.replyTo?.from?.email || draft?.replyTo?.to_email || '';

  const handleRestore = () => {
    if (!onEmailPage) navigate('/email');
    // If we're navigating, EmailPage will mount and pick up the restored state.
    // Otherwise flip mode back to open immediately.
    setTimeout(() => restore(), 0);
  };

  const handleDiscard = () => {
    if (window.confirm('Discard this email draft?')) close();
  };

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9500,
      background: 'var(--surface)', color: 'var(--text)',
      border: '1px solid var(--border)', borderRadius: 14,
      boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
      minWidth: 260, maxWidth: 320,
      backdropFilter: 'blur(20px)',
      animation: 'compose-pill-in 0.2s ease',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10,
        background: 'linear-gradient(135deg, var(--orange), #ef4444)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
      }}>
        <Mail size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Email draft
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {previewSubject || previewTo || 'Untitled — click to resume'}
        </div>
      </div>
      <button
        onClick={handleRestore}
        title="Resume draft"
        style={{ padding: 6, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', display: 'flex' }}>
        <Maximize2 size={13} />
      </button>
      <button
        onClick={handleDiscard}
        title="Discard draft"
        style={{ padding: 6, borderRadius: 8, background: 'transparent', border: '1px solid transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}>
        <X size={13} />
      </button>
      <style>{`
        @keyframes compose-pill-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
