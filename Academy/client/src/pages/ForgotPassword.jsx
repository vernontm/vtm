import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Loader, ArrowLeft } from 'lucide-react';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    }
    setLoading(false);
  };

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-primary)', fontSize: 15, outline: 'none', fontFamily: 'inherit',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, color: 'var(--text-primary)', marginBottom: 6 }}>Reset Password</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {success ? 'Check your email for a reset link.' : 'Enter your email and we\'ll send you a reset link.'}
          </p>
        </div>

        {!success ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 13,
                background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)',
              }}>{error}</div>
            )}
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required autoFocus style={inputStyle} />
            <button type="submit" disabled={loading} style={{
              padding: '12px 24px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
              color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: loading ? 0.7 : 1, fontFamily: 'inherit',
            }}>
              {loading ? <Loader size={18} className="spin" /> : <Mail size={18} />}
              Send Reset Link
            </button>
          </form>
        ) : (
          <div style={{
            padding: '16px', borderRadius: 12, background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center', color: '#22c55e', fontSize: 14,
          }}>
            Reset link sent to <strong>{email}</strong>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link to="/login" style={{ color: 'var(--text-secondary)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
