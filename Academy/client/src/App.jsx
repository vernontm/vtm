import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Courses from './pages/Courses';
import CourseDetail from './pages/CourseDetail';
import LessonPlayer from './pages/LessonPlayer';
import Community from './pages/Community';
import Messages from './pages/Messages';
import Recommendations from './pages/Recommendations';
import Account from './pages/Account';

function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}>
        <div style={{
          width: 36, height: 36, border: '3px solid var(--border)',
          borderTopColor: '#E8650A', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)', padding: '24px 28px' }}>
        <Outlet />
      </main>
    </div>
  );
}

function PublicRoute() {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (session) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function LandingRoute() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0D0600',
      }}>
        <div style={{
          width: 36, height: 36, border: '3px solid #2a2a2a',
          borderTopColor: '#E8650A', borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    );
  }
  if (session) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <BrowserRouter basename="/academy">
      <AuthProvider>
        <Routes>
          {/* Landing page — shown when not logged in */}
          <Route path="/" element={<LandingRoute />} />

          {/* Public routes (login, signup, etc.) */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>

          {/* Protected routes */}
          <Route element={<AuthGate />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/courses" element={<Courses />} />
            <Route path="/courses/:slug" element={<CourseDetail />} />
            <Route path="/learn/:lessonId" element={<LessonPlayer />} />
            <Route path="/community" element={<Community />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/recommendations" element={<Recommendations />} />
            <Route path="/account" element={<Account />} />
          </Route>

          {/* Fallback — unauthenticated go to landing, authenticated go to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
