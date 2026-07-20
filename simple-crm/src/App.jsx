import { Routes, Route, Navigate } from 'react-router-dom'
import { Zap } from 'lucide-react'
import Sidebar from './components/Sidebar.jsx'
import Header from './components/Header.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Leads from './pages/Leads.jsx'
import Contacts from './pages/Contacts.jsx'
import Deals from './pages/Deals.jsx'
import Meetings from './pages/Meetings.jsx'
import Email from './pages/Email.jsx'
import Settings from './pages/Settings.jsx'
import Login from './pages/Login.jsx'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { DataProvider } from './context/DataContext.jsx'
import { UIProvider } from './context/UIContext.jsx'

const layoutStyle = {
  display: 'flex',
  minHeight: '100vh',
}

const mainStyle = {
  flex: 1,
  marginLeft: 220,
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
}

const contentStyle = {
  flex: 1,
  width: '100%',
  maxWidth: 1200,
  margin: '0 auto',
  padding: '32px 40px 56px',
}

const loadingStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--bg)',
}

const loadingInnerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 14,
}

const loadingIconStyle = {
  width: 44,
  height: 44,
  borderRadius: 12,
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  color: '#fff',
  boxShadow: '0 8px 22px rgba(59,130,246,0.3)',
}

const loadingTextStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
}

function LoadingScreen() {
  return (
    <div style={loadingStyle}>
      <div style={loadingInnerStyle} className="fade-up">
        <div style={loadingIconStyle}>
          <Zap size={22} strokeWidth={2.5} />
        </div>
        <div style={loadingTextStyle}>VTM CRM</div>
      </div>
    </div>
  )
}

function AppShell() {
  return (
    <DataProvider>
      <UIProvider>
        <div style={layoutStyle}>
          <Sidebar />
          <div style={mainStyle}>
            <Header />
            <main style={contentStyle}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/deals" element={<Deals />} />
                <Route path="/meetings" element={<Meetings />} />
                <Route path="/email" element={<Email />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </main>
          </div>
        </div>
      </UIProvider>
    </DataProvider>
  )
}

function AppRoutes() {
  const { session, loading } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session) return <Login />
  return <AppShell />
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
