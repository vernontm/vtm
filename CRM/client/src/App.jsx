import React, { useState, createContext, useContext, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RefreshProvider, useRefresh } from './context/RefreshContext';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ClientProvider, useClient } from './context/ClientContext';
// Gate a route by page slug. Admins bypass; anyone else needs the slug
// in their current client's allowed_pages. Blocked users get a friendly
// /no-access page so they know *why* they can't see something (instead of
// a silent redirect, which looks like a bug).
function Gated({ slug, adminOnly = false, children }) {
  const { isAdmin, canAccess } = useClient();
  if (adminOnly && !isAdmin) return <Navigate to={`/no-access?page=${encodeURIComponent(slug || 'page')}&reason=admin`} replace />;
  if (!canAccess(slug)) return <Navigate to={`/no-access?page=${encodeURIComponent(slug || 'page')}`} replace />;
  return children;
}

// Where "/" lands: the first page the user can actually open, in nav order.
// (Dashboard now respects the grant, so someone without it lands on Leads,
// Appointments, etc. instead of bouncing to a no-access screen.)
const LANDING_ORDER = [
  ['dashboard', '/dashboard'], ['leads', '/leads'], ['clients', '/clients'],
  ['projects', '/projects'], ['appointments', '/appointments'], ['todos', '/todos'],
  ['routines', '/routines'], ['email', '/email'], ['time', '/time'],
  ['employee-resources', '/employee-resources'], ['contacts', '/contacts'], ['settings', '/settings'],
];
function Landing() {
  const { loading, canAccess } = useClient();
  if (loading) return null;
  const target = LANDING_ORDER.find(([slug]) => canAccess(slug));
  return <Navigate to={target ? target[1] : '/settings'} replace />;
}

function NoAccess() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') || 'this page';
  const reason = params.get('reason');
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 440, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 32px', textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>Access required</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16 }}>
          {reason === 'admin'
            ? <>The <strong>{page}</strong> page is admin-only.</>
            : <>You don't have access to <strong>{page}</strong>.</>}
          <br />Ask your admin to enable it for your account.
        </div>
        <button
          onClick={() => { window.location.href = '/admin/'; }}
          style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--orange)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}
        >
          Go to my pages
        </button>
      </div>
    </div>
  );
}
import { RecorderProvider } from './context/RecorderContext';
import { TeamProvider } from './context/TeamContext';
import { UiProvider } from './context/UiContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import RecordingBar from './components/RecordingBar';
import Login from './pages/Login';
import Contacts from './pages/Contacts';
import Deals from './pages/Deals';
import Clients from './pages/Clients';
import Projects from './pages/Projects';
import Dashboard from './pages/Dashboard';
import Time from './pages/Time';
import EmployeeResources from './pages/EmployeeResources';
import TeamTodos from './pages/TeamTodos';
import Routines from './pages/Routines';
import Settings from './pages/Settings';
import Meetings from './pages/Meetings';
import MeetingDetail from './pages/MeetingDetail';
import Notifications from './pages/Notifications';
import QuickNotes from './pages/QuickNotes';
import Blog from './pages/Blog';
import EmailPage from './pages/Email';
import Portfolio from './pages/Portfolio';
import Subscribers from './pages/Subscribers';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

// Heavy routes — code-split so they don't ship on first paint.
const ContentScheduler = lazy(() => import('./pages/ContentScheduler'));
const Avatars = lazy(() => import('./pages/Avatars'));
const EmailMarketing = lazy(() => import('./pages/EmailMarketing'));

// Academy Admin Pages (admin-only, never loaded for non-admins)
const AcademyDashboard = lazy(() => import('./pages/AcademyDashboard'));
const AcademyCourses = lazy(() => import('./pages/AcademyCourses'));
const AcademyCourseEdit = lazy(() => import('./pages/AcademyCourseEdit'));
const AcademyLessonEdit = lazy(() => import('./pages/AcademyLessonEdit'));
const AcademyStudents = lazy(() => import('./pages/AcademyStudents'));
const AcademyHomework = lazy(() => import('./pages/AcademyHomework'));
const AcademyMessages = lazy(() => import('./pages/AcademyMessages'));
const AcademyCommunity = lazy(() => import('./pages/AcademyCommunity'));
const AcademyRecommendations = lazy(() => import('./pages/AcademyRecommendations'));
const AcademySettings = lazy(() => import('./pages/AcademySettings'));

