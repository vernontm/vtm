import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

const BLUE_GRADIENT = 'linear-gradient(135deg, #3b82f6, #1d4ed8)'
const FOCUS_BORDER = 'rgba(59,130,246,0.4)'
const FOCUS_RING = '0 0 0 3px rgba(59,130,246,0.10)'

const pageStyle = {
  minHeight: '100vh',
  width: '100%',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--bg)',
  padding: '24px',
}

const cardStyle = {
  width: '100%',
  maxWidth: 420,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 20,
  padding: '36px 32px 32px',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
}

const titleStyle = {
  fontFamily: 'var(--font-display)',
  fontWeight: 800,
  fontSize: 28,
  letterSpacing: '-0.02em',
  background: BLUE_GRADIENT,
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  color: 'transparent',
  textAlign: 'center',
  marginBottom: 6,
}

const subtitleStyle = {
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  color: 'var(--muted)',
  textAlign: 'center',
  marginBottom: 28,
}

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 8,
}

const inputBaseStyle = {
  width: '100%',
  padding: '13px 14px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  outline: 'none',
  transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
}

const buttonStyle = (disabled) => ({
  width: '100%',
  padding: '13px 16px',
  marginTop: 4,
  background: BLUE_GRADIENT,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: '-0.005em',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.7 : 1,
  boxShadow: '0 8px 22px rgba(59,130,246,0.25)',
  transition: 'transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease',
})

const errorStyle = {
  marginTop: 14,
  padding: '10px 12px',
  background: 'rgba(239,68,68,0.08)',
  border: '1px solid rgba(239,68,68,0.25)',
  borderRadius: 8,
  color: '#ff6b6b',
  fontSize: 12.5,
  fontFamily: 'var(--font-body)',
  textAlign: 'center',
}

export default function Login() {
  const { signIn, demoMode } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(null)

  async function enterDemo() {
    setSubmitting(true)
    await signIn('demo@vtm.crm', 'demo')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error: signInError } = await signIn(email, password)
    if (signInError) {
      setError(signInError.message)
      setSubmitting(false)
    }
  }

  function inputStyleFor(name) {
    const isFocused = focused === name
    return {
      ...inputBaseStyle,
      borderColor: isFocused ? FOCUS_BORDER : 'var(--border)',
      boxShadow: isFocused ? FOCUS_RING : 'none',
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle} className="fade-up">
        <h1 style={titleStyle}>VTM CRM</h1>
        <p style={subtitleStyle}>Sign in to your workspace</p>

        {demoMode && (
          <div
            style={{
              marginBottom: 22,
              padding: '12px 14px',
              background: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 10,
              fontSize: 12.5,
              color: 'var(--muted)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: '#3b82f6' }}>Demo mode</strong> — no backend
            connected. Use any email &amp; password, or{' '}
            <button
              type="button"
              onClick={enterDemo}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                fontWeight: 700,
                cursor: 'pointer',
                padding: 0,
                fontSize: 12.5,
                textDecoration: 'underline',
              }}
            >
              explore instantly
            </button>
            .
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="login-email" style={labelStyle}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused('email')}
              onBlur={() => setFocused(null)}
              style={inputStyleFor('email')}
              placeholder="you@company.com"
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label htmlFor="login-password" style={labelStyle}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocused('password')}
              onBlur={() => setFocused(null)}
              style={inputStyleFor('password')}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={buttonStyle(submitting)}
            onMouseEnter={(e) => {
              if (submitting) return
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 12px 28px rgba(59,130,246,0.35)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 8px 22px rgba(59,130,246,0.25)'
            }}
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>

          {error && <div style={errorStyle}>{error}</div>}
        </form>
      </div>
    </div>
  )
}
