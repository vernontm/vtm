import React, { useState, useRef, useEffect } from 'react';

const STATUS_COLORS = {
  // Lead statuses
  'New Lead':   { bg: '#c8f135', text: '#fff' },
  'Contacted':  { bg: '#fdab3d', text: '#fff' },
  'Qualified':  { bg: '#c8f135', text: '#fff' },
  'Converted':  { bg: '#784bd1', text: '#fff' },
  'Cold':       { bg: '#4a4845', text: '#fff' },
  'Warm':       { bg: '#c8f135', text: '#fff' },
  'Hot':        { bg: '#fdab3d', text: '#0a0a08' },
  'Unqualified':{ bg: '#ff5c5c', text: '#fff' },
  // Deal stages
  'New':        { bg: '#c8f135', text: '#fff' },
  'Discovery':  { bg: '#fdab3d', text: '#fff' },
  'Proposal':   { bg: '#ffcb00', text: '#0a0a08' },
  'Negotiation':{ bg: '#784bd1', text: '#fff' },
  'Won':        { bg: '#c8f135', text: '#fff' },
  'Lost':       { bg: '#ff5c5c', text: '#fff' },
  // Payment statuses
  'Pending':      { bg: '#f9c74f', text: '#0a0a08' },
  'Partial Paid': { bg: '#fdab3d', text: '#fff' },
  'Paid':         { bg: '#c8f135', text: '#fff' },
  // Project statuses
  'Active':     { bg: '#c8f135', text: '#fff' },
  'In Progress':{ bg: '#fdab3d', text: '#fff' },
  'Completed':  { bg: '#c8f135', text: '#fff' },
  'On Hold':    { bg: '#4a4845', text: '#fff' },
  'Cancelled':  { bg: '#ff5c5c', text: '#fff' },
};

const DEFAULT_COLOR = { bg: '#252523', text: '#7a7870' };

export function getStatusColor(status) {
  return STATUS_COLORS[status] || DEFAULT_COLOR;
}

export default function StatusBadge({ status, options = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const color = getStatusColor(status);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!onChange || !options.length) {
    return (
      <span className="status-badge" style={{ background: color.bg, color: color.text }}>
        {status}
      </span>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <span
        className="status-badge"
        style={{ background: color.bg, color: color.text }}
        onClick={() => setOpen(!open)}
      >
        {status}
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 100, marginTop: 4,
          background: '#111110', border: '1px solid #252523', borderRadius: 8,
          padding: 6, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
        }}>
          {options.map((opt) => {
            const c = getStatusColor(opt);
            return (
              <div
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                style={{
                  padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#1c1c1a'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{
                  display: 'inline-block', width: 12, height: 12,
                  borderRadius: 3, background: c.bg, flexShrink: 0
                }} />
                <span style={{ fontSize: 13, color: '#e8e6df' }}>{opt}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
