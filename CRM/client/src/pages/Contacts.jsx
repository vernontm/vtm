import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, Plus, Pencil, Trash2, X, Mail, Phone, Building2, Save, StickyNote } from 'lucide-react';
import { toast } from '../components/Toast';
import { getContacts, createContact, updateContact, deleteContact } from '../api';

// Contacts = the rolodex. Everyone Ray or the team actually talks to, with their
// details and running notes. Distinct from Marketing (the MailerLite audience)
// and from Leads (the sales pipeline).

const BLANK = { name: '', title: '', company: '', email: '', phone: '', notes: '' };

const initials = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const hue = (s) => { let h = 0; for (const ch of (s || '')) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

export default function Contacts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);   // contact object or BLANK for new
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await getContacts() || []); }
    catch (e) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (rows || []).filter(r => !r.archived);
    if (!q) return list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list
      .filter(r => [r.name, r.company, r.email, r.phone, r.title, r.notes]
        .some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [rows, search]);

  const save = async () => {
    if (!editing?.name?.trim()) { toast('error', 'Name is required'); return; }
    setSaving(true);
    try {
      const body = {
        name: editing.name.trim(), title: editing.title?.trim() || '',
        company: editing.company?.trim() || '', email: editing.email?.trim() || '',
        phone: editing.phone?.trim() || '', notes: editing.notes || '',
      };
      if (editing.id) await updateContact(editing.id, body);
      else await createContact(body);
      toast('success', editing.id ? 'Contact updated' : 'Contact added');
      setEditing(null);
      await load();
    } catch (e) { toast('error', e.message); }
    finally { setSaving(false); }
  };

  const remove = async (c) => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try { await deleteContact(c.id); toast('success', 'Deleted'); await load(); }
    catch (e) { toast('error', e.message); }
  };

  const input = {
    width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)',
    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13.5,
    fontFamily: 'var(--font-display)', boxSizing: 'border-box',
  };
  const label = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block' };

  return (
    <div style={{ padding: 24, fontFamily: 'var(--font-display)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Contacts</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Your rolodex. Everyone you talk to, with their details and notes.
          </div>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ ...BLANK })}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} /> New contact
        </button>
      </div>

      <div style={{ position: 'relative', maxWidth: 380, marginBottom: 16 }}>
        <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
        <input className="search-input" placeholder="Search name, company, email, notes…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...input, paddingLeft: 32 }} />
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <Users size={30} style={{ color: 'var(--muted)', marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
            {search ? 'No contacts match that search' : 'No contacts yet'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 5 }}>
            {search ? 'Try a different term.' : 'Add the people you talk to so their details and notes live in one place.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {visible.map(c => (
            <div key={c.id} onClick={() => setEditing({ ...c })}
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, cursor: 'pointer', position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `hsl(${hue(c.name)} 60% 22%)`, color: `hsl(${hue(c.name)} 80% 78%)`, fontWeight: 800, fontSize: 14 }}>
                  {initials(c.name)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="pii-name" style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[c.title, c.company].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <button title="Delete" onClick={e => { e.stopPropagation(); remove(c); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
                {c.email && (
                  <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()}
                     style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--orange)', textDecoration: 'none', overflow: 'hidden' }}>
                    <Mail size={13} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                     style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text)', textDecoration: 'none' }}>
                    <Phone size={13} style={{ flexShrink: 0 }} /> {c.phone}
                  </a>
                )}
                {c.notes && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, color: 'var(--muted)', marginTop: 3 }}>
                    <StickyNote size={13} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.notes}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div onClick={() => !saving && setEditing(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 470, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)' }}>
                {editing.id ? 'Edit contact' : 'New contact'}
              </div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <span style={label}>Name *</span>
                <input style={input} autoFocus value={editing.name || ''} placeholder="Jane Doe"
                  onChange={e => setEditing(v => ({ ...v, name: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={label}>Title</span>
                  <input style={input} value={editing.title || ''} placeholder="Owner"
                    onChange={e => setEditing(v => ({ ...v, title: e.target.value }))} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={label}>Company</span>
                  <input style={input} value={editing.company || ''} placeholder="Acme Co"
                    onChange={e => setEditing(v => ({ ...v, company: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={label}>Email</span>
                  <input style={input} type="email" value={editing.email || ''} placeholder="jane@acme.com"
                    onChange={e => setEditing(v => ({ ...v, email: e.target.value }))} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={label}>Phone</span>
                  <input style={input} type="tel" value={editing.phone || ''} placeholder="(000) 000-0000"
                    onChange={e => setEditing(v => ({ ...v, phone: e.target.value }))} />
                </div>
              </div>
              <div>
                <span style={label}>Notes</span>
                <textarea style={{ ...input, minHeight: 130, resize: 'vertical', lineHeight: 1.5 }}
                  value={editing.notes || ''}
                  placeholder="Where you met, what they need, what you last talked about, anything worth remembering."
                  onChange={e => setEditing(v => ({ ...v, notes: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setEditing(null)} disabled={saving}
                style={{ padding: '9px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button className="btn-primary" onClick={save} disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Save size={14} /> {saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
