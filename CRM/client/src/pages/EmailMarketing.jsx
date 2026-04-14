import React, { useState, useEffect } from 'react';
import {
  getContentClients, getEmailConfig, saveEmailConfig,
  getEmailContacts, addEmailContacts, updateContactTags, deleteEmailContact,
  getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate,
  getEmailCampaigns, createEmailCampaign, sendEmailCampaign, scheduleEmailCampaign, deleteEmailCampaign,
} from '../api';
import {
  Mail, Users, FileText, Send, Plus, Trash2, Loader, Check, X, ChevronDown,
  Settings, Tag, Clock, RefreshCw, Eye, Calendar, Zap,
} from 'lucide-react';

const STATUS_COLORS = {
  draft:     { bg: '#f0f0f5', text: '#8e8ea0', label: 'Draft' },
  scheduled: { bg: '#e0f2fe', text: '#0ea5e9', label: 'Scheduled' },
  sending:   { bg: '#fef3c7', text: '#f59e0b', label: 'Sending' },
  sent:      { bg: '#e8f5e9', text: '#22c55e', label: 'Sent' },
  partial:   { bg: '#fef3c7', text: '#f59e0b', label: 'Partial (Rollover)' },
  active:    { bg: '#e8f5e9', text: '#22c55e', label: 'Active' },
  unsubscribed: { bg: '#fee2e2', text: '#ef4444', label: 'Unsubscribed' },
  bounced:   { bg: '#fee2e2', text: '#ef4444', label: 'Bounced' },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  );
}

const TABS = [
  { key: 'contacts', label: 'Contacts', Icon: Users },
  { key: 'templates', label: 'Templates', Icon: FileText },
  { key: 'campaigns', label: 'Campaigns', Icon: Send },
  { key: 'settings', label: 'Settings', Icon: Settings },
];

