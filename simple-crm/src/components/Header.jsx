import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Search, Bell, Plus } from 'lucide-react'
import { useUI } from '../context/UIContext.jsx'

const titles = {
  '/dashboard': 'Dashboard',
  '/leads': 'Leads',
  '/contacts': 'Contacts',
  '/deals': 'Deals',
  '/meetings': 'Meetings',
  '/email': 'Email',
  '/settings': 'Settings',
}

const headerStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 5,
  display: 'flex',
  alignItems: 'center',
  gap: 20,
  padding: '18px 40px',
  background: 'rgba(17,17,18,0.7)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  borderBottom: '1px solid var(--border)',
}

const titleBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
}

const titleStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 20,
  fontWeight: 700,
  letterSpacing: '-0.01em',
}

const subtitleStyle = {
  fontSize: 12.5,
  color: 'var(--muted)',
  marginTop: 2,
}

const searchWrap = {
  marginLeft: 'auto',
  position: 'relative',
  width: 280,
}

const searchInputStyle = {
  width: '100%',
  padding: '10px 14px 10px 38px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
}

const searchIconStyle = {
  position: 'absolute',
  left: 12,
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--muted)',
}

const iconBtnStyle = {
  width: 38,
  height: 38,
  display: 'grid',
  placeItems: 'center',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  cursor: 'pointer',
  position: 'relative',
}

const dotStyle = {
  position: 'absolute',
  top: 9,
  right: 9,
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: 'var(--blue)',
  boxShadow: '0 0 8px var(--blue)',
}

const subtitles = {
  '/dashboard': "Welcome back — here's your overview.",
  '/leads': 'Track and qualify incoming leads.',
  '/contacts': 'Everyone you work with, in one place.',
  '/deals': 'Move deals through your pipeline.',
  '/meetings': 'Your upcoming calls and meetings.',
  '/email': 'Compose and send from the CRM.',
  '/settings': 'Manage your account and data.',
}

export default function Header() {
  const { pathname } = useLocation()
  const { search, setSearch, triggerNew } = useUI()
  const title = titles[pathname] || 'Dashboard'

  // Reset the shared search box whenever the page changes.
  useEffect(() => {
    setSearch('')
  }, [pathname, setSearch])

  return (
    <header style={headerStyle}>
      <div style={titleBlockStyle}>
        <h1 style={titleStyle}>{title}</h1>
        <span style={subtitleStyle}>{subtitles[pathname] || subtitles['/dashboard']}</span>
      </div>

      <div style={searchWrap}>
        <Search size={16} style={searchIconStyle} />
        <input
          style={searchInputStyle}
          placeholder="Search this page..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <button style={iconBtnStyle} aria-label="Notifications">
        <Bell size={17} />
        <span style={dotStyle} />
      </button>

      <button className="btn-primary" onClick={triggerNew}>
        <Plus size={16} strokeWidth={2.5} />
        New
      </button>
    </header>
  )
}
