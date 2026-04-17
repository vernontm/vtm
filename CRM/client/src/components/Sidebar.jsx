import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, Star, LayoutDashboard, RefreshCw,
  Mail, Calendar, Settings, Search, Bell, Receipt, StickyNote, CheckSquare, LogOut,
  Eye, EyeOff, FileText, CreditCard, FolderOpen, Zap, Film,
  GraduationCap, BookOpen, FileCheck, MessageSquare, Link2, Settings2, UserCog,
  Video, X,
} from 'lucide-react';
import { useRefresh } from '../context/RefreshContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useMobile } from '../App';
import GlobalSearch from './GlobalSearch';
import { getNotifications, getGmailInbox } from '../api';

// ── Nav definitions with permission slugs ────────────────────────────────────
const nav = [
  { to: '/dashboard',          icon: LayoutDashboard, label: 'Dashboard',        slug: 'dashboard' },
  { to: '/leads',              icon: Star,            label: 'Leads',             slug: 'leads' },
  { to: '/contacts',           icon: Users,           label: 'Contacts',          slug: 'contacts' },
  { to: '/projects',           icon: Briefcase,       label: 'Projects',          slug: 'projects' },
  { to: '/todos',              icon: CheckSquare,     label: 'Todo Board',        slug: 'todos' },
  { to: '/blog',               icon: FileText,        label: 'Blog',              slug: 'blog' },
  { to: '/portfolio',          icon: FolderOpen,      label: 'Portfolio',         slug: 'portfolio' },
  { to: '/content-scheduler',  icon: Film,            label: 'Content',           slug: 'content-scheduler' },
  { to: '/email-marketing',    icon: Mail,            label: 'Email Marketing',   slug: 'email-marketing' },
];

const navTools = [
  { to: '/email',          icon: Mail,        label: 'Email',          slug: 'email' },
  { to: '/meetings',       icon: Calendar,    label: 'Meetings',       slug: 'meetings' },
  { to: '/invoices',       icon: Receipt,     label: 'Invoices',       slug: 'invoices' },
  { to: '/subscriptions',  icon: CreditCard,  label: 'Subscriptions',  slug: 'subscriptions' },
  { to: '/quick-notes',    icon: StickyNote,  label: 'Quick Notes',    slug: 'quick-notes' },
  { to: '/notifications',  icon: Bell,        label: 'Notifications',  slug: 'notifications' },
  { to: '/settings',       icon: Settings,    label: 'Settings',       slug: 'settings' },
];

const navAcademy = [
  { to: '/academy',                    icon: GraduationCap,  label: 'Academy',           slug: 'academy' },
  { to: '/academy/courses',            icon: BookOpen,       label: 'Courses',            slug: 'academy-courses' },
  { to: '/academy/students',           icon: Users,          label: 'Students',           slug: 'academy-students' },
  { to: '/academy/homework',           icon: FileCheck,      label: 'Homework',           slug: 'academy-homework' },
  { to: '/academy/messages',           icon: MessageSquare,  label: 'Messages',           slug: 'academy-messages' },
  { to: '/academy/community',          icon: Users,          label: 'Community',          slug: 'academy-community' },
  { to: '/academy/recommendations',    icon: Link2,          label: 'Recommendations',    slug: 'academy-recommendations' },
  { to: '/academy/settings',           icon: Settings2,      label: 'Academy Settings',   slug: 'academy-settings' },
];