const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7ef', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' };
const btnPrimary = { background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', color: '#fff', borderRadius: 8, border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const btnSecondary = { background: '#f8f9fc', border: '1px solid #e5e7ef', color: '#5a5a6e', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const btnDanger = { ...btnSecondary, color: '#ef4444', border: '1px solid #fecaca' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 12, padding: 20 };
const sectionTitle = { fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 };
const labelStyle = { fontSize: 11, fontWeight: 600, color: '#8e8ea0', marginBottom: 4, display: 'block' };

export default function EmailMarketing() {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Data
  const [config, setConfig] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [campaigns, setCampaigns] = useState([]);

  // Forms
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [adding, setAdding] = useState(false);

  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplType, setTplType] = useState('blast');
  const [savingTpl, setSavingTpl] = useState(false);
  const [editingTplId, setEditingTplId] = useState(null);

  const [campSubject, setCampSubject] = useState('');
  const [campBody, setCampBody] = useState('');
  const [campTags, setCampTags] = useState('');
  const [campSchedule, setCampSchedule] = useState('');
  const [creatingCamp, setCreatingCamp] = useState(false);
  const [sendingCampId, setSendingCampId] = useState(null);

  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgFromEmail, setCfgFromEmail] = useState('');
  const [cfgFromName, setCfgFromName] = useState('');
  const [cfgDailyLimit, setCfgDailyLimit] = useState('100');
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getContentClients();
        setClients(data || []);
      } catch (e) { console.error(e); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedClientId) {
      setContacts([]); setTemplates([]); setCampaigns([]); setConfig(null);
      return;
    }
    loadAllData();
  }, [selectedClientId]);

  async function loadAllData() {
    setLoading(true); setError('');
    try {
      const [cfg, c, t, camp] = await Promise.all([
        getEmailConfig(selectedClientId),
        getEmailContacts(selectedClientId),
        getEmailTemplates(selectedClientId),
        getEmailCampaigns(selectedClientId),
      ]);
      setConfig(cfg);
      setContacts(c || []);
      setTemplates(t || []);
      setCampaigns(camp || []);
      if (cfg) {
        setCfgFromEmail(cfg.from_email || '');
        setCfgFromName(cfg.from_name || '');
        setCfgDailyLimit(String(cfg.daily_limit || 100));
        setCfgApiKey('');
      }
    } catch (e) {
      setError('Failed to load data');
    }
    setLoading(false);
  }

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const allTags = [...new Set(contacts.flatMap(c => c.tags || []))].sort();

  // ── Contact handlers ──
  async function handleAddContact() {
    if (!newEmail.trim() || !selectedClientId) return;
    setAdding(true); setError('');
    try {
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean);
      await addEmailContacts({
        client_id: selectedClientId,
        contacts: [{ email: newEmail.trim(), name: newName.trim(), tags }],
      });
      setNewEmail(''); setNewName(''); setNewTags('');
      const c = await getEmailContacts(selectedClientId);
      setContacts(c || []);
    } catch (e) { setError(e.message); }
    setAdding(false);
  }

  async function handleBulkAdd() {
    const lines = bulkEmails.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length || !selectedClientId) return;
    setAdding(true); setError('');
    try {
      const contactsList = lines.map(line => {
        const [email, ...rest] = line.split(',').map(s => s.trim());
        return { email, name: rest[0] || '', tags: rest.slice(1).filter(Boolean) };
      });
      await addEmailContacts({ client_id: selectedClientId, contacts: contactsList });
      setBulkEmails('');
      const c = await getEmailContacts(selectedClientId);
      setContacts(c || []);
    } catch (e) { setError(e.message); }
    setAdding(false);
  }

  async function handleDeleteContact(id) {
    try {
      await deleteEmailContact(id);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) { setError(e.message); }
  }

  // ── Template handlers ──
  async function handleSaveTemplate() {
    if (!tplName.trim() || !tplSubject.trim() || !selectedClientId) return;
    setSavingTpl(true); setError('');
    try {
      if (editingTplId) {
        await updateEmailTemplate(editingTplId, { name: tplName, subject: tplSubject, html_body: tplBody, template_type: tplType });
      } else {
        await createEmailTemplate({ client_id: selectedClientId, name: tplName, subject: tplSubject, html_body: tplBody, template_type: tplType });
      }
      setTplName(''); setTplSubject(''); setTplBody(''); setTplType('blast'); setEditingTplId(null);
      const t = await getEmailTemplates(selectedClientId);
      setTemplates(t || []);
    } catch (e) { setError(e.message); }
    setSavingTpl(false);
  }

  function startEditTemplate(t) {
    setTplName(t.name); setTplSubject(t.subject); setTplBody(t.html_body || ''); setTplType(t.template_type); setEditingTplId(t.id);
    setActiveTab('templates');
  }

  // ── Campaign handlers ──
  async function handleCreateCampaign() {
    if (!campSubject.trim() || !selectedClientId) return;
    setCreatingCamp(true); setError('');
    try {
      const tags = campTags.split(',').map(t => t.trim()).filter(Boolean);
      await createEmailCampaign({
        client_id: selectedClientId,
        subject: campSubject,
        html_body: campBody,
        tag_filter: tags,
        scheduled_at: campSchedule || undefined,
      });
      setCampSubject(''); setCampBody(''); setCampTags(''); setCampSchedule('');
      const camp = await getEmailCampaigns(selectedClientId);
      setCampaigns(camp || []);
    } catch (e) { setError(e.message); }
    setCreatingCamp(false);
  }

  async function handleSendCampaign(id) {
    setSendingCampId(id); setError('');
    try {
      const result = await sendEmailCampaign({ campaign_id: id });
      const msg = `Sent: ${result.sent}, Failed: ${result.failed}${result.rolled_over ? `, Rolled over: ${result.rolled_over}` : ''}`;
      setError(''); // Clear error
      alert(msg);
      const camp = await getEmailCampaigns(selectedClientId);
      setCampaigns(camp || []);
    } catch (e) { setError(e.message); }
    setSendingCampId(null);
  }

  async function handleDeleteCampaign(id) {
    try {
      await deleteEmailCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
    } catch (e) { setError(e.message); }
  }

  // ── Config handler ──
  async function handleSaveConfig() {
    if (!cfgFromEmail.trim() || !selectedClientId) return;
    if (!cfgApiKey.trim() && !config) { setError('Resend API key required'); return; }
    setSavingConfig(true); setError('');
    try {
      await saveEmailConfig({
        client_id: selectedClientId,
        resend_api_key: cfgApiKey.trim() || config?.resend_api_key,
        from_email: cfgFromEmail.trim(),
        from_name: cfgFromName.trim(),
        daily_limit: parseInt(cfgDailyLimit) || 100,
      });
      setCfgApiKey('');
      const cfg = await getEmailConfig(selectedClientId);
      setConfig(cfg);
    } catch (e) { setError(e.message); }
    setSavingConfig(false);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ padding: 0, fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#f8f9fc' }}>
      {/* Top Bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7ef', padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mail size={22} color="#4a6cf7" />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>Email Marketing</span>
        </div>

        {/* Client selector */}
        <div style={{ position: 'relative', minWidth: 200 }}>
          <button onClick={() => setClientDropdownOpen(!clientDropdownOpen)} style={{ ...btnSecondary, width: '100%', justifyContent: 'space-between' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedClient ? selectedClient.business_name : 'Select Client'}
            </span>
            <ChevronDown size={14} />
          </button>
          {clientDropdownOpen && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: '#fff', border: '1px solid #e5e7ef', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 240, overflowY: 'auto', marginTop: 4 }}>
              {clients.map(c => (
                <div key={c.id} onClick={() => { setSelectedClientId(c.id); setClientDropdownOpen(false); }}
                  style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: selectedClientId === c.id ? 'rgba(74,108,247,0.06)' : 'transparent', color: selectedClientId === c.id ? '#4a6cf7' : '#1a1a2e', fontWeight: selectedClientId === c.id ? 600 : 400 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,108,247,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedClientId === c.id ? 'rgba(74,108,247,0.06)' : 'transparent'}>
                  {c.business_name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Config status indicator */}
        {selectedClientId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {config ? (
              <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> Resend connected</span>
            ) : (
              <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}><Settings size={14} /> Setup needed</span>
            )}
          </div>
        )}

        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              background: activeTab === t.key ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#f0f0f5',
              color: activeTab === t.key ? '#fff' : '#5a5a6e', transition: 'all 0.15s',
            }}>
              <t.Icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error bar */}
      {error && (
        <div style={{ padding: '10px 28px', background: '#fef2f2', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
        </div>
      )}

      {/* Main content */}
      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#8e8ea0' }}>
            <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: 8, fontSize: 13 }}>Loading...</div>
          </div>
        )}

        {!selectedClientId && !loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#8e8ea0' }}>
            <Mail size={48} strokeWidth={1} />
            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>Select a client to get started</div>
          </div>
        )}

        {selectedClientId && !loading && (
          <>
            {activeTab === 'contacts' && renderContactsTab()}
            {activeTab === 'templates' && renderTemplatesTab()}
            {activeTab === 'campaigns' && renderCampaignsTab()}
            {activeTab === 'settings' && renderSettingsTab()}
          </>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // TAB: CONTACTS
  // ══════════════════════════════════════════════════════════════
  function renderContactsTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Add single contact */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Add Contact</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: 180 }}>
              <label style={labelStyle}>Email</label>
              <input style={inputStyle} placeholder="email@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddContact()} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} placeholder="First Last" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={labelStyle}>Tags (comma-separated)</label>
              <input style={inputStyle} placeholder="newsletter, vip" value={newTags} onChange={e => setNewTags(e.target.value)} />
            </div>
            <button onClick={handleAddContact} disabled={adding || !newEmail.trim()} style={{ ...btnPrimary, opacity: adding ? 0.6 : 1 }}>
              {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Add
            </button>
          </div>
        </div>

        {/* Bulk add */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Bulk Import</div>
          <label style={labelStyle}>One per line: email, name, tag1, tag2...</label>
          <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} placeholder={'john@example.com, John Doe, newsletter\njane@example.com, Jane, vip, newsletter'} value={bulkEmails} onChange={e => setBulkEmails(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <button onClick={handleBulkAdd} disabled={adding || !bulkEmails.trim()} style={{ ...btnPrimary, opacity: adding ? 0.6 : 1 }}>
              {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Import All
            </button>
          </div>
        </div>

        {/* Contact list */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle}>Contacts ({contacts.length})</div>
            <button onClick={loadAllData} style={btnSecondary}><RefreshCw size={13} /> Refresh</button>
          </div>

          {/* Tag summary */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {allTags.map(tag => {
                const count = contacts.filter(c => (c.tags || []).includes(tag)).length;
                return (
                  <span key={tag} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#f0f0f5', color: '#5a5a6e' }}>
                    <Tag size={10} style={{ marginRight: 3 }} />{tag} ({count})
                  </span>
                );
              })}
            </div>
          )}

          {contacts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}>
              <Users size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No contacts yet. Add some above.</div>
            </div>
          )}

          {contacts.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7ef' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Tags</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Status</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Welcomed</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                      <td style={{ padding: '10px 10px', fontWeight: 600, color: '#1a1a2e' }}>{c.email}</td>
                      <td style={{ padding: '10px 10px', color: '#5a5a6e' }}>{c.name || '-'}</td>
                      <td style={{ padding: '10px 10px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {(c.tags || []).map((tag, i) => (
                            <span key={i} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: '#e0f2fe', color: '#0ea5e9' }}>{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}><StatusPill status={c.status} /></td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                        {c.welcomed_at ? <Check size={14} color="#22c55e" /> : <X size={14} color="#d1d5db" />}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                        <button onClick={() => handleDeleteContact(c.id)} style={{ ...btnDanger, padding: '4px 8px', fontSize: 11 }}><Trash2 size={11} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: TEMPLATES
  // ══════════════════════════════════════════════════════════════
  function renderTemplatesTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={cardStyle}>
          <div style={sectionTitle}>{editingTplId ? 'Edit Template' : 'Create Template'}</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Template Name</label>
              <input style={inputStyle} placeholder="e.g. Welcome Email" value={tplName} onChange={e => setTplName(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <label style={labelStyle}>Subject Line</label>
              <input style={inputStyle} placeholder="Welcome to {{name}}!" value={tplSubject} onChange={e => setTplSubject(e.target.value)} />
            </div>
            <div style={{ minWidth: 140 }}>
              <label style={labelStyle}>Type</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {['welcome', 'blast'].map(t => (
                  <button key={t} onClick={() => setTplType(t)} style={{
                    padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                    background: tplType === t ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#f0f0f5',
                    color: tplType === t ? '#fff' : '#5a5a6e',
                  }}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <label style={labelStyle}>HTML Body <span style={{ fontWeight: 400, color: '#b0b0c0' }}>(use {'{{name}}'} and {'{{email}}'} as placeholders)</span></label>
          <textarea style={{ ...inputStyle, minHeight: 200, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} placeholder={'<h1>Welcome, {{name}}!</h1>\n<p>Thanks for joining...</p>'} value={tplBody} onChange={e => setTplBody(e.target.value)} />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={handleSaveTemplate} disabled={savingTpl || !tplName.trim() || !tplSubject.trim()} style={{ ...btnPrimary, opacity: savingTpl ? 0.6 : 1 }}>
              {savingTpl ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              {editingTplId ? 'Update Template' : 'Save Template'}
            </button>
            {editingTplId && (
              <button onClick={() => { setEditingTplId(null); setTplName(''); setTplSubject(''); setTplBody(''); setTplType('blast'); }} style={btnSecondary}>
                <X size={13} /> Cancel
              </button>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Templates ({templates.length})</div>
          {templates.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}>
              <FileText size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No templates yet. Create one above.</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(t => (
              <div key={t.id} style={{ border: '1px solid #e5e7ef', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 13 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>
                    Subject: {t.subject} &middot; <span style={{ textTransform: 'capitalize' }}>{t.template_type}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => startEditTemplate(t)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11 }}><Eye size={12} /> Edit</button>
                  <button onClick={async () => { await deleteEmailTemplate(t.id); setTemplates(prev => prev.filter(x => x.id !== t.id)); }} style={{ ...btnDanger, padding: '5px 10px', fontSize: 11 }}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: CAMPAIGNS
  // ══════════════════════════════════════════════════════════════
  function renderCampaignsTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!config && (
          <div style={{ ...cardStyle, background: '#fef3c7', borderColor: '#fbbf24' }}>
            <div style={{ fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={16} /> Set up your Resend API key in the Settings tab before sending campaigns.
            </div>
          </div>
        )}

        <div style={cardStyle}>
          <div style={sectionTitle}>Create Campaign</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ flex: 2, minWidth: 200 }}>
              <label style={labelStyle}>Subject</label>
              <input style={inputStyle} placeholder="Your email subject line" value={campSubject} onChange={e => setCampSubject(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={labelStyle}>Filter by tags (comma-separated, leave empty for all)</label>
              <input style={inputStyle} placeholder="newsletter, vip" value={campTags} onChange={e => setCampTags(e.target.value)} />
            </div>
          </div>

          {/* Tag quick-select */}
          {allTags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Quick select tags:</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {allTags.map(tag => {
                  const isSelected = campTags.split(',').map(t => t.trim()).includes(tag);
                  return (
                    <button key={tag} onClick={() => {
                      const current = campTags.split(',').map(t => t.trim()).filter(Boolean);
                      if (isSelected) setCampTags(current.filter(t => t !== tag).join(', '));
                      else setCampTags([...current, tag].join(', '));
                    }} style={{
                      padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: isSelected ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#f0f0f5',
                      color: isSelected ? '#fff' : '#5a5a6e', border: 'none',
                    }}>
                      <Tag size={10} style={{ marginRight: 3 }} />{tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label style={labelStyle}>Email Body (HTML)</label>
          <textarea style={{ ...inputStyle, minHeight: 200, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} placeholder={'<h1>Hey {{name}},</h1>\n<p>Check out our latest...</p>'} value={campBody} onChange={e => setCampBody(e.target.value)} />

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 200 }}>
              <label style={labelStyle}>Schedule (optional)</label>
              <input type="datetime-local" style={inputStyle} value={campSchedule} onChange={e => setCampSchedule(e.target.value)} />
            </div>
            <button onClick={handleCreateCampaign} disabled={creatingCamp || !campSubject.trim()} style={{ ...btnPrimary, opacity: creatingCamp ? 0.6 : 1 }}>
              {creatingCamp ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : campSchedule ? <Calendar size={14} /> : <Plus size={14} />}
              {campSchedule ? 'Schedule Campaign' : 'Create Draft'}
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle}>Campaigns ({campaigns.length})</div>
            <button onClick={loadAllData} style={btnSecondary}><RefreshCw size={13} /> Refresh</button>
          </div>

          {campaigns.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}>
              <Send size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No campaigns yet.</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {campaigns.map(c => {
              const tags = c.tag_filter || [];
              return (
                <div key={c.id} style={{ border: '1px solid #e5e7ef', borderRadius: 10, padding: 14, background: '#fafbfe' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 13 }}>{c.subject}</div>
                      <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <StatusPill status={c.status} />
                        {c.total_recipients > 0 && <span>Recipients: {c.total_recipients}</span>}
                        {c.sent_count > 0 && <span style={{ color: '#22c55e' }}>Sent: {c.sent_count}</span>}
                        {c.failed_count > 0 && <span style={{ color: '#ef4444' }}>Failed: {c.failed_count}</span>}
                        {c.scheduled_at && <span><Clock size={10} /> {new Date(c.scheduled_at).toLocaleString()}</span>}
                        {tags.length > 0 && tags.map((t, i) => (
                          <span key={i} style={{ padding: '1px 6px', borderRadius: 6, fontSize: 10, background: '#e0f2fe', color: '#0ea5e9' }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(c.status === 'draft' || c.status === 'scheduled') && (
                        <button onClick={() => handleSendCampaign(c.id)} disabled={sendingCampId === c.id || !config} style={{ ...btnPrimary, padding: '5px 10px', fontSize: 11, opacity: (sendingCampId === c.id || !config) ? 0.6 : 1 }}>
                          {sendingCampId === c.id ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />} Send Now
                        </button>
                      )}
                      {c.status !== 'sending' && (
                        <button onClick={() => handleDeleteCampaign(c.id)} style={{ ...btnDanger, padding: '5px 10px', fontSize: 11 }}><Trash2 size={12} /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: SETTINGS
  // ══════════════════════════════════════════════════════════════
  function renderSettingsTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={cardStyle}>
          <div style={sectionTitle}>Resend Configuration — {selectedClient?.business_name}</div>
          {config && (
            <div style={{ marginBottom: 14, padding: 12, background: '#e8f5e9', borderRadius: 8, fontSize: 12, color: '#1a7a3a' }}>
              <Check size={14} style={{ marginRight: 6 }} /> Connected. API key: <code>{config.resend_api_key_masked}</code> &middot; From: {config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email} &middot; Daily limit: {config.daily_limit}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>Resend API Key {config && <span style={{ fontWeight: 400, color: '#b0b0c0' }}>(leave blank to keep current)</span>}</label>
              <input style={inputStyle} type="password" placeholder="re_..." value={cfgApiKey} onChange={e => setCfgApiKey(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>From Email</label>
                <input style={inputStyle} placeholder="you@yourdomain.com" value={cfgFromEmail} onChange={e => setCfgFromEmail(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>From Name</label>
                <input style={inputStyle} placeholder="Your Name" value={cfgFromName} onChange={e => setCfgFromName(e.target.value)} />
              </div>
              <div style={{ width: 100 }}>
                <label style={labelStyle}>Daily Limit</label>
                <input style={inputStyle} type="number" value={cfgDailyLimit} onChange={e => setCfgDailyLimit(e.target.value)} />
              </div>
            </div>
            <button onClick={handleSaveConfig} disabled={savingConfig || !cfgFromEmail.trim()} style={{ ...btnPrimary, alignSelf: 'flex-start', opacity: savingConfig ? 0.6 : 1 }}>
              {savingConfig ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              Save Configuration
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>How Rollover Works</div>
          <div style={{ fontSize: 13, color: '#5a5a6e', lineHeight: 1.6 }}>
            <p>Resend's free tier allows <strong>100 emails per day</strong>. When you send a campaign to more recipients than your daily limit:</p>
            <ul style={{ paddingLeft: 20 }}>
              <li>The first {cfgDailyLimit || 100} emails send immediately</li>
              <li>Remaining emails are auto-scheduled for <strong>24.5 hours later</strong></li>
              <li>A cron job checks every 15 minutes and sends any due rollover emails</li>
              <li>If the next batch also exceeds the limit, it rolls over again</li>
            </ul>
            <p>Campaign status shows as <strong>"Partial (Rollover)"</strong> until all emails are sent.</p>
          </div>
        </div>
      </div>
    );
  }
}
