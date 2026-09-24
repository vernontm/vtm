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
    if (!editing || !inputRef.current) return;
    const el = inputRef.current;
    el.focus();
    // select() throws InvalidStateError on a date input.
    if (type !== 'date' && el.select) el.select();
  }, [editing, type]);

  const commit = (next) => {
    setEditing(false);
    const raw = next === undefined ? val : next;
    const trimmed = typeof raw === 'string' ? raw.trim() : raw;
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
    boxShadow: '0 0 0 2px rgba(37,99,235,0.15)',
  };

  // Dates never go through click-to-edit. The field is always live, and a
  // click anywhere on it opens the native calendar — showPicker() only works
  // when it is called straight from the user's gesture, not from an effect.
  if (type === 'date') {
    return (
      <input
        type="date"
        value={val || ''}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch (_) { /* field still works */ } }}
        onChange={(e) => { setVal(e.target.value); commit(e.target.value); }}
        onKeyDown={handleKey}
        style={{
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: 4,
          color: val ? 'var(--text)' : 'var(--muted)',
          padding: '2px 6px',
          fontSize: 13,
          outline: 'none',
          width: '100%',
          minHeight: 22,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.background = 'var(--surface)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
      />
    );
  }

  if (editing) {
    if (options) {
      return (
        <select
          ref={inputRef}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => commit()}
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
        onBlur={() => commit()}
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
        minWidth: 0,
        minHeight: 22,
        color: value ? 'var(--text)' : 'var(--muted)',
        transition: 'background 0.1s, filter 0.25s ease',
        userSelect: 'none',
        lineHeight: '18px',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
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
