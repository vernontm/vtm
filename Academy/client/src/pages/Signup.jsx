import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Loader, Eye, EyeOff } from 'lucide-react';

export default function Signup() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await signUp(email, password, fullName);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Signup failed');
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontSize: 15, outline: 'none', fontFamily: 'inherit',
  };

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary)', padding: 20,
      }}>
        <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28,
          }}>✓</div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Check Your Email</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
            We sent a confirmation link to <strong style={{ color: '#f5f5f5' }}>{email}</strong>.
            Click the link to activate your account.
          </p>
          <Link to="/login" style={{
            display: 'inline-block', marginTop: 24, padding: '10px 24px',
            borderRadius: 10, background: 'var(--bg-card)', border: '1px solid var(--border)',
            color: '#f5f5f5', fontSize: 14, fontWeight: 600,
          }}>Back to Sign In</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 24, color: '#fff',
          }}>V</div>
          <h1 style={{ fontSize: 28, color: 'var(--text-primary)', marginBottom: 6 }}>Create Account</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Join VTM Academy and start learning</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, fontSize: 13,
              background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)',
            }}>{error}</div>
          )}

          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Your full name" required autoFocus style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required style={inputStyle} />
          </div>

          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input type={showPw ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 6 characters" required style={inputStyle} />
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
            opacity: loading ? 0.7 : 1, fontFamily: 'inherit',
          }}>
            {loading ? <Loader size={18} className="spin" /> : <UserPlus size={18} />}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'var(--text-secondary)' }}>
          Already have an account? <Link to="/login" style={{ color: '#E8650A', fontWeight: 600 }}>Sign In</Link>
        </p>
      </div>
    </div>
  );
}
