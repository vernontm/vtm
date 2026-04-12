import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api';
import {
  LayoutDashboard, BookOpen, MessageSquare, Users,
  Link2, User, LogOut, Menu, X, Bell, Check,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/courses', icon: BookOpen, label: 'Courses' },
  { to: '/community', icon: Users, label: 'Community' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/recommendations', icon: Link2, label: 'Recommended' },
  { to: '/account', icon: User, label: 'Account' },
];

export default function Sidebar() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    loadNotifs();
    const iv = setInterval(loadNotifs, 30000);
    return () => clearInterval(iv);
  }, []);

  async function loadNotifs() {
    try {
      const data = await getNotifications();
      setNotifications(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function handleMarkRead(id) {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  }

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  }

  // Close notif dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const linkStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
    borderRadius: 10, fontSize: 14, fontWeight: isActive ? 600 : 400,
    color: isActive ? '#E8650A' : '#999',
    background: isActive ? 'rgba(232,101,10,0.1)' : 'transparent',
    textDecoration: 'none', transition: 'all 0.15s',
  });

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ padding: '20px 16px 24px', borderBottom: '1px solid var(--border)' }}>
        <img src="/Logo /VTM_logo.svg" alt="VTM" style={{ width: 40, height: 40, objectFit: 'contain' }} />
      </div>

      {/* Nav links */}
      <div style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            style={({ isActive }) => linkStyle(isActive)}
          >
            <Icon size={18} />
            <span>{label}</span>
            {label === 'Messages' && unreadCount > 0 && (
              <span style={{
                marginLeft: 'auto', background: '#E8650A', color: '#fff',
                borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
              }}>{unreadCount}</span>
            )}
          </NavLink>
        ))}
      </div>

      {/* Notification bell + Sign out */}
      <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
        {/* Notification bell */}
        <div ref={notifRef} style={{ position: 'relative', marginBottom: 4 }}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
              width: '100%', border: 'none', background: showNotifs ? 'rgba(232,101,10,0.1)' : 'transparent',
              color: showNotifs ? '#E8650A' : '#999', fontSize: 14, cursor: 'pointer',
              borderRadius: 10, fontFamily: 'inherit', position: 'relative',
            }}
          >
            <Bell size={18} />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span style={{
                marginLeft: 'auto', background: '#E8650A', color: '#fff',
                borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                minWidth: 20, textAlign: 'center',
              }}>{unreadCount}</span>
            )}
          </button>

          {/* Dropdown */}
          {showNotifs && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 8, right: 8,
              marginBottom: 4, background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, maxHeight: 360, overflow: 'hidden', zIndex: 100,
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
            }}>
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                  Notifications
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    style={{
                      background: 'none', border: 'none', color: '#E8650A',
                      fontSize: 11, cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No notifications yet
                  </div>
                ) : (
                  notifications.slice(0, 20).map(n => (
                    <div
                      key={n.id}
                      onClick={() => !n.read && handleMarkRead(n.id)}
                      style={{
                        padding: '10px 14px', borderBottom: '1px solid var(--border)',
                        cursor: n.read ? 'default' : 'pointer',
                        background: n.read ? 'transparent' : 'rgba(232,101,10,0.04)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        {!n.read && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%', background: '#E8650A',
                            flexShrink: 0, marginTop: 6,
                          }} />
                        )}
                        <div style={{ flex: 1 }}>
                          <p style={{
                            fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4,
                            fontWeight: n.read ? 400 : 500,
                          }}>{n.body || n.title}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                            {new Date(n.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={handleSignOut}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
            width: '100%', border: 'none', background: 'transparent',
            color: '#666', fontSize: 14, cursor: 'pointer', borderRadius: 10,
            fontFamily: 'inherit',
          }}
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="mobile-menu-btn"
        onClick={() => setMobileOpen(!mobileOpen)}
        style={{
          display: 'none', position: 'fixed', top: 12, left: 12, zIndex: 1001,
          width: 40, height: 40, borderRadius: 10, border: '1px solid var(--border)',
          background: 'var(--bg-surface)', color: '#f5f5f5', cursor: 'pointer',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 999, display: 'none',
          }}
          className="mobile-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}
        style={{
          width: 240, height: '100%', background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)', display: 'flex',
          flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
        }}
      >
        {sidebarContent}
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
          .mobile-overlay { display: block !important; }
          .sidebar {
            position: fixed !important;
            left: -260px;
            top: 0;
            z-index: 1000;
            transition: left 0.25s ease;
          }
          .sidebar-open {
            left: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
