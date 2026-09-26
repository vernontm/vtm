import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, LayoutDashboard,
  Mail, Calendar, Settings, LogOut,
  Eye, EyeOff, Building2, UserCog, X, UserPlus, Clock, BookOpen, CheckSquare, RotateCcw, Megaphone, Briefcase, MessageSquare, ListChecks, Sparkles, Wallet,
} from 'lucide-react';
import { usePrivacy } from '../context/PrivacyContext';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { useClient } from '../context/ClientContext';
import { useMobile } from '../App';

// ── Nav definitions ───────────────────────────────────────────────────────────
// Naming rewrite (audit item #9): trimmed to a mental model that reads as a
// customer journey: Home → People → Pipeline → Inbox → Calendar → Marketing
// → Work → Team → Workspace. Old paths kept intact so no route breaks.
//
// `info` is the information switch an item needs on top of its page grant
// (see ACCESS_INFO in ClientContext). An item whose role lacks the switch is
// not listed here and is not reachable by URL either, App.jsx gates the same
// pair on the route.
const nav = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Home',         slug: 'dashboard' },
  { to: '/leads',        icon: UserPlus,        label: 'Leads',        slug: 'leads' },
  { to: '/clients',      icon: Building2,       label: 'Clients',      slug: 'clients' },
  { to: '/projects',     icon: Briefcase,       label: 'Projects',     slug: 'projects' },
  { to: '/money',        icon: Wallet,          label: 'Money',        slug: 'money', info: 'money' },
  { to: '/inbox',        icon: MessageSquare,   label: 'Inbox',        slug: 'inbox' },
  { to: '/assistant',    icon: Sparkles,        label: 'Assistant',    slug: 'assistant' },
  { to: '/appointments', icon: Calendar,        label: 'Calendar',     slug: 'appointments' },
];

const navWork = [
  { to: '/tasks',        icon: ListChecks,      label: 'Tasks',        slug: 'tasks' },
  { to: '/todos',        icon: CheckSquare,     label: 'To-Do',        slug: 'todos' },
  { to: '/routines',     icon: RotateCcw,       label: 'Routines',     slug: 'routines' },
];

const navMarketing = [
  { to: '/marketing',     icon: Megaphone,  label: 'Marketing',     slug: 'marketing' },
  { to: '/contacts',      icon: Users,      label: 'Contacts',      slug: 'contacts' },
];

const navTeam = [
  { to: '/employees',    icon: UserCog,         label: 'Employees',    slug: 'employees', info: 'team_pay' },
  { to: '/time',         icon: Clock,           label: 'Time',         slug: 'time' },
  { to: '/employee-resources', icon: BookOpen,  label: 'Library',      slug: 'employee-resources' },
];

const navTools = [
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
  color: active ? 'var(--blue)' : 'var(--side-muted)',
  fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
  fontFamily: 'var(--font-display)',
});

export default function Sidebar() {

  const { hasPermission, isOwner, viewingAs, clearViewingAs } = useTeam();
  const { isAdmin, canAccess, can, user } = useClient();
  // A nav item is visible when the user has the legacy team permission (for
  // sub-team filtering), a page grant in their current client, and, where
  // the item declares one, the information switch their role carries.
  // Admins bypass all three.
  const canSee = (item) => hasPermission(item.slug) && canAccess(item.slug) && can(item.info);


  const { privacyMode, togglePrivacy } = usePrivacy();
  const { signOut } = useAuth();
  const { sidebarOpen } = useMobile();

  const visibleNav          = nav.filter(canSee);
  const visibleNavWork      = navWork.filter(canSee);
  const visibleNavTeam      = navTeam.filter(canSee);
  const visibleNavMarketing = navMarketing.filter(canSee);
  const visibleNavTools     = navTools.filter(canSee);

  return (
    <>
      <aside
        style={{
          width: 230, minWidth: 230,
          background: 'transparent',
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
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--side-text)', lineHeight: 1.2, fontFamily: 'var(--font-display)' }}>Vernon Tech</div>
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
                  <span style={{ flex: 1 }}>{label}</span>
                </NavLink>
              ))}
            </>
          )}

          {visibleNavWork.length > 0 && (
            <>
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 14 }}>Work</div>
              {visibleNavWork.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <Icon size={15} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </>
          )}

          {visibleNavTeam.length > 0 && (
            <>
              <div style={{ ...NAV_LABEL_STYLE, marginTop: 14 }}>Team</div>
              {visibleNavTeam.map(({ to, icon: Icon, label }) => (
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
                  <span>{label}</span>
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
                color: 'var(--blue)', fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-display)',
              }}>
                {user.email[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--side-text)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
