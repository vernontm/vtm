import { TrendingUp } from 'lucide-react'

export default function StatCard({ label, value, icon: Icon, accent, delta, delay = 0 }) {
  return (
    <div
      className="card fade-up"
      style={{
        animationDelay: `${delay}ms`,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: accent || 'rgba(59,130,246,0.1)',
            color: 'var(--blue)',
            border: '1px solid rgba(59,130,246,0.2)',
          }}
        >
          {Icon && <Icon size={17} strokeWidth={2} />}
        </div>
      </div>

      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="pill pill-muted">
          <TrendingUp size={12} />
          {delta || 'No change'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>vs last week</span>
      </div>
    </div>
  )
}
