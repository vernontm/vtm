import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Users, Mail, Phone } from 'lucide-react'
import { useData } from '../context/DataContext.jsx'
import { useUI } from '../context/UIContext.jsx'
import { initials, formatDate } from '../lib/format'
import Modal from '../components/Modal.jsx'

const empty = { name: '', email: '', phone: '', company: '', title: '' }

export default function Contacts() {
  const { contacts, addItem, updateItem, removeItem } = useData()
  const { search, newNonce } = useUI()
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(empty)

  useEffect(() => {
    if (newNonce > 0) openNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newNonce])

  function openNew() {
    setForm(empty)
    setEditing('new')
  }
  function openEdit(c) {
    setForm({ ...empty, ...c })
    setEditing(c)
  }

  function save(e) {
    e.preventDefault()
    if (editing === 'new') {
      addItem('contacts', form, `Contact ${form.name || 'Untitled'} created`)
    } else {
      updateItem('contacts', editing.id, form, `Contact ${form.name} updated`)
    }
    setEditing(null)
  }

  function del(c) {
    if (confirm(`Delete contact "${c.name}"?`))
      removeItem('contacts', c.id, `Contact ${c.name} deleted`)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) =>
      [c.name, c.email, c.company, c.title, c.phone]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [contacts, search])

  return (
    <div className="fade-up" style={{ opacity: 1 }}>
      <div className="toolbar">
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {filtered.length} contact{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="grow" />
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} strokeWidth={2.5} /> Add Contact
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="table-wrap">
          <div className="empty">
            <div className="empty-icon"><Users size={22} /></div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
              No contacts found
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Add people you work with to keep everything in one place.
            </div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Added</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="avatar">{initials(c.name)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.title || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td>{c.company || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {c.email && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12.5 }}>
                          <Mail size={13} /> {c.email}
                        </span>
                      )}
                      {c.phone && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12.5 }}>
                          <Phone size={13} /> {c.phone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{formatDate(c.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="icon-btn" onClick={() => openEdit(c)} aria-label="Edit">
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn danger" onClick={() => del(c)} aria-label="Delete">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Add Contact' : 'Edit Contact'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Name</label>
              <input className="input" required autoFocus value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Company</label>
                <input className="input" value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc." />
              </div>
              <div className="field">
                <label>Title</label>
                <input className="input" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Head of Growth" />
              </div>
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" />
            </div>
            <div className="field">
              <label>Phone</label>
              <input className="input" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }}
                onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {editing === 'new' ? 'Add Contact' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
