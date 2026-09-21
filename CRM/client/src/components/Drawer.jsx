import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// Standard detail-view drawer.
//
// Slides in from the right, keyboard-navigable, scroll-locked
// when open. Use this everywhere a modal is currently rendered for
// looking at a record's details.
//
// Props:
//   open           — boolean, controls visibility
//   onClose        — required close handler
//   title          — string or React node (shown in the sticky header)
//   subtitle       — small secondary header line (optional)
//   width          — pixel width (default 560)
//   onPrev/onNext  — enable j/k row navigation; if omitted, keys are ignored
//   footer         — sticky bottom bar content (optional)
//   headerActions  — right-side action buttons in the header
//   children       — main body content
//
// Keyboard: esc close, j → next, k → prev, ⌘Enter → submit (if footer).
// ─────────────────────────────────────────────────────────────

export default function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = 560,
  onPrev,
  onNext,
  footer,
  headerActions,
  children,
}) {
  const handleKey = useCallback((e) => {
    if (!open) return;
    if (e.key === 'Escape') { onClose(); }
    else if ((e.key === 'j' || e.key === 'ArrowDown') && onNext && !isTypingIn(e.target)) { e.preventDefault(); onNext(); }
    else if ((e.key === 'k' || e.key === 'ArrowUp')   && onPrev && !isTypingIn(e.target)) { e.preventDefault(); onPrev(); }
  }, [open, onClose, onPrev, onNext]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = original;
    };
  }, [open, handleKey]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop — does NOT close on click, so a stray outside click never
          discards a half-typed form. Close via the X button or Escape. */}
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 8000,
          background: 'rgba(15, 17, 22, 0.42)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity var(--dur-base, 220ms) var(--ease-out, cubic-bezier(0.4,0,0.2,1))',
          backdropFilter: 'blur(2px)',
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width, maxWidth: '100vw', zIndex: 8001,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-24px 0 60px rgba(0,0,0,0.14)',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform var(--dur-slow, 320ms) var(--ease-out, cubic-bezier(0.4,0,0.2,1))',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          position: 'sticky', top: 0, zIndex: 2,
        }}>
          <button
            onClick={onClose}
            title="Close (esc)"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', color: 'var(--text)', padding: 6, display: 'flex' }}>
            <X size={15} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
          </div>

          {/* Prev / Next stepper */}
          {(onPrev || onNext) && (
            <div style={{ display: 'flex', gap: 2, marginRight: 6 }}>
              <button onClick={onPrev} disabled={!onPrev} title="Previous (k)" style={rowStepBtn(!!onPrev)}><ChevronUp size={14} /></button>
              <button onClick={onNext} disabled={!onNext} title="Next (j)"     style={rowStepBtn(!!onNext)}><ChevronDown size={14} /></button>
            </div>
          )}

          {headerActions}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', background: 'var(--surface)' }}>
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

function rowStepBtn(enabled) {
  return {
    background: enabled ? 'var(--surface-2)' : 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 6,
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? 'var(--text)' : 'var(--muted)',
    padding: '4px 6px', display: 'flex',
    opacity: enabled ? 1 : 0.4,
  };
}

function isTypingIn(el) {
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
