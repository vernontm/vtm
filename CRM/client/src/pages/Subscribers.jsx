import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search, Users } from 'lucide-react';
import { getEmailContacts } from '../api';
import { useClient } from '../context/ClientContext';
import { usePageActions } from '../context/UiContext';

const RESOURCE_TAGS = ['resources', 'prompts', 'traders', 'crm'];

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'resources', label: 'Resources' },
  { key: 'prompts',   label: 'Prompts' },
  { key: 'traders',   label: 'Traders' },
  { key: 'crm',       label: 'CRM' },
];

function pillStyle(active) {
  return {
    padding: '6px 14px',
    borderRadius: 100,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    background: active ? 'rgba(255,155,38,0.12)' : 'var(--surface)',
    border: active ? '1px solid rgba(255,155,38,0.45)' : '1px solid var(--border)',
    color: active ? 'var(--orange)' : 'var(--muted)',
    fontFamily: 'var(--font-body)',
    transition: 'all 0.15s',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  };
}

function tagChip(t) {
  return (
    <span key={t} style={{
      display: 'inline-block',
      background: 'rgba(255,155,38,0.1)',
      border: '1px solid rgba(255,155,38,0.2)',
      color: 'var(--orange)',
      fontSize: 11, padding: '2px 8px', borderRadius: 100,
      marginRight: 4, marginBottom: 2,
    }}>{t}</span>
  );
}

export default function Subscribers() {
  const { selectedClientId } = useClient();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!selectedClientId) { setContacts([]); setLoading(false); return; }
    setLoading(true); setErr('');
    try {
      const rows = await getEmailContacts(selectedClientId);
      setContacts(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(e.message || 'Failed to load subscribers');
    } finally {
      setLoading(false);
    }
  }, [selectedClientId]);

  useEffect(() => { load(); }, [load]);

  usePageActions(
    () => (
      <button onClick={load} className="btn-secondary" style={{ fontSize: 13 }}>Refresh</button>
    ),
    [load]
  );

  const visible = useMemo(() => {
    const qLower = q.trim().toLowerCase();
    return contacts.filter(c => {
      const tags = Array.isArray(c.tags) ? c.tags : [];
      if (filter === 'resources') {
        if (!tags.some(t => RESOURCE_TAGS.includes(t))) return false;
      } else if (filter !== 'all') {
        if (!tags.includes(filter)) return false;
      }
      if (qLower) {
        const hay = `${c.email || ''} ${c.name || ''}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [contacts, filter, q]);

  const counts = useMemo(() => {
    const c = { all: contacts.length, resources: 0, prompts: 0, traders: 0, crm: 0 };
    contacts.forEach(row => {
      const tags = Array.isArray(row.tags) ? row.tags : [];
      if (tags.some(t => RESOURCE_TAGS.includes(t))) c.resources += 1;
      if (tags.includes('prompts')) c.prompts += 1;
      if (tags.includes('traders')) c.traders += 1;
      if (tags.includes('crm'))     c.crm += 1;
    });
    return c;
  }, [contacts]);

  const exportCsv = () => {
    if (!visible.length) return;
    const header = ['email', 'name', 'tags', 'status', 'signed_up_at'];
    const rows = visible.map(s => [
      s.email || '',
      s.name || '',
      (Array.isArray(s.tags) ? s.tags.join('|') : ''),
      s.status || '',
      s.signed_up_at || s.created_at || '',
    ]);
    const csv = [header, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vtm-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading subscribers…</div>;
  }
  if (err) {
    return <div style={{ padding: 32, color: '#f87171' }}>{err}</div>;
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <Users size={20} color="var(--orange)" />
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22 }}>Subscribers</h1>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>
          {visible.length} of {contacts.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 18 }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={pillStyle(filter === f.key)}>
            {f.label}
            <span style={{
              fontSize: 11, color: 'var(--muted)', background: 'var(--bg)',
              padding: '1px 7px', borderRadius: 100,
            }}>{counts[f.key] ?? 0}</span>
          </button>
        ))}

        <div style={{
          flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
          padding: '6px 10px', marginLeft: 'auto',
        }}>
          <Search size={14} color="var(--muted)" />
          <input
            type="text" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email…"
            style={{ background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontSize: 13, width: '100%' }}
          />
        </div>

        <button onClick={exportCsv} className="btn-primary" style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {visible.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          No subscribers match.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Email</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Tags</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px' }}>{s.email}</td>
                  <td style={{ padding: '12px 16px' }}>{s.name || ''}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {Array.isArray(s.tags) && s.tags.length > 0
                      ? s.tags.map(tagChip)
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>{s.status || ''}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--muted)' }}>
                    {(s.signed_up_at || s.created_at)
                      ? new Date(s.signed_up_at || s.created_at).toLocaleDateString()
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
