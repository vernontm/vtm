import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Users, Briefcase, Star, BarChart3, LayoutDashboard, RefreshCw,
  Mail, Calendar, Settings, Search, Bell, Receipt, StickyNote, CheckSquare, LogOut,
  Eye, EyeOff, FileText,
} from 'lucide-react';
import { useRefresh } from '../context/RefreshContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useAuth } from '../context/AuthContext';
import GlobalSearch from './GlobalSearch';
import { getNotifications } from '../api';

const nav = [
  { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads',          icon: Star,            label: 'Leads' },
  { to: '/contacts',       icon: Users,           label: 'Contacts' },
  { to: '/projects',       icon: Briefcase,       label: 'Projects' },
  { to: '/todos',          icon: CheckSquare,     label: 'Todo Board' },
  { to: '/blog',           icon: FileText,        label: 'Blog' },
];

const navTools = [
  { to: '/email',          icon: Mail,        label: 'Email' },
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
        style={{ width: 230, minWidth: 230, background: '#f0f2f8', borderRight: '1px solid #e5e7ef' }}
        className="flex flex-col h-full"
      >
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid #e5e7ef' }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', borderRadius: 8 }} className="flex items-center justify-center">
              <BarChart3 size={18} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1a2e', lineHeight: 1.2, fontFamily: 'Inter, sans-serif' }}>Vernon Tech</div>
              <div style={{ fontSize: 10, color: '#8e8ea0', fontFamily: 'Inter, sans-serif' }}>&amp; Media CRM</div>
            </div>
          </div>
        </div>

        {/* Search button */}
        <div style={{ padding: '10px 12px 4px' }}>
          <button
            onClick={() => setSearchOpen(true)}
            title="Search (Cmd+K)"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
              background: '#ffffff', border: '1px solid #e5e7ef',
              color: '#b0b0c0', fontSize: 12, transition: 'all 0.15s',
              textAlign: 'left', fontFamily: 'Inter, sans-serif',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4a6cf7'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7ef'; }}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>Search...</span>
            <span style={{ fontSize: 10, background: '#f0f2f8', border: '1px solid #e5e7ef', borderRadius: 4, padding: '1px 5px', color: '#8e8ea0' }}>Cmd+K</span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3" style={{ overflowY: 'auto' }}>
          <div style={{ padding: '4px 16px 8px', fontSize: 10, fontWeight: 600, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif' }}>
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

          <div style={{ padding: '12px 16px 8px', fontSize: 10, fontWeight: 600, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'Inter, sans-serif', marginTop: 4 }}>
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
                <span style={{ background: '#ff5c5c', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700, lineHeight: '14px' }}>
                  {notifCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7ef', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={togglePrivacy}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              background: privacyMode ? 'rgba(74,108,247,0.08)' : '#ffffff',
              border: privacyMode ? '1px solid rgba(74,108,247,0.3)' : '1px solid #e5e7ef',
              color: privacyMode ? '#4a6cf7' : '#8e8ea0',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
            }}
          >
            {privacyMode ? <EyeOff size={13} /> : <Eye size={13} />}
            {privacyMode ? 'Privacy On' : 'Privacy Mode'}
          </button>
          <button
            onClick={handleRefresh}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              background: '#ffffff', border: '1px solid #e5e7ef', color: '#8e8ea0',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
            }}
          >
            <RefreshCw size={13} style={{ transition: 'transform 0.7s', transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)' }} />
            Refresh All
          </button>
          <button
            onClick={signOut}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '7px 0', borderRadius: 8, cursor: 'pointer',
              background: '#ffffff', border: '1px solid #e5e7ef', color: '#8e8ea0',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
            }}
          >
            <LogOut size={13} />
            Sign Out
          </button>
          <div style={{ fontSize: 10, color: '#b0b0c0', textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
            Vernon Tech &amp; Media
          </div>
        </div>
      </aside>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
