import React, { useEffect, useState } from 'react';
import { X, Loader } from 'lucide-react';

export default function Modal({ title, onClose, children, onSubmit, submitLabel = 'Save', danger = false, disabled = false }) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, submitting]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!onSubmit || submitting || disabled) return;
    setSubmitting(true);
    try { await onSubmit(); }
    finally { setSubmitting(false); }
  }

  const btnDisabled = submitting || disabled;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="modal-content">
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>{title}</h2>
          <button onClick={onClose} disabled={submitting} className="btn-ghost" style={{ padding: '4px', opacity: submitting ? 0.5 : 1 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {children}

          <div className="flex gap-3 mt-6 justify-end">
            <button type="button" onClick={onClose} disabled={submitting} className="btn-ghost" style={{ opacity: submitting ? 0.5 : 1 }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={btnDisabled}
              className={danger ? 'btn-danger' : 'btn-primary'}
              style={{ opacity: btnDisabled ? 0.6 : 1, cursor: btnDisabled ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {submitting && <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} />}
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
