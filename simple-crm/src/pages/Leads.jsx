import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, UserPlus } from 'lucide-react'
import { useData } from '../context/DataContext.jsx'
import { useUI } from '../context/UIContext.jsx'
import { LEAD_STATUSES, LEAD_SOURCES } from '../lib/store'
import { currency, initials, formatDate } from '../lib/format'
import Modal from '../components/Modal.jsx'
import Badge from '../components/Badge.jsx'

const empty = { name: '', email: '', company: '', source: 'Website', status: 'New', value: '' }

export default function Leads() {
  const { leads, addItem, updateItem, removeItem } = useData()
  const { search, newNonce } = useUI()
  const [editing, setEditing] = useState(null) // null | 'new' | lead object
  const [form, setForm] = useState(empty)
  const [statusFilter, setStatusFilter] = useState('All')

  // Header "New" button opens the create modal.
  useEffect(() => {
    if (newNonce > 0) openNew()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newNonce])

  function openNew() {
    setForm(empty)
    setEditing('new')
  }
  function openEdit(lead) {
    setForm({ ...empty, ...lead, value: lead.value ?? '' })
    setEditing(lead)
  }

  function save(e) {
    e.preventDefault()
    const payload = { ...form, value: Number(form.value) || 0 }
    if (editing === 'new') {
      addItem('leads', payload, `New lead ${payload.name || 'Untitled'} added`)
    } else {
      updateItem('leads', editing.id, payload, `Lead ${payload.name} updated`)
    }
    setEditing(null)
  }

  function del(lead) {
    if (confirm(`Delete lead "${lead.name}"?`))
      removeItem('leads', lead.id, `Lead ${lead.name} deleted`)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((l) => {
      const matchesStatus = statusFilter === 'All' || l.status === statusFilter
      const matchesSearch =
        !q ||
        [l.name, l.email, l.company, l.source, l.status]
          .join(' ')
          .toLowerCase()
          .includes(q)
      return matchesStatus && matchesSearch
    })
  }, [leads, search, statusFilter])

  return (
    <div className="fade-up" style={{ opacity: 1 }}>
      <div className="toolbar">
        <select
          className="input"
          style={{ width: 170 }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option>All</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {filtered.length} lead{filtered.length === 1 ? '' : 's'}
        </span>
        <div className="grow" />
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} strokeWidth={2.5} /> Add Lead
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="table-wrap">
          <div className="empty">
            <div className="empty-icon">
              <UserPlus size={22} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
              No leads found
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Add your first lead to start building your pipeline.
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
                <th>Source</th>
                <th>Status</th>
                <th>Value</th>
                <th>Added</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="avatar">{initials(l.name)}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{l.name}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{l.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{l.company || '—'}</td>
                  <td style={{ color: 'var(--muted)' }}>{l.source}</td>
                  <td><Badge value={l.status} /></td>
                  <td style={{ fontWeight: 600 }}>{currency(l.value)}</td>
                  <td style={{ color: 'var(--muted)' }}>{formatDate(l.createdAt)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="icon-btn" onClick={() => openEdit(l)} aria-label="Edit">
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn danger" onClick={() => del(l)} aria-label="Delete">
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
        <Modal title={editing === 'new' ? 'Add Lead' : 'Edit Lead'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Name</label>
              <input className="input" required autoFocus value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" />
            </div>
            <div className="field">
              <label>Company</label>
              <input className="input" value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc." />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Source</label>
                <select className="input" value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Status</label>
                <select className="input" value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {LEAD_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Estimated Value ($)</label>
              <input className="input" type="number" min="0" value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="5000" />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }}
                onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {editing === 'new' ? 'Add Lead' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
