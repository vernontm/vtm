import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 380, padding: 40, background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border)', boxShadow: '0 8px 60px rgba(0,0,0,0.5)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(37,99,235,0.35)',
            overflow: 'hidden',
          }}>
            <img
              src={import.meta.env.BASE_URL + 'vtm-icon.png'}
              alt="VTM"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Vernon Tech &amp; Media</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-display)', marginTop: 2 }}>CRM</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, fontFamily: 'var(--font-display)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
                background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)',
                fontSize: 14, outline: 'none', fontFamily: 'var(--font-body)',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--orange)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, fontFamily: 'var(--font-display)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
                background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)',
                fontSize: 14, outline: 'none', fontFamily: 'var(--font-body)',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--orange)'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171', fontSize: 13, fontFamily: 'var(--font-display)' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 10, cursor: loading ? 'wait' : 'pointer',
              background: 'var(--btn-black)', border: 'none',
              color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(17,20,26,0.22)',
            }}
          >
            <LogIn size={16} />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
