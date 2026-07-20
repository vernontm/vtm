import { UserPlus, Briefcase, DollarSign, Calendar, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import StatCard from '../components/StatCard.jsx'
import { useData } from '../context/DataContext.jsx'
import { currency, timeAgo } from '../lib/format'

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 18,
  marginBottom: 28,
}

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 14,
}

const sectionTitleStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: '-0.01em',
}

const ACTIVITY_ACCENT = {
  deal: '#c084fc',
  lead: '#60a5fa',
  contact: '#3b82f6',
  meeting: '#2ecc71',
  email: '#f59e0b',
}

export default function Dashboard() {
  const { leads, deals, stats, activities } = useData()
  const navigate = useNavigate()

  const wonCount = deals.filter((d) => d.stage === 'Won').length

  return (
    <div>
      <div style={gridStyle}>
        <StatCard label="Total Leads" value={String(stats.totalLeads)} icon={UserPlus}
          delta={`${leads.filter((l) => l.status === 'New').length} new`} delay={0} />
        <StatCard label="Active Deals" value={String(stats.activeDeals)} icon={Briefcase}
          delta={`${currency(stats.pipelineValue)} pipeline`} delay={80} />
        <StatCard label="Revenue (Won)" value={currency(stats.wonRevenue)} icon={DollarSign}
          delta={`${wonCount} closed`} delay={160} />
        <StatCard label="Meetings This Week" value={String(stats.meetingsThisWeek)} icon={Calendar}
          delta="upcoming" delay={240} />
      </div>

      <section className="card fade-up" style={{ animationDelay: '320ms', padding: 22 }}>
        <div style={sectionHeaderStyle}>
          <div style={sectionTitleStyle}>Recent Activity</div>
          <span className="pill pill-muted">Live</span>
        </div>

        {activities.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Activity size={22} /></div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600 }}>
              No recent activity yet
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 360 }}>
              Activity from your leads, deals, and meetings will show up here as you work.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activities.slice(0, 8).map((a, i) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '13px 4px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: ACTIVITY_ACCENT[a.type] || 'var(--muted)',
                    boxShadow: `0 0 8px ${ACTIVITY_ACCENT[a.type] || 'transparent'}`,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13.5, flex: 1 }}>{a.text}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {timeAgo(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button className="btn-secondary" onClick={() => navigate('/leads')}>
          <UserPlus size={15} /> Manage Leads
        </button>
        <button className="btn-secondary" onClick={() => navigate('/deals')}>
          <Briefcase size={15} /> View Pipeline
        </button>
        <button className="btn-secondary" onClick={() => navigate('/meetings')}>
          <Calendar size={15} /> Meetings
        </button>
      </div>
    </div>
  )
}
