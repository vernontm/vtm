import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Calendar, Clock } from 'lucide-react'
import { useData } from '../context/DataContext.jsx'
import { useUI } from '../context/UIContext.jsx'
import { formatDateTime, initials } from '../lib/format'
import Modal from '../components/Modal.jsx'

const empty = { title: '', contact: '', company: '', date: '', notes: '' }

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

export default function Meetings() {
  const { meetings, contacts, addItem, updateItem, removeItem } = useData()
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
  function openEdit(m) {
    setForm({ ...empty, ...m, date: toLocalInput(m.date) })
    setEditing(m)
  }

  function save(e) {
    e.preventDefault()
    const payload = { ...form, date: form.date ? new Date(form.date).toISOString() : new Date().toISOString() }
    if (editing === 'new') {
      addItem('meetings', payload, `Meeting scheduled with ${payload.contact || 'a contact'}`)
    } else {
      updateItem('meetings', editing.id, payload, `Meeting "${payload.title}" updated`)
    }
    setEditing(null)
  }

  function del(m) {
    if (confirm(`Delete meeting "${m.title}"?`))
      removeItem('meetings', m.id, `Meeting "${m.title}" deleted`)
  }

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase()
    return [...meetings]
      .filter((m) => !q || [m.title, m.contact, m.company, m.notes].join(' ').toLowerCase().includes(q))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
  }, [meetings, search])

  const now = Date.now()

  return (
    <div className="fade-up" style={{ opacity: 1 }}>
      <div className="toolbar">
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {sorted.length} meeting{sorted.length === 1 ? '' : 's'}
        </span>
        <div className="grow" />
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} strokeWidth={2.5} /> Schedule Meeting
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="table-wrap">
          <div className="empty">
            <div className="empty-icon"><Calendar size={22} /></div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
              No meetings scheduled
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Schedule a call or meeting to keep your week organized.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map((m) => {
            const past = new Date(m.date).getTime() < now
            return (
              <div key={m.id} className="card" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', opacity: past ? 0.6 : 1 }}>
                <div className="avatar" style={{ width: 42, height: 42 }}>{initials(m.contact || m.title)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{m.title}</span>
                    <span className={`pill ${past ? 'pill-muted' : 'pill-success'}`}>{past ? 'Past' : 'Upcoming'}</span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                    {m.contact}{m.company ? ` · ${m.company}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)', fontSize: 12.5, marginTop: 6 }}>
                    <Clock size={13} /> {formatDateTime(m.date)}
                  </div>
                  {m.notes && <div style={{ fontSize: 13, marginTop: 10, color: 'var(--text)' }}>{m.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="icon-btn" onClick={() => openEdit(m)} aria-label="Edit"><Pencil size={15} /></button>
                  <button className="icon-btn danger" onClick={() => del(m)} aria-label="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'Schedule Meeting' : 'Edit Meeting'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Title</label>
              <input className="input" required autoFocus value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Discovery call" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Contact</label>
                <input className="input" list="meeting-contacts" value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Jane Doe" />
                <datalist id="meeting-contacts">
                  {contacts.map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
              <div className="field">
                <label>Company</label>
                <input className="input" value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc." />
              </div>
            </div>
            <div className="field">
              <label>Date &amp; Time</label>
              <input className="input" type="datetime-local" required value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea className="input" value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Agenda, links, prep..." />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }}
                onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {editing === 'new' ? 'Schedule' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
