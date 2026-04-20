import React, { useEffect, useState } from 'react';
import {
  RefreshCw, Star, Mail, Sparkles, FolderOpen, CheckSquare,
  Calendar, Clock, ArrowRight, AlertCircle, Send, Video,
  TrendingUp, Users, FileText, DollarSign, CreditCard,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getDashboardStats, getUpcomingMeetings, getEmailQueue,
  getLeads, getProjects, getAcademyStats,
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

function Card({ children, style }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 22px', ...style }}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, color = 'var(--orange)', linkTo, linkLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</span>
      </div>
      {linkTo && (
        <Link to={linkTo} style={{ fontSize: 12, color: 'var(--orange)', textDecoration: 'none', fontWeight: 600 }}>
          {linkLabel || 'View All'} →
        </Link>
      )}
    </div>
  );
}

function StatMini({ icon: Icon, label, value, color = 'var(--orange)' }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [recentLeads, setRecentLeads] = useState([]);
  const [projects, setProjects] = useState([]);
  const [academyStats, setAcademyStats] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [statsData, meetingsData, emailData, leadsData, projectsData, academyData] = await Promise.allSettled([
        getDashboardStats(),
        getUpcomingMeetings(),
        getEmailQueue(),
        getLeads(),
        getProjects(),
        getAcademyStats(),
      ]);
      setStats(statsData.status === 'fulfilled' ? statsData.value : null);
      setMeetings(meetingsData.status === 'fulfilled' ? (meetingsData.value || []).slice(0, 5) : []);
      const allEmails = emailData.status === 'fulfilled' ? (emailData.value || []) : [];
      setDrafts(allEmails.filter(e => (e.status === 'draft' || e.status === 'pending') && e.auto_generated));
      const allLeads = leadsData.status === 'fulfilled' ? (leadsData.value || []) : [];
      setRecentLeads(allLeads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6));
      const allProjects = projectsData.status === 'fulfilled' ? (projectsData.value || []) : [];
      setProjects(allProjects.filter(p => p.status === 'Active' || p.status === 'In Progress').slice(0, 5));
      setAcademyStats(academyData.status === 'fulfilled' ? academyData.value : null);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() { setRefreshing(true); await load(); setRefreshing(false); }
  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 15 }}>
        Loading dashboard...
      </div>
    );
  }

  const openLeads = stats?.openLeads || 0;
  const activeProjects = stats?.activeProjects || 0;
  const activeDeals = stats?.activeDeals || 0;
  const pendingDrafts = drafts.length;

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

      {/* Quick Stats */}
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatMini icon={Star} label="Open Leads" value={openLeads} color="#f5a623" />
        <StatMini icon={Mail} label="Drafts to Review" value={pendingDrafts} color={pendingDrafts > 0 ? '#ff5c5c' : 'var(--orange)'} />
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
                        background: m.revenue > 0 ? 'linear-gradient(180deg, var(--orange), #6e8efb)' : 'var(--surface-3)',
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

      {/* Action Items Banner */}
      {pendingDrafts > 0 && (
        <Link to="/email" style={{ textDecoration: 'none' }}>
          <div style={{
            background: 'rgba(255,155,38,0.06)', border: '1px solid rgba(74,108,247,0.15)',
            borderRadius: 12, padding: '14px 20px', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          }}>
            <Sparkles size={18} color="var(--orange)" />
            <span style={{ fontSize: 14, color: 'var(--orange)', fontWeight: 600, flex: 1 }}>
              {pendingDrafts} auto-drafted email{pendingDrafts > 1 ? 's' : ''} waiting for your review
            </span>
            <ArrowRight size={16} color="var(--orange)" />
          </div>
        </Link>
      )}

      {/* Main Grid */}
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Recent Leads */}
        <Card>
          <CardHeader icon={Star} title="Recent Leads" color="#f5a623" linkTo="/leads" />
          {recentLeads.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No leads yet</div>
          ) : (
            recentLeads.map(lead => (
              <div key={lead.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#f5a62318',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#f5a623', flexShrink: 0,
                }}>
                  {(lead.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="private-value" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.name || 'Unknown'}
                  </div>
                  <div className="private-value" style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {lead.email || lead.company || lead.lead_source || ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>
                  {timeAgo(lead.created_at)}
                </div>
              </div>
            ))
          )}
        </Card>

        {/* Email Drafts to Review */}
        <Card>
          <CardHeader icon={Mail} title="Drafts to Review" color="var(--orange)" linkTo="/email" />
          {drafts.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              <CheckSquare size={20} style={{ opacity: 0.3, marginBottom: 6, display: 'block', margin: '0 auto 6px' }} />
              All caught up — no pending drafts
            </div>
          ) : (
            drafts.slice(0, 5).map(email => (
              <div key={email.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,155,38,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={13} color="var(--orange)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.lead_name || email.to_email || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {email.subject || '(no subject)'}
                  </div>
                </div>
                {email.follow_up_date && (
                  <div style={{ fontSize: 10, color: 'var(--orange)', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <Clock size={10} /> Follow-up
                  </div>
                )}
              </div>
            ))
          )}
        </Card>

        {/* Upcoming Meetings */}
        <Card>
          <CardHeader icon={Calendar} title="Upcoming Meetings" color="#784bd1" linkTo="/meetings" />
          {meetings.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No upcoming meetings</div>
          ) : (
            meetings.map(m => (
              <div key={m.google_event_id || m.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{fmtDate(m.start_time)}</div>
                </div>
                {m.meet_link && (
                  <button
                    onClick={() => window.open(m.meet_link, '_blank')}
                    style={{
                      background: '#22c55e18', color: '#22c55e', border: '1px solid #22c55e30',
                      borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <Video size={11} /> Join
                  </button>
                )}
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


      {/* ── Academy Overview ── */}
      {academyStats && (
        <Card style={{ marginTop: 14 }}>
          <CardHeader icon={Users} title="Academy" color="#E8650A" linkTo="/academy" linkLabel="Manage" />
          <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Students</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>{academyStats.total_students || 0}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Subscribers</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e' }}>{academyStats.active_subscribers || 0}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>MRR</div>
              <div className="private-value" style={{ fontSize: 20, fontWeight: 800, color: 'var(--orange)' }}>${(academyStats.mrr || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Pending HW</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: academyStats.pending_homework > 0 ? '#ef4444' : '#1a1a2e' }}>{academyStats.pending_homework || 0}</div>
            </div>
          </div>
        </Card>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
