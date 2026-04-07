import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText, CreditCard, Trash2, XCircle, ExternalLink,
  RefreshCw, ChevronDown, ChevronUp, Search,
} from 'lucide-react';
import {
  getInvoices, getManualInvoices, deleteInvoice, voidInvoice,
  deleteManualInvoice, updateManualInvoice, refreshInvoice,
} from '../api';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_STYLE = {
  open:          { bg: '#fdab3d22', color: '#fdab3d', label: 'Open' },
  paid:          { bg: '#4a6cf722', color: '#4a6cf7', label: 'Paid' },
  void:          { bg: '#8e8ea022', color: '#8e8ea0', label: 'Void' },
  uncollectible: { bg: '#ff5c5c22', color: '#ff5c5c', label: 'Uncollectible' },
  draft:         { bg: '#4a6cf722', color: '#4a6cf7', label: 'Draft' },
  cancelled:     { bg: '#8e8ea022', color: '#8e8ea0', label: 'Cancelled' },
};

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || { bg: '#e5e7ef', color: '#8e8ea0', label: status };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {s.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const isStripe = type === 'stripe';
  return (
    <span style={{ background: isStripe ? '#784bd122' : '#4a6cf722', color: isStripe ? '#a78bfa' : '#4a6cf7', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700 }}>
      {isStripe ? 'Stripe' : 'Manual'}
    </span>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 12, padding: 28, width: 360, textAlign: 'center' }}>
        <p style={{ color: '#8e8ea0', fontSize: 14, marginBottom: 24 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onCancel} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, background: '#ff5c5c', color: '#1a1a2e', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Invoices() {
  const [stripeInvoices, setStripeInvoices] = useState([]);
  const [manualInvoices, setManualInvoices] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [tab, setTab]                       = useState('all');   // all | stripe | manual
  const [search, setSearch]                 = useState('');
  const [sort, setSort]                     = useState({ key: 'created_at', dir: 'desc' });
  const [confirm, setConfirm]               = useState(null);    // { message, action }
  const [toast, setToast]                   = useState(null);
  const [refreshingId, setRefreshingId]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stripe, manual] = await Promise.all([getInvoices(), getManualInvoices()]);
      setStripeInvoices(stripe || []);
      setManualInvoices(manual || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg, error = false) => {
    setToast({ msg, error });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleVoid = (inv) => {
    setConfirm({
      message: `Void the Stripe invoice for ${inv.customer_name || inv.email} ($${inv.amount?.toLocaleString()})? This cannot be undone.`,
      action: async () => {
        try {
          await voidInvoice(inv.id);
          setStripeInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'void' } : i));
          showToast('Invoice voided');
        } catch (e) { showToast(e.message || 'Failed to void', true); }
        setConfirm(null);
      },
    });
  };

  const handleDeleteStripe = (inv) => {
    setConfirm({
      message: `Remove this invoice record from the CRM? (The Stripe invoice itself is not affected.)`,
      action: async () => {
        try {
          await deleteInvoice(inv.id);
          setStripeInvoices(prev => prev.filter(i => i.id !== inv.id));
          showToast('Invoice removed');
        } catch (e) { showToast(e.message || 'Failed to delete', true); }
        setConfirm(null);
      },
    });
  };

  const handleCancelManual = (inv) => {
    setConfirm({
      message: `Cancel invoice ${inv.invoice_number}? It will be marked as cancelled.`,
      action: async () => {
        try {
          await updateManualInvoice(inv.id, { status: 'cancelled' });
          setManualInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'cancelled' } : i));
          showToast('Invoice cancelled');
        } catch (e) { showToast(e.message || 'Failed to cancel', true); }
        setConfirm(null);
      },
    });
  };

  const handleDeleteManual = (inv) => {
    setConfirm({
      message: `Permanently delete invoice ${inv.invoice_number}? This cannot be undone.`,
      action: async () => {
        try {
          await deleteManualInvoice(inv.id);
          setManualInvoices(prev => prev.filter(i => i.id !== inv.id));
          showToast('Invoice deleted');
        } catch (e) { showToast(e.message || 'Failed to delete', true); }
        setConfirm(null);
      },
    });
  };

  const handleRefreshStripe = async (inv) => {
    setRefreshingId(inv.id);
    try {
      const updated = await refreshInvoice(inv.id);
      setStripeInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, ...updated } : i));
      showToast('Status refreshed from Stripe');
    } catch (e) { showToast('Failed to refresh', true); }
    setRefreshingId(null);
  };

  // ── Build unified list ────────────────────────────────────────────────────────
  const allRows = [
    ...stripeInvoices.map(i => ({
      ...i,
      _type:       'stripe',
      _number:     i.stripe_invoice_id?.slice(-8).toUpperCase() || '—',
      _client:     i.customer_name || i.email || '—',
      _amount:     i.amount || 0,
      _date:       i.created_at,
    })),
    ...manualInvoices.map(i => ({
      ...i,
      _type:   'manual',
      _number: i.invoice_number || '—',
      _client: i.bill_to_name  || i.bill_to_email || '—',
      _amount: i.total || 0,
      _date:   i.created_at,
    })),
  ];

  const q = search.toLowerCase();
  const filtered = allRows
    .filter(r => (tab === 'all') || r._type === tab)
    .filter(r => !q || r._client.toLowerCase().includes(q) || r._number.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q) || (r.invoice_number || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const av = a[sort.key] ?? a['_' + sort.key] ?? '';
      const bv = b[sort.key] ?? b['_' + sort.key] ?? '';
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'desc' ? -cmp : cmp;
    });

  const toggleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  const SortIcon = ({ k }) => sort.key === k
    ? (sort.dir === 'desc' ? <ChevronDown size={12} style={{ marginLeft: 3 }} /> : <ChevronUp size={12} style={{ marginLeft: 3 }} />)
    : null;

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totals = {
    all:    allRows.filter(r => r.status === 'paid').reduce((s, r) => s + r._amount, 0),
    open:   allRows.filter(r => r.status === 'open').reduce((s, r) => s + r._amount, 0),
    draft:  manualInvoices.filter(r => r.status === 'draft').reduce((s, r) => s + (r.total || 0), 0),
  };

  const thStyle = { fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '12px 14px', fontSize: 13, color: '#8e8ea0', verticalAlign: 'middle' };

  return (
    <div style={{ minHeight: '100%', background: '#f5f7fa' }}>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="page-title">Invoices</div>
          <span style={{ background: '#e5e7ef', color: '#8e8ea0', borderRadius: 12, padding: '2px 9px', fontSize: 12, fontWeight: 700 }}>
            {allRows.length}
          </span>
        </div>
        <button onClick={load} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ padding: '0 28px 28px' }}>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
          {[
            { label: 'Total Collected', value: `$${totals.all.toLocaleString()}`, color: '#4a6cf7', note: 'paid invoices' },
            { label: 'Outstanding',     value: `$${totals.open.toLocaleString()}`, color: '#fdab3d', note: 'open / unpaid' },
            { label: 'Draft',           value: `$${totals.draft.toLocaleString()}`, color: '#4a6cf7', note: 'manual drafts' },
          ].map(({ label, value, color, note }) => (
            <div key={label} style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 10, padding: '16px 20px' }}>
              <div className="private-value" style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#8e8ea0', marginTop: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>{note}</div>
            </div>
          ))}
        </div>

        {/* Tabs + Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['all', 'All'], ['stripe', 'Stripe'], ['manual', 'Manual']].map(([key, lbl]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  border: `1px solid ${tab === key ? '#4a6cf7' : '#e5e7ef'}`,
                  background: tab === key ? '#4a6cf722' : 'transparent',
                  color: tab === key ? '#4a6cf7' : '#8e8ea0',
                  fontWeight: tab === key ? 700 : 400,
                }}
              >
                {lbl}
                <span style={{ marginLeft: 5, background: '#e5e7ef', borderRadius: 10, padding: '1px 6px', fontSize: 11 }}>
                  {key === 'all' ? allRows.length : allRows.filter(r => r._type === key).length}
                </span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoices..."
              style={{ width: '100%', background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 8, padding: '7px 10px 7px 30px', color: '#8e8ea0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', color: '#8e8ea0', padding: 60, fontSize: 14 }}>Loading invoices...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <FileText size={40} style={{ color: '#e5e7ef', marginBottom: 16 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: '#8e8ea0' }}>No invoices found</div>
          </div>
        ) : (
          <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#ffffff', borderBottom: '1px solid #e5e7ef' }}>
                <tr>
                  <th style={thStyle} onClick={() => toggleSort('_number')}>#<SortIcon k="_number" /></th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle} onClick={() => toggleSort('_client')}>Client<SortIcon k="_client" /></th>
                  <th style={thStyle} onClick={() => toggleSort('_amount')}>Amount<SortIcon k="_amount" /></th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle} onClick={() => toggleSort('_date')}>Date<SortIcon k="_date" /></th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv, idx) => (
                  <tr
                    key={inv.id}
                    style={{ borderBottom: idx < filtered.length - 1 ? '1px solid #2a2d4e' : 'none' }}
                  >
                    {/* # */}
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, background: inv._type === 'stripe' ? '#784bd122' : '#4a6cf722', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {inv._type === 'stripe' ? <CreditCard size={13} style={{ color: '#a78bfa' }} /> : <FileText size={13} style={{ color: '#4a6cf7' }} />}
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv._number}</span>
                      </div>
                    </td>

                    {/* Type */}
                    <td style={tdStyle}><TypeBadge type={inv._type} /></td>

                    {/* Client */}
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: '#1a1a2e' }}>{inv._client}</div>
                      {inv._type === 'stripe' && inv.email && inv.email !== inv._client && (
                        <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>{inv.email}</div>
                      )}
                      {inv._type === 'manual' && inv.bill_to_email && (
                        <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>{inv.bill_to_email}</div>
                      )}
                      {(inv.description) && (
                        <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>{inv.description}</div>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="private-value" style={{ ...tdStyle, fontWeight: 700, color: '#1a1a2e' }}>
                      ${inv._amount.toLocaleString()}
                      {inv._type === 'stripe' && inv.phase_number && inv.total_phases > 1 && (
                        <div style={{ fontSize: 11, color: '#8e8ea0', fontWeight: 400 }}>Phase {inv.phase_number}/{inv.total_phases}</div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={tdStyle}><StatusBadge status={inv.status} /></td>

                    {/* Date */}
                    <td style={{ ...tdStyle, color: '#8e8ea0', fontSize: 12 }}>
                      {inv._date ? new Date(inv._date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      {inv.status === 'paid' && inv.paid_at && (
                        <div style={{ fontSize: 11, color: '#4a6cf7', marginTop: 2 }}>
                          Paid {new Date(inv.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {/* Stripe-specific */}
                        {inv._type === 'stripe' && (
                          <>
                            {inv.stripe_invoice_url && (
                              <a
                                href={inv.stripe_invoice_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View on Stripe"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4a6cf7', background: '#4a6cf718', border: '1px solid #4a6cf740', borderRadius: 6, padding: '5px 10px', textDecoration: 'none', fontWeight: 500 }}
                              >
                                <ExternalLink size={12} /> View
                              </a>
                            )}
                            <button
                              onClick={() => handleRefreshStripe(inv)}
                              title="Refresh status from Stripe"
                              disabled={refreshingId === inv.id}
                              style={{ display: 'flex', alignItems: 'center', background: 'none', border: '1px solid #e5e7ef', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#8e8ea0' }}
                            >
                              <RefreshCw size={12} style={{ animation: refreshingId === inv.id ? 'spin 0.8s linear infinite' : 'none' }} />
                            </button>
                            {inv.status === 'open' && (
                              <button
                                onClick={() => handleVoid(inv)}
                                title="Void invoice"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#fdab3d', background: '#fdab3d18', border: '1px solid #fdab3d40', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 500 }}
                              >
                                <XCircle size={12} /> Void
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteStripe(inv)}
                              title="Remove record"
                              style={{ display: 'flex', alignItems: 'center', background: 'none', border: '1px solid #e5e7ef', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', color: '#8e8ea0' }}
                              onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
                              onMouseLeave={e => e.currentTarget.style.color = '#8e8ea0'}
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}

                        {/* Manual-specific */}
                        {inv._type === 'manual' && (
                          <>
                            {inv.status === 'draft' && (
                              <button
                                onClick={() => handleCancelManual(inv)}
                                title="Cancel invoice"
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#fdab3d', background: '#fdab3d18', border: '1px solid #fdab3d40', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 500 }}
                              >
                                <XCircle size={12} /> Cancel
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteManual(inv)}
                              title="Delete invoice"
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#ff5c5c', background: '#ff5c5c18', border: '1px solid #ff5c5c40', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 500 }}
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.action}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: toast.error ? '#ff5c5c' : '#4a6cf7', color: '#1a1a2e',
          borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600,
          zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
