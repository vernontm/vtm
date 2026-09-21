import React, { createContext, useContext, useState, useCallback } from 'react';
import { Calendar, Maximize2, X } from 'lucide-react';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal';

// Global schedule-meeting modal. Lives above the router so opening the modal
// on Leads, then navigating to Contacts to look up an email, keeps the draft
// intact. Users can minimize the modal into a floating pill in the bottom-
// right corner and keep browsing the CRM.

const ScheduleMeetingCtx = createContext(null);

export function useScheduleMeeting() {
  const ctx = useContext(ScheduleMeetingCtx);
  if (!ctx) throw new Error('useScheduleMeeting must be used inside <ScheduleMeetingProvider>');
  return ctx;
}

export function ScheduleMeetingProvider({ children }) {
  // state.mode: 'closed' | 'open' | 'minimized'
  const [state, setState] = useState({ mode: 'closed', props: null });

  const openModal    = useCallback((props = {}) => setState({ mode: 'open',      props }), []);
  const minimize     = useCallback(()          => setState(s => s.mode === 'open' ? { ...s, mode: 'minimized' } : s), []);
  const restore      = useCallback(()          => setState(s => s.mode === 'minimized' ? { ...s, mode: 'open' } : s), []);
  const close        = useCallback(()          => setState({ mode: 'closed', props: null }), []);

  const isOpen       = state.mode === 'open';
  const isMinimized  = state.mode === 'minimized';

  return (
    <ScheduleMeetingCtx.Provider value={{ openModal, minimize, restore, close, isOpen, isMinimized, props: state.props }}>
      {children}
      <ScheduleMeetingHost />
    </ScheduleMeetingCtx.Provider>
  );
}

// Renders the modal (when open) or the minimized pill (when minimized). The
// modal always stays mounted while state is 'open' OR 'minimized', so form
// state survives minimize/restore.
function ScheduleMeetingHost() {
  const { isOpen, isMinimized, props, minimize, restore, close } = useScheduleMeeting();
  if (!isOpen && !isMinimized) return null;

  return (
    <>
      {/* Hide the full modal by translating it off-screen instead of unmounting.
          This preserves every piece of local state (title, date, time, attendees,
          description, availability check, etc.) while minimized. */}
      <div style={{ display: isOpen ? 'block' : 'none' }}>
        <ScheduleMeetingModal
          {...(props || {})}
          onMinimize={minimize}
          onClose={() => { close(); (props?.onClose)?.(); }}
          onComplete={(...args) => { close(); (props?.onComplete)?.(...args); }}
        />
      </div>

      {isMinimized && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9500,
          background: 'var(--surface)', color: 'var(--text)',
          border: '1px solid var(--border)', borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
          minWidth: 260, maxWidth: 320,
          backdropFilter: 'blur(20px)',
          animation: 'sched-slide-in 0.2s ease',
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--orange), #ef4444)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0,
          }}>
            <Calendar size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Meeting draft
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {props?.initialTitle || props?.initialLeadName || 'Untitled — click to resume'}
            </div>
          </div>
          <button
            onClick={restore}
            title="Restore"
            style={{ padding: 6, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', display: 'flex' }}>
            <Maximize2 size={13} />
          </button>
          <button
            onClick={() => { if (window.confirm('Discard this meeting draft?')) close(); }}
            title="Discard"
            style={{ padding: 6, borderRadius: 8, background: 'transparent', border: '1px solid transparent', color: 'var(--muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Keyframes for the pill entrance */}
      <style>{`
        @keyframes sched-slide-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
