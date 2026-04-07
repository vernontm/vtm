import React, { useState, useRef, useEffect } from 'react';

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
    if (trimmed !== (value ?? '')) onSave(trimmed);
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
    background: '#ffffff',
    border: '1px solid #4a6cf7',
    borderRadius: 4,
    color: '#1a1a2e',
    padding: '3px 8px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
    minWidth: 80,
    boxShadow: '0 0 0 2px rgba(74,108,247,0.15)',
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
        display: 'block',
        padding: '2px 6px',
        borderRadius: 4,
        minWidth: 32,
        minHeight: 22,
        color: value ? '#1a1a2e' : '#b0b0c0',
        transition: 'background 0.1s, filter 0.25s ease',
        userSelect: 'none',
        lineHeight: '18px',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f2f8')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {display || placeholder}
    </span>
  );
}