export default function Sidebar() {
  const { triggerRefresh } = useRefresh();
  const [spinning, setSpinning]         = useState(false);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [notifCount, setNotifCount]     = useState(0);
  const [emailCount, setEmailCount]     = useState(0);

  const { hasPermission, isOwner, viewingAs, clearViewingAs } = useTeam();

  useEffect(() => {
    const fetchCounts = () => {
      getNotifications().then(d => setNotifCount(d.total || 0)).catch(() => {});
      getGmailInbox({ maxResults: '10' }).then(d => {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recent = (d?.messages || []).filter(m => {
          const date = new Date(m.date);
          return date.getTime() > dayAgo && !(m.crmLabels || []).includes('spam');
        });
        setEmailCount(recent.length);
      }).catch(() => {});
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 60000);
    return () => clearInterval(interval);
  }, []);

  function handleRefresh() {
    setSpinning(true);
    triggerRefresh();
    setTimeout(() => setSpinning(false), 700);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { privacyMode, togglePrivacy } = usePrivacy();
  const { signOut } = useAuth();
  const { sidebarOpen } = useMobile();

  const visibleNav        = nav.filter(item => hasPermission(item.slug));
  const visibleNavTools   = navTools.filter(item => hasPermission(item.slug));
  const visibleNavAcademy = navAcademy.filter(item => hasPermission(item.slug));

  return (
    <>
      <aside
        style={{ width: 230, minWidth: 230, background: '#0a0a12', borderRight: '1px solid #1e1e2e', display: 'flex', flexDirection: 'column' }}
        className={`app-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}
      >
        {/* View As banner */}
        {viewingAs && (
          <div style={{
            background: 'linear-gradient(90deg, #F59E0B, #D97706)',
            padding: '8px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={12} color="#fff" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                Viewing as {viewingAs.name || viewingAs.email}
              </span>
            </div>
            <button
              onClick={clearViewingAs}
              style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', color: '#fff', fontSize: 10, fontWeight: 700 }}
            >
              <X size={10} /> Exit
            </button>
          </div>
        )}

        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #1e1e2e', flexShrink: 0 }}>
          <div className="flex items-center gap-2">
            <img src={import.meta.env.BASE_URL + 'vtm-icon.png'} alt="VTM" style={{ width:32, height:32, borderRadius:8, objectFit:'cover' }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', lineHeight: 1.2, fontFamily: 'Inter, sans-serif' }}>Vernon Tech</div>
              <div style={{ fontSize: 10, color: '#6b6b80', fontFamily: 'Inter, sans-serif' }}>&amp; Media CRM</div>
            </div>
          </div>
        </div>

        {/* Search button */}
        <div style={{ padding: '10px 12px 4px', flexShrink: 0 }}>
          <button
            onClick={() => setSearchOpen(true)}
            title="Search (Cmd+K)"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              background: '#14141f', border: '1px solid #2a2a3d',
              color: '#6b6b80', fontSize: 12, transition: 'all 0.15s',
              textAlign: 'left', fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a6cf7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a3d'; }}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Search...</span>
            <span style={{ fontSize: 10, background: '#1e1e2e', border: '1px solid #2a2a3d', borderRadius: 4, padding: '1px 5px', color: '#6b6b80' }}>Cmd+K</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3" style={{ overflowY: 'auto' }}>
          {visibleNav.length > 0 && (
            <>
              <div style={{ padding: '4px 16px 8px', fontSize: 10, fontWeight: 600, color: '#505068', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif' }}>
                Workspace
              </div>
              {visibleNav.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <Icon size={15} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </>
          )}

          {visibleNavTools.length > 0 && (
            <>
              <div style={{ padding: '12px 16px 8px', fontSize: 10, fontWeight: 600, color: '#505068', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
                Tools
              </div>
              {visibleNavTools.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {to === '/email' && emailCount > 0 && (
                    <span style={{ background: '#4a6cf7', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, lineHeight: '14px' }}>
                      {emailCount}
                    </span>
                  )}
                  {to === '/notifications' && notifCount > 0 && (
                    <span style={{ background: '#ff5c5c', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, lineHeight: '14px' }}>
                      {notifCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}

          {visibleNavAcademy.length > 0 && (
            <>
              <div style={{ padding: '12px 16px 8px', fontSize: 10, fontWeight: 600, color: '#505068', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
                Academy
              </div>
              {visibleNavAcademy.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={to === '/academy'} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <Icon size={15} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </>
          )}

          {/* Training — visible to all with permission */}
          {(hasPermission('training') || hasPermission('scripts')) && (
            <>
              <div style={{ padding: '12px 16px 8px', fontSize: 10, fontWeight: 600, color: '#505068', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
                Training
              </div>
              {hasPermission('training') && (
                <NavLink to="/training" className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <Video size={15} />
                  <span>Training Videos</span>
                </NavLink>
              )}
              {hasPermission('scripts') && (
                <NavLink to="/scripts" className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <FileText size={15} />
                  <span>Call Scripts</span>
                </NavLink>
              )}
            </>
          )}

          {/* Team — owner only, not shown in viewingAs mode */}
          {isOwner && !viewingAs && (
            <>
              <div style={{ padding: '12px 16px 8px', fontSize: 10, fontWeight: 600, color: '#505068', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
                Admin
              </div>
              <NavLink to="/team" className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                <UserCog size={15} />
                <span>Team &amp; Access</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #1e1e2e', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {!viewingAs && (
            <button
              onClick={togglePrivacy}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                background: privacyMode ? 'rgba(74,108,247,0.15)' : '#14141f',
                border: privacyMode ? '1px solid rgba(74,108,247,0.3)' : '1px solid #2a2a3d',
                color: privacyMode ? '#4a6cf7' : '#6b6b80',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
              }}
            >
              {privacyMode ? <EyeOff size={13} /> : <Eye size={13} />}
              {privacyMode ? 'Privacy On' : 'Privacy Mode'}
            </button>
          )}
          <button
            onClick={handleRefresh}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              background: '#14141f', border: '1px solid #2a2a3d', color: '#6b6b80',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
            }}
          >
            <RefreshCw size={13} style={{ transition: 'transform 0.7s', transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)' }} />
            Refresh All
          </button>
          {!viewingAs && (
            <button
              onClick={signOut}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                background: '#14141f', border: '1px solid #2a2a3d', color: '#6b6b80',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
              }}
            >
              <LogOut size={13} />
              Sign Out
            </button>
          )}
          <div style={{ fontSize: 10, color: '#505068', textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
            Vernon Tech &amp; Media
          </div>
        </div>
      </aside>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
