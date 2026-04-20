import React, { useState } from 'react';
import { Trash2, Archive, Copy, Mail, Calendar, ArrowRight, RefreshCw, X } from 'lucide-react';

function ActionBtn({ icon, label, onClick, color }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? 'var(--surface-3)' : 'none',
        border: 'none',
        cursor: 'pointer',
        color: color || '#8e8ea0',
        padding: '5px 10px',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        minWidth: 52,
        transition: 'background 0.15s',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const VDivider = () => (
  <div style={{ width: 1, height: 32, background: '#e5e7ef', flexShrink: 0, margin: '0 4px' }} />
);

export default function SelectionBar({
  count,
  selectedItems = [],
  onClear,
  onDelete,
  onArchive,
  onDuplicate,
  onConvert,
  moveToOptions,
  onMoveTo,
}) {
  const [showMoveTo, setShowMoveTo] = useState(false);

  if (count === 0) return null;

  const emails = selectedItems.filter(i => i.email).map(i => i.email);
  const names  = selectedItems.map(i => i.name).filter(Boolean);

  const gmailHref = emails.length > 0
    ? `https://mail.google.com/mail/?view=cm&to=${emails.map(encodeURIComponent).join(',')}`
    : 'https://mail.google.com/mail/?view=cm';

  const calTitle = names.length > 0
    ? `Meeting: ${names.slice(0, 3).join(', ')}`
    : 'Meeting';
  const calHref = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calTitle)}`;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: '8px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      zIndex: 1000,
      whiteSpace: 'nowrap',
    }}>
      <div style={{
        background: 'var(--orange)',
        borderRadius: '50%',
        width: 26, height: 26,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color: '#ffffff', flexShrink: 0,
      }}>{count}</div>
      <span style={{ color: 'var(--muted)', fontSize: 13, paddingLeft: 6, paddingRight: 10 }}>
        {count === 1 ? '1 item selected' : `${count} items selected`}
      </span>

      <VDivider />

      {moveToOptions && onMoveTo && (
        <div style={{ position: 'relative' }}>
          <ActionBtn icon={<ArrowRight size={14} />} label="Move to" onClick={() => setShowMoveTo(v => !v)} />
          {showMoveTo && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
              overflow: 'hidden', minWidth: 160, boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            }}>
              {moveToOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { onMoveTo(opt.value); setShowMoveTo(false); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 14px', background: 'none', border: 'none',
                    color: 'var(--text)', fontSize: 13, cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {onDuplicate && <ActionBtn icon={<Copy size={14} />} label="Duplicate" onClick={onDuplicate} />}
      {onArchive && <ActionBtn icon={<Archive size={14} />} label="Archive" onClick={onArchive} />}
      {onDelete && <ActionBtn icon={<Trash2 size={14} />} label="Delete" onClick={onDelete} color="#ff5c5c" />}

      <ActionBtn icon={<Mail size={14} />} label="Send Email" onClick={() => window.open(gmailHref, '_blank')} />
      <ActionBtn icon={<Calendar size={14} />} label="Calendar" onClick={() => window.open(calHref, '_blank')} />
      {onConvert && <ActionBtn icon={<RefreshCw size={14} />} label="Convert" onClick={onConvert} />}

      <VDivider />

      <button
        onClick={onClear}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', padding: '4px 6px', borderRadius: 6,
          display: 'flex', alignItems: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#1a1a2e'; e.currentTarget.style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#b0b0c0'; e.currentTarget.style.background = 'none'; }}
        title="Clear selection"
      >
        <X size={16} />
      </button>
    </div>
  );
}
