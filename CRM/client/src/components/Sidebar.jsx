import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, Star, LayoutDashboard, RefreshCw,
  Mail, Calendar, Settings, Search, Bell, Receipt, StickyNote, LogOut,
  Eye, EyeOff, FileText, CreditCard, FolderOpen, Film,
  GraduationCap, BookOpen, FileCheck, MessageSquare, Link2, Settings2, UserCog,
  Video, X, Package,
} from 'lucide-react';
import { useRefresh } from '../context/RefreshContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useMobile } from '../App';
import GlobalSearch from './GlobalSearch';
import { getNotifications, getGmailInbox } from '../api';

// ── Nav definitions ───────────────────────────────────────────────────────────
const nav = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard',       slug: 'dashboard' },
  { to: '/leads',             icon: Star,            label: 'Leads',            slug: 'leads' },
  { to: '/contacts',          icon: Users,           label: 'Contacts',         slug: 'contacts' },
  { to: '/projects',          icon: Briefcase,       label: 'Projects',         slug: 'projects' },
  { to: '/blog',              icon: FileText,        label: 'Blog',             slug: 'blog' },
  { to: '/portfolio',         icon: FolderOpen,      label: 'Portfolio',        slug: 'portfolio' },
  { to: '/content-scheduler', icon: Film,            label: 'Content',          slug: 'content-scheduler' },
  { to: '/email-marketing',   icon: Mail,            label: 'Email Marketing',  slug: 'email-marketing' },
];

const navTools = [
  { to: '/email',         icon: Mail,       label: 'Email',         slug: 'email' },
  { to: '/meetings',      icon: Calendar,   label: 'Meetings',      slug: 'meetings' },
  { to: '/invoices',      icon: Receipt,    label: 'Invoices',      slug: 'invoices' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions', slug: 'subscriptions' },
  { to: '/quick-notes',   icon: StickyNote, label: 'Quick Notes',   slug: 'quick-notes' },
  { to: '/notifications', icon: Bell,       label: 'Notifications', slug: 'notifications' },
  { to: '/settings',      icon: Settings,   label: 'Settings',      slug: 'settings' },
];

const navAcademy = [
  { to: '/academy',                 icon: GraduationCap, label: 'Academy',          slug: 'academy' },
  { to: '/academy/courses',         icon: BookOpen,      label: 'Courses',          slug: 'academy-courses' },
  { to: '/academy/students',        icon: Users,         label: 'Students',         slug: 'academy-students' },
  { to: '/academy/homework',        icon: FileCheck,     label: 'Homework',         slug: 'academy-homework' },
  { to: '/academy/messages',        icon: MessageSquare, label: 'Messages',         slug: 'academy-messages' },
  { to: '/academy/community',       icon: Users,         label: 'Community',        slug: 'academy-community' },
  { to: '/academy/recommendations', icon: Link2,         label: 'Recommendations',  slug: 'academy-recommendations' },
  { to: '/academy/settings',        icon: Settings2,     label: 'Academy Settings', slug: 'academy-settings' },
];

const NAV_LABEL_STYLE = {
  padding: '4px 16px 6px',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontFamily: 'var(--font-display)',
  opacity: 0.6,
};

const FOOTER_BTN = (active = false) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  width: '100%', padding: '8px 0', borderRadius: 10, cursor: 'pointer',
  background: active ? 'rgba(255,155,38,0.1)' : 'var(--surface-2)',
  border: active ? '1px solid rgba(255,155,38,0.3)' : '1px solid var(--border)',
  color: active ? 'var(--orange)' : 'var(--muted)',
  fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
  fontFamily: 'var(--font-display)',
});

export default function Sidebar() {
  const { triggerRefresh } = useRefresh();
  const [spinning, setSpinning]     = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [emailCount, setEmailCount] = useState(0);

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
        style={{
          width: 230, minWidth: 230,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
        }}
        className={`app-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}
      >
        {/* View As banner */}
        {viewingAs && (
          <div style={{
            background: 'linear-gradient(90deg, var(--orange), var(--orange-dark))',
            padding: '8px 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={12} color="#fff" />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>
                Viewing as {viewingAs.name || viewingAs.email}
              </span>
            </div>
            <button
              onClick={clearViewingAs}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', color: '#fff', fontSize: 10, fontWeight: 700 }}
            >
              <X size={10} /> Exit
            </button>
          </div>
        )}

        {/* Brand */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(255,155,38,0.3)',
              overflow: 'hidden',
            }}>
              <img
                src={import.meta.env.BASE_URL + 'vtm-icon.png'}
                alt="VTM"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>Vernon Tech</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>&amp; Media CRM</div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px 4px', flexShrink: 0 }}>
          <button
            onClick={() => setSearchOpen(true)}
            title="Search (Cmd+K)"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              color: 'var(--muted)', fontSize: 12.5, transition: 'all 0.15s',
              textAlign: 'left', fontFamily: 'var(--font-display)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,155,38,0.35)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Search...</span>
            <span style={{
              fontSize: 10,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '1px 6px',
              color: 'var(--muted)',
              fontFamily: 'var(--font-display)',
            }}>⌘K</span>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 8 }}>

          {visibleNav.length > 0 && (
            <>
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 4 }}>Workspace</div>
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
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 14 }}>Tools</div>
              {visibleNavTools.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {to === '/email' && emailCount > 0 && (
                    <span style={{ background: 'var(--orange)', color: 'var(--text)', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, lineHeight: '15px', fontFamily: 'var(--font-display)' }}>
                      {emailCount}
                    </span>
                  )}
                  {to === '/notifications' && notifCount > 0 && (
                    <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, lineHeight: '15px', boxShadow: '0 0 8px rgba(239,68,68,0.5)', fontFamily: 'var(--font-display)' }}>
                      {notifCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}

          {visibleNavAcademy.length > 0 && (
            <>
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 14 }}>Academy</div>
              {visibleNavAcademy.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={to === '/academy'} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <Icon size={15} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </>
          )}

          {(hasPermission('training') || hasPermission('scripts')) && (
            <>
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 14 }}>Training</div>
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
              <NavLink to="/products" className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                <Package size={15} />
                <span>Products &amp; Services</span>
              </NavLink>
            </>
          )}

          {isOwner && !viewingAs && (
            <>
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 14 }}>Admin</div>
              <NavLink to="/team" className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                <UserCog size={15} />
                <span>Team &amp; Access</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          {!viewingAs && (
            <button onClick={togglePrivacy} style={FOOTER_BTN(privacyMode)}>
              {privacyMode ? <EyeOff size={13} /> : <Eye size={13} />}
              {privacyMode ? 'Privacy On' : 'Privacy Mode'}
            </button>
          )}
          <button onClick={handleRefresh} style={FOOTER_BTN(false)}>
            <RefreshCw size={13} style={{ transition: 'transform 0.7s', transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)' }} />
            Refresh All
          </button>
          {!viewingAs && (
            <button onClick={signOut} style={FOOTER_BTN(false)}>
              <LogOut size={13} />
              Sign Out
            </button>
          )}
          <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', fontFamily: 'var(--font-display)', opacity: 0.5, paddingTop: 2 }}>
            Vernon Tech &amp; Media
          </div>
        </div>
      </aside>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
