import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RefreshProvider, useRefresh } from './context/RefreshContext';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Leads from './pages/Leads';
import Contacts from './pages/Contacts';
import Deals from './pages/Deals';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Meetings from './pages/Meetings';
import MeetingDetail from './pages/MeetingDetail';
import Notifications from './pages/Notifications';
import Invoices from './pages/Invoices';
import QuickNotes from './pages/QuickNotes';
import Todos from './pages/Todos';
import Blog from './pages/Blog';
import EmailPage from './pages/Email';
import Subscriptions from './pages/Subscriptions';
import Portfolio from './pages/Portfolio';
import Outreach from './pages/Outreach';

export const MobileContext = createContext({ sidebarOpen: false, setSidebarOpen: () => {} });
export const useMobile = () => useContext(MobileContext);

function AppLayout() {
  const { refreshKey } = useRefresh();
  const { privacyMode } = usePrivacy();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change (mobile)
  React.useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <MobileContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      <div className={privacyMode ? 'privacy-mode' : ''} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f5f7fa' }}>
        {/* Mobile hamburger */}
        <button className="mobile-hamburger" onClick={() => setSidebarOpen(true)}>
          <Menu size={20} />
        </button>

        {/* Sidebar overlay */}
        <div className={`sidebar-overlay${sidebarOpen ? ' sidebar-open' : ''}`} onClick={() => setSidebarOpen(false)} />

        <Sidebar />
        <main key={refreshKey} className="app-main" style={{ flex: 1, overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/projects" element={<Deals />} />
            <Route path="/meetings/:eventId" element={<MeetingDetail />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/quick-notes" element={<QuickNotes />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/email" element={<EmailPage />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/outreach" element={<Outreach />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </MobileContext.Provider>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#8e8ea0', fontSize: 14, fontFamily: 'Inter, sans-serif' }}>Loading...</div>
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <RefreshProvider>
      <PrivacyProvider>
        <AppLayout />
      </PrivacyProvider>
    </RefreshProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}
