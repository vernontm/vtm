import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';

export default function CopyCell({ value, children, style }) {
  const [copied, setCopied] = useState(false);

  if (!value) return children || null;

  const handleCopy = (e) => {
    e.stopPropagation();
    e.preventDefault();
    copyToClipboard(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <span className="copy-cell" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}>
      {children}
      <button
        className="copy-cell-btn"
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 2, display: 'inline-flex', alignItems: 'center',
          color: copied ? 'var(--orange)' : '#b0b0c0',
          opacity: copied ? 1 : 0,
          transition: 'opacity 0.15s, color 0.15s',
          flexShrink: 0,
        }}
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </span>
  );
}
