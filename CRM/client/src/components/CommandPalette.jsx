import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import {
  Home, Users, Briefcase, Mail, Calendar, FileText, FolderOpen, Settings, Plus, Send, Search,
  BookOpen, CheckSquare, Clock, LayoutGrid,
} from 'lucide-react';
import { useCompose } from '../context/ComposeContext';
import { useScheduleMeeting } from '../context/ScheduleMeetingContext';

// ─────────────────────────────────────────────────────────────
// Command Palette (⌘K / Ctrl+K)
//
// Table-stakes for any modern SaaS. Keeps the sidebar quiet by
// making everything reachable in three keystrokes. Groups:
//   • Navigate   — jump to any top-level page
//   • Create     — new lead / new project / new meeting / new email
//   • Search     — find something (contact, deal, project)
//   • Recent     — the last few things you looked at (localStorage)
//
// Extend `useCommands()` with new items as the app grows.
// ─────────────────────────────────────────────────────────────

const RECENT_KEY = 'vtm-cmdk-recent-v1';

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const compose = useCompose();
  const schedule = useScheduleMeeting();

  // Global hotkey
  useEffect(() => {
    const onKey = (e) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const recordRecent = (item) => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const prev = raw ? JSON.parse(raw) : [];
      const next = [item, ...prev.filter(x => x.id !== item.id)].slice(0, 6);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  const runAction = (item) => {
    recordRecent({ id: item.id, label: item.label, group: item.group });
    setOpen(false);
    item.action?.();
  };

  const groups = useCommands({ navigate, compose, schedule });
  const recent = useMemo(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9990,
          background: 'rgba(15, 17, 22, 0.42)',
          backdropFilter: 'blur(2px)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity var(--dur-base, 220ms) var(--ease-out, cubic-bezier(0.4,0,0.2,1))',
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', top: '15vh', left: '50%',
        transform: `translateX(-50%) scale(${open ? 1 : 0.97})`,
        transition: 'transform var(--dur-base, 220ms) var(--ease-out, cubic-bezier(0.4,0,0.2,1)), opacity var(--dur-base, 220ms)',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        zIndex: 9991,
        width: 560, maxWidth: '92vw',
      }}>
        <Command
          label="Command palette"
          shouldFilter
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 40px 80px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.10)',
            overflow: 'hidden',
            fontFamily: 'var(--font-body)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
            <Search size={16} style={{ color: 'var(--muted)' }} />
            <Command.Input
              placeholder="Type a command or search…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-body)' }}
            />
            <kbd style={kbdStyle}>ESC</kbd>
          </div>
          <Command.List style={{ maxHeight: 420, overflowY: 'auto', padding: 8 }}>
            <Command.Empty style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No results. Try "email", "new lead", or a client name.
            </Command.Empty>

            {recent.length > 0 && (
              <Group label="Recent">
                {recent.map(item => (
                  <Item key={item.id} icon={Clock} label={item.label} hint={item.group}
                    onSelect={() => {
                      const all = groups.flatMap(g => g.items);
                      const found = all.find(x => x.id === item.id);
                      if (found) runAction(found);
                    }} />
                ))}
              </Group>
            )}

            {groups.map(group => (
              <Group key={group.label} label={group.label}>
                {group.items.map(item => (
                  <Item
                    key={item.id}
                    icon={item.icon}
                    label={item.label}
                    hint={item.shortcut}
                    onSelect={() => runAction({ ...item, group: group.label })}
                  />
                ))}
              </Group>
            ))}
          </Command.List>

          <div style={{ display: 'flex', gap: 14, padding: '10px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)' }}>
            <span><kbd style={kbdStyle}>↑</kbd><kbd style={kbdStyle}>↓</kbd> navigate</span>
            <span><kbd style={kbdStyle}>↵</kbd> select</span>
            <span style={{ marginLeft: 'auto' }}><kbd style={kbdStyle}>⌘</kbd><kbd style={kbdStyle}>K</kbd> anytime</span>
          </div>
        </Command>
      </div>
    </>,
    document.body
  );
}

// ─── Command definitions ────────────────────────────────────
function useCommands({ navigate, compose, schedule }) {
  return [
    {
      label: 'Create',
      items: [
        { id: 'new-lead',     icon: Users,      label: 'New lead',           action: () => navigate('/leads?new=1') },
        { id: 'new-client',   icon: Briefcase,  label: 'New client',         action: () => navigate('/clients?new=1') },
        { id: 'new-project',  icon: FolderOpen, label: 'New project',        action: () => navigate('/projects?new=1') },
        { id: 'new-meeting',  icon: Calendar,   label: 'Schedule a meeting', action: () => schedule.openModal({}) },
        { id: 'new-email',    icon: Send,       label: 'Compose email',      action: () => { compose.openCompose(null); navigate('/email'); } },
      ],
    },
    {
      label: 'Go to',
      items: [
        { id: 'go-home',      icon: Home,        label: 'Home / Dashboard',  shortcut: 'g h', action: () => navigate('/dashboard') },
        { id: 'go-leads',     icon: Users,       label: 'Leads',              shortcut: 'g l', action: () => navigate('/leads') },
        { id: 'go-clients',   icon: Briefcase,   label: 'Clients',            shortcut: 'g c', action: () => navigate('/clients') },
        { id: 'go-projects',  icon: FolderOpen,  label: 'Projects',           shortcut: 'g p', action: () => navigate('/projects') },
        { id: 'go-inbox',     icon: Mail,        label: 'Email inbox',        shortcut: 'g e', action: () => navigate('/email') },
        { id: 'go-calendar',  icon: Calendar,    label: 'Calendar',           shortcut: 'g m', action: () => navigate('/meetings') },
        { id: 'go-contacts',  icon: BookOpen,    label: 'Contacts',           shortcut: 'g x', action: () => navigate('/contacts') },
        { id: 'go-todos',     icon: CheckSquare, label: 'To-dos',              shortcut: 'g t', action: () => navigate('/todos') },
        { id: 'go-time',      icon: Clock,       label: 'Time',                              action: () => navigate('/time') },
        { id: 'go-routines',  icon: LayoutGrid,  label: 'Routines',                          action: () => navigate('/routines') },
        { id: 'go-settings',  icon: Settings,    label: 'Settings',                           action: () => navigate('/settings') },
      ],
    },
  ];
}

// ─── UI helpers ────────────────────────────────────
function Group({ label, children }) {
  return (
    <Command.Group heading={label} style={{ fontFamily: 'var(--font-display)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.09em', textTransform: 'uppercase', padding: '10px 10px 4px' }}>{label}</div>
      {children}
    </Command.Group>
  );
}
function Item({ icon: Icon, label, hint, onSelect }) {
  return (
    <Command.Item onSelect={onSelect} style={{ cursor: 'pointer' }}
      className="cmdk-item">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 8, transition: 'background var(--dur-fast) var(--ease-out)' }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' }}>
          <Icon size={14} />
        </div>
        <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)', fontWeight: 500 }}>{label}</span>
        {hint && <kbd style={kbdStyle}>{hint}</kbd>}
      </div>
    </Command.Item>
  );
}
const kbdStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10.5, fontWeight: 700, padding: '2px 6px',
  background: 'var(--surface-2)', border: '1px solid var(--border)',
  borderRadius: 5, color: 'var(--muted)',
};
