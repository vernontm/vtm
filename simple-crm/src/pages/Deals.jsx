import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Briefcase } from 'lucide-react'
import { useData } from '../context/DataContext.jsx'
import { useUI } from '../context/UIContext.jsx'
import { DEAL_STAGES } from '../lib/store'
import { currency, formatDate } from '../lib/format'
import Modal from '../components/Modal.jsx'

const COLUMNS = ['Qualified', 'Proposal', 'Negotiation', 'Won']
const empty = { title: '', company: '', contact: '', stage: 'Qualified', value: '', closeDate: '' }

export default function Deals() {
  const { deals, contacts, addItem, updateItem, removeItem } = useData()
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
  function openEdit(d) {
    setForm({ ...empty, ...d, value: d.value ?? '', closeDate: (d.closeDate || '').slice(0, 10) })
    setEditing(d)
  }

  function save(e) {
    e.preventDefault()
    const payload = {
      ...form,
      value: Number(form.value) || 0,
      closeDate: form.closeDate ? new Date(form.closeDate).toISOString() : null,
    }
    if (editing === 'new') {
      addItem('deals', payload, `Deal "${payload.title || 'Untitled'}" created`)
    } else {
      updateItem('deals', editing.id, payload, `Deal "${payload.title}" updated`)
    }
    setEditing(null)
  }

  function del(d) {
    if (confirm(`Delete deal "${d.title}"?`))
      removeItem('deals', d.id, `Deal "${d.title}" deleted`)
  }

  function moveStage(d, stage) {
    updateItem('deals', d.id, { stage }, `Deal "${d.title}" moved to ${stage}`)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return deals
    return deals.filter((d) =>
      [d.title, d.company, d.contact, d.stage].join(' ').toLowerCase().includes(q)
    )
  }, [deals, search])

  const byStage = (stage) => filtered.filter((d) => d.stage === stage)
  const columnTotal = (stage) =>
    byStage(stage).reduce((s, d) => s + (Number(d.value) || 0), 0)

  return (
    <div className="fade-up" style={{ opacity: 1 }}>
      <div className="toolbar">
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {filtered.length} deal{filtered.length === 1 ? '' : 's'} ·{' '}
          {currency(filtered.filter((d) => d.stage !== 'Lost').reduce((s, d) => s + (Number(d.value) || 0), 0))} total
        </span>
        <div className="grow" />
        <button className="btn-primary" onClick={openNew}>
          <Plus size={16} strokeWidth={2.5} /> Add Deal
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(220px, 1fr))`,
          gap: 14,
          overflowX: 'auto',
          paddingBottom: 8,
        }}
      >
        {COLUMNS.map((stage) => (
          <div key={stage} style={{ minWidth: 220 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 6px 12px',
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
                {stage}
                <span style={{ color: 'var(--muted)', fontWeight: 500 }}> · {byStage(stage).length}</span>
              </span>
              <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>{currency(columnTotal(stage))}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byStage(stage).length === 0 && (
                <div
                  style={{
                    border: '1px dashed var(--border)',
                    borderRadius: 12,
                    padding: '22px 12px',
                    textAlign: 'center',
                    color: 'var(--muted)',
                    fontSize: 12.5,
                  }}
                >
                  No deals
                </div>
              )}
              {byStage(stage).map((d) => (
                <div
                  key={d.id}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>
                      {d.title}
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="icon-btn" onClick={() => openEdit(d)} aria-label="Edit" style={{ width: 26, height: 26 }}>
                        <Pencil size={13} />
                      </button>
                      <button className="icon-btn danger" onClick={() => del(d)} aria-label="Delete" style={{ width: 26, height: 26 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{d.company}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginTop: 10 }}>
                    {currency(d.value)}
                  </div>
                  {d.closeDate && (
                    <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 4 }}>
                      Closes {formatDate(d.closeDate)}
                    </div>
                  )}
                  <select
                    className="input"
                    value={d.stage}
                    onChange={(e) => moveStage(d, e.target.value)}
                    style={{ marginTop: 12, padding: '8px 10px', fontSize: 12.5 }}
                  >
                    {DEAL_STAGES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add Deal' : 'Edit Deal'} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="field">
              <label>Deal Title</label>
              <input className="input" required autoFocus value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Acme — Annual Plan" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Company</label>
                <input className="input" value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc." />
              </div>
              <div className="field">
                <label>Contact</label>
                <input className="input" list="contact-options" value={form.contact}
                  onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Jane Doe" />
                <datalist id="contact-options">
                  {contacts.map((c) => <option key={c.id} value={c.name} />)}
                </datalist>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Stage</label>
                <select className="input" value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  {DEAL_STAGES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Value ($)</label>
                <input className="input" type="number" min="0" value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="24000" />
              </div>
            </div>
            <div className="field">
              <label>Expected Close Date</label>
              <input className="input" type="date" value={form.closeDate}
                onChange={(e) => setForm({ ...form, closeDate: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn-secondary" style={{ flex: 1 }}
                onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                {editing === 'new' ? 'Add Deal' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
