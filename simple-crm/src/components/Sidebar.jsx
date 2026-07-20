import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  UserPlus,
  Users,
  Briefcase,
  Calendar,
  Mail,
  Settings,
  Zap,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/leads', label: 'Leads', icon: UserPlus },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/deals', label: 'Deals', icon: Briefcase },
  { to: '/meetings', label: 'Meetings', icon: Calendar },
  { to: '/email', label: 'Email', icon: Mail },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const sidebarStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: 220,
  height: '100vh',
  background: 'var(--surface)',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
  padding: '22px 14px',
  zIndex: 10,
}

const brandStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 10px 22px',
  marginBottom: 10,
  borderBottom: '1px solid var(--border)',
}

const brandIconStyle = {
  width: 32,
  height: 32,
  borderRadius: 9,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  color: '#fff',
  boxShadow: '0 4px 14px rgba(59,130,246,0.3)',
}

const brandTextStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  fontSize: 15,
  letterSpacing: '-0.01em',
}

const navStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  marginTop: 8,
}

const navLabelStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  padding: '8px 12px 6px',
}

function linkStyle(isActive) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    fontFamily: 'var(--font-display)',
    fontSize: 13.5,
    fontWeight: 600,
    color: isActive ? '#fff' : 'var(--muted)',
    background: isActive
      ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(29,78,216,0.15))'
      : 'transparent',
    border: isActive
      ? '1px solid rgba(59,130,246,0.35)'
      : '1px solid transparent',
    transition: 'color 0.15s ease, background 0.15s ease, border-color 0.15s ease',
  }
}

const signOutButtonStyle = {
  marginTop: 10,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '10px 12px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--muted)',
  fontFamily: 'var(--font-display)',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
}

export default function Sidebar() {
  const { signOut, user } = useAuth()
  const email = user?.email || 'demo@vtm.crm'
  const displayName = email.split('@')[0].replace(/[._-]+/g, ' ')

  return (
    <aside style={sidebarStyle}>
      <div style={brandStyle}>
        <div style={brandIconStyle}>
          <Zap size={18} strokeWidth={2.5} />
        </div>
        <div style={brandTextStyle}>CRM</div>
      </div>

      <div style={navLabelStyle}>Workspace</div>
      <nav style={navStyle}>
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => linkStyle(isActive)}
            onMouseEnter={(e) => {
              if (!e.currentTarget.dataset.active) {
                e.currentTarget.style.color = 'var(--text)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.dataset.active) {
                e.currentTarget.style.color = 'var(--muted)'
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            {({ isActive }) => (
              <>
                <Icon size={17} strokeWidth={2} />
                <span>{label}</span>
                {isActive && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--blue)',
                      boxShadow: '0 0 8px var(--blue)',
                    }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', padding: '14px 10px 4px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px',
            borderRadius: 10,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 13,
              color: '#fff',
              textTransform: 'uppercase',
            }}
          >
            {email[0]}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 12.5,
                color: 'var(--text)',
                textTransform: 'capitalize',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {email}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={signOut}
          style={signOutButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text)'
            e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--muted)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          <LogOut size={15} strokeWidth={2} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
