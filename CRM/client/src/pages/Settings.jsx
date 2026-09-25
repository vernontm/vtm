import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Settings as SettingsIcon, Mail, CheckCircle, AlertCircle, Loader, ExternalLink, Clock, Zap } from 'lucide-react';
import { getSettings, bulkUpdateSettings, getGmailStatus, connectGmail, disconnectGmail } from '../api';
import { toast } from '../components/Toast';
import { DEFAULT_AUTOMATIONS, PLACEHOLDERS, AUTOMATION_TITLES, SAMPLE_VARS, fillTemplate, parseAutomations } from '../lib/templates';

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
        background: checked ? 'var(--orange)' : '#e5e7ef',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3,
        left: checked ? 23 : 3,
        width: 18, height: 18, borderRadius: 9,
        background: 'var(--surface)', transition: 'left 0.18s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '20px 24px', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        {Icon && <Icon size={16} color="var(--orange)" />}
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{title}</h3>
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
        <label style={{ fontSize: 13, color: 'var(--muted)', display: 'block', paddingTop: 6 }}>{label}</label>
        {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

const INPUT_STYLE = {
  width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13, color: 'var(--text)',
  background: 'var(--bg)', border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box',
};
const TEXTAREA_STYLE = {
  ...INPUT_STYLE, resize: 'vertical', minHeight: 80, lineHeight: 1.5, fontFamily: 'inherit',
};

// Work hours that gate what times the assistant offers for meetings. Stored as
// the JSON setting 'scheduling_hours'; self-contained so it does not depend on
// the flat settings map.
const WH_DEFAULT = { days: [1, 2, 3, 4], start: '08:00', end: '20:00', tz: 'America/Chicago' };
const WH_DAYS = [['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]];
const WH_ZONES = ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix'];
const whParse = (s) => { try { return JSON.parse(s); } catch { return null; } };

function WorkHoursSection() {
  const [wh, setWh] = useState(WH_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    getSettings().then(s => {
      let v;
      if (Array.isArray(s)) v = s.find(r => r.key === 'scheduling_hours')?.value;
      else if (s && typeof s === 'object') v = s.scheduling_hours;
      const parsed = typeof v === 'string' ? whParse(v) : v;
      if (parsed && Array.isArray(parsed.days)) setWh({ ...WH_DEFAULT, ...parsed });
    }).catch(() => {});
  }, []);
  const toggleDay = (d) => setWh(w => ({ ...w, days: w.days.includes(d) ? w.days.filter(x => x !== d) : [...w.days, d].sort((a, b) => a - b) }));
  const save = async () => {
    setSaving(true); setMsg('');
    try { await bulkUpdateSettings([{ key: 'scheduling_hours', value: JSON.stringify(wh) }]); setMsg('saved'); setTimeout(() => setMsg(''), 3000); }
    catch { setMsg('error'); setTimeout(() => setMsg(''), 4000); }
    finally { setSaving(false); }
  };
  return (
    <Section title="Scheduling / Work Hours" icon={Clock}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
        The assistant only offers meeting times inside these hours. A meeting's last start is the end time minus its length, so a 1 hour meeting ending by 8pm starts by 7.
      </p>
      <FormRow label="Days available">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {WH_DAYS.map(([lbl, d]) => { const on = wh.days.includes(d); return (
            <button key={d} type="button" onClick={() => toggleDay(d)}
              style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700, border: `1.5px solid ${on ? 'var(--orange)' : 'var(--border)'}`, background: on ? 'rgba(37,99,235,0.12)' : 'var(--surface)', color: on ? 'var(--orange)' : 'var(--muted)' }}>{lbl}</button>
          ); })}
        </div>
      </FormRow>
      <FormRow label="Start time"><input type="time" style={INPUT_STYLE} value={wh.start} onChange={e => setWh(w => ({ ...w, start: e.target.value }))} /></FormRow>
      <FormRow label="End time" hint="Latest a meeting can finish"><input type="time" style={INPUT_STYLE} value={wh.end} onChange={e => setWh(w => ({ ...w, end: e.target.value }))} /></FormRow>
      <FormRow label="Timezone">
        <select style={INPUT_STYLE} value={wh.tz} onChange={e => setWh(w => ({ ...w, tz: e.target.value }))}>
          {WH_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
      </FormRow>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save work hours'}</button>
        {msg === 'saved' && <span style={{ fontSize: 13, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle size={15} /> Saved</span>}
        {msg === 'error' && <span style={{ fontSize: 13, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertCircle size={15} /> Failed to save</span>}
      </div>
    </Section>
  );
}

// Texts the CRM sends on its own (thank-you after a meetup, meeting
// confirmation) and what a Nudge sends (invoice, agreement, plan past due).
// Stored as one JSON value under the settings key 'automations'; the iPhone
// app edits the same value, and the defaults live in src/lib/templates.js.
const AUTOMATION_KEYS = Object.keys(DEFAULT_AUTOMATIONS);
const AUTOMATION_HELP = {
  thank_you: 'Goes out the morning after any in-person meeting with a known number.',
  meeting_confirmation: 'Texted when a meeting is created from a conversation. {link} becomes the Meet link, or the address for in-person.',
  invoice_reminder: 'What Nudge sends for an unpaid invoice, by text and email. {link} is the pay link.',
  agreement_reminder: 'What Nudge sends for an agreement that has not been signed. {link} is the sign link.',
  plan_past_due: 'What Nudge sends when a client plan payment fails. {link} lets them update the card.',
};
const SEND_HOURS = [7, 8, 9, 10];
const fmtHour = (h) => `${h > 12 ? h - 12 : h} ${h >= 12 ? 'PM' : 'AM'}`;

function AutomationsSection() {
  const [auto, setAuto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const refs = useRef({});   // template textareas by key, for insert-at-cursor

  useEffect(() => {
    getSettings().then(rows => setAuto(parseAutomations(rows))).catch(() => setAuto(parseAutomations([])));
  }, []);

  const set = (key, patch) => setAuto(a => ({ ...a, [key]: { ...a[key], ...patch } }));

  // Drop {placeholder} where the caret is (or at the end), then put the caret
  // right after it so the next chip lands in the right spot too.
  const insert = (key, p) => {
    const el = refs.current[key];
    const cur = auto[key].template || '';
    const token = `{${p}}`;
    let start = cur.length, end = cur.length;
    if (el && typeof el.selectionStart === 'number') { start = el.selectionStart; end = el.selectionEnd; }
    set(key, { template: cur.slice(0, start) + token + cur.slice(end) });
    const caret = start + token.length;
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(caret, caret); } catch (_) { /* ignore */ }
    });
  };

  const save = async () => {
    setSaving(true); setMsg('');
    try { await bulkUpdateSettings([{ key: 'automations', value: JSON.stringify(auto) }]); setMsg('saved'); setTimeout(() => setMsg(''), 3000); }
    catch { setMsg('error'); setTimeout(() => setMsg(''), 4000); }
    finally { setSaving(false); }
  };

  const chip = {
    fontSize: 11.5, fontWeight: 600, fontFamily: 'monospace', color: 'var(--orange)',
    background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 999,
    padding: '3px 9px', cursor: 'pointer',
  };

  return (
    <Section title="Automations (texts and nudges)" icon={Zap}>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
        The texts the CRM sends on its own, and what a Nudge sends. Click a placeholder to drop it into the template where your cursor is. The preview fills it with sample values.
      </p>
      {!auto ? (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {AUTOMATION_KEYS.map(k => {
            const a = auto[k];
            const on = a.enabled !== false;
            const mode = a.mode === 'assistant' ? 'assistant' : 'template';
            return (
              <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'var(--bg)', marginBottom: 12, opacity: on ? 1 : 0.75 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{AUTOMATION_TITLES[k].title}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{AUTOMATION_HELP[k] || AUTOMATION_TITLES[k].sub}</div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: on ? 'var(--text)' : 'var(--muted)', cursor: 'pointer', flexShrink: 0, paddingTop: 2 }}>
                    <input type="checkbox" checked={on} onChange={e => set(k, { enabled: e.target.checked })} style={{ margin: 0 }} />
                    {on ? 'On' : 'Off'}
                  </label>
                </div>

                {k === 'thank_you' && (
                  <FormRow label="Send at" hint="Central time, the day after">
                    <select style={{ ...INPUT_STYLE, width: 140 }} value={SEND_HOURS.includes(Number(a.send_hour)) ? Number(a.send_hour) : 8} onChange={e => set(k, { send_hour: Number(e.target.value) })}>
                      {SEND_HOURS.map(h => <option key={h} value={h}>{fmtHour(h)}</option>)}
                    </select>
                  </FormRow>
                )}

                <FormRow label="Mode" hint={mode === 'assistant' ? 'The assistant writes each one fresh, matching the tone and length of your template.' : 'Sent exactly as written, with the placeholders filled in.'}>
                  <select style={{ ...INPUT_STYLE, width: 220 }} value={mode} onChange={e => set(k, { mode: e.target.value })}>
                    <option value="template">Use the template</option>
                    <option value="assistant">Assistant writes it</option>
                  </select>
                </FormRow>

                <FormRow label="Template">
                  <textarea
                    ref={el => { refs.current[k] = el; }}
                    style={{ ...TEXTAREA_STYLE, minHeight: 72 }}
                    value={a.template || ''}
                    onChange={e => set(k, { template: e.target.value })}
                    placeholder="Write the message"
                  />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {PLACEHOLDERS[k].map(p => (
                      <button key={p} type="button" style={chip} onClick={() => insert(k, p)} title={`Insert {${p}}`}>{`{${p}}`}</button>
                    ))}
                  </div>
                </FormRow>

                <FormRow label="Preview" hint="With sample values">
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: 'var(--text)', lineHeight: 1.55, whiteSpace: 'pre-wrap', minHeight: 20 }}>
                    {fillTemplate(a.template, SAMPLE_VARS) || <span style={{ color: 'var(--muted)' }}>(empty)</span>}
                  </div>
                </FormRow>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save templates'}</button>
            {msg === 'saved' && <span style={{ fontSize: 13, color: '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle size={15} /> Saved. New texts use these templates.</span>}
            {msg === 'error' && <span style={{ fontSize: 13, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertCircle size={15} /> Failed to save</span>}
          </div>
        </>
      )}
    </Section>
  );
}

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
      toast('error', 'Failed to disconnect Gmail: ' + e.message);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)' }}>
        <Loader size={20} className="animate-spin" /> &nbsp; Loading settings…
      </div>
    );
  }

  const gmailError = gmailMsg.startsWith('error:') ? gmailMsg.slice(6) : '';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 24px 60px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Business Profile ─────────────────────────────────────────────── */}
        <Section title="Business Profile" icon={SettingsIcon}>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px' }}>
            Used by the AI email generator in every prompt. Be specific: the more detail, the better the emails.
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
              maxLength={2000}
              value={settings.services_offered || ''}
              onChange={e => set('services_offered', e.target.value)}
              placeholder="e.g. TikTok growth strategy, content creation, monetization coaching for creators…"
            />
          </FormRow>
          <FormRow label="Target Client" hint="Who is your ideal customer">
            <textarea
              style={{ ...TEXTAREA_STYLE, minHeight: 64 }}
              maxLength={2000}
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

        <WorkHoursSection />

        {/* ── Automated texts + nudge templates ─────────────────────────────── */}
        <AutomationsSection />

        {/* ── Email Signature ───────────────────────────────────────────────── */}
        <Section title="Email Signature" icon={Mail}>
          <FormRow label="Signature" hint="Appended to every email">
            <textarea
              style={{ ...TEXTAREA_STYLE, minHeight: 100 }}
              maxLength={2000}
              value={settings.email_signature || ''}
              onChange={e => set('email_signature', e.target.value)}
              placeholder={`Best,\nVernon\n\nVernon Tech & Media\nhttps://vernontm.com`}
            />
          </FormRow>
          {settings.email_signature && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</div>
              <div style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                padding: '10px 14px', fontSize: 13, color: 'var(--muted)',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(37,99,235,0.12)', border: '1px solid var(--orange)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--orange)', fontSize: 13 }}>
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
              background: gmailStatus.connected && !gmailStatus.expired ? 'var(--orange)' : '#ff5c5c',
              boxShadow: gmailStatus.connected && !gmailStatus.expired ? '0 0 6px var(--orange)' : '0 0 6px #ff5c5c',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {gmailStatus.connected
                ? `Connected as ${gmailStatus.email}${gmailStatus.expired ? ' (token expired, reconnect)' : ''}`
                : 'Not connected'}
            </span>
          </div>

          {!gmailStatus.connected ? (
            <div>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
                Connecting Gmail lets you send emails and save drafts directly from the Email Campaign page.
                You'll be redirected to Google to authorise access.
              </p>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>
                <p style={{ margin: '0 0 6px', lineHeight: 1.6 }}>
                  Click below to connect your Gmail account via Google OAuth. This allows the CRM to send emails and save drafts on your behalf.
                </p>
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
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>emails / day</span>
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
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                {settings.unsubscribe_enabled === 'true' ? 'ON' : 'OFF'}
              </span>
            </div>
          </FormRow>
          {settings.unsubscribe_enabled === 'true' && (
            <FormRow label="Footer text">
              <textarea
                style={{ ...TEXTAREA_STYLE, minHeight: 60 }}
                maxLength={500}
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
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--orange)', fontSize: 13 }}>
              <CheckCircle size={15} /> Saved successfully
            </span>
          )}
          {saveMsg === 'error' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ff5c5c', fontSize: 13 }}>
              <AlertCircle size={15} /> Failed to save, try again
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
