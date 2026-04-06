import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RefreshProvider, useRefresh } from './context/RefreshContext';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
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

function AppLayout() {
  const { refreshKey } = useRefresh();
  const { privacyMode } = usePrivacy();
  return (
    <div className={privacyMode ? 'privacy-mode' : ''} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a0a08' }}>
      <Sidebar />
      <main key={refreshKey} style={{ flex: 1, overflow: 'auto' }}>
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
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#4a4845', fontSize: 14, fontFamily: 'DM Mono, monospace' }}>Loading...</div>
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
