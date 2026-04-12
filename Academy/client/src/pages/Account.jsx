import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getProfile, updateProfile, getBillingStatus, createCheckoutSession, createCustomerPortal } from '../api';
import { Loader, User, CreditCard, Save, ExternalLink, Crown, CheckCircle, ArrowRight } from 'lucide-react';

const card = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24,
};

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg-primary)',
  color: 'var(--text-primary)', fontSize: 14, outline: 'none',
  fontFamily: 'inherit',
};

const btn = {
  padding: '10px 20px', borderRadius: 10, border: 'none',
  background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
  color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const STRIPE_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID || '';

export default function Account() {
  const { profile: authProfile, loadProfile, session } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [billing, setBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [data, bill] = await Promise.all([
          getProfile(),
          getBillingStatus().catch(() => null),
        ]);
        setProfileData(data);
        setBilling(bill);
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

  async function handleSubscribe() {
    if (!STRIPE_PRICE_ID) {
      alert('Subscription is not configured yet. Please check back soon.');
      return;
    }
    setBillingLoading(true);
    try {
      const data = await createCheckoutSession(STRIPE_PRICE_ID);
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error('Failed to create checkout:', err);
      alert('Failed to start checkout. Please try again.');
    }
    setBillingLoading(false);
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
  const isActive = billing?.subscription_status === 'active';

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={28} className="spin" style={{ color: '#E8650A' }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Account</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 28 }}>
        Manage your profile and subscription.
      </p>

      {/* Profile Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <User size={16} style={{ color: '#E8650A' }} />
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Profile</h2>
      </div>

      <div style={{ ...card, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 20, color: '#fff', flexShrink: 0,
          }}>{initial}</div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{fullName || 'Student'}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{email}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Full Name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={handleSave} disabled={saving} style={{
              ...btn, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer',
            }}>
              {saving ? <Loader size={14} className="spin" /> : <Save size={14} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {saved && <span style={{ fontSize: 13, color: '#22c55e' }}>Saved!</span>}
          </div>
        </div>
      </div>

      {/* Subscription Section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <CreditCard size={16} style={{ color: '#E8650A' }} />
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Subscription</h2>
      </div>

      {isActive ? (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(34,197,94,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle size={20} color="#22c55e" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Premium Active</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>You have full access to all courses and content.</p>
            </div>
          </div>
          <button onClick={handleManageBilling} disabled={billingLoading} style={{
            ...btn, background: 'var(--bg-primary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            opacity: billingLoading ? 0.7 : 1, cursor: billingLoading ? 'not-allowed' : 'pointer',
          }}>
            {billingLoading ? <Loader size={14} className="spin" /> : <ExternalLink size={14} />}
            Manage Billing
          </button>
        </div>
      ) : (
        <div style={{
          ...card,
          background: 'linear-gradient(135deg, rgba(232,101,10,0.08) 0%, rgba(255,140,58,0.04) 100%)',
          border: '1px solid rgba(232,101,10,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'linear-gradient(135deg, #E8650A, #ff8c3a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Crown size={20} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Upgrade to Premium</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Get unlimited access to all courses and lessons.</p>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Full access to all courses', 'Unlimited lesson streaming', 'Quizzes & homework feedback', 'Direct messaging with instructor', 'Community access'].map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <CheckCircle size={14} color="#E8650A" /> {f}
              </li>
            ))}
          </ul>

          <button onClick={handleSubscribe} disabled={billingLoading} style={{
            ...btn, width: '100%', justifyContent: 'center',
            opacity: billingLoading ? 0.7 : 1, cursor: billingLoading ? 'not-allowed' : 'pointer',
          }}>
            {billingLoading ? <Loader size={14} className="spin" /> : <ArrowRight size={14} />}
            {billingLoading ? 'Loading...' : 'Subscribe Now'}
          </button>
        </div>
      )}
    </div>
  );
}
