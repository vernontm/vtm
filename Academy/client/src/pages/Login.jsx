import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogIn, Loader, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || 'Invalid email or password');
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontSize: 15, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: '#fff',
          }}>V</div>
          <h1 style={{ fontSize: 28, color: 'var(--text-primary)', marginBottom: 6 }}>Welcome Back</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Sign in to your VTM Academy account</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)',
            }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus
              style={inputStyle}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>Password</label>
              <Link to="/forgot-password" style={{ fontSize: 12, color: '#E8650A' }}>Forgot?</Link>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password" required
                style={inputStyle}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
              }}>
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} style={{
            padding: '12px 24px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
            fontFamily: 'inherit',
          }}>
            {loading ? <Loader size={18} className="spin" /> : <LogIn size={18} />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-secondary)' }}>
          Don't have an account? <Link to="/signup" style={{ color: '#E8650A', fontWeight: 600 }}>Sign Up</Link>
        </p>
      </div>
    </div>
  );
}
