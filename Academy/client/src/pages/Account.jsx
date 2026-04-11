import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getProfile, updateProfile, createCustomerPortal } from '../api';
import { Loader, User, CreditCard, Save, ExternalLink } from 'lucide-react';

const cardStyle = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24,
};

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  fontFamily: 'inherit',
};

const btnStyle = {
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

export default function Account() {
  const { profile: authProfile, loadProfile, session } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await getProfile();
        setProfileData(data);
        setFullName(data.full_name || authProfile?.full_name || '');
        setEmail(data.email || session?.user?.email || '');
      } catch (err) {
        console.error('Failed to load profile:', err);
        setFullName(authProfile?.full_name || '');
        setEmail(session?.user?.email || '');
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile({ full_name: fullName, email });
      if (session?.user?.id) loadProfile(session.user.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save profile:', err);
    }
    setSaving(false);
  }

  async function handleManageBilling() {
    setBillingLoading(true);
    try {
      const data = await createCustomerPortal();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Failed to open billing portal:', err);
    }
    setBillingLoading(false);
  }

  const initial = (fullName || 'U')[0].toUpperCase();

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Syne', fontSize: 28, color: 'var(--text-primary)', marginBottom: 4 }}>Account</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 32 }}>
        Manage your profile and subscription.
      </p>

      {/* Profile Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <User size={18} style={{ color: '#E8650A' }} />
        <h2 style={{ fontFamily: 'Syne', fontSize: 20, color: 'var(--text-primary)' }}>Profile</h2>
      </div>

      <div style={{ ...cardStyle, marginBottom: 32 }}>
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Syne', fontWeight: 800, fontSize: 22, color: '#fff', flexShrink: 0,
          }}>{initial}</div>
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{fullName || 'Student'}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{email}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Full Name</label>
            <input
              value={fullName} onChange={e => setFullName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleSave} disabled={saving} style={{
              ...btnStyle, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? <Loader size={14} className="spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saved && <span style={{ fontSize: 13, color: '#22c55e' }}>Saved!</span>}
          </div>
        </div>
      </div>

      {/* Subscription Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <CreditCard size={18} style={{ color: '#E8650A' }} />
        <h2 style={{ fontFamily: 'Syne', fontSize: 20, color: 'var(--text-primary)' }}>Subscription</h2>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {profileData?.subscription_status === 'active' ? 'Active Subscription' : 'No Active Subscription'}
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {profileData?.plan_name || 'Manage your plan and billing details'}
            </p>
          </div>
          <button onClick={handleManageBilling} disabled={billingLoading} style={{
            ...btnStyle, opacity: billingLoading ? 0.7 : 1, cursor: billingLoading ? 'not-allowed' : 'pointer',
          }}>
            {billingLoading ? <Loader size={14} className="spin" /> : <ExternalLink size={14} />}
            Manage Billing
          </button>
        </div>
      </div>
    </div>
  );
}
