import React, { useState, useEffect } from 'react';
import { Settings, Save, ToggleLeft, ToggleRight, Info, Loader2, Check } from 'lucide-react';
import { getAcademySettings, updateAcademySetting } from '../api';

const pageStyle = { padding: '24px 28px', background: '#f5f7fa', minHeight: '100vh' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 20, marginBottom: 16 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };
const labelStyle = { fontSize: 12, fontWeight: 600, color: '#1a1a2e', marginBottom: 6, display: 'block' };
const inputStyle = { width: '100%', padding: '10px 14px', border: '1px solid #e5e7ef', borderRadius: 10, fontSize: 13, color: '#1a1a2e', outline: 'none', boxSizing: 'border-box' };
const hintStyle = { fontSize: 11, color: '#7a7f9a', marginTop: 4, marginBottom: 0, lineHeight: 1.4 };

const booleanKeys = ['community_enabled', 'messaging_enabled'];
const settingMeta = {
  still_watching_interval: { label: '"Still Watching?" Interval (minutes)', hint: 'Prompt students to confirm they are still watching after this many minutes of inactivity.', type: 'number', group: 'video' },
  community_enabled: { label: 'Community', hint: 'Enable the student community discussion board.', type: 'boolean', group: 'toggles' },
  messaging_enabled: { label: 'Direct Messaging', hint: 'Allow students to send direct messages to instructors.', type: 'boolean', group: 'toggles' },
  stripe_price_id: { label: 'Stripe Price ID', hint: 'Primary Stripe Price ID used to verify student access.', type: 'text', group: 'stripe' },
  welcome_message: { label: 'Welcome Message', hint: 'Shown to new students upon first login.', type: 'textarea', group: 'content' },
};

export default function AcademySettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademySettings();
      const map = {};
      if (Array.isArray(data)) {
        data.forEach(s => { map[s.key] = s.value; });
      } else if (data && typeof data === 'object') {
        Object.assign(map, data);
      }
      setSettings(map);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveSetting(key, value) {
    try {
      setSaving(prev => ({ ...prev, [key]: true }));
      await updateAcademySetting(key, value);
      setSettings(prev => ({ ...prev, [key]: value }));
      setSaved(prev => ({ ...prev, [key]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 2000);
    } catch (err) {
      alert('Failed to save: ' + err.message);
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  async function handleToggle(key) {
    const current = settings[key];
    const newVal = current === 'true' || current === true ? false : true;
    setSettings(prev => ({ ...prev, [key]: newVal }));
    await saveSetting(key, newVal);
  }

  function handleInputChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  function isTruthy(val) {
    return val === true || val === 'true' || val === '1';
  }

  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="#4a6cf7" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, color: '#ef4444', textAlign: 'center', padding: 40 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load settings</p>
          <p style={{ fontSize: 13, color: '#7a7f9a' }}>{error}</p>
          <button onClick={loadSettings} style={{ marginTop: 12, padding: '8px 20px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      </div>
    );
  }

  // Gather all keys: known ones + any extra from API
  const knownKeys = Object.keys(settingMeta);
  const extraKeys = Object.keys(settings).filter(k => !knownKeys.includes(k));

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: '#7a7f9a18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Settings size={18} color="#7a7f9a" />
          </div>
          <h1 style={headingStyle}>Academy Settings</h1>
        </div>
      </div>
      <p style={subStyle}>Configure global academy settings, integrations, and feature toggles.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          {/* Video Settings */}
          <div style={cardStyle}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 16 }}>Video Settings</div>
            <SettingInput
              settingKey="still_watching_interval"
              meta={settingMeta.still_watching_interval}
              value={settings.still_watching_interval || ''}
              onChange={v => handleInputChange('still_watching_interval', v)}
              onSave={() => saveSetting('still_watching_interval', settings.still_watching_interval)}
              saving={saving.still_watching_interval}
              saved={saved.still_watching_interval}
            />
          </div>

          {/* Stripe */}
          <div style={cardStyle}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 16 }}>Stripe Integration</div>
            <SettingInput
              settingKey="stripe_price_id"
              meta={settingMeta.stripe_price_id}
              value={settings.stripe_price_id || ''}
              onChange={v => handleInputChange('stripe_price_id', v)}
              onSave={() => saveSetting('stripe_price_id', settings.stripe_price_id)}
              saving={saving.stripe_price_id}
              saved={saved.stripe_price_id}
            />
          </div>

          {/* Welcome Message */}
          <div style={cardStyle}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 16 }}>Welcome Message</div>
            <SettingInput
              settingKey="welcome_message"
              meta={settingMeta.welcome_message}
              value={settings.welcome_message || ''}
              onChange={v => handleInputChange('welcome_message', v)}
              onSave={() => saveSetting('welcome_message', settings.welcome_message)}
              saving={saving.welcome_message}
              saved={saved.welcome_message}
            />
          </div>
        </div>

        <div>
          {/* Feature Toggles */}
          <div style={cardStyle}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 8 }}>Feature Toggles</div>
            {booleanKeys.map(key => {
              const meta = settingMeta[key];
              const isOn = isTruthy(settings[key]);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #f0f1f5' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{meta.label}</div>
                    <div style={{ fontSize: 12, color: '#7a7f9a', marginTop: 2 }}>{meta.hint}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {saving[key] && <Loader2 size={14} color="#4a6cf7" style={{ animation: 'spin 1s linear infinite' }} />}
                    {saved[key] && <Check size={14} color="#22c55e" />}
                    <div onClick={() => handleToggle(key)} style={{ cursor: 'pointer' }}>
                      {isOn
                        ? <ToggleRight size={26} color="#22c55e" />
                        : <ToggleLeft size={26} color="#7a7f9a" />
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Extra settings from API */}
          {extraKeys.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e', marginBottom: 16 }}>Other Settings</div>
              {extraKeys.map(key => (
                <SettingInput
                  key={key}
                  settingKey={key}
                  meta={{ label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), hint: '', type: 'text' }}
                  value={settings[key] || ''}
                  onChange={v => handleInputChange(key, v)}
                  onSave={() => saveSetting(key, settings[key])}
                  saving={saving[key]}
                  saved={saved[key]}
                />
              ))}
            </div>
          )}

          <div style={{ ...cardStyle, background: '#4a6cf708' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Info size={16} color="#4a6cf7" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>Configuration Note</span>
            </div>
            <p style={{ fontSize: 12, color: '#7a7f9a', margin: 0, lineHeight: 1.6 }}>
              Changes to settings will apply immediately across the academy. Disabling features will hide them from the student portal but will not delete any data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingInput({ settingKey, meta, value, onChange, onSave, saving, saved }) {
  const btnSave = { padding: '8px 14px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8 };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{meta.label}</label>
      {meta.type === 'textarea' ? (
        <textarea
          style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={meta.label}
        />
      ) : (
        <input
          style={inputStyle}
          type={meta.type === 'number' ? 'number' : 'text'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={meta.label}
        />
      )}
      {meta.hint && <p style={hintStyle}>{meta.hint}</p>}
      <button onClick={onSave} disabled={saving} style={{ ...btnSave, opacity: saving ? 0.6 : 1 }}>
        {saving ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <Check size={12} /> : <Save size={12} />}
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  );
}
