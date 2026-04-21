import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, Star, LayoutDashboard, RefreshCw,
  Mail, Calendar, Settings, Receipt, StickyNote, LogOut,
  Eye, EyeOff, FileText, CreditCard, FolderOpen, Film,
  GraduationCap, BookOpen, FileCheck, MessageSquare, Link2, Settings2, UserCog,
  Video, X, Package, Bell, FileCode, Sparkles,
} from 'lucide-react';
import { useRefresh } from '../context/RefreshContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useMobile } from '../App';
import { getGmailInbox } from '../api';

// ── Nav definitions ───────────────────────────────────────────────────────────
const nav = [
  { to: '/dashboard',         icon: LayoutDashboard, label: 'Dashboard',       slug: 'dashboard' },
  { to: '/leads',             icon: Star,            label: 'Leads',            slug: 'leads' },
  { to: '/contacts',          icon: Users,           label: 'Contacts',         slug: 'contacts' },
  { to: '/projects',          icon: Briefcase,       label: 'Projects',         slug: 'projects' },
  { to: '/blog',              icon: FileText,        label: 'Blog',             slug: 'blog' },
  { to: '/portfolio',         icon: FolderOpen,      label: 'Portfolio',        slug: 'portfolio' },
  { to: '/resources',         icon: FileCode,        label: 'Resources',        slug: 'resources' },
  { to: '/content-scheduler', icon: Film,            label: 'Content',          slug: 'content-scheduler' },
  { to: '/avatars',           icon: Sparkles,        label: 'Avatars',          slug: 'avatars' },
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
  const [spinning, setSpinning]     = useState(false);
  const [emailCount, setEmailCount] = useState(0);

  const { hasPermission, isOwner, viewingAs, clearViewingAs } = useTeam();
  const { triggerRefresh } = useRefresh();

  function handleRefresh() {
    setSpinning(true);
    triggerRefresh();
    setTimeout(() => setSpinning(false), 800);
  }

  // Only fetch email count — notifications + refresh + search live in Header now
  useEffect(() => {
    const fetchCounts = () => {
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
          background: 'var(--bg)',
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
              overflow: 'hidden', padding: 4,
            }}>
              <img
                src={import.meta.env.BASE_URL + 'vtm-logo.svg'}
                alt="VTM"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>Vernon Tech</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-display)' }}>&amp; Media CRM</div>
            </div>
          </div>
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

    </>
  );
}
