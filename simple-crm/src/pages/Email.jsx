import { useState } from 'react'
import { Mail, Send, Info } from 'lucide-react'
import { useData } from '../context/DataContext.jsx'

// Demo email composer: in demo mode there is no mail provider wired up, so
// "sending" logs an activity and clears the form. Swap in Resend / Supabase
// Edge Functions here to send for real.
export default function Email() {
  const { contacts, logActivity } = useData()
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sent, setSent] = useState(false)

  function send(e) {
    e.preventDefault()
    logActivity('email', `Email "${subject || '(no subject)'}" sent to ${to}`)
    setSent(true)
    setTo('')
    setSubject('')
    setBody('')
    setTimeout(() => setSent(false), 2500)
  }

  return (
    <div className="fade-up" style={{ opacity: 1, maxWidth: 640 }}>
      <div
        className="card"
        style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 18, borderColor: 'rgba(59,130,246,0.25)' }}
      >
        <Info size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Demo composer. Messages are logged to your activity feed but not
          actually delivered. Connect an email provider (e.g. Resend) to send for real.
        </div>
      </div>

      <form className="card" onSubmit={send}>
        <div className="field">
          <label>To</label>
          <input className="input" required list="email-contacts" value={to}
            onChange={(e) => setTo(e.target.value)} placeholder="jane@company.com" />
          <datalist id="email-contacts">
            {contacts.filter((c) => c.email).map((c) => (
              <option key={c.id} value={c.email}>{c.name}</option>
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Subject</label>
          <input className="input" value={subject}
            onChange={(e) => setSubject(e.target.value)} placeholder="Following up on our conversation" />
        </div>
        <div className="field">
          <label>Message</label>
          <textarea className="input" style={{ minHeight: 160 }} value={body}
            onChange={(e) => setBody(e.target.value)} placeholder="Hi there,&#10;&#10;..." />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn-primary">
            <Send size={15} strokeWidth={2.5} /> Send
          </button>
          {sent && (
            <span className="pill pill-success">
              <Mail size={12} /> Logged to activity
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
