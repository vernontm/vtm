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
    <div style={{ minHeight: '100vh', background: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 380, padding: 40, background: '#ffffff', borderRadius: 16, border: '1px solid #e5e7ef', boxShadow: '0 8px 32px rgba(0,0,0,0.06)' }}>
        {/* Logo */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, marginBottom:32 }}>
          <img src={import.meta.env.BASE_URL + 'vtm-icon.png'} alt="VTM" style={{ width:64, height:64, borderRadius:14, objectFit:'cover' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:800, color:'#1a1a2e', fontFamily:'Inter, sans-serif' }}>Vernon Tech & Media</div>
            <div style={{ fontSize:12, color:'#8e8ea0', fontFamily:'Inter, sans-serif', marginTop:2 }}>CRM</div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#8e8ea0', marginBottom: 6, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#f5f7fa', border: '1px solid #e5e7ef', color: '#1a1a2e',
                fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif',
              }}
              onFocus={e => { e.target.style.borderColor = '#4a6cf7'; e.target.style.boxShadow = '0 0 0 3px rgba(74,108,247,0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#e5e7ef'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, color: '#8e8ea0', marginBottom: 6, fontWeight: 500, fontFamily: 'Inter, sans-serif' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                background: '#f5f7fa', border: '1px solid #e5e7ef', color: '#1a1a2e',
                fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif',
              }}
              onFocus={e => { e.target.style.borderColor = '#4a6cf7'; e.target.style.boxShadow = '0 0 0 3px rgba(74,108,247,0.1)'; }}
              onBlur={e => { e.target.style.borderColor = '#e5e7ef'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 16, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,92,92,0.06)', border: '1px solid rgba(255,92,92,0.2)', color: '#ff5c5c', fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 8, cursor: loading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', border: 'none',
              color: '#ffffff', fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif',
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
