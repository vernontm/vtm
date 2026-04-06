import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  DollarSign, TrendingUp, Briefcase, Users, FolderOpen,
  Star, FileText, RefreshCw, ArrowUpRight, Calendar, Video, Clock,
  ThumbsUp, ThumbsDown, PhoneCall,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, getUpcomingMeetings } from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Number(n).toFixed(0)}`;

const STAGE_COLORS = {
  Won:      '#c8f135',
  Lost:     '#ff5c5c',
  Proposal: '#fdab3d',
  New:      '#c8f135',
  Qualified:'#784bd1',
  Negotiation: '#00d1d1',
};

const PIE_COLORS = ['#c8f135','#784bd1','#c8f135','#fdab3d','#ff5c5c','#00d1d1'];

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = '#c8f135', trend, private: isPrivate }) {
  return (
    <div style={{
      background: '#161614', border: '1px solid #252523', borderRadius: 14,
      padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} style={{ color }} />
        </div>
        {trend !== undefined && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 12, color: trend >= 0 ? '#c8f135' : '#ff5c5c',
          }}>
            <ArrowUpRight size={13} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className={isPrivate ? 'private-value' : ''} style={{ fontSize: 26, fontWeight: 800, color: '#e8e6df', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#4a4845' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#4a4845' }}>{sub}</div>}
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#111110', border: '1px solid #252523', borderRadius: 8,
      padding: '8px 14px', fontSize: 13,
    }}>
      <div style={{ color: '#4a4845', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || '#fff', fontWeight: 600 }}>
          {p.name}: {p.name === 'revenue' || p.name === 'Revenue' ? fmt(p.value) : p.value}
        </div>
      ))}
    </div>
  );
}

// ── Deal Stage Badge ──────────────────────────────────────────────────────────
function StageBadge({ stage }) {
  const color = STAGE_COLORS[stage] || '#4a4845';
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
    }}>{stage}</span>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats, setStats]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [meetings, setMeetings]   = useState([]);

  async function load() {
    setLoading(true); setError('');
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
    // Load upcoming meetings silently (don't block dashboard if Calendar not connected)
    getUpcomingMeetings().then(m => setMeetings(m.slice(0, 3))).catch(() => {});
  }

  function fmtMeetingDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
    } catch { return iso; }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a4845', fontSize: 15 }}>
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#ff5c5c', fontSize: 14 }}>Error: {error}</div>
      </div>
    );
  }

  const {
    totalRevenue, totalInvoiced, pipelineValue,
    activeClients, activeProjects, completedProjects,
    openLeads, activeDeals, last30DaysRevenue,
    monthlyChart, dealsByStage, recentDeals, invoiceStats,
    leadsContacted = 0, leadsInterested = 0, leadsUninterested = 0,
  } = stats;

  // Pie data for deals by stage
  const pieData = Object.entries(dealsByStage || {}).map(([name, value]) => ({ name, value }));

  // Collect bar data for deal stages
  const stageBarData = Object.entries(dealsByStage || {}).map(([stage, count]) => ({ stage, count }));

  // Invoice collection rate
  const collectRate = invoiceStats.totalAmount > 0
    ? Math.round((invoiceStats.paidAmount / invoiceStats.totalAmount) * 100)
    : 0;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', background: '#0a0a08' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#e8e6df' }}>Dashboard</div>
          <div style={{ fontSize: 13, color: '#4a4845', marginTop: 2 }}>Vernon Tech &amp; Media — Business Overview</div>
        </div>
        <button
          onClick={handleRefresh}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: '#111110',
            border: '1px solid #252523', borderRadius: 8, color: '#7a7870',
            padding: '8px 14px', cursor: 'pointer', fontSize: 13,
          }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* KPI Cards Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
        <StatCard icon={DollarSign}   label="Total Revenue (Won Deals)"  value={fmt(totalRevenue)}            color="#c8f135" private />
        <StatCard icon={Clock}        label="Last 30 Days Revenue"        value={fmt(last30DaysRevenue || 0)}  color="#c8f135" sub="Paid deals only" private />
        <StatCard icon={FileText}     label="Total Invoiced (Collected)"  value={fmt(totalInvoiced)}           color="#c8f135" private />
        <StatCard icon={TrendingUp}   label="Pipeline Value"              value={fmt(pipelineValue)}           color="#fdab3d" private />
        <StatCard icon={Briefcase}    label="Active Deals"                value={activeDeals}                  color="#784bd1" />
      </div>

      {/* KPI Cards Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard icon={Users}      label="Contacts"            value={activeClients}    color="#c8f135" />
        <StatCard icon={FolderOpen} label="Active Projects"     value={activeProjects}   color="#00d1d1"
          sub={`${completedProjects} completed`} />
        <StatCard icon={Star}       label="Open Leads"          value={openLeads}        color="#fdab3d" />
        <StatCard icon={FileText}   label="Invoice Collection"  value={`${collectRate}%`} color="#c8f135"
          sub={`${invoiceStats.paid} / ${invoiceStats.total} invoices paid`} />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Monthly Revenue Area Chart */}
        <div style={{ background: '#161614', border: '1px solid #252523', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 18 }}>
            Monthly Revenue (Last 12 Months)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#c8f135" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#c8f135" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#111110" />
              <XAxis dataKey="label" tick={{ fill: '#4a4845', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => v >= 1000 ? `$${v/1000}k` : `$${v}`} tick={{ fill: '#4a4845', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone" dataKey="revenue" name="Revenue"
                stroke="#c8f135" strokeWidth={2}
                fill="url(#revGrad)"
                dot={{ r: 3, fill: '#c8f135', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#c8f135' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Deals by Stage Pie */}
        <div style={{ background: '#161614', border: '1px solid #252523', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 12 }}>
            Deals by Stage
          </div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="45%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={STAGE_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(val, name) => [val, name]} contentStyle={{ background: '#111110', border: '1px solid #252523', borderRadius: 8, fontSize: 12 }} />
                <Legend
                  iconType="circle" iconSize={8}
                  formatter={v => <span style={{ color: '#7a7870', fontSize: 12 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#4a4845', fontSize: 13, textAlign: 'center', paddingTop: 60 }}>No deal data yet</div>
          )}
        </div>
      </div>

      {/* Bottom Row: Deal Stage Bar + Recent Deals + Invoice Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr', gap: 20 }}>

        {/* Stage Count Bar Chart */}
        <div style={{ background: '#161614', border: '1px solid #252523', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 16 }}>Deal Counts</div>
          {stageBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stageBarData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#111110" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#4a4845', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="stage" tick={{ fill: '#7a7870', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="count" name="Deals" radius={[0, 4, 4, 0]}>
                  {stageBarData.map((entry, i) => (
                    <Cell key={i} fill={STAGE_COLORS[entry.stage] || PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: '#4a4845', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>No deals yet</div>
          )}
        </div>

        {/* Recent Deals */}
        <div style={{ background: '#161614', border: '1px solid #252523', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 14 }}>Recent Deals</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Deal', 'Stage', 'Value'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 8px 10px 0', color: '#4a4845', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #252523' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentDeals.length === 0 ? (
                <tr><td colSpan={3} style={{ color: '#4a4845', padding: '20px 0', textAlign: 'center', fontSize: 13 }}>No deals yet</td></tr>
              ) : recentDeals.map((d, i) => (
                <tr key={d.id} style={{ borderBottom: i < recentDeals.length - 1 ? '1px solid #111110' : 'none' }}>
                  <td style={{ padding: '9px 8px 9px 0', color: '#e8e6df', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</td>
                  <td style={{ padding: '9px 8px 9px 0' }}><StageBadge stage={d.stage} /></td>
                  <td style={{ padding: '9px 0', color: '#c8f135', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {d.value ? `$${Number(d.value).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Invoice Summary */}
        <div style={{ background: '#161614', border: '1px solid #252523', borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df', marginBottom: 16 }}>Invoice Summary</div>

          {/* Collection progress bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#4a4845', marginBottom: 6 }}>
              <span>Collection Rate</span>
              <span style={{ color: '#e8e6df', fontWeight: 600 }}>{collectRate}%</span>
            </div>
            <div style={{ height: 8, background: '#111110', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${collectRate}%`, background: collectRate === 100 ? '#c8f135' : '#c8f135', borderRadius: 4, transition: 'width 0.5s ease' }} />
            </div>
          </div>

          {/* Stats list */}
          {[
            { label: 'Total Invoices',    value: invoiceStats.total,                         color: '#7a7870' },
            { label: 'Sent / Open',       value: invoiceStats.sent,                          color: '#c8f135' },
            { label: 'Paid',              value: invoiceStats.paid,                          color: '#c8f135' },
            { label: 'Total Billed',      value: `$${Number(invoiceStats.totalAmount).toLocaleString()}`, color: '#fdab3d' },
            { label: 'Total Collected',   value: `$${Number(invoiceStats.paidAmount).toLocaleString()}`,  color: '#c8f135' },
            { label: 'Outstanding',
              value: `$${Number(invoiceStats.totalAmount - invoiceStats.paidAmount).toLocaleString()}`,
              color: invoiceStats.totalAmount - invoiceStats.paidAmount > 0 ? '#ff5c5c' : '#4a4845',
            },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #111110' }}>
              <span style={{ fontSize: 13, color: '#4a4845' }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color }}>{value}</span>
            </div>
          ))}
        </div>

      </div>


      {/* Upcoming Meetings Widget */}
      {meetings.length > 0 && (
        <div style={{ marginTop: 20, background: '#161614', border: '1px solid #252523', borderRadius: 14, padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} color="#c8f135" />
              <span style={{ fontSize: 15, fontWeight: 700, color: '#e8e6df' }}>Upcoming Meetings</span>
            </div>
            <Link to="/meetings" style={{ fontSize: 12, color: '#c8f135', textDecoration: 'none', fontWeight: 600 }}>
              View All →
            </Link>
          </div>
          {meetings.map(m => (
            <div key={m.google_event_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #111110' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e6df' }}>{m.title}</div>
                <div style={{ fontSize: 11, color: '#4a4845', marginTop: 2 }}>{fmtMeetingDate(m.start_time)}</div>
              </div>
              {m.meet_link && (
                <button
                  onClick={() => window.open(m.meet_link, '_blank')}
                  className="btn-green"
                  style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Video size={11} /> Join
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Spin animation */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