const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const Training = lazy(() => import('./pages/Training'));
const Scripts = lazy(() => import('./pages/Scripts'));
const Products = lazy(() => import('./pages/Products'));
const Resources = lazy(() => import('./pages/Resources'));

function RouteFallback() {
  return (
    <div style={{ padding: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 13 }}>
      Loading…
    </div>
  );
}

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
        {/* Sidebar overlay */}
        <div className={`sidebar-overlay${sidebarOpen ? ' sidebar-open' : ''}`} onClick={() => setSidebarOpen(false)} />

        <RecordingBar />
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Header />
          <main key={refreshKey} className="app-main" style={{ flex: 1, overflow: 'auto' }}>
            <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/no-access" element={<NoAccess />} />
              <Route path="/dashboard" element={<Gated slug="dashboard"><Dashboard /></Gated>} />
              {/* ── New lean CRM (Phase 1) ── */}
              <Route path="/leads" element={<Gated slug="leads"><Clients kind="lead" /></Gated>} />
              <Route path="/clients" element={<Gated slug="clients"><Clients kind="client" /></Gated>} />
              <Route path="/projects" element={<Gated slug="projects"><Projects /></Gated>} />
              <Route path="/appointments" element={<Gated slug="appointments"><Meetings /></Gated>} />
              <Route path="/appointments/:eventId" element={<Gated slug="appointments"><MeetingDetail /></Gated>} />
              <Route path="/employees" element={<Gated slug="employees" adminOnly><AdminUsers /></Gated>} />
              <Route path="/time" element={<Gated slug="time"><Time /></Gated>} />
              <Route path="/todos" element={<Gated slug="todos"><TeamTodos /></Gated>} />
              <Route path="/routines" element={<Gated slug="routines"><Routines /></Gated>} />
              <Route path="/employee-resources" element={<Gated slug="employee-resources"><EmployeeResources /></Gated>} />
              {/* ── Legacy routes (hidden from nav, kept reachable) ── */}
              <Route path="/contacts" element={<Gated slug="contacts"><Contacts /></Gated>} />
              <Route path="/deals" element={<Gated slug="projects"><Deals /></Gated>} />
              <Route path="/meetings/:eventId" element={<Gated slug="meetings"><MeetingDetail /></Gated>} />
              <Route path="/meetings" element={<Gated slug="meetings"><Meetings /></Gated>} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/quick-notes" element={<Gated slug="quick-notes"><QuickNotes /></Gated>} />
              <Route path="/blog" element={<Gated slug="blog"><Blog /></Gated>} />
              <Route path="/email" element={<Gated slug="email"><EmailPage /></Gated>} />
              <Route path="/portfolio" element={<Gated slug="portfolio"><Portfolio /></Gated>} />
              <Route path="/content-scheduler" element={<Gated slug="content-scheduler"><ContentScheduler /></Gated>} />
              <Route path="/avatars" element={<Gated slug="avatars"><Avatars /></Gated>} />
              <Route path="/email-marketing" element={<Gated slug="email-marketing"><EmailMarketing /></Gated>} />
              <Route path="/subscribers" element={<Gated slug="subscribers"><Subscribers /></Gated>} />
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
              {/* /team retired — redirect any bookmarks to the new Users & Access page */}
              <Route path="/team" element={<Navigate to="/admin-users" replace />} />
              <Route path="/admin-users" element={<Gated slug="admin-users" adminOnly><AdminUsers /></Gated>} />
              <Route path="/training" element={<Gated slug="training"><Training /></Gated>} />
              <Route path="/scripts" element={<Gated slug="scripts"><Scripts /></Gated>} />
              <Route path="/products" element={<Gated slug="products"><Products /></Gated>} />
              <Route path="/resources" element={<Gated slug="resources"><Resources /></Gated>} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </main>
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
      <ToastProvider>
        <BrowserRouter basename="/admin">
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}
