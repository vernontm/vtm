import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * InlineEdit — click any cell to edit in place.
 * Props:
 *   value      — current value
 *   onSave     — called with new value when committed
 *   type       — input type (text, number, email, date, tel)
 *   options    — array of strings → renders a <select> instead
 *   placeholder — shown when value is empty
 *   moneyFormat — if true, formats as $X,XXX on display
 *   privacy    — 'name' | 'email' | 'money' | 'phone' | true → blurs in privacy mode
 */
export default function InlineEdit({
  value,
  onSave,
  type = 'text',
  options = null,
  placeholder = '—',
  moneyFormat = false,
  privacy = false,
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef(null);
  const inputRef = useRef(null);

  // Sync if external value changes (e.g. after save)
  useEffect(() => { setVal(value ?? ''); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = typeof val === 'string' ? val.trim() : val;
    if (trimmed !== (value ?? '')) {
      onSave(trimmed);
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 1500);
    }
  };

  const cancel = () => {
    setEditing(false);
    setVal(value ?? '');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') cancel();
  };

  const inputStyle = {
    background: 'var(--surface)',
    border: '1px solid var(--orange)',
    borderRadius: 4,
    color: 'var(--text)',
    padding: '3px 8px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    minWidth: 80,
    boxShadow: '0 0 0 2px rgba(255,155,38,0.15)',
  };

  if (editing) {
    if (options) {
      return (
        <select
          ref={inputRef}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
        >
          {options.map((o) => (
            <option key={o} value={o}>{o || '—'}</option>
          ))}
        </select>
      );
    }
    return (
      <input
        ref={inputRef}
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        style={inputStyle}
      />
    );
  }

  const display = moneyFormat && value !== '' && value !== undefined
    ? `$${Number(value).toLocaleString()}`
    : (value || '');

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={privacy ? 'private-value' : ''}
      style={{
        cursor: 'text',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 4,
        minWidth: 32,
        minHeight: 22,
        color: value ? 'var(--text)' : 'var(--muted)',
        transition: 'background 0.1s, filter 0.25s ease',
        userSelect: 'none',
        lineHeight: '18px',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {display || placeholder}
      {saved && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: '#22c55e' }}>
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  );
}
