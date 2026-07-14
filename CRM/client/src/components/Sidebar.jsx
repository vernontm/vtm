import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, LayoutDashboard,
  Mail, Calendar, Settings, LogOut,
  Eye, EyeOff, Building2, UserCog, X, UserPlus,
} from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useClient } from '../context/ClientContext';
import { useMobile } from '../App';
import { getGmailInbox } from '../api';

// ── Nav definitions ───────────────────────────────────────────────────────────
const nav = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard',    slug: 'dashboard' },
  { to: '/leads',        icon: UserPlus,        label: 'Leads',        slug: 'leads' },
  { to: '/clients',      icon: Building2,       label: 'Clients',      slug: 'clients' },
  { to: '/projects',     icon: Briefcase,       label: 'Projects',     slug: 'projects' },
  { to: '/appointments', icon: Calendar,        label: 'Appointments', slug: 'appointments' },
  { to: '/employees',    icon: UserCog,         label: 'Employees',    slug: 'employees' },
];

const navMarketing = [
  { to: '/contacts',      icon: Users,      label: 'Contacts',      slug: 'contacts' },
];

const navTools = [
  { to: '/email',         icon: Mail,       label: 'Email',         slug: 'email' },
  { to: '/settings',      icon: Settings,   label: 'Settings',      slug: 'settings' },
];

const NAV_LABEL_STYLE = {
  padding: '4px 16px 6px',
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--side-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontFamily: 'var(--font-display)',
  opacity: 0.6,
};

const FOOTER_BTN = (active = false) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  width: '100%', padding: '8px 0', borderRadius: 10, cursor: 'pointer',
  background: active ? 'rgba(37,99,235,0.16)' : 'var(--side-hover)',
  border: active ? '1px solid rgba(37,99,235,0.35)' : '1px solid var(--side-border)',
  color: active ? '#60a5fa' : 'var(--side-muted)',
  fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
  fontFamily: 'var(--font-display)',
});

export default function Sidebar() {
  const [emailCount, setEmailCount] = useState(0);

  const { hasPermission, isOwner, viewingAs, clearViewingAs } = useTeam();
  const { isAdmin, canAccess, user } = useClient();
  // A nav item is visible when the user has BOTH legacy team permission
  // (for sub-team filtering) AND a page grant in their current client.
  // Admins bypass both.
  const canSee = (slug) => hasPermission(slug) && canAccess(slug);

  // Only fetch email count — notifications + search live in Header now
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

  const visibleNav          = nav.filter(item => canSee(item.slug));
  const visibleNavMarketing = navMarketing.filter(item => canSee(item.slug));
  const visibleNavTools     = navTools.filter(item => canSee(item.slug));

  return (
    <>
      <aside
        style={{
          width: 230, minWidth: 230,
          background: 'var(--side-bg)',
          borderRight: '1px solid var(--side-border)',
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
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--side-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
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
              <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>Vernon Tech</div>
              <div style={{ fontSize: 10, color: 'var(--side-muted)', fontFamily: 'var(--font-display)' }}>&amp; Media CRM</div>
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

          {visibleNavMarketing.length > 0 && (
            <>
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 14 }}>Marketing</div>
              {visibleNavMarketing.map(({ to, icon: Icon, label }) => (
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
                    <span style={{ background: 'var(--orange)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, lineHeight: '15px', fontFamily: 'var(--font-display)' }}>
                      {emailCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </>
          )}

        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--side-border)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          {user?.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(37,99,235,0.16)', border: '1px solid rgba(37,99,235,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#60a5fa', fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-display)',
              }}>
                {user.email[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email.split('@')[0]}
                </div>
                <div style={{ fontSize: 10, color: 'var(--side-muted)', fontFamily: 'var(--font-display)' }}>
                  {isAdmin ? 'Admin' : 'Team member'}
                </div>
              </div>
            </div>
          )}
          {!viewingAs && (
            <button onClick={togglePrivacy} style={FOOTER_BTN(privacyMode)}>
              {privacyMode ? <EyeOff size={13} /> : <Eye size={13} />}
              {privacyMode ? 'Privacy On' : 'Privacy Mode'}
            </button>
          )}
          {!viewingAs && (
            <button onClick={signOut} style={FOOTER_BTN(false)}>
              <LogOut size={13} />
              Sign Out
            </button>
          )}
          <div style={{ fontSize: 10, color: 'var(--side-muted)', textAlign: 'center', fontFamily: 'var(--font-display)', opacity: 0.5, paddingTop: 2 }}>
            Vernon Tech &amp; Media
          </div>
        </div>
      </aside>

    </>
  );
}
