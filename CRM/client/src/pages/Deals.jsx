import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Search, Trash2, ChevronDown, ChevronRight,
  DollarSign, CreditCard, RefreshCw, ExternalLink, Send,
  FileText, X, Loader, Check, ClipboardList,
} from 'lucide-react';
import {
  getDeals, createDeal, updateDeal, deleteDeal,
  getContacts, getInvoices, createInvoice, refreshInvoice,
  getManualInvoices, createManualInvoice, updateManualInvoice,
  getTodos, createTodo, updateTodo, deleteTodo,
} from '../api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';

// ── Constants ────────────────────────────────────────────────────────────────
const STAGES = ['New', 'Discovery', 'Proposal', 'Negotiation', 'Won', 'Lost', 'Completed'];
const PAYMENT_STATUSES = ['Pending', 'Partial Paid', 'Paid'];
const GROUPS = [
  { label: 'Active Pipeline', stages: ['New', 'Discovery', 'Proposal', 'Negotiation'] },
  { label: 'Closed Won',      stages: ['Won'] },
  { label: 'Closed Lost',     stages: ['Lost'] },
  { label: 'Completed',       stages: ['Completed'] },
];

const PAYMENT_STATUS_COLORS = {
  'Pending':      '#8e8ea0',
  'Partial Paid': '#fdab3d',
  'Paid':         '#4a6cf7',
};

// ── Payment Progress Badge (Stripe) ──────────────────────────────────────────
function PaymentBadge({ dealId, allInvoices, onRefresh }) {
  const inv = allInvoices.filter(i => i.deal_id === dealId);
  if (inv.length === 0) return <span style={{ fontSize: 12, color: '#555880' }}>Not Invoiced</span>;

  const totalPhases = Math.max(...inv.map(i => i.total_phases));
  const paid = inv.filter(i => i.status === 'paid');
  const allPaid = paid.length >= totalPhases;

  let label, color;
  if (allPaid)              { label = '✓ Fully Paid'; color = '#4a6cf7'; }
  else if (paid.length > 0) { label = `Phase ${paid.length}/${totalPhases} Paid`; color = '#fdab3d'; }
  else                      { label = totalPhases > 1 ? `Phase 1/${totalPhases} Sent` : 'Invoice Sent'; color = '#4a6cf7'; }

  const latestUrl = inv.find(i => i.stripe_invoice_url)?.stripe_invoice_url;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '22', borderRadius: 12, padding: '2px 8px', whiteSpace: 'nowrap' }}>{label}</span>
      {latestUrl && (
        <a href={latestUrl} target="_blank" rel="noreferrer" title="View on Stripe">
          <ExternalLink size={11} style={{ color: '#8e8ea0' }} />
        </a>
      )}
      <button onClick={() => onRefresh(inv)} title="Refresh" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0', padding: 2, display: 'flex' }}>
        <RefreshCw size={11} />
      </button>
    </div>
  );
}

