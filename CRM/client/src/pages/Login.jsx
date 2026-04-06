import React, { useState } from 'react';
import { BarChart3, LogIn } from 'lucide-react';
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
    <div style={{ minHeight: '100vh', background: '#0a0a08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 360, padding: 40 }}>
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #ff9b26, #ee4c27)', borderRadius: 10 }} className="flex items-center justify-center">
            <BarChart3 size={22} color="#0a0a08" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#e8e6df', fontFamily: 'Poppins, sans-serif' }}>Vernon Tech</div>
            <div style={{ fontSize: 11, color: '#4a4845', fontFamily: 'DM Mono, monospace' }}>&amp; Media CRM</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#4a4845', marginBottom: 6, fontFamily: 'DM Mono, monospace' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#111110', border: '1px solid #252523', color: '#e8e6df',
                fontSize: 14, outline: 'none', fontFamily: 'DM Mono, monospace',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(255,155,38,0.5)'}
              onBlur={e => e.target.style.borderColor = '#252523'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#4a4845', marginBottom: 6, fontFamily: 'DM Mono, monospace' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#111110', border: '1px solid #252523', color: '#e8e6df',
                fontSize: 14, outline: 'none', fontFamily: 'DM Mono, monospace',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(255,155,38,0.5)'}
              onBlur={e => e.target.style.borderColor = '#252523'}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,92,92,0.1)', border: '1px solid rgba(255,92,92,0.3)', color: '#ff5c5c', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #ff9b26, #ee4c27)', border: 'none',
              color: '#0a0a08', fontSize: 14, fontWeight: 700, fontFamily: 'Poppins, sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: loading ? 0.7 : 1,
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
