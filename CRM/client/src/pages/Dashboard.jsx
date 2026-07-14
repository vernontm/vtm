import React, { useEffect, useState } from 'react';
import {
  RefreshCw, Star, FolderOpen, CheckSquare,
  Calendar,
  TrendingUp, DollarSign, CreditCard, Bell, Check, X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  getDashboardStats, getUpcomingMeetings, getClients, getProjects,
  getClientAlerts, markAlertRead, markAllAlertsRead,
} from '../api';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
  } catch { return iso; }
}

function fmtTime(iso) {
  if (!iso) return '';
  try { return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)); }
  catch { return ''; }
}

// Out-of-office / all-day blocks aren't real meetings — filter them out of
// the calendar entirely (Ray's request).
function isBlock(m) {
  if ((m.duration_minutes || 0) >= 720) return true;
  if (/out of office/i.test(m.title || m.summary || '')) return true;
  return false;
}

function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, color = 'var(--orange)', linkTo, linkLabel, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
      </div>
      {right || (linkTo && (
        <Link to={linkTo} style={{ fontSize: 12, color: 'var(--link)', textDecoration: 'none', fontWeight: 700 }}>
          {linkLabel || 'View All'} →
        </Link>
      ))}
    </div>
  );
}

function StatMini({ icon: Icon, label, value, color = 'var(--orange)' }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div className="stat-tile-icon" style={{ background: color + '18' }}>
        <Icon size={17} color={color} />
      </div>
      <div>
        <div className="stat-tile-value">{value}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

// ── Interactive meetings calendar ──────────────────────────────────────────
// Hover a day with meetings to see details; click a meeting to open the
// matching client's profile (matched by attendee email), or the meeting
// detail page if no client matches.
function WeekMeetings({ meetings, onMeetingClick }) {
  const today = new Date();
  const start = new Date(today); start.setHours(0, 0, 0, 0); start.setDate(today.getDate() - today.getDay());
  const weekEndMs = start.getTime() + 7 * 24 * 60 * 60 * 1000;

  const byDay = {};
  meetings.forEach(m => {
    if (!m.start_time) return;
    const t = new Date(m.start_time).getTime();
    if (t < start.getTime() || t >= weekEndMs) return;
    const key = new Date(m.start_time).toDateString();
    (byDay[key] = byDay[key] || []).push(m);
  });
  Object.values(byDay).forEach(a => a.sort((x, y) => new Date(x.start_time) - new Date(y.start_time)));

  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const daysWithMeetings = days.filter(d => (byDay[d.toDateString()] || []).length > 0);
  const weekLabel = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 12 }}>{weekLabel}</div>
      {daysWithMeetings.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No meetings this week</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 460, overflowY: 'auto' }}>
          {daysWithMeetings.map(d => {
            const list = byDay[d.toDateString()];
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={d.toDateString()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: isToday ? '#fff' : 'var(--muted)',
                    background: isToday ? 'var(--link)' : 'transparent',
                    borderRadius: 999, padding: isToday ? '2px 9px' : '0',
                  }}>{WD[d.getDay()]} {d.getDate()}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {list.map(m => (
                    <div
                      key={m.google_event_id || m.id}
                      onClick={() => onMeetingClick(m)}
                      title={m.title || m.summary || ''}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-2)'}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#784bd1', flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700 }}>{fmtTime(m.start_time)}</span> {m.title || m.summary || '(no title)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [alerts, setAlerts] = useState([]);

  async function loadAlerts() {
    try { setAlerts(await getClientAlerts(true)); } catch { /* ignore */ }
  }
  async function dismissAlert(id) {
    setAlerts(a => a.filter(x => x.id !== id));
    try { await markAlertRead(id); } catch { /* ignore */ }
  }
  async function dismissAllAlerts() {
    setAlerts([]);
    try { await markAllAlertsRead(); } catch { /* ignore */ }
  }

  async function load() {
    setLoading(true);
    try {
      const [statsData, meetingsData, clientsData, projectsData] = await Promise.allSettled([
        getDashboardStats(),
        getUpcomingMeetings(),
        getClients(),
        getProjects(),
      ]);
      loadAlerts();
      setStats(statsData.status === 'fulfilled' ? statsData.value : null);
      const allMeetings = meetingsData.status === 'fulfilled' ? (meetingsData.value || []) : [];
      setMeetings(allMeetings.filter(m => !isBlock(m)));
      setClients(clientsData.status === 'fulfilled' ? (clientsData.value || []) : []);
      const allProjects = projectsData.status === 'fulfilled' ? (projectsData.value || []) : [];
      setProjects(allProjects.filter(p => p.status === 'Active' || p.status === 'In Progress').slice(0, 5));
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() { setRefreshing(true); await load(); setRefreshing(false); }
  useEffect(() => { load(); }, []);

  // Click a meeting on the calendar -> open the matching client's profile
  // (matched by attendee email), or the meeting detail page as a fallback.
  function handleMeetingClick(m) {
    const attendeeEmails = (m.participants || []).map(p => (p.email || '').toLowerCase()).filter(Boolean);
    const match = clients.find(c => c.contact_email && attendeeEmails.includes(c.contact_email.toLowerCase()));
    if (match) navigate(`/clients?open=${match.id}`);
    else navigate(`/appointments/${m.google_event_id || m.id}`);
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 15 }}>
        Loading dashboard...
      </div>
    );
  }

  const leads = clients.filter(c => c.stage === 'lead');
  const recentLeads = [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  const openLeads = leads.length;
  const activeProjects = stats?.activeProjects || 0;
  const activeDeals = stats?.activeDeals || 0;

  return (
    <div className="dashboard-page" style={{ flex: 1, overflow: 'auto', padding: '28px 32px', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Dashboard</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Vernon Tech & Media — What needs your attention</div>
        </div>
        <button onClick={handleRefresh} style={{
          display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)',
          padding: '8px 14px', cursor: 'pointer', fontSize: 13,
        }}>
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* ── Client Activity alerts ── */}
      {alerts.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 14, padding: '16px 20px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={15} color="#22c55e" />
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Client Activity</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 999, padding: '1px 8px' }}>{alerts.length} new</span>
            </div>
            <button onClick={dismissAllAlerts} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Check size={13} /> Mark all read
            </button>
          </div>
          {alerts.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckSquare size={14} color="#22c55e" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.client?.business_name || 'Client'} · {timeAgo(a.created_at)}</div>
              </div>
              <Link to="/clients" style={{ fontSize: 11, color: 'var(--link)', textDecoration: 'none', fontWeight: 700, flexShrink: 0 }}>Open</Link>
              <button onClick={() => dismissAlert(a.id)} title="Mark read" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatMini icon={Star} label="Open Leads" value={openLeads} color="#f5a623" />
        <StatMini icon={FolderOpen} label="Active Projects" value={activeProjects} color="#00b8d4" />
        <StatMini icon={TrendingUp} label="Active Deals" value={activeDeals} color="#22c55e" />
      </div>

      {/* ── Stripe Revenue ── */}
      {stats?.stripeRevenue && (
        <div style={{ marginBottom: 22 }}>
          {/* Revenue Stats Row */}
          <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Stripe Balance</div>
              <div className="private-value" style={{ fontSize: 22, fontWeight: 800, color: '#22c55e' }}>${stats.stripeRevenue.available?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              {stats.stripeRevenue.pending > 0 && <div className="private-value" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>${stats.stripeRevenue.pending.toFixed(2)} pending</div>}
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Last 30 Days</div>
              <div className="private-value" style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange)' }}>${stats.stripeRevenue.last30Days?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{stats.stripeRevenue.last30Count} payment{stats.stripeRevenue.last30Count !== 1 ? 's' : ''}</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>12-Month Revenue</div>
              <div className="private-value" style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>${stats.stripeRevenue.total?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Pipeline Value</div>
              <div className="private-value" style={{ fontSize: 22, fontWeight: 800, color: '#784bd1' }}>${(stats?.pipelineValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          {/* Revenue Chart + Recent Payments */}
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Monthly Revenue Chart */}
            <Card>
              <CardHeader icon={TrendingUp} title="Monthly Revenue" color="#22c55e" />
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {(stats?.monthlyChart || []).map((m, i) => {
                  const maxVal = Math.max(...(stats?.monthlyChart || []).map(x => x.revenue), 1);
                  const h = Math.max((m.revenue / maxVal) * 100, 2);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div title={`$${m.revenue.toLocaleString()}`} style={{
                        width: '100%', height: h, borderRadius: '4px 4px 0 0',
                        background: m.revenue > 0 ? 'var(--orange)' : 'var(--surface-3)',
                        transition: 'height 0.3s ease',
                      }} />
                      <span style={{ fontSize: 8, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Recent Payments */}
            <Card>
              <CardHeader icon={CreditCard} title="Recent Payments" color="#22c55e" linkTo="/invoices" />
              {(stats.stripeRevenue.recentPayments || []).length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No recent payments</div>
              ) : (
                (stats.stripeRevenue.recentPayments || []).slice(0, 6).map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#22c55e18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <DollarSign size={13} color="#22c55e" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="private-value" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.customer}
                      </div>
                      <div className="private-value" style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description || p.email || ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="private-value" style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>+${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{timeAgo(p.date)}</div>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Three-column widgets: this-week meetings (left) · recent leads · active projects */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 20, alignItems: 'start' }}>

        {/* Upcoming Meetings — this week */}
        <Card>
          <CardHeader icon={Calendar} title="Upcoming Meetings" color="#784bd1" linkTo="/appointments" />
          <WeekMeetings meetings={meetings} onMeetingClick={handleMeetingClick} />
        </Card>

        {/* Recent Leads */}
        <Card>
          <CardHeader icon={Star} title="Recent Leads" color="#f5a623" linkTo="/leads" />
          {recentLeads.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No leads yet</div>
          ) : (
            recentLeads.map(lead => (
              <div key={lead.id} onClick={() => navigate(`/clients?open=${lead.id}`)} style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#f5a62318',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#f5a623', flexShrink: 0,
                }}>
                  {(lead.business_name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="private-value" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.business_name || 'Unknown'}
                  </div>
                  <div className="private-value" style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.owner_name || lead.contact_email || lead.source || ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                  {timeAgo(lead.created_at)}
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Active Projects */}
        <Card>
          <CardHeader icon={FolderOpen} title="Active Projects" color="#00b8d4" linkTo="/projects" />
          {projects.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No active projects</div>
          ) : (
            projects.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: '#00b8d418',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FolderOpen size={14} color="#00b8d4" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="private-value" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </div>
                  <div className="private-value" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {p.client || p.status || ''}
                  </div>
                </div>
                {p.deadline && (
                  <div style={{ fontSize: 11, color: new Date(p.deadline) < new Date() ? '#ff5c5c' : '#8e8ea0', flexShrink: 0 }}>
                    {new Date(p.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                )}
              </div>
            ))
          )}
        </Card>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
