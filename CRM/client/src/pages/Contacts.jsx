import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Users, Search, RefreshCw, Mail, AlertCircle } from 'lucide-react';
import { useClient } from '../context/ClientContext';
import { getMailerliteGroups, getMailerliteSubscribers } from '../api';

// Marketing > Contacts = the live MailerLite audience for the current workspace
// (groups on the left, subscribers on the right). This is the marketing list,
// distinct from Leads (the sales pipeline).

const STATUS = {
  active:       { label: 'Active',       color: '#16a34a' },
  unsubscribed: { label: 'Unsubscribed', color: '#8a8a8a' },
  unconfirmed:  { label: 'Unconfirmed',  color: '#f5a623' },
  bounced:      { label: 'Bounced',      color: '#dc2626' },
  junk:         { label: 'Junk',         color: '#dc2626' },
};
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return '—'; } };

const rail = (active) => ({
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
  fontFamily: 'var(--font-display)', fontWeight: active ? 700 : 500,
  background: active ? 'rgba(37,99,235,0.10)' : 'transparent',
  color: active ? 'var(--text)' : 'var(--muted)',
  borderLeft: `3px solid ${active ? 'var(--orange)' : 'transparent'}`,
});

export default function Contacts() {
  const { selectedClient } = useClient();
  const clientId = selectedClient?.id;

  const [groups, setGroups]         = useState([]);
  const [activeGroup, setActiveGroup] = useState(null); // null = all contacts
  const [subs, setSubs]             = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [error, setError]           = useState('');

  const loadGroups = useCallback(async () => {
    if (!clientId) return;
    try { const r = await getMailerliteGroups(clientId); setGroups(r.groups || []); } catch { /* surfaced via subs error */ }
  }, [clientId]);

  const loadSubs = useCallback(async (groupId) => {
    if (!clientId) return;
    setLoading(true); setError('');
    try { const r = await getMailerliteSubscribers(clientId, groupId); setSubs(r.subscribers || []); setTotal(r.total || 0); }
    catch (e) { setError(e.message || 'Failed to load contacts'); setSubs([]); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { setActiveGroup(null); loadGroups(); }, [clientId, loadGroups]);
  useEffect(() => { loadSubs(activeGroup); }, [activeGroup, loadSubs]);

  const refresh = async () => { setRefreshing(true); await Promise.all([loadGroups(), loadSubs(activeGroup)]); setRefreshing(false); };

  const filtered = useMemo(() =>
    subs.filter(s => !search ||
      (s.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.name || '').toLowerCase().includes(search.toLowerCase())),
    [subs, search]
  );

  if (!clientId) {
    return <div style={{ padding: 40, color: 'var(--muted)', fontSize: 14 }}>Pick a workspace up top to see its marketing contacts.</div>;
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input className="search-input" placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
          {activeGroup ? `${filtered.length} in group` : `${total.toLocaleString()} contacts`}
        </span>
        <button className="btn-ghost" onClick={refresh} disabled={refreshing} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, padding: 20, alignItems: 'start' }}>
        {/* Groups rail */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Groups</div>
          <button onClick={() => setActiveGroup(null)} style={rail(activeGroup === null)}>
            <Users size={14} /> <span style={{ flex: 1, textAlign: 'left' }}>All contacts</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{total.toLocaleString()}</span>
          </button>
          {groups.map(g => (
            <button key={g.id} onClick={() => setActiveGroup(g.id)} style={rail(activeGroup === g.id)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{(g.total || 0).toLocaleString()}</span>
            </button>
          ))}
          {groups.length === 0 && <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--muted)' }}>No groups yet.</div>}
        </div>

        {/* Subscribers */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {error ? (
            <div style={{ padding: '28px 24px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--muted)', fontSize: 13 }}>
              <AlertCircle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              <span>{/No MailerLite/i.test(error) ? 'This workspace has no MailerLite connected. Add its API key in Settings to see marketing contacts.' : error}</span>
            </div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 230px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table className="compact-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Name</th>
                    <th style={{ minWidth: 200 }}>Email</th>
                    <th style={{ minWidth: 96 }}>Status</th>
                    <th style={{ minWidth: 100 }}>Subscribed</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 40 }}>No contacts{search ? ' match your search' : ''}.</td></tr>
                  ) : filtered.map(s => {
                    const st = STATUS[s.status] || { label: s.status || '—', color: '#8a8a8a' };
                    return (
                      <tr key={s.id}>
                        <td className="private-value" style={{ fontWeight: 600, color: 'var(--text)' }}>{s.name || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Mail size={12} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                            <span className="private-value" style={{ color: 'var(--muted)' }}>{s.email}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}40`, borderRadius: 999, padding: '1px 8px' }}>{st.label}</span>
                        </td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(s.subscribed_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
