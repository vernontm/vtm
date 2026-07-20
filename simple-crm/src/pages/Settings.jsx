import { RefreshCw, Trash2, Database, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useData } from '../context/DataContext.jsx'

export default function Settings() {
  const { user, demoMode } = useAuth()
  const { reseed, wipe, contacts, leads, deals, meetings } = useData()

  return (
    <div className="fade-up" style={{ opacity: 1, maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Account */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <User size={18} style={{ color: 'var(--blue)' }} />
          <h2 style={{ fontSize: 16 }}>Account</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="avatar" style={{ width: 46, height: 46, fontSize: 15 }}>
            {(user?.email?.[0] || 'U').toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}>{user?.email || 'Demo user'}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
              {demoMode ? 'Signed in (demo mode)' : 'Signed in via Supabase'}
            </div>
          </div>
        </div>
      </div>

      {/* Backend status */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Database size={18} style={{ color: 'var(--blue)' }} />
          <h2 style={{ fontSize: 16 }}>Backend</h2>
        </div>
        {demoMode ? (
          <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>
            Running in <strong style={{ color: 'var(--text)' }}>demo mode</strong> — all data lives in
            your browser (localStorage). No account or server required.
            <br />
            To go live, add <code style={{ color: '#3b82f6' }}>VITE_SUPABASE_URL</code> and{' '}
            <code style={{ color: '#3b82f6' }}>VITE_SUPABASE_ANON_KEY</code> to a{' '}
            <code style={{ color: '#3b82f6' }}>.env</code> file and restart the dev server. The app
            switches to Supabase auth automatically.
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>
            Connected to Supabase. Auth and data are served from your project.
          </div>
        )}
      </div>

      {/* Demo data controls */}
      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 6 }}>Demo Data</h2>
        <div style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          {contacts.length} contacts · {leads.length} leads · {deals.length} deals · {meetings.length} meetings
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => { if (confirm('Reset all demo data to the sample set?')) reseed() }}>
            <RefreshCw size={15} /> Reset to sample data
          </button>
          <button className="btn-secondary" style={{ color: '#ff6b6b' }}
            onClick={() => { if (confirm('Delete ALL data? This cannot be undone.')) wipe() }}>
            <Trash2 size={15} /> Clear everything
          </button>
        </div>
      </div>
    </div>
  )
}
