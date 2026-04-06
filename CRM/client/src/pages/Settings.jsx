import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Mail, CheckCircle, AlertCircle, Loader, ExternalLink } from 'lucide-react';
import { getSettings, bulkUpdateSettings, getGmailStatus, connectGmail, disconnectGmail } from '../api';

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        background: checked ? '#c8f135' : '#252523',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: 9,
        background: '#fff', transition: 'left 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
  return (
    <div style={{ background: '#161614', borderRadius: 10, padding: '20px 24px', border: '1px solid #252523' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {Icon && <Icon size={16} color="#c8f135" />}
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e8e6df' }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ── Form row ─────────────────────────────────────────────────────────────────
function FormRow({ label, hint, children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
      <div>
        <label style={{ fontSize: 13, color: '#7a7870', display: 'block', paddingTop: 6 }}>{label}</label>
        {hint && <div style={{ fontSize: 11, color: '#4a4845', marginTop: 2 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

const INPUT_STYLE = {
  width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13, color: '#e8e6df',
  background: '#111328', border: '1px solid #252523', outline: 'none', boxSizing: 'border-box',
};
const TEXTAREA_STYLE = {
  ...INPUT_STYLE, resize: 'vertical', minHeight: 80, lineHeight: 1.5, fontFamily: 'inherit',
};

export default function Settings() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();

  const [settings, setSettings]       = useState({});
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: '', expired: false });
  const [saving, setSaving]           = useState(false);
  const [saveMsg, setSaveMsg]         = useState(''); // '' | 'saved' | 'error'
  const [gmailMsg, setGmailMsg]       = useState(''); // '' | 'connected' | 'error:...'
  const [loading, setLoading]         = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([getSettings(), getGmailStatus()]);
      setSettings(s);
      setGmailStatus(g);
    } catch (e) {
      console.error('Failed to load settings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // Handle OAuth callback URL params
  useEffect(() => {
    if (searchParams.get('gmail_connected') === 'true') {
      setGmailMsg('connected');
      loadSettings();
      navigate('/settings', { replace: true });
    }
    const err = searchParams.get('gmail_error');
    if (err) {
      setGmailMsg(`error:${err}`);
      navigate('/settings', { replace: true });
    }
  }, [searchParams, navigate, loadSettings]);

  const set = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await bulkUpdateSettings(settings);
      setSaveMsg('saved');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) {
      setSaveMsg('error');
      setTimeout(() => setSaveMsg(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnectGmail = async () => {
    if (!window.confirm('Disconnect Gmail? You will need to re-authorise to send emails.')) return;
    try {
      await disconnectGmail();
      setGmailStatus({ connected: false, email: '', expired: false });
      setGmailMsg('');
    } catch (e) {
      alert('Failed to disconnect Gmail: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#4a4845' }}>
        <Loader size={20} className="animate-spin" /> &nbsp; Loading settings…
      </div>
    );
  }

  const gmailError = gmailMsg.startsWith('error:') ? gmailMsg.slice(6) : '';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 60px' }}>
      {/* Header */}
      <div className="page-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SettingsIcon size={20} />
          Settings
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Business Profile ─────────────────────────────────────────────── */}
        <Section title="Business Profile" icon={SettingsIcon}>
          <p style={{ fontSize: 12, color: '#4a4845', margin: '0 0 16px' }}>
            Used by the AI email generator in every prompt. Be specific — the more detail, the better the emails.
          </p>
          <FormRow label="Company Name">
            <input
              style={INPUT_STYLE}
              value={settings.company_name || ''}
              onChange={e => set('company_name', e.target.value)}
              placeholder="e.g. Vernon Tech & Media"
            />
          </FormRow>
          <FormRow label="Sender Name" hint="How emails are signed">
            <input
              style={INPUT_STYLE}
              value={settings.sender_name || ''}
              onChange={e => set('sender_name', e.target.value)}
              placeholder="e.g. Vernon"
            />
          </FormRow>
          <FormRow label="Services Offered" hint="What you sell / do">
            <textarea
              style={TEXTAREA_STYLE}
              value={settings.services_offered || ''}
              onChange={e => set('services_offered', e.target.value)}
              placeholder="e.g. TikTok growth strategy, content creation, monetization coaching for creators…"
            />
          </FormRow>
          <FormRow label="Target Client" hint="Who is your ideal customer">
            <textarea
              style={{ ...TEXTAREA_STYLE, minHeight: 64 }}
              value={settings.target_client || ''}
              onChange={e => set('target_client', e.target.value)}
              placeholder="e.g. Aspiring content creators looking to turn their following into income…"
            />
          </FormRow>
          <FormRow label="Email Tone">
            <select
              style={INPUT_STYLE}
              value={settings.tone_preference || 'professional'}
              onChange={e => set('tone_preference', e.target.value)}
            >
              <option value="professional">Professional</option>
              <option value="conversational">Conversational</option>
              <option value="motivational">Motivational</option>
              <option value="direct">Direct</option>
            </select>
          </FormRow>
        </Section>

        {/* ── Email Signature ───────────────────────────────────────────────── */}
        <Section title="Email Signature" icon={Mail}>
          <FormRow label="Signature" hint="Appended to every email">
            <textarea
              style={{ ...TEXTAREA_STYLE, minHeight: 100 }}
              value={settings.email_signature || ''}
              onChange={e => set('email_signature', e.target.value)}
              placeholder={`Best,\nVernon\n\nVernon Tech & Media\nhttps://vernontm.com`}
            />
          </FormRow>
          {settings.email_signature && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: '#4a4845', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</div>
              <div style={{
                background: '#111328', border: '1px solid #252523', borderRadius: 6,
                padding: '10px 14px', fontSize: 13, color: '#7a7870',
                whiteSpace: 'pre-wrap', fontFamily: 'inherit',
              }}>
                {settings.email_signature}
              </div>
            </div>
          )}
        </Section>

        {/* ── Gmail OAuth ───────────────────────────────────────────────────── */}
        <Section title="Gmail Connection" icon={Mail}>
          {/* Status messages */}
          {gmailMsg === 'connected' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#c8f13520', border: '1px solid #c8f135', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#c8f135', fontSize: 13 }}>
              <CheckCircle size={15} /> Gmail connected successfully!
            </div>
          )}
          {gmailError && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#ff5c5c20', border: '1px solid #ff5c5c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#ff5c5c', fontSize: 13 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /> {gmailError}
            </div>
          )}

          {/* Connection status indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: gmailStatus.connected && !gmailStatus.expired ? '#c8f135' : '#ff5c5c',
              boxShadow: gmailStatus.connected && !gmailStatus.expired ? '0 0 6px #c8f135' : '0 0 6px #ff5c5c',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, color: '#7a7870' }}>
              {gmailStatus.connected
                ? `Connected as ${gmailStatus.email}${gmailStatus.expired ? ' (token expired — reconnect)' : ''}`
                : 'Not connected'}
            </span>
          </div>

          {!gmailStatus.connected ? (
            <div>
              <p style={{ fontSize: 12, color: '#4a4845', margin: '0 0 14px', lineHeight: 1.6 }}>
                Connecting Gmail lets you send emails and save drafts directly from the Email Campaign page.
                You'll be redirected to Google to authorise access.
              </p>
              <div style={{ background: '#111328', border: '1px solid #252523', borderRadius: 8, padding: '14px 16px', marginBottom: 14, fontSize: 12, color: '#4a4845' }}>
                <div style={{ fontWeight: 600, color: '#7a7870', marginBottom: 8 }}>Before connecting, make sure you have:</div>
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
                  <li>Created a Google Cloud project and enabled the Gmail API</li>
                  <li>Set up OAuth2 credentials (Web Application type)</li>
                  <li>Added <code style={{ background: '#161614', padding: '1px 5px', borderRadius: 3 }}>http://localhost:3001/auth/gmail/callback</code> as a redirect URI</li>
                  <li>Added <code style={{ background: '#161614', padding: '1px 5px', borderRadius: 3 }}>GOOGLE_CLIENT_ID</code>, <code style={{ background: '#161614', padding: '1px 5px', borderRadius: 3 }}>GOOGLE_CLIENT_SECRET</code> to <code style={{ background: '#161614', padding: '1px 5px', borderRadius: 3 }}>server/.env</code></li>
                  <li>Added your Gmail as a test user in the OAuth consent screen</li>
                </ol>
                <a
                  href="https://console.cloud.google.com"
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#c8f135', fontSize: 12, marginTop: 8 }}
                >
                  Open Google Cloud Console <ExternalLink size={11} />
                </a>
              </div>
              <button
                className="btn-primary"
                onClick={connectGmail}
                style={{ gap: 8 }}
              >
                <Mail size={14} /> Connect Gmail
              </button>
            </div>
          ) : (
            <button
              onClick={handleDisconnectGmail}
              style={{
                background: 'none', border: '1px solid #ff5c5c', color: '#ff5c5c',
                borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13,
              }}
            >
              Disconnect Gmail
            </button>
          )}
        </Section>

        {/* ── Auto-Draft ────────────────────────────────────────────────────── */}
        <Section title="Auto-Draft" icon={Mail}>
          <FormRow label="Auto-Save to Drafts" hint="When ON, every email you approve is automatically saved to your Gmail Drafts">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 2 }}>
              <Toggle
                checked={settings.auto_draft_enabled === 'true'}
                onChange={v => set('auto_draft_enabled', String(v))}
              />
              <span style={{ fontSize: 13, color: '#7a7870' }}>
                {settings.auto_draft_enabled === 'true' ? 'ON — Approved emails will be saved to Gmail Drafts' : 'OFF'}
              </span>
            </div>
          </FormRow>
        </Section>

        {/* ── Sending Limits ────────────────────────────────────────────────── */}
        <Section title="Sending Limits" icon={SettingsIcon}>
          <FormRow label="Daily Send Cap" hint="Emails per day (Gmail free limit is ~500/day, 50 is a safe default)">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                style={{ ...INPUT_STYLE, width: 100 }}
                type="number"
                min={1}
                max={500}
                value={settings.daily_send_cap || '50'}
                onChange={e => set('daily_send_cap', e.target.value)}
              />
              <span style={{ fontSize: 12, color: '#4a4845' }}>emails / day</span>
            </div>
          </FormRow>
        </Section>

        {/* ── Unsubscribe Footer ────────────────────────────────────────────── */}
        <Section title="Unsubscribe Footer" icon={Mail}>
          <FormRow label="Auto-append footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 2 }}>
              <Toggle
                checked={settings.unsubscribe_enabled === 'true'}
                onChange={v => set('unsubscribe_enabled', String(v))}
              />
              <span style={{ fontSize: 13, color: '#7a7870' }}>
                {settings.unsubscribe_enabled === 'true' ? 'ON' : 'OFF'}
              </span>
            </div>
          </FormRow>
          {settings.unsubscribe_enabled === 'true' && (
            <FormRow label="Footer text">
              <textarea
                style={{ ...TEXTAREA_STYLE, minHeight: 60 }}
                value={settings.unsubscribe_text || ''}
                onChange={e => set('unsubscribe_text', e.target.value)}
              />
            </FormRow>
          )}
        </Section>

        {/* ── Save button ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '9px 24px', fontSize: 14 }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> Saving…</> : 'Save Settings'}
          </button>
          {saveMsg === 'saved' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c8f135', fontSize: 13 }}>
              <CheckCircle size={15} /> Saved successfully
            </span>
          )}
          {saveMsg === 'error' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ff5c5c', fontSize: 13 }}>
              <AlertCircle size={15} /> Failed to save — try again
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
