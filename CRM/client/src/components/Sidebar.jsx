import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, Star, Building2, FolderOpen, BarChart3, LayoutDashboard, RefreshCw,
  Mail, Calendar, Settings, Search, Bell, Receipt, StickyNote, CheckSquare, LogOut,
  Eye, EyeOff,
} from 'lucide-react';
import { useRefresh } from '../context/RefreshContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import { getNotifications } from '../api';

const nav = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/contacts',       icon: Users,           label: 'Contacts' },
  { to: '/deals',          icon: Briefcase,       label: 'Deals' },
  { to: '/leads',          icon: Star,            label: 'Leads' },
  { to: '/accounts',       icon: Building2,       label: 'Accounts' },
  { to: '/projects',       icon: FolderOpen,      label: 'Client Projects' },
  { to: '/todos',          icon: CheckSquare,     label: 'Todo Board' },
];

const navTools = [
  { to: '/meetings',       icon: Calendar,    label: 'Meetings' },
  { to: '/invoices',       icon: Receipt,     label: 'Invoices' },
  { to: '/quick-notes',    icon: StickyNote,  label: 'Quick Notes' },
  { to: '/notifications',  icon: Bell,        label: 'Notifications' },
  { to: '/settings',       icon: Settings,    label: 'Settings' },
];

export default function Sidebar() {
  const { triggerRefresh } = useRefresh();
  const [spinning, setSpinning]         = useState(false);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [notifCount, setNotifCount]     = useState(0);

  useEffect(() => {
    const fetchCount = () => {
      getNotifications().then(d => setNotifCount(d.total || 0)).catch(() => {});
    };
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
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

  return (
    <>
      <aside
        style={{ width: 220, minWidth: 220, background: '#111110', borderRight: '1px solid #252523' }}
        className="flex flex-col h-full"
      >
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #252523' }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #c8f135, #9ed420)', borderRadius: 8 }} className="flex items-center justify-center">
              <BarChart3 size={18} color="#0a0a08" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#e8e6df', lineHeight: 1.2, fontFamily: 'Syne, sans-serif' }}>Vernon Tech</div>
              <div style={{ fontSize: 10, color: '#4a4845', fontFamily: 'DM Mono, monospace' }}>&amp; Media CRM</div>
            </div>
          </div>
        </div>

        {/* Search button */}
        <div style={{ padding: '10px 12px 4px' }}>
          <button
            onClick={() => setSearchOpen(true)}
            title="Search (⌘K)"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              background: '#0a0a08', border: '1px solid #252523',
              color: '#4a4845', fontSize: 12, transition: 'color 0.15s, border-color 0.15s',
              textAlign: 'left', fontFamily: 'Syne, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e8e6df'; e.currentTarget.style.borderColor = 'rgba(200,241,53,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4a4845'; e.currentTarget.style.borderColor = '#252523'; }}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Search…</span>
            <span style={{ fontSize: 10, background: '#161614', border: '1px solid #252523', borderRadius: 4, padding: '1px 5px', fontFamily: 'DM Mono, monospace', color: '#4a4845' }}>⌘K</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3" style={{ overflowY: 'auto' }}>
          <div style={{ padding: '4px 16px 8px', fontSize: 10, fontWeight: 500, color: '#4a4845', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'DM Mono, monospace' }}>
            Workspace
          </div>
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            >
              <Icon size={15} />
              <span>{label}</span>
            </NavLink>
          ))}

          <div style={{ padding: '12px 16px 8px', fontSize: 10, fontWeight: 500, color: '#4a4845', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'DM Mono, monospace', marginTop: 4 }}>
            Tools
          </div>
          {navTools.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            >
              <Icon size={15} />
              <span style={{ flex: 1 }}>{label}</span>
              {to === '/notifications' && notifCount > 0 && (
                <span style={{ background: '#ff5c5c', color: '#0a0a08', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800, lineHeight: '14px', fontFamily: 'DM Mono, monospace' }}>
                  {notifCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #252523', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={togglePrivacy}
            title={privacyMode ? 'Disable Privacy Mode' : 'Enable Privacy Mode'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              background: privacyMode ? 'rgba(200,241,53,0.08)' : '#0a0a08',
              border: privacyMode ? '1px solid rgba(200,241,53,0.35)' : '1px solid #252523',
              color: privacyMode ? '#c8f135' : '#4a4845',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              fontFamily: 'Syne, sans-serif',
            }}
            onMouseEnter={e => { if (!privacyMode) { e.currentTarget.style.color = '#e8e6df'; e.currentTarget.style.borderColor = '#c8f135'; } }}
            onMouseLeave={e => { if (!privacyMode) { e.currentTarget.style.color = '#4a4845'; e.currentTarget.style.borderColor = '#252523'; } }}
          >
            {privacyMode ? <EyeOff size={13} /> : <Eye size={13} />}
            {privacyMode ? 'Privacy On' : 'Privacy Mode'}
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh all data"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              background: '#0a0a08', border: '1px solid #252523', color: '#4a4845',
              fontSize: 12, fontWeight: 600, transition: 'color 0.15s, border-color 0.15s',
              fontFamily: 'Syne, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#e8e6df'; e.currentTarget.style.borderColor = '#c8f135'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4a4845'; e.currentTarget.style.borderColor = '#252523'; }}
          >
            <RefreshCw size={13} style={{ transition: 'transform 0.7s', transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)' }} />
            Refresh All
          </button>
          <button
            onClick={signOut}
            title="Sign out"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              background: '#0a0a08', border: '1px solid #252523', color: '#4a4845',
              fontSize: 12, fontWeight: 600, transition: 'color 0.15s, border-color 0.15s',
              fontFamily: 'Syne, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff5c5c'; e.currentTarget.style.borderColor = '#ff5c5c'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#4a4845'; e.currentTarget.style.borderColor = '#252523'; }}
          >
            <LogOut size={13} />
            Sign Out
          </button>
          <div style={{ fontSize: 10, color: '#4a4845', textAlign: 'center', fontFamily: 'DM Mono, monospace' }}>
            Vernon Tech &amp; Media
          </div>
        </div>
      </aside>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
