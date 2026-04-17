import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RefreshProvider, useRefresh } from './context/RefreshContext';
import { PrivacyProvider, usePrivacy } from './context/PrivacyContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RecorderProvider } from './context/RecorderContext';
import { TeamProvider } from './context/TeamContext';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
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
import Todos from './pages/Todos';
import Blog from './pages/Blog';
import EmailPage from './pages/Email';
import Subscriptions from './pages/Subscriptions';
import Portfolio from './pages/Portfolio';
import Outreach from './pages/Outreach';
import ContentScheduler from './pages/ContentScheduler';
import YouTubeStudio from './pages/YouTubeStudio';
import EmailMarketing from './pages/EmailMarketing';
import GlobalAgent from './components/GlobalAgent';

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
import Training from './pages/Training';
import Scripts from './pages/Scripts';

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

        <RecordingBar />
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
              <Route path="/content-scheduler" element={<ContentScheduler />} />
              <Route path="/youtube" element={<YouTubeStudio />} />
              <Route path="/email-marketing" element={<EmailMarketing />} />
              <Route path="/settings" element={<Settings />} />
              {/* Academy Admin */}
              <Route path="/academy" element={<AcademyDashboard />} />
              <Route path="/academy/courses" element={<AcademyCourses />} />
              <Route path="/academy/courses/:id/edit" element={<AcademyCourseEdit />} />
              <Route path="/academy/lessons/:id/edit" element={<AcademyLessonEdit />} />
              <Route path="/academy/students" element={<AcademyStudents />} />
              <Route path="/academy/homework" element={<AcademyHomework />} />
              <Route path="/academy/messages" element={<AcademyMessages />} />
              <Route path="/academy/community" element={<AcademyCommunity />} />
              <Route path="/academy/recommendations" element={<AcademyRecommendations />} />
              <Route path="/academy/settings" element={<AcademySettings />} />
              <Route path="/team" element={<Team />} />
              <Route path="/training" element={<Training />} />
              <Route path="/scripts" element={<Scripts />} />
            </Routes>
          </main>
          <GlobalAgent />
        </div>
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
        <TeamProvider>
          <RecorderProvider>
            <AppLayout />
          </RecorderProvider>
        </TeamProvider>
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
