import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, RefreshCw } from 'lucide-react';
import { useRefresh } from '../context/RefreshContext';
import { useUi } from '../context/UiContext';
import { getNotifications } from '../api';
import GlobalSearch from './GlobalSearch';

/* ── Page metadata map ────────────────────────────────────────────────────── */
const PAGE_META = {
  '/dashboard':                   { title: 'Dashboard',           sub: 'Overview of your business' },
  '/leads':                       { title: 'Leads',               sub: 'Track and manage your pipeline' },
  '/contacts':                    { title: 'Contacts',            sub: 'Your client & prospect database' },
  '/projects':                    { title: 'Projects',            sub: 'Active work & deliverables' },
  '/email':                       { title: 'Email',               sub: 'Inbox & communications' },
  '/meetings':                    { title: 'Meetings',            sub: 'Schedule & recordings' },
  '/invoices':                    { title: 'Invoices',            sub: 'Billing & payments' },
  '/subscriptions':               { title: 'Subscriptions',       sub: 'Recurring revenue' },
  '/quick-notes':                 { title: 'Quick Notes',         sub: 'Thoughts & reminders' },
  '/notifications':               { title: 'Notifications',       sub: 'Alerts & activity' },
  '/blog':                        { title: 'Blog',                sub: 'Content & publishing' },
  '/portfolio':                   { title: 'Portfolio',           sub: 'Showcase & case studies' },
  '/content-scheduler':           { title: 'Content',             sub: 'Social media scheduling' },
  '/email-marketing':             { title: 'Email Marketing',     sub: 'Campaigns & lists' },
  '/settings':                    { title: 'Settings',            sub: 'Account & preferences' },
  '/team':                        { title: 'Team & Access',       sub: 'Members & permissions' },
  '/training':                    { title: 'Training',            sub: 'Videos & resources' },
  '/scripts':                     { title: 'Call Scripts',        sub: 'Sales playbook' },
  '/products':                    { title: 'Products & Services', sub: 'Packages & pricing' },
  '/academy':                     { title: 'Academy',             sub: 'Course management' },
  '/academy/courses':             { title: 'Courses',             sub: 'Academy course library' },
  '/academy/students':            { title: 'Students',            sub: 'Enrolled members' },
  '/academy/homework':            { title: 'Homework',            sub: 'Submissions & reviews' },
  '/academy/messages':            { title: 'Messages',            sub: 'Student communications' },
  '/academy/community':           { title: 'Community',           sub: 'Discussion & posts' },
  '/academy/recommendations':     { title: 'Recommendations',     sub: 'Curated resources' },
  '/academy/settings':            { title: 'Academy Settings',    sub: 'Configuration' },
};

function getPageMeta(pathname) {
  // Exact match first
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  // Prefix match for dynamic segments (e.g. /meetings/abc, /academy/courses/123/edit)
  const match = Object.entries(PAGE_META)
    .filter(([k]) => pathname.startsWith(k + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]; // longest prefix wins
  return match?.[1] ?? { title: 'Vernon Tech & Media', sub: '' };
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { triggerRefresh } = useRefresh();
  const { pageActions } = useUi();

  const [searchOpen,  setSearchOpen]  = useState(false);
  const [notifCount,  setNotifCount]  = useState(0);
  const [spinning,    setSpinning]    = useState(false);

  const meta = getPageMeta(pathname);

  /* fetch notification count on every route change */
  useEffect(() => {
    getNotifications()
      .then(d => setNotifCount(d.total || 0))
      .catch(() => {});
  }, [pathname]);

  /* ⌘K → open search */
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function handleRefresh() {
    setSpinning(true);
    triggerRefresh();
    setTimeout(() => setSpinning(false), 800);
  }

  /* shared icon-button style */
  const iconBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, borderRadius: 8, flexShrink: 0,
    background: 'var(--surface)', border: '1px solid var(--border)',
    cursor: 'pointer', color: 'var(--muted)', transition: 'border-color 0.15s, color 0.15s',
  };

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 24px',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        gap: 16,
      }}>

        {/* ── Left: page title + subtitle ── */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 18, fontWeight: 800, color: 'var(--text)',
            fontFamily: 'var(--font-display)', lineHeight: 1.2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {meta.title}
          </div>
          {meta.sub && (
            <div style={{
              fontSize: 11, color: 'var(--muted)',
              fontFamily: 'var(--font-display)', marginTop: 1,
            }}>
              {meta.sub}
            </div>
          )}
        </div>

        {/* ── Right: page actions · search · bell · refresh ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

          {/* Page-specific action buttons injected by current route */}
          {pageActions && (
            <>
              {pageActions}
              <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
            </>
          )}

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            title="Search (⌘K)"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 11px', borderRadius: 8,
              background: 'var(--surface)', border: '1px solid var(--border)',
              color: 'var(--muted)', cursor: 'pointer', fontSize: 12,
              fontFamily: 'var(--font-display)', transition: 'border-color 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,155,38,0.4)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <Search size={13} style={{ flexShrink: 0 }} />
            <span>Search</span>
            <span style={{
              fontSize: 10, background: 'var(--surface-2)',
              border: '1px solid var(--border)', borderRadius: 4,
              padding: '1px 5px', color: 'var(--muted)',
              fontFamily: 'var(--font-display)', lineHeight: '15px',
            }}>⌘K</span>
          </button>

          {/* Notifications bell */}
          <button
            onClick={() => navigate('/notifications')}
            title="Notifications"
            style={{ ...iconBtn, position: 'relative' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,155,38,0.4)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <Bell size={14} />
            {notifCount > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                background: 'var(--red)', color: '#fff',
                borderRadius: 10, padding: '1px 5px',
                fontSize: 9, fontWeight: 700, lineHeight: '13px',
                boxShadow: '0 0 8px rgba(239,68,68,0.5)',
                fontFamily: 'var(--font-display)',
              }}>
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            title="Refresh all data"
            style={iconBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,155,38,0.4)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
          >
            <RefreshCw
              size={13}
              style={{
                transition: 'transform 0.7s',
                transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)',
              }}
            />
          </button>
        </div>
      </div>

      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
    </>
  );
}
