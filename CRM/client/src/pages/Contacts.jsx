import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, Trash2, Phone, Mail } from 'lucide-react';
import { getContacts, createContact, updateContact, deleteContact } from '../api';
import Modal from '../components/Modal';
import InlineEdit from '../components/InlineEdit';
import SelectionBar from '../components/SelectionBar';

const EMPTY = { name: '', email: '', phone: '', company: '', title: '', notes: '' };
const gmailLink = (email) => `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(email)}`;

export default function Contacts() {
  const [searchParams] = useSearchParams();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const load = async () => {
    try { setContacts((await getContacts()).filter(c => !c.archived)); } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    contacts.filter(c => !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase())),
    [contacts, search]
  );

  // Selection helpers
  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());
  const selectedItems = contacts.filter(c => selectedIds.has(c.id));

  const handleFieldSave = async (id, field, value) => {
    try {
      await updateContact(id, { [field]: value });
      setContacts(cs => cs.map(c => c.id === id ? { ...c, [field]: value } : c));
    } catch (e) { console.error(e); }
  };

  const openAdd = () => { setForm(EMPTY); setModal('add'); };
  const openDelete = (c) => { setSelected(c); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try { await createContact(form); await load(); setModal(null); } catch (e) { alert(e.message); }
  };
  const handleDelete = async () => {
    try { await deleteContact(selected.id); await load(); setModal(null); } catch (e) { alert(e.message); }
  };

  // Bulk actions
  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${selectedIds.size} contact(s)? This cannot be undone.`)) return;
    try {
      await Promise.all([...selectedIds].map(id => deleteContact(id)));
      setContacts(cs => cs.filter(c => !selectedIds.has(c.id)));
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const handleBulkArchive = async () => {
    try {
      await Promise.all([...selectedIds].map(id => updateContact(id, { archived: true })));
      setContacts(cs => cs.filter(c => !selectedIds.has(c.id)));
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const handleBulkDuplicate = async () => {
    try {
      const items = contacts.filter(c => selectedIds.has(c.id));
      await Promise.all(items.map(({ id, created_at, updated_at, ...rest }) =>
        createContact({ ...rest, name: `${rest.name} (copy)` })
      ));
      await load();
      clearSelection();
    } catch (e) { console.error(e); }
  };

  const initials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const avatarColor = (name) => {
    const colors = ['#4a6cf7', '#784bd1', '#22c55e', '#f5a623', '#ff5c5c'];
    return colors[name.charCodeAt(0) % colors.length];
  };

  return (
    <div style={{ minHeight: '100%', background: '#f5f7fa' }}>
      <div className="page-header">
        <div className="page-title">Contacts</div>
        <div className="flex items-center gap-3">
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
            <input className="search-input" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={openAdd}><Plus size={16} /> New Contact</button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th style={{ minWidth: 220 }}>Name</th>
              <th style={{ minWidth: 220 }}>Email</th>
              <th style={{ minWidth: 160 }}>Phone</th>
              <th style={{ minWidth: 180 }}>Company</th>
              <th style={{ minWidth: 150 }}>Title</th>
              <th style={{ minWidth: 120 }}>Added</th>
              <th style={{ width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#8e8ea0', padding: 40 }}>No contacts yet.</td></tr>
            ) : filtered.map(contact => (
              <tr key={contact.id} style={{ background: selectedIds.has(contact.id) ? 'rgba(74,108,247,0.08)' : undefined }}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(contact.id)}
                    onChange={() => toggleSelect(contact.id)}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: avatarColor(contact.name),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#ffffff', flexShrink: 0
                    }}>
                      {initials(contact.name)}
                    </div>
                    <InlineEdit value={contact.name} onSave={val => handleFieldSave(contact.id, 'name', val)} placeholder="Name" />
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {contact.email && (
                      <a href={gmailLink(contact.email)} target="_blank" rel="noreferrer" title="Compose in Gmail" style={{ display: 'flex', flexShrink: 0 }}>
                        <Mail size={13} style={{ color: '#4a6cf7' }} />
                      </a>
                    )}
                    <InlineEdit value={contact.email} type="email" onSave={val => handleFieldSave(contact.id, 'email', val)} placeholder="Add email" />
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {contact.phone && <Phone size={12} style={{ color: '#8e8ea0', flexShrink: 0 }} />}
                    <InlineEdit value={contact.phone} type="tel" onSave={val => handleFieldSave(contact.id, 'phone', val)} placeholder="Add phone" />
                  </div>
                </td>
                <td><InlineEdit value={contact.company} onSave={val => handleFieldSave(contact.id, 'company', val)} placeholder="Company" /></td>
                <td><InlineEdit value={contact.title} onSave={val => handleFieldSave(contact.id, 'title', val)} placeholder="Title" /></td>
                <td style={{ color: '#8e8ea0', fontSize: 12, paddingLeft: 8 }}>
                  {contact.created_at ? new Date(contact.created_at).toLocaleDateString() : '—'}
                </td>
                <td>
                  <button className="btn-ghost" style={{ padding: '4px 6px', color: '#ff5c5c' }} onClick={() => openDelete(contact)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={8} style={{ padding: 0 }}>
                <div className="add-row" onClick={openAdd}><Plus size={14} /> Add Contact</div>
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
        <Modal title="New Contact" onClose={() => setModal(null)} onSubmit={handleSave} submitLabel="Add Contact">
          <div className="form-group">
            <label className="form-label">Name *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Company</label>
              <input className="form-input" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Company name" />
            </div>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Job title" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes..." style={{ resize: 'vertical' }} />
          </div>
        </Modal>
      )}
      {modal === 'delete' && (
        <Modal title="Delete Contact" onClose={() => setModal(null)} onSubmit={handleDelete} submitLabel="Delete" danger>
          <p style={{ color: '#8e8ea0' }}>Delete <strong style={{ color: '#1a1a2e' }}>{selected?.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}
