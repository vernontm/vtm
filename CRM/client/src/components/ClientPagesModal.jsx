// Per-client "enabled pages" editor. Ray uses this from the client switcher
// to configure which CRM modules a client actually uses. Admins see their
// sidebar filtered to this list when that client is active, and non-admin
// grants are intersected with it server-side too.
import React, { useMemo, useState } from 'react';
import { X, Check } from 'lucide-react';
import { updateContentClient } from '../api';
import { useToast } from './Toast';

const PAGE_GROUPS = [
  { label: 'Workspace', pages: [
    { slug: 'dashboard',         name: 'Dashboard' },
    { slug: 'leads',             name: 'Leads' },
    { slug: 'contacts',          name: 'Contacts' },
    { slug: 'projects',          name: 'Projects' },
    { slug: 'blog',              name: 'Blog' },
    { slug: 'portfolio',         name: 'Portfolio' },
    { slug: 'resources',         name: 'Resources' },
    { slug: 'content-scheduler', name: 'Content' },
    { slug: 'avatars',           name: 'Avatars' },
    { slug: 'email-marketing',   name: 'Email Marketing' },
  ]},
  { label: 'Tools', pages: [
    { slug: 'email',         name: 'Email' },
    { slug: 'meetings',      name: 'Meetings' },
    { slug: 'invoices',      name: 'Invoices' },
    { slug: 'quick-notes',   name: 'Quick Notes' },
    { slug: 'notifications', name: 'Notifications' },
    { slug: 'settings',      name: 'Settings' },
    { slug: 'deals',         name: 'Deals' },
  ]},
  { label: 'Training', pages: [
    { slug: 'scripts',  name: 'Call Scripts' },
    { slug: 'training', name: 'Training Videos' },
    { slug: 'products', name: 'Products & Services' },
  ]},
];

const card = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 20, fontFamily: 'var(--font-display)',
};
const btnPrimary = {
  padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))',
  color: '#fff', fontSize: 13, fontWeight: 700, display: 'inline-flex',
  alignItems: 'center', gap: 6,
};
const btnGhost = {
  padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)',
  border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
};

export default function ClientPagesModal({ client, onClose, onSaved }) {
  const toast = useToast();
  const initial = Array.isArray(client.enabled_pages) ? client.enabled_pages : null;
  const [restrict, setRestrict] = useState(!!(initial && initial.length));
  const [pages, setPages] = useState(
    initial && initial.length
      ? initial
      : PAGE_GROUPS.flatMap(g => g.pages.map(p => p.slug))
  );
  const [saving, setSaving] = useState(false);

  function togglePage(slug) {
    setPages(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  }

  const dirty = useMemo(() => {
    const wasRestricted = !!(initial && initial.length);
    if (wasRestricted !== restrict) return true;
    if (!restrict) return false;
    const a = [...(initial || [])].sort().join(',');
    const b = [...pages].sort().join(',');
    return a !== b;
  }, [restrict, pages, initial]);

  async function save() {
    setSaving(true);
    try {
      await updateContentClient(client.id, {
        enabled_pages: restrict ? pages : null,
      });
      toast.success(restrict ? 'Client pages updated' : 'Restrictions removed');
      onSaved();
    } catch (e) { toast.error(e.message); setSaving(false); }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ ...card, width: 520, maxWidth: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Configure pages</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{client.name}</div>
          </div>
          <button type="button" style={btnGhost} onClick={onClose}><X size={13} /></button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={restrict} onChange={e => setRestrict(e.target.checked)} />
          <span style={{ fontWeight: 700 }}>Restrict this client to specific pages</span>
        </label>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
          {restrict
            ? 'Only the checked pages appear in the sidebar when this client is active — for you and for anyone with access to them.'
            : 'Every page is available. Check the box to limit the sidebar to a subset for this client.'}
        </div>

        {restrict && (
          <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
            {PAGE_GROUPS.map(group => (
              <div key={group.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{group.label}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.pages.map(p => (
                    <button
                      key={p.slug}
                      onClick={() => togglePage(p.slug)}
                      style={{
                        padding: '5px 10px', borderRadius: 20,
                        background: pages.includes(p.slug) ? 'var(--orange)' : 'var(--surface)',
                        color: pages.includes(p.slug) ? '#fff' : 'var(--text)',
                        border: `1px solid ${pages.includes(p.slug) ? 'var(--orange)' : 'var(--border)'}`,
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}
                    >{p.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="button" style={btnPrimary} onClick={save} disabled={saving || !dirty}>
            <Check size={13} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
