import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2, Globe, Phone, Mail, Building2 } from 'lucide-react';
import { getAccounts, createAccount, updateAccount, deleteAccount } from '../api';
import Modal from '../components/Modal';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';
import { usePageActions } from '../context/UiContext';
import { toast } from '../components/Toast';

const INDUSTRIES = ['', 'Technology', 'Marketing', 'Logistics', 'Finance', 'Healthcare', 'Education', 'Real Estate', 'Media', 'Retail', 'Other'];
const EMPTY = { name: '', industry: '', email: '', phone: '', address: '', website: '', notes: '' };
const gmailLink = (email) => `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}`;

export default function Accounts() {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoadError('');
    try { setAccounts((await getAccounts()).filter(a => !a.archived)); }
    catch (e) { console.error(e); setLoadError(e?.message || 'Failed to load accounts'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    accounts.filter(a => !search ||
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.industry || '').toLowerCase().includes(search.toLowerCase())),
    [accounts, search]
  );

  // Selection helpers
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const selectedItems = accounts.filter(a => selectedIds.has(a.id));

  const handleFieldSave = async (id, field, value) => {
    try {
      await updateAccount(id, { [field]: value });
      setAccounts(as => as.map(a => a.id === id ? { ...a, [field]: value } : a));
    } catch (e) { console.error(e); }
  };

  const openAdd = () => { setForm(EMPTY); setModal('add'); };
  const openDelete = (a) => { setSelected(a); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try { await createAccount(form); await load(); setModal(null); } catch (e) { toast('error', e.message); }
  };
  const handleDelete = async () => {
    try { await deleteAccount(selected.id); await load(); setModal(null); } catch (e) { toast('error', e.message); }
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} account(s)? This cannot be undone.`)) return;
    try {
      await Promise.all([...selectedIds].map(id => deleteAccount(id)));
      setAccounts(as => as.filter(a => !selectedIds.has(a.id)));
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const handleBulkArchive = async () => {
    try {
      await Promise.all([...selectedIds].map(id => updateAccount(id, { archived: true })));
      setAccounts(as => as.filter(a => !selectedIds.has(a.id)));
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const handleBulkDuplicate = async () => {
    try {
      const items = accounts.filter(a => selectedIds.has(a.id));
      await Promise.all(items.map(({ id, created_at, updated_at, ...rest }) =>
        createAccount({ ...rest, name: `${rest.name} (copy)` })
      ));
      await load();
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const industryColor = (ind) => {
    const colors = { Technology: 'var(--orange)', Marketing: '#fdab3d', Logistics: '#784bd1', Finance: 'var(--orange)', Media: '#ff5c5c' };
    return colors[ind] || '#8e8ea0';
  };

  usePageActions(() => (
    <button className="btn-primary" onClick={openAdd}><Plus size={15} /> New Account</button>
  ), [openAdd]);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
      </div>

      {loadError && (
        <div style={{ margin: '12px 20px', padding: '12px 16px', background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, fontSize: 13, color: '#ff5c5c', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>Couldn't load accounts: {loadError}</span>
          <button onClick={load} style={{ padding: '6px 14px', borderRadius: 6, background: '#ff5c5c', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ minWidth: 200 }}>Account</th>
              <th style={{ minWidth: 150 }}>Industry</th>
              <th style={{ minWidth: 210 }}>Email</th>
              <th style={{ minWidth: 160 }}>Phone</th>
              <th style={{ minWidth: 170 }}>Website</th>
              <th style={{ minWidth: 200 }}>Address</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No accounts yet.</td></tr>
            ) : filtered.map(account => (
              <tr key={account.id} style={{ background: selectedIds.has(account.id) ? 'rgba(37,99,235,0.08)' : undefined }}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(account.id)}
                    onChange={() => toggleSelect(account.id)}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div style={{
                      width: 30, height: 30, borderRadius: 7,
                      background: industryColor(account.industry),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Building2 size={14} color="white" />
                    </div>
                    <InlineEdit value={account.name} onSave={val => handleFieldSave(account.id, 'name', val)} placeholder="Account name" privacy="name" />
                  </div>
                </td>
                <td>
                  <InlineEdit value={account.industry} options={INDUSTRIES} onSave={val => handleFieldSave(account.id, 'industry', val)} placeholder="Industry" />
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {account.email && (
                      <a href={gmailLink(account.email)} target="_blank" rel="noreferrer" title="Compose in Gmail" style={{ display: 'flex', flexShrink: 0 }}>
                        <Mail size={13} style={{ color: 'var(--orange)' }} />
                      </a>
                    )}
                    <InlineEdit value={account.email} type="email" onSave={val => handleFieldSave(account.id, 'email', val)} placeholder="Add email" />
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {account.phone && <Phone size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                    <InlineEdit value={account.phone} type="tel" onSave={val => handleFieldSave(account.id, 'phone', val)} placeholder="Add phone" />
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {account.website && <Globe size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />}
                    <InlineEdit value={account.website} onSave={val => handleFieldSave(account.id, 'website', val)} placeholder="website.com" />
                  </div>
                </td>
                <td>
                  <InlineEdit value={account.address} onSave={val => handleFieldSave(account.id, 'address', val)} placeholder="Address" />
                </td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => openDelete(account)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={8} style={{ padding: 0 }}>
                <div className="add-row" onClick={openAdd}><Plus size={14} /> Add Account</div>
              </td>
            </tr>
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
      />

      {modal === 'add' && (
        <Modal title="New Account" onClose={() => setModal(null)} onSubmit={handleSave} submitLabel="Add Account">
          <div className="form-group">
            <label className="form-label">Account Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Company name" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Industry</label>
              <select className="form-select" value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}>
                {INDUSTRIES.map(i => <option key={i}>{i || '— Select —'}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Website</label>
              <input className="form-input" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="example.com" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@company.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Address</label>
            <input className="form-input" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, City, State" />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Account notes..." style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete Account" onClose={() => setModal(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
          <p style={{ color: 'var(--muted)' }}>Delete <strong style={{ color: 'var(--text)' }}>{selected?.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