// ── Stripe Invoice Modal ──────────────────────────────────────────────────────
function InvoiceModal({ deal, contacts, existingInvoices, onClose, onSent }) {
  const contact    = contacts.find(c => c.id === deal.contact_id);
  const phase1Paid = existingInvoices.some(i => i.phase_number === 1 && i.status === 'paid');
  const phase2Sent = existingInvoices.some(i => i.phase_number === 2);
  const defaultStr = (phase1Paid && !phase2Sent) ? 'phase2' : 'single';

  const [structure, setStructure] = useState(defaultStr);
  const [email,    setEmail]    = useState(contact?.email || '');
  const [custName, setCustName] = useState(contact?.name || deal.name);
  const [pct1,     setPct1]     = useState(50);
  const [desc,     setDesc]     = useState(`Professional services — ${deal.name}`);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState('');

  const amount1 = parseFloat(((deal.value || 0) * pct1 / 100).toFixed(2));
  const amount2 = parseFloat(((deal.value || 0) - amount1).toFixed(2));

  async function send() {
    if (!email) { setErr('Customer email is required.'); return; }
    setLoading(true); setErr('');
    try {
      if (structure === 'single') {
        await createInvoice({ deal_id: deal.id, email, customer_name: custName, amount: deal.value || 0, description: desc, phase_number: 1, total_phases: 1 });
      } else if (structure === 'two_phase') {
        await createInvoice({ deal_id: deal.id, email, customer_name: custName, amount: amount1, description: `${desc} — Phase 1 of 2`, phase_number: 1, total_phases: 2 });
      } else if (structure === 'phase2') {
        const ph1 = existingInvoices.find(i => i.phase_number === 1);
        const remaining = (deal.value || 0) - (ph1?.amount || 0);
        await createInvoice({ deal_id: deal.id, email, customer_name: custName, amount: remaining, description: `${desc} — Phase 2 of 2`, phase_number: 2, total_phases: 2 });
      }
      onSent(); onClose();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const showStructureToggle = !phase1Paid && !phase2Sent && existingInvoices.length === 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 14, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={18} style={{ color: '#4a6cf7' }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>Send Invoice (Stripe)</span>
          <span style={{ fontSize: 13, color: '#8e8ea0' }}>— {deal.name}</span>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 5 }}>Customer Email *</label>
              <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@email.com" />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 5 }}>Customer Name</label>
              <input className="form-input" value={custName} onChange={e => setCustName(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 5 }}>Description</label>
            <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          {showStructureToggle && (
            <div>
              <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 8 }}>Payment Structure</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['single', '💳 1 Full Payment'], ['two_phase', '📊 2 Phases']].map(([val, lbl]) => (
                  <button key={val} onClick={() => setStructure(val)} style={{
                    flex: 1, padding: '9px 0', borderRadius: 8,
                    border: `1px solid ${structure === val ? '#4a6cf7' : '#e5e7ef'}`,
                    background: structure === val ? '#4a6cf722' : 'transparent',
                    color: structure === val ? '#4a6cf7' : '#8e8ea0',
                    cursor: 'pointer', fontSize: 13, fontWeight: structure === val ? 700 : 400,
                  }}>{lbl}</button>
                ))}
              </div>
            </div>
          )}
          {structure === 'single' && (
            <div style={{ background: '#161830', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8e8ea0', fontSize: 13 }}>Total invoice amount</span>
              <span style={{ color: '#4a6cf7', fontWeight: 700, fontSize: 16 }}>${(deal.value || 0).toLocaleString()}</span>
            </div>
          )}
          {structure === 'two_phase' && (
            <div style={{ background: '#161830', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#8e8ea0', fontSize: 13 }}>Phase 1 (sent now)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={10} max={90} value={pct1} onChange={e => setPct1(Number(e.target.value))} style={{ width: 80 }} />
                  <span style={{ color: '#4a6cf7', fontWeight: 700, fontSize: 14, minWidth: 100, textAlign: 'right' }}>${amount1.toLocaleString()} ({pct1}%)</span>
                </div>
              </div>
              <div style={{ height: 1, background: '#e5e7ef' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8e8ea0', fontSize: 13 }}>Phase 2 (after Phase 1 paid)</span>
                <span style={{ color: '#fdab3d', fontWeight: 700, fontSize: 14 }}>${amount2.toLocaleString()} ({100 - pct1}%)</span>
              </div>
            </div>
          )}
          {structure === 'phase2' && (
            <div style={{ background: '#161830', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8e8ea0', fontSize: 13 }}>Phase 2 (remaining balance)</span>
                <span style={{ color: '#fdab3d', fontWeight: 700, fontSize: 16 }}>${amount2.toLocaleString()}</span>
              </div>
              <div style={{ color: '#8e8ea0', fontSize: 11, marginTop: 6 }}>Phase 1 has been paid ✓</div>
            </div>
          )}
          {err && <div style={{ color: '#ff5c5c', fontSize: 13, background: '#ff5c5c15', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7ef', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={send} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={14} />
            {loading ? 'Sending...' : structure === 'phase2' ? 'Send Phase 2' : 'Send Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manual Invoice Creator ────────────────────────────────────────────────────
function ManualInvoiceCreator({ deal, contact, contacts, existingInvoices = [], onClose, onSaved, onSent }) {
  const [mode, setMode] = useState('manual'); // 'manual' | 'stripe'

  // ── Stripe state ──
  const stripeContact  = contacts?.find(c => c.id === deal.contact_id);
  const phase1Paid     = existingInvoices.some(i => i.phase_number === 1 && i.status === 'paid');
  const phase2Sent     = existingInvoices.some(i => i.phase_number === 2);
  const defaultStr     = (phase1Paid && !phase2Sent) ? 'phase2' : 'single';
  const [structure,    setStructure]   = useState(defaultStr);
  const [strEmail,     setStrEmail]    = useState(stripeContact?.email || '');
  const [strName,      setStrName]     = useState(stripeContact?.name || deal.name);
  const [pct1,         setPct1]        = useState(50);
  const [strDesc,      setStrDesc]     = useState(`Professional services — ${deal.name}`);
  const [strLoading,   setStrLoading]  = useState(false);
  const [strErr,       setStrErr]      = useState('');
  const amount1 = parseFloat(((deal.value || 0) * pct1 / 100).toFixed(2));
  const amount2 = parseFloat(((deal.value || 0) - amount1).toFixed(2));

  const showStructureToggle = !phase1Paid && !phase2Sent && existingInvoices.length === 0;

  async function sendStripe() {
    if (!strEmail) { setStrErr('Customer email is required.'); return; }
    setStrLoading(true); setStrErr('');
    try {
      if (structure === 'single') {
        await createInvoice({ deal_id: deal.id, email: strEmail, customer_name: strName, amount: deal.value || 0, description: strDesc, phase_number: 1, total_phases: 1 });
      } else if (structure === 'two_phase') {
        await createInvoice({ deal_id: deal.id, email: strEmail, customer_name: strName, amount: amount1, description: `${strDesc} — Phase 1 of 2`, phase_number: 1, total_phases: 2 });
      } else if (structure === 'phase2') {
        const ph1 = existingInvoices.find(i => i.phase_number === 1);
        const remaining = (deal.value || 0) - (ph1?.amount || 0);
        await createInvoice({ deal_id: deal.id, email: strEmail, customer_name: strName, amount: remaining, description: `${strDesc} — Phase 2 of 2`, phase_number: 2, total_phases: 2 });
      }
      onSent && onSent(); onClose();
    } catch (e) { setStrErr(e.message); }
    finally { setStrLoading(false); }
  }

  // ── Manual state ──
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    invoice_number:       '',        // auto-generated by server
    invoice_date:         today,
    due_date:             dueDate,
    bill_to_name:         contact?.name || deal.company || '',
    bill_to_email:        contact?.email || '',
    bill_to_address:      '',
    from_name:            'Vernon Tech & Media',
    from_email:           '',
    from_phone:           '',
    payment_instructions: 'Pay via Zelle to: ',
    notes:                '',
    items: [{ description: deal.name || 'Professional Services', qty: 1, rate: deal.value || 0 }],
  });

  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(null); // saved invoice object
  const [err,      setErr]      = useState('');

  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const subtotal = form.items.reduce((s, i) => s + ((i.qty || 1) * (parseFloat(i.rate) || 0)), 0);

  function updateItem(idx, key, val) {
    setForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? { ...item, [key]: val } : item) }));
  }
  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { description: '', qty: 1, rate: 0 }] }));
  }
  function removeItem(idx) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    setSaving(true); setErr('');
    try {
      const result = await createManualInvoice({ ...form, deal_id: deal.id });
      setSaved(result);
      onSaved && onSaved();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  function handleDownload() {
    const html = buildInvoiceHTML({ ...form, invoice_number: saved?.invoice_number || form.invoice_number || 'DRAFT', subtotal });
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }

  function handleEmail() {
    const subject = encodeURIComponent(`Invoice from Vernon Tech & Media — ${form.invoice_number || 'New Invoice'}`);
    const body    = encodeURIComponent(
      `Hi ${form.bill_to_name || 'there'},\n\nPlease find your invoice attached.\n\n` +
      `Invoice: ${form.invoice_number || 'TBD'}\nAmount: $${subtotal.toLocaleString()}\nDue: ${form.due_date}\n\n` +
      `${form.payment_instructions}\n\nThank you,\nVernon Tech & Media`
    );
    const to = encodeURIComponent(form.bill_to_email || '');
    window.open(`https://mail.google.com/mail/?view=cm&to=${to}&su=${subject}&body=${body}`, '_blank');
  }

  const inp = {
    width: '100%', boxSizing: 'border-box',
    background: '#111328', border: '1px solid #e5e7ef', borderRadius: 6,
    padding: '7px 10px', fontSize: 12, color: '#1a1a2e', outline: 'none',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: 20 }}>
      <div style={{ background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {mode === 'manual' ? <FileText size={18} style={{ color: '#4a6cf7' }} /> : <CreditCard size={18} style={{ color: '#4a6cf7' }} />}
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>Invoice</span>
          <span style={{ fontSize: 13, color: '#8e8ea0' }}>— {deal.name}</span>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7ef', marginLeft: 8 }}>
            {[['manual', FileText, 'Manual Invoice'], ['stripe', CreditCard, 'Send via Stripe']].map(([m, Icon, label]) => (
              <button key={m} onClick={() => setMode(m)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
                background: mode === m ? '#4a6cf722' : 'transparent',
                color: mode === m ? '#4a6cf7' : '#8e8ea0',
                fontWeight: mode === m ? 700 : 400,
                borderRight: m === 'manual' ? '1px solid #e5e7ef' : 'none',
              }}>
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Stripe Mode ── */}
          {mode === 'stripe' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 5 }}>Customer Email *</label>
                  <input className="form-input" type="email" value={strEmail} onChange={e => setStrEmail(e.target.value)} placeholder="client@email.com" />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 5 }}>Customer Name</label>
                  <input className="form-input" value={strName} onChange={e => setStrName(e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 5 }}>Description</label>
                <input className="form-input" value={strDesc} onChange={e => setStrDesc(e.target.value)} />
              </div>
              {showStructureToggle && (
                <div>
                  <label style={{ fontSize: 12, color: '#8e8ea0', display: 'block', marginBottom: 8 }}>Payment Structure</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['single', '💳 1 Full Payment'], ['two_phase', '📊 2 Phases']].map(([val, lbl]) => (
                      <button key={val} onClick={() => setStructure(val)} style={{
                        flex: 1, padding: '9px 0', borderRadius: 8,
                        border: `1px solid ${structure === val ? '#4a6cf7' : '#e5e7ef'}`,
                        background: structure === val ? '#4a6cf722' : 'transparent',
                        color: structure === val ? '#4a6cf7' : '#8e8ea0',
                        cursor: 'pointer', fontSize: 13, fontWeight: structure === val ? 700 : 400,
                      }}>{lbl}</button>
                    ))}
                  </div>
                </div>
              )}
              {structure === 'single' && (
                <div style={{ background: '#161830', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#8e8ea0', fontSize: 13 }}>Total invoice amount</span>
                  <span style={{ color: '#4a6cf7', fontWeight: 700, fontSize: 16 }}>${(deal.value || 0).toLocaleString()}</span>
                </div>
              )}
              {structure === 'two_phase' && (
                <div style={{ background: '#161830', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#8e8ea0', fontSize: 13 }}>Phase 1 (sent now)</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="range" min={10} max={90} value={pct1} onChange={e => setPct1(Number(e.target.value))} style={{ width: 80 }} />
                      <span style={{ color: '#4a6cf7', fontWeight: 700, fontSize: 14, minWidth: 100, textAlign: 'right' }}>${amount1.toLocaleString()} ({pct1}%)</span>
                    </div>
                  </div>
                  <div style={{ height: 1, background: '#e5e7ef' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8ea0', fontSize: 13 }}>Phase 2 (after Phase 1 paid)</span>
                    <span style={{ color: '#fdab3d', fontWeight: 700, fontSize: 14 }}>${amount2.toLocaleString()} ({100 - pct1}%)</span>
                  </div>
                </div>
              )}
              {structure === 'phase2' && (
                <div style={{ background: '#161830', borderRadius: 8, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#8e8ea0', fontSize: 13 }}>Phase 2 (remaining balance)</span>
                    <span style={{ color: '#fdab3d', fontWeight: 700, fontSize: 16 }}>${amount2.toLocaleString()}</span>
                  </div>
                  <div style={{ color: '#8e8ea0', fontSize: 11, marginTop: 6 }}>Phase 1 has been paid ✓</div>
                </div>
              )}
              {strErr && <div style={{ color: '#ff5c5c', fontSize: 13, background: '#ff5c5c15', borderRadius: 8, padding: '8px 12px' }}>{strErr}</div>}
            </>
          )}

          {/* ── Manual Mode ── */}
          {mode === 'manual' && <>

          {/* Invoice meta */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#8e8ea0', display: 'block', marginBottom: 4 }}>Invoice Date</label>
              <input style={inp} type="date" value={form.invoice_date} onChange={e => setField('invoice_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8e8ea0', display: 'block', marginBottom: 4 }}>Due Date</label>
              <input style={inp} type="date" value={form.due_date} onChange={e => setField('due_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8e8ea0', display: 'block', marginBottom: 4 }}>Invoice # (auto-assigned)</label>
              <input style={{ ...inp, color: '#8e8ea0' }} value={form.invoice_number || 'Will be assigned on save'} readOnly />
            </div>
          </div>

          {/* From + Bill To */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#161830', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>From</div>
              <input style={inp} placeholder="Company name" value={form.from_name} onChange={e => setField('from_name', e.target.value)} />
              <input style={inp} placeholder="Your email" value={form.from_email} onChange={e => setField('from_email', e.target.value)} />
              <input style={inp} placeholder="Phone (optional)" value={form.from_phone} onChange={e => setField('from_phone', e.target.value)} />
            </div>
            <div style={{ background: '#161830', borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Bill To</div>
              <input style={inp} placeholder="Client name" value={form.bill_to_name} onChange={e => setField('bill_to_name', e.target.value)} />
              <input style={inp} placeholder="Client email" value={form.bill_to_email} onChange={e => setField('bill_to_email', e.target.value)} />
              <input style={inp} placeholder="Address (optional)" value={form.bill_to_address} onChange={e => setField('bill_to_address', e.target.value)} />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Line Items</div>
            <div style={{ background: '#161830', borderRadius: 8, overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 100px 32px', gap: 8, padding: '8px 12px', borderBottom: '1px solid #e5e7ef', fontSize: 11, color: '#8e8ea0', fontWeight: 700, textTransform: 'uppercase' }}>
                <span>Description</span><span>Qty</span><span>Rate ($)</span><span>Amount</span><span></span>
              </div>
              {form.items.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 100px 32px', gap: 8, padding: '8px 12px', borderBottom: '1px solid #ffffff', alignItems: 'center' }}>
                  <input style={{ ...inp, padding: '5px 8px' }} placeholder="Description" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                  <input style={{ ...inp, padding: '5px 8px' }} type="number" min="1" value={item.qty} onChange={e => updateItem(idx, 'qty', Number(e.target.value))} />
                  <input style={{ ...inp, padding: '5px 8px' }} type="number" min="0" step="0.01" value={item.rate} onChange={e => updateItem(idx, 'rate', e.target.value)} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#4a6cf7' }}>${((item.qty || 1) * (parseFloat(item.rate) || 0)).toLocaleString()}</span>
                  <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff5c5c', display: 'flex', padding: 0 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div style={{ padding: '8px 12px' }}>
                <button onClick={addItem} style={{ background: 'none', border: '1px dashed #e5e7ef', borderRadius: 6, cursor: 'pointer', color: '#4a6cf7', fontSize: 12, padding: '5px 12px', width: '100%' }}>
                  + Add Item
                </button>
              </div>
            </div>
            {/* Total */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingRight: 44 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: '#8e8ea0', marginBottom: 3 }}>Total</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#4a6cf7' }}>${subtotal.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Payment Instructions + Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#8e8ea0', display: 'block', marginBottom: 6 }}>Payment Instructions</label>
              <textarea
                style={{ ...inp, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="e.g. Please pay via Zelle to: 5551234567 or venmo.com/yourname"
                value={form.payment_instructions}
                onChange={e => setField('payment_instructions', e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#8e8ea0', display: 'block', marginBottom: 6 }}>Notes</label>
              <textarea
                style={{ ...inp, minHeight: 80, resize: 'vertical', lineHeight: 1.5 }}
                placeholder="Thank you for your business!"
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
              />
            </div>
          </div>

          {err && <div style={{ color: '#ff5c5c', fontSize: 13, background: '#ff5c5c15', borderRadius: 8, padding: '8px 12px' }}>{err}</div>}

          {saved && (
            <div style={{ color: '#4a6cf7', fontSize: 13, background: '#4a6cf715', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <Check size={14} /> Invoice #{saved.invoice_number} saved successfully
            </div>
          )}
          </> /* end manual mode */}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7ef', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button className="btn-ghost" onClick={onClose}>Close</button>
          {mode === 'stripe' ? (
            <button onClick={sendStripe} disabled={strLoading} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Send size={14} />
              {strLoading ? 'Sending...' : structure === 'phase2' ? 'Send Phase 2' : 'Send Invoice'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              {saved && (
                <>
                  <button onClick={handleEmail} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <Send size={13} /> Send Email
                  </button>
                  <button onClick={handleDownload} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                    <ExternalLink size={13} /> Download PDF
                  </button>
                </>
              )}
              <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                {saving ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Check size={13} />}
                {saved ? 'Save Again' : 'Save Invoice'}
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function buildInvoiceHTML({ invoice_number, invoice_date, due_date, bill_to_name, bill_to_email, bill_to_address, from_name, from_email, from_phone, items, payment_instructions, notes, subtotal }) {
  const itemRows = items.map((item, i) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 14px;color:#374151;">${item.description || '—'}</td>
      <td style="padding:10px 14px;text-align:center;color:#374151;">${item.qty || 1}</td>
      <td style="padding:10px 14px;text-align:right;color:#374151;">$${parseFloat(item.rate || 0).toLocaleString()}</td>
      <td style="padding:10px 14px;text-align:right;font-weight:600;color:#111827;">$${((item.qty || 1) * parseFloat(item.rate || 0)).toLocaleString()}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; background: #fff; padding: 48px; max-width: 800px; margin: 0 auto; }
    @media print { body { padding: 24px; } @page { margin: 1cm; } }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #111827; }
    .company { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 6px; }
    .from-details { font-size: 13px; color: #6b7280; line-height: 1.6; }
    .invoice-meta { text-align: right; }
    .invoice-title { font-size: 28px; font-weight: 800; color: #4a6cf7; margin-bottom: 8px; }
    .meta-row { font-size: 13px; color: #6b7280; margin-bottom: 3px; }
    .meta-row span { color: #111827; font-weight: 600; }
    .bill-to { margin-bottom: 32px; }
    .section-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin-bottom: 6px; }
    .bill-name { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }
    .bill-detail { font-size: 13px; color: #6b7280; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead tr { background: #f3f4f6; }
    th { padding: 10px 14px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
    th:last-child, th:nth-child(3), th:nth-child(2) { text-align: right; }
    th:nth-child(2) { text-align: center; }
    .total-section { display: flex; justify-content: flex-end; margin-bottom: 32px; }
    .total-box { background: #f9fafb; border-radius: 8px; padding: 16px 20px; min-width: 220px; }
    .total-row { display: flex; justify-content: space-between; font-size: 14px; color: #374151; margin-bottom: 8px; }
    .total-final { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; color: #111827; padding-top: 8px; border-top: 2px solid #e5e7eb; }
    .footer-section { background: #f9fafb; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
    .footer-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9ca3af; margin-bottom: 6px; }
    .footer-text { font-size: 13px; color: #374151; line-height: 1.65; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company">${from_name || 'Vernon Tech &amp; Media'}</div>
      <div class="from-details">
        ${from_email ? from_email + '<br>' : ''}
        ${from_phone || ''}
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">INVOICE</div>
      <div class="meta-row">Invoice #: <span>${invoice_number}</span></div>
      <div class="meta-row">Date: <span>${invoice_date || '—'}</span></div>
      ${due_date ? `<div class="meta-row">Due: <span>${due_date}</span></div>` : ''}
    </div>
  </div>

  <div class="bill-to">
    <div class="section-label">Bill To</div>
    <div class="bill-name">${bill_to_name || 'Client'}</div>
    <div class="bill-detail">
      ${bill_to_email ? bill_to_email + '<br>' : ''}
      ${bill_to_address || ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center;">Qty</th>
        <th style="text-align:right;">Rate</th>
        <th style="text-align:right;">Amount</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="total-section">
    <div class="total-box">
      <div class="total-final">
        <span>Total Due</span>
        <span>$${(subtotal || 0).toLocaleString()}</span>
      </div>
    </div>
  </div>

  ${payment_instructions ? `
  <div class="footer-section">
    <div class="footer-label">Payment Instructions</div>
    <div class="footer-text">${payment_instructions.replace(/\n/g, '<br>')}</div>
  </div>` : ''}

  ${notes ? `
  <div class="footer-section">
    <div class="footer-label">Notes</div>
    <div class="footer-text">${notes.replace(/\n/g, '<br>')}</div>
  </div>` : ''}
</body>
</html>`;
}

// ── Deal Tasks Panel ──────────────────────────────────────────────────────────
const TASK_STATUS_STYLE = {
  'Not Started':   { background: 'rgba(74,72,69,0.35)',   color: '#8e8ea0' },
  'Working on it': { background: 'rgba(253,171,61,0.15)', color: '#fdab3d' },
  'Done':          { background: 'rgba(74,108,247,0.12)', color: '#4a6cf7' },
  'Stuck':         { background: 'rgba(255,92,92,0.15)',  color: '#ff5c5c' },
  'In Review':     { background: 'rgba(91,156,246,0.15)', color: '#5b9cf6' },
};
const TASK_STATUSES = ['Not Started', 'Working on it', 'Done', 'Stuck', 'In Review'];

function DealTasksPanel({ dealId, todos, onToggle, onDelete, onAdd, onStatusChange }) {
  const [inputVal, setInputVal] = useState('');
  const [adding, setAdding]     = useState(false);
  const [statusOpen, setStatusOpen] = useState(null); // todoId

  function submit() {
    if (!inputVal.trim()) { setAdding(false); return; }
    onAdd(inputVal.trim());
    setInputVal('');
    setAdding(false);
  }

  const done = todos.filter(t => t.completed).length;

  return (
    <div style={{ padding: '10px 16px 14px 12px', background: '#0d0d0b', borderTop: '1px solid #f0f2f8' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <ClipboardList size={13} style={{ color: '#4a6cf7' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Inter, sans-serif' }}>
          Tasks
        </span>
        {todos.length > 0 && (
          <span style={{ fontSize: 11, color: '#8e8ea0', fontFamily: 'Inter, sans-serif' }}>
            {done}/{todos.length} done
          </span>
        )}
      </div>

      {/* Task rows */}
      {todos.map(todo => (
        <div key={todo.id} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 6px', borderRadius: 6, marginBottom: 2,
        }}
          onMouseEnter={e => e.currentTarget.style.background = '#ffffff'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {/* Checkbox */}
          <button
            onClick={() => onToggle(todo)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
          >
            {todo.completed
              ? <div style={{ width: 14, height: 14, borderRadius: 3, background: '#4a6cf7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={10} color="#f5f7fa" strokeWidth={3} />
                </div>
              : <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid #3a3a38' }} />
            }
          </button>

          {/* Title */}
          <span style={{
            flex: 1, fontSize: 13, color: todo.completed ? '#8e8ea0' : '#1a1a2e',
            textDecoration: todo.completed ? 'line-through' : 'none',
            fontFamily: 'Inter, sans-serif',
          }}>
            {todo.title}
          </span>

          {/* Status badge (mini dropdown) */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setStatusOpen(statusOpen === todo.id ? null : todo.id)}
              style={{
                ...(TASK_STATUS_STYLE[todo.status] || TASK_STATUS_STYLE['Not Started']),
                border: 'none', cursor: 'pointer', borderRadius: 4,
                fontSize: 10, fontWeight: 600, padding: '2px 7px',
                fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
              }}
            >
              {todo.status || 'Not Started'}
            </button>
            {statusOpen === todo.id && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: 4,
                background: '#ffffff', border: '1px solid #e5e7ef', borderRadius: 8, padding: 4, minWidth: 140,
              }}>
                {TASK_STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => { onStatusChange(todo.id, s); setStatusOpen(null); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', border: 'none',
                      background: 'none', cursor: 'pointer', padding: '5px 8px', borderRadius: 5,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#e5e7ef'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ ...(TASK_STATUS_STYLE[s] || {}), borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delete */}
          <button
            onClick={() => onDelete(todo.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d8dbe6', padding: 0, display: 'flex', transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
            onMouseLeave={e => e.currentTarget.style.color = '#d8dbe6'}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      {/* Add task */}
      {adding ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px' }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid #3a3a38', flexShrink: 0 }} />
          <input
            autoFocus
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setInputVal(''); } }}
            onBlur={submit}
            placeholder="Task name…"
            style={{
              flex: 1, background: 'none', border: 'none', borderBottom: '1px solid rgba(74,108,247,0.35)',
              outline: 'none', color: '#1a1a2e', fontSize: 13, fontFamily: 'Inter, sans-serif', padding: '2px 0',
            }}
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
            cursor: 'pointer', color: '#8e8ea0', fontSize: 12, padding: '5px 6px', fontFamily: 'Inter, sans-serif',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#4a6cf7'}
          onMouseLeave={e => e.currentTarget.style.color = '#8e8ea0'}
        >
          <Plus size={12} /> Add Task
        </button>
      )}
    </div>
  );
}

// ── Main Deals Component ──────────────────────────────────────────────────────
const EMPTY = {
  name: '', stage: 'New', value: '', amount_paid: '', contact_id: '', company: '', notes: '',
  created_date: new Date().toISOString().slice(0, 10),
  payment_status: 'Pending',
};

export default function Deals() {
  const [searchParams] = useSearchParams();
  const [deals,          setDeals]          = useState([]);
  const [contacts,       setContacts]       = useState([]);
  const [invoices,       setInvoices]       = useState([]);
  const [allTodos,       setAllTodos]       = useState([]);
  const [expandedTasks,  setExpandedTasks]  = useState(new Set());
  const [hoveredDeal,    setHoveredDeal]    = useState(null);
  const [quickAddDeal,   setQuickAddDeal]   = useState(null);
  const [quickAddVal,    setQuickAddVal]    = useState('');
  const [search,         setSearch]         = useState(() => searchParams.get('search') || '');
  const [collapsed,      setCollapsed]      = useState({});
  const [modal,          setModal]          = useState(null);
  const [form,           setForm]           = useState(EMPTY);
  const [selected,       setSelected]       = useState(null);
  const [manualDeal,     setManualDeal]     = useState(null);   // Unified invoice modal
  const [loading,        setLoading]        = useState(true);
  const [selectedIds,    setSelectedIds]    = useState(new Set());

  const load = async () => {
    try {
      const [d, c, inv, todos] = await Promise.all([getDeals(), getContacts(), getInvoices(), getTodos()]);
      setDeals(d.filter(x => !x.archived));
      setContacts(c);
      setInvoices(inv);
      setAllTodos(todos);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const getDealTodos = (dealId) => allTodos.filter(t => t.deal_id === dealId);
  const toggleTasks  = (dealId) => setExpandedTasks(prev => { const n = new Set(prev); n.has(dealId) ? n.delete(dealId) : n.add(dealId); return n; });

  const handleAddDealTask = async (dealId, title) => {
    const todo = await createTodo({ deal_id: dealId, group_id: null, title });
    setAllTodos(t => [...t, todo]);
  };
  const handleToggleDealTask = async (todo) => {
    await updateTodo(todo.id, { completed: !todo.completed });
    setAllTodos(t => t.map(x => x.id === todo.id ? { ...x, completed: !x.completed } : x));
  };
  const handleDeleteDealTask = async (id) => {
    await deleteTodo(id);
    setAllTodos(t => t.filter(x => x.id !== id));
  };
  const handleDealTaskStatus = async (id, status) => {
    await updateTodo(id, { status });
    setAllTodos(t => t.map(x => x.id === id ? { ...x, status } : x));
  };

  const filtered = useMemo(() =>
    deals.filter(d => !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.company || '').toLowerCase().includes(search.toLowerCase())),
    [deals, search]
  );

  const getContactName = (id) => contacts.find(c => c.id === id)?.name || '';
  const groups = useMemo(() => GROUPS.map(g => ({ ...g, items: filtered.filter(d => g.stages.includes(d.stage)) })), [filtered]);

  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSelection = () => setSelectedIds(new Set());
  const selectedItems = deals.filter(d => selectedIds.has(d.id));

  const handleFieldSave = async (id, field, value) => {
    try {
      const parsed = field === 'value' ? (parseFloat(value) || 0) : value;
      await updateDeal(id, { [field]: parsed });
      setDeals(ds => ds.map(d => d.id === id ? { ...d, [field]: parsed } : d));
    } catch (e) { console.error(e); }
  };

  const handleStageChange = async (deal, stage) => {
    try { await updateDeal(deal.id, { stage }); setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, stage } : d)); }
    catch (e) { alert(e.message); }
  };

  const handlePaymentStatusChange = async (deal, payment_status) => {
    try { await updateDeal(deal.id, { payment_status }); setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, payment_status } : d)); }
    catch (e) { alert(e.message); }
  };

  const handleAmountPaidSave = async (deal, rawVal) => {
    const amount_paid = parseFloat(rawVal) || 0;
    const dealValue = deal.value || 0;
    const payment_status = amount_paid <= 0 ? 'Pending'
      : amount_paid >= dealValue ? 'Paid'
      : 'Partial Paid';
    try {
      await updateDeal(deal.id, { amount_paid, payment_status });
      setDeals(ds => ds.map(d => d.id === deal.id ? { ...d, amount_paid, payment_status } : d));
    } catch (e) { console.error(e); }
  };

  const openAdd    = (stage) => { setForm({ ...EMPTY, stage: stage || 'New', created_date: new Date().toISOString().slice(0, 10) }); setModal('add'); };
  const openDelete = (d) => { setSelected(d); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const value = parseFloat(form.value) || 0;
    const amount_paid = parseFloat(form.amount_paid) || 0;
    const payment_status = amount_paid <= 0 ? 'Pending'
      : amount_paid >= value ? 'Paid'
      : 'Partial Paid';
    try {
      await createDeal({ ...form, value, amount_paid, payment_status });
      await load(); setModal(null);
    } catch (e) { alert(e.message); }
  };
  const handleDelete = async () => {
    try { await deleteDeal(selected.id); await load(); setModal(null); }
    catch (e) { alert(e.message); }
  };

  const handleRefreshInvoices = async (inv) => {
    try {
      const updated = await Promise.all(inv.map(i => refreshInvoice(i.id)));
      setInvoices(all => all.map(i => updated.find(r => r.id === i.id) || i));
    } catch (e) { console.error(e); }
  };

  const handleBulkDelete    = async () => { if (!window.confirm(`Delete ${selectedIds.size} deal(s)?`)) return; try { await Promise.all([...selectedIds].map(id => deleteDeal(id))); setDeals(ds => ds.filter(d => !selectedIds.has(d.id))); clearSelection(); } catch(e) { console.error(e); } };
  const handleBulkArchive   = async () => { try { await Promise.all([...selectedIds].map(id => updateDeal(id, { archived: true }))); setDeals(ds => ds.filter(d => !selectedIds.has(d.id))); clearSelection(); } catch(e) { console.error(e); } };
  const handleBulkDuplicate = async () => { try { await Promise.all(deals.filter(d => selectedIds.has(d.id)).map(({ id, created_at, updated_at, ...r }) => createDeal({ ...r, name: `${r.name} (copy)` }))); await load(); clearSelection(); } catch(e) { console.error(e); } };
  const handleBulkMoveTo    = async (stage) => { try { await Promise.all([...selectedIds].map(id => updateDeal(id, { stage }))); setDeals(ds => ds.map(d => selectedIds.has(d.id) ? { ...d, stage } : d)); clearSelection(); } catch(e) { console.error(e); } };

  const formatMoney = (v) => `$${Number(v || 0).toLocaleString()}`;
  const formatDate  = (d) => { if (!d) return '—'; try { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(d + 'T12:00:00')); } catch { return d; } };

  // Group color by label
  const groupLabelColor = (label) => {
    if (label === 'Closed Won') return '#4a6cf7';
    if (label === 'Closed Lost') return '#ff5c5c';
    if (label === 'Completed') return '#784bd1';
    return '#4a6cf7';
  };

  return (
    <div style={{ minHeight: '100%', background: '#f5f7fa' }}>
      <div className="page-header">
        <div className="page-title">Projects</div>
        <div className="flex items-center gap-3">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
            <input className="search-input" placeholder="Search deals..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => openAdd()}><Plus size={16} /> New Deal</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ minWidth: 200 }}>Deal</th>
              <th style={{ minWidth: 130 }}>Stage</th>
              <th style={{ minWidth: 110 }}>Created</th>
              <th style={{ minWidth: 110 }}>Value</th>
              <th style={{ minWidth: 110 }}>Amt Paid</th>
              <th style={{ minWidth: 130 }}>Pay Status</th>
              <th style={{ minWidth: 200 }}>Payment Progress</th>
              <th style={{ width: 64 }}></th>
              <th style={{ minWidth: 140 }}>Contact</th>
              <th style={{ minWidth: 130 }}>Company</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>Loading...</td></tr>
            ) : groups.map(({ label, items, stages }) => (
              <React.Fragment key={label}>
                <tr>
                  <td colSpan={11} style={{ padding: 0, background: '#ffffff' }}>
                    <div className="group-header" onClick={() => setCollapsed(c => ({ ...c, [label]: !c[label] }))}>
                      {collapsed[label] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      <span style={{ color: groupLabelColor(label) }}>{label}</span>
                      <span style={{ background: '#e5e7ef', borderRadius: 12, padding: '1px 8px', fontSize: 12, color: '#8e8ea0' }}>{items.length}</span>
                    </div>
                  </td>
                </tr>
                {!collapsed[label] && items.map(deal => (
                  <React.Fragment key={deal.id}>
                  <tr style={{ background: selectedIds.has(deal.id) ? 'rgba(74,108,247,0.08)' : undefined }}>
                    <td><input type="checkbox" checked={selectedIds.has(deal.id)} onChange={() => toggleSelect(deal.id)} /></td>
                    <td
                      style={{ fontWeight: 500 }}
                      onMouseEnter={() => setHoveredDeal(deal.id)}
                      onMouseLeave={() => setHoveredDeal(null)}
                    >
                      <InlineEdit value={deal.name} onSave={val => handleFieldSave(deal.id, 'name', val)} placeholder="Deal name" privacy="name" />
                      {quickAddDeal === deal.id ? (
                        <input
                          autoFocus
                          value={quickAddVal}
                          onChange={e => setQuickAddVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (quickAddVal.trim()) handleAddDealTask(deal.id, quickAddVal.trim());
                              setQuickAddDeal(null); setQuickAddVal('');
                            }
                            if (e.key === 'Escape') { setQuickAddDeal(null); setQuickAddVal(''); }
                          }}
                          onBlur={() => {
                            if (quickAddVal.trim()) handleAddDealTask(deal.id, quickAddVal.trim());
                            setQuickAddDeal(null); setQuickAddVal('');
                          }}
                          placeholder="Task name…"
                          style={{
                            display: 'block', marginTop: 4, width: '100%',
                            background: '#f0f2f8', border: '1px solid rgba(74,108,247,0.4)',
                            borderRadius: 5, outline: 'none', color: '#1a1a2e',
                            fontSize: 12, padding: '3px 8px', fontFamily: 'Inter, sans-serif',
                          }}
                        />
                      ) : hoveredDeal === deal.id ? (
                        <button
                          onMouseDown={e => { e.preventDefault(); setQuickAddDeal(deal.id); setQuickAddVal(''); setHoveredDeal(null); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#8e8ea0', fontSize: 11, padding: 0,
                            fontFamily: 'Inter, sans-serif', transition: 'color 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.color = '#4a6cf7'}
                          onMouseLeave={e => e.currentTarget.style.color = '#8e8ea0'}
                        >
                          <Plus size={11} /> Add Task
                        </button>
                      ) : null}
                    </td>
                    <td>
                      <StatusBadge status={deal.stage} options={STAGES} onChange={s => handleStageChange(deal, s)} />
                    </td>
                    <td style={{ fontSize: 12, color: '#8e8ea0' }}>
                      <InlineEdit value={deal.created_date || ''} type="date" onSave={val => handleFieldSave(deal.id, 'created_date', val)} placeholder={formatDate(deal.created_date)} />
                    </td>
                    <td>
                      <div className="private-value" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <DollarSign size={13} style={{ color: '#4a6cf7', flexShrink: 0 }} />
                        <InlineEdit value={String(deal.value || '')} type="number" onSave={val => handleFieldSave(deal.id, 'value', val)} placeholder="0" />
                      </div>
                    </td>
                    <td>
                      <div className="private-value" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <DollarSign size={13} style={{ color: deal.amount_paid > 0 ? '#4a6cf7' : '#555880', flexShrink: 0 }} />
                        <InlineEdit value={String(deal.amount_paid || '')} type="number" onSave={val => handleAmountPaidSave(deal, val)} placeholder="0" />
                      </div>
                    </td>
                    <td>
                      {/* Payment Status — auto-updated when Amt Paid changes */}
                      <StatusBadge
                        status={deal.payment_status || 'Pending'}
                        options={PAYMENT_STATUSES}
                        onChange={s => handlePaymentStatusChange(deal, s)}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <PaymentBadge dealId={deal.id} allInvoices={invoices} onRefresh={handleRefreshInvoices} />
                        <button
                          onClick={() => setManualDeal(deal)}
                          title="Create or Send Invoice"
                          style={{ background: 'none', border: '1px solid #e5e7ef', borderRadius: 6, cursor: 'pointer', color: '#4a6cf7', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, flexShrink: 0, width: 'fit-content' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#4a6cf722'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        >
                          <FileText size={11} /> Invoice
                        </button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => toggleTasks(deal.id)}
                          title="Toggle tasks"
                          style={{
                            background: expandedTasks.has(deal.id) ? 'rgba(74,108,247,0.1)' : 'none',
                            border: expandedTasks.has(deal.id) ? '1px solid rgba(74,108,247,0.3)' : '1px solid transparent',
                            borderRadius: 6, cursor: 'pointer', color: expandedTasks.has(deal.id) ? '#4a6cf7' : '#8e8ea0',
                            padding: '3px 6px', display: 'flex', alignItems: 'center', gap: 3, transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { if (!expandedTasks.has(deal.id)) { e.currentTarget.style.color = '#1a1a2e'; e.currentTarget.style.borderColor = '#e5e7ef'; } }}
                          onMouseLeave={e => { if (!expandedTasks.has(deal.id)) { e.currentTarget.style.color = '#8e8ea0'; e.currentTarget.style.borderColor = 'transparent'; } }}
                        >
                          <ClipboardList size={13} />
                          {getDealTodos(deal.id).length > 0 && (
                            <span style={{ fontSize: 10, fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
                              {getDealTodos(deal.id).filter(t => t.completed).length}/{getDealTodos(deal.id).length}
                            </span>
                          )}
                        </button>
                        <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => openDelete(deal)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                    <td>
                      {deal.contact_id
                        ? <span className="contact-chip private-value">{getContactName(deal.contact_id)}</span>
                        : <span style={{ color: '#555880', fontSize: 13, paddingLeft: 6 }}>—</span>}
                    </td>
                    <td>
                      <InlineEdit value={deal.company} onSave={val => handleFieldSave(deal.id, 'company', val)} placeholder="Company" privacy="name" />
                    </td>
                  </tr>
                  {expandedTasks.has(deal.id) && (
                    <tr>
                      <td colSpan={11} style={{ padding: 0 }}>
                        <DealTasksPanel
                          dealId={deal.id}
                          todos={getDealTodos(deal.id)}
                          onToggle={handleToggleDealTask}
                          onDelete={handleDeleteDealTask}
                          onAdd={(title) => handleAddDealTask(deal.id, title)}
                          onStatusChange={handleDealTaskStatus}
                        />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
                {!collapsed[label] && items.length > 0 && (
                  <tr className="sum-row">
                    <td colSpan={3} style={{ textAlign: 'right', color: '#8e8ea0', fontSize: 12 }}>Total</td>
                    <td></td>
                    <td><div className="private-value flex items-center gap-1"><DollarSign size={13} style={{ color: '#4a6cf7' }} /><span>{formatMoney(items.reduce((s, d) => s + (d.value || 0), 0))}</span></div></td>
                    <td><div className="private-value flex items-center gap-1"><DollarSign size={13} style={{ color: '#4a6cf7' }} /><span>{formatMoney(items.reduce((s, d) => s + (d.amount_paid || 0), 0))}</span></div></td>
                    <td colSpan={5}></td>
                  </tr>
                )}
                {!collapsed[label] && (
                  <tr>
                    <td colSpan={11} style={{ padding: 0 }}>
                      <div className="add-row" onClick={() => openAdd(stages?.[0])}><Plus size={14} /> Add Deal</div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <SelectionBar
        count={selectedIds.size}
        selectedItems={selectedItems}
        onClear={clearSelection}
        onDelete={handleBulkDelete}
        onArchive={handleBulkArchive}
        onDuplicate={handleBulkDuplicate}
        moveToOptions={STAGES.map(s => ({ label: s, value: s }))}
        onMoveTo={handleBulkMoveTo}
      />

      {/* Unified Invoice Modal */}
      {manualDeal && (
        <ManualInvoiceCreator
          deal={manualDeal}
          contact={contacts.find(c => c.id === manualDeal.contact_id)}
          contacts={contacts}
          existingInvoices={invoices.filter(i => i.deal_id === manualDeal.id)}
          onClose={() => setManualDeal(null)}
          onSaved={load}
          onSent={load}
        />
      )}

      {/* Add Deal Modal */}
      {modal === 'add' && (
        <Modal title="New Deal" onClose={() => setModal(null)} onSubmit={handleSave} submitLabel="Add Deal">
          <div className="form-group">
            <label className="form-label">Deal Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Website Redesign" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Stage</label>
              <select className="form-select" value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Value ($)</label>
              <input className="form-input" type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">Amount Paid ($)</label>
              <input className="form-input" type="number" min="0" value={form.amount_paid} onChange={e => setForm(f => ({ ...f, amount_paid: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Created Date</label>
              <input className="form-input" type="date" value={form.created_date} onChange={e => setForm(f => ({ ...f, created_date: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Company</label>
              <input className="form-input" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Payment Status</label>
              <select className="form-select" value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}>
                {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Contact</label>
              <select className="form-select" value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
                <option value="">— No contact —</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal title="Delete Deal" onClose={() => setModal(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
          <p style={{ color: '#8e8ea0' }}>Delete <strong style={{ color: '#1a1a2e' }}>{selected?.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
