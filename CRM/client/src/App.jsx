import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RefreshProvider, useRefresh } from './context/RefreshContext';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientProvider, useClient } from './context/ClientContext';
// Gate a route by page slug. Admins bypass; anyone else needs the slug
// in their current client's allowed_pages. Blocked users are redirected
// to the dashboard (which is always allowed).
function Gated({ slug, adminOnly = false, children }) {
  const { isAdmin, canAccess } = useClient();
  if (adminOnly && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (!canAccess(slug)) return <Navigate to="/dashboard" replace />;
  return children;
}
import { RecorderProvider } from './context/RecorderContext';
import { TeamProvider } from './context/TeamContext';
import { UiProvider } from './context/UiContext';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import RecordingBar from './components/RecordingBar';
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
import Blog from './pages/Blog';
import EmailPage from './pages/Email';
import Subscriptions from './pages/Subscriptions';
import Portfolio from './pages/Portfolio';
import ContentScheduler from './pages/ContentScheduler';
import Avatars from './pages/Avatars';
import EmailMarketing from './pages/EmailMarketing';
import GlobalAgent from './components/GlobalAgent';
import ErrorBoundary from './components/ErrorBoundary';

// Academy Admin Pages
import AcademyDashboard from './pages/AcademyDashboard';
import AcademyCourses from './pages/AcademyCourses';
import AcademyCourseEdit from './pages/AcademyCourseEdit';
import AcademyLessonEdit from './pages/AcademyLessonEdit';
import AcademyStudents from './pages/AcademyStudents';
import AcademyHomework from './pages/AcademyHomework';
import AcademyMessages from './pages/AcademyMessages';
import AcademyCommunity from './pages/AcademyCommunity';
import AcademyRecommendations from './pages/AcademyRecommendations';
import AcademySettings from './pages/AcademySettings';
import Team from './pages/Team';
import AdminUsers from './pages/AdminUsers';
import Training from './pages/Training';
import Scripts from './pages/Scripts';
import Products from './pages/Products';
import Resources from './pages/Resources';

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
      <div className={privacyMode ? 'privacy-mode' : ''} style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Mobile hamburger */}
        <button className="mobile-hamburger" onClick={() => setSidebarOpen(true)}>
          <Menu size={20} />
        </button>

        {/* Sidebar overlay */}
        <div className={`sidebar-overlay${sidebarOpen ? ' sidebar-open' : ''}`} onClick={() => setSidebarOpen(false)} />

        <RecordingBar />
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Header />
          <main key={refreshKey} className="app-main" style={{ flex: 1, overflow: 'auto' }}>
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Gated slug="dashboard"><Dashboard /></Gated>} />
              <Route path="/leads" element={<Gated slug="leads"><Leads /></Gated>} />
              <Route path="/contacts" element={<Gated slug="contacts"><Contacts /></Gated>} />
              <Route path="/projects" element={<Gated slug="projects"><Deals /></Gated>} />
              <Route path="/meetings/:eventId" element={<Gated slug="meetings"><MeetingDetail /></Gated>} />
              <Route path="/meetings" element={<Gated slug="meetings"><Meetings /></Gated>} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/invoices" element={<Gated slug="invoices"><Invoices /></Gated>} />
              <Route path="/quick-notes" element={<Gated slug="quick-notes"><QuickNotes /></Gated>} />
              <Route path="/blog" element={<Gated slug="blog"><Blog /></Gated>} />
              <Route path="/email" element={<Gated slug="email"><EmailPage /></Gated>} />
              <Route path="/subscriptions" element={<Gated slug="subscriptions"><Subscriptions /></Gated>} />
              <Route path="/portfolio" element={<Gated slug="portfolio"><Portfolio /></Gated>} />
              <Route path="/content-scheduler" element={<Gated slug="content-scheduler"><ContentScheduler /></Gated>} />
              <Route path="/avatars" element={<Gated slug="avatars"><Avatars /></Gated>} />
              <Route path="/email-marketing" element={<Gated slug="email-marketing"><EmailMarketing /></Gated>} />
              <Route path="/settings" element={<Settings />} />
              {/* Academy Admin (admin-only) */}
              <Route path="/academy" element={<Gated slug="academy" adminOnly><AcademyDashboard /></Gated>} />
              <Route path="/academy/courses" element={<Gated slug="academy-courses" adminOnly><AcademyCourses /></Gated>} />
              <Route path="/academy/courses/:id/edit" element={<Gated slug="academy-courses" adminOnly><AcademyCourseEdit /></Gated>} />
              <Route path="/academy/lessons/:id/edit" element={<Gated slug="academy-courses" adminOnly><AcademyLessonEdit /></Gated>} />
              <Route path="/academy/students" element={<Gated slug="academy-students" adminOnly><AcademyStudents /></Gated>} />
              <Route path="/academy/homework" element={<Gated slug="academy-homework" adminOnly><AcademyHomework /></Gated>} />
              <Route path="/academy/messages" element={<Gated slug="academy-messages" adminOnly><AcademyMessages /></Gated>} />
              <Route path="/academy/community" element={<Gated slug="academy-community" adminOnly><AcademyCommunity /></Gated>} />
              <Route path="/academy/recommendations" element={<Gated slug="academy-recommendations" adminOnly><AcademyRecommendations /></Gated>} />
              <Route path="/academy/settings" element={<Gated slug="academy-settings" adminOnly><AcademySettings /></Gated>} />
              <Route path="/team" element={<Team />} />
              <Route path="/admin-users" element={<Gated slug="admin-users" adminOnly><AdminUsers /></Gated>} />
              <Route path="/training" element={<Gated slug="training"><Training /></Gated>} />
              <Route path="/scripts" element={<Gated slug="scripts"><Scripts /></Gated>} />
              <Route path="/products" element={<Gated slug="products"><Products /></Gated>} />
              <Route path="/resources" element={<Gated slug="resources"><Resources /></Gated>} />
            </Routes>
            </ErrorBoundary>
          </main>
          <GlobalAgent />
        </div>
      </div>
    </MobileContext.Provider>
  );
}

// Blocks app render until the /me call resolves. Shows a friendly message if
// the user has no client grants yet (common for a freshly created non-admin).
function ClientGate({ children }) {
  const { loading, error, clients, isAdmin, refresh } = useClient();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14, fontFamily: 'var(--font-display)' }}>Loading workspace...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Couldn't load your workspace</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{error}</div>
          <button onClick={refresh} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--orange)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </div>
      </div>
    );
  }
  if (!isAdmin && clients.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>No client access yet</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>Your account is active but hasn't been granted access to a client workspace. Please ask an admin to assign you.</div>
        </div>
      </div>
    );
  }
  return children;
}

function AuthGate() {
  const { session, loading, authError, retry } = useAuth();

  if (authError) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-display)' }}>
        <div style={{ maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', textAlign: 'center', boxShadow: '0 4px 40px rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Connection problem</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 18 }}>{authError}</div>
          <button onClick={retry} style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--muted)', fontSize: 14, fontFamily: 'var(--font-display)' }}>Loading...</div>
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <RefreshProvider>
      <PrivacyProvider>
        <ClientProvider>
          <TeamProvider>
            <RecorderProvider>
              <UiProvider>
                <ClientGate><AppLayout /></ClientGate>
              </UiProvider>
            </RecorderProvider>
          </TeamProvider>
        </ClientProvider>
      </PrivacyProvider>
    </RefreshProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename="/admin">
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
