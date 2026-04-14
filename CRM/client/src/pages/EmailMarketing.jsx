import React, { useState, useEffect, useRef } from 'react';
import {
  getContentClients, getEmailConfig, saveEmailConfig,
  getEmailContacts, addEmailContacts, deleteEmailContact,
  getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate,
  getEmailCampaigns, createEmailCampaign, sendEmailCampaign, deleteEmailCampaign,
  getTagContexts, saveTagContext, deleteTagContext,
  getContactStats, getContactSends,
} from '../api';
import {
  Mail, Users, FileText, Send, Plus, Trash2, Loader, Check, X, ChevronDown,
  Settings, Tag, Clock, RefreshCw, Eye, Calendar, Zap, BookOpen, Info,
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
  failed:    { bg: '#fee2e2', text: '#ef4444', label: 'Failed' },
  pending:   { bg: '#f0f0f5', text: '#8e8ea0', label: 'Pending' },
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
  { key: 'tags', label: 'Tag Context', Icon: BookOpen },
  { key: 'settings', label: 'Settings', Icon: Settings },
];

const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7ef', fontSize: 13, fontFamily: 'Inter, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box' };
const btnPrimary = { background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', color: '#fff', borderRadius: 8, border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const btnSecondary = { background: '#f8f9fc', border: '1px solid #e5e7ef', color: '#5a5a6e', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const btnDanger = { ...btnSecondary, color: '#ef4444', border: '1px solid #fecaca' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 12, padding: 20 };
const sectionTitle = { fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 };
const labelStyle = { fontSize: 11, fontWeight: 600, color: '#8e8ea0', marginBottom: 4, display: 'block' };

const DYNAMIC_VARS = [
  { token: '{{name}}', label: 'Name' },
  { token: '{{email}}', label: 'Email' },
];

// Small helper: append a dynamic variable to a text state
function VarButtons({ onInsert }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
      {DYNAMIC_VARS.map(v => (
        <button key={v.token} type="button" onClick={() => onInsert(v.token)} style={{
          padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
          background: '#eef2ff', color: '#4a6cf7', border: '1px solid #c7d2fe',
        }}>
          + {v.label}
        </button>
      ))}
    </div>
  );
}

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
  const [tagContexts, setTagContexts] = useState([]);
  const [contactStats, setContactStats] = useState({});

  // Contact send modal
  const [viewSendsContact, setViewSendsContact] = useState(null);
  const [viewSendsData, setViewSendsData] = useState([]);
  const [loadingSends, setLoadingSends] = useState(false);

  // Add contact form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [adding, setAdding] = useState(false);

  // Template form
  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplType, setTplType] = useState('blast');
  const [savingTpl, setSavingTpl] = useState(false);
  const [editingTplId, setEditingTplId] = useState(null);
  const tplBodyRef = useRef(null);
  const tplSubjectRef = useRef(null);

  // Campaign form
  const [campSubject, setCampSubject] = useState('');
  const [campBody, setCampBody] = useState('');
  const [campTags, setCampTags] = useState([]);
  const [campSchedule, setCampSchedule] = useState('');
  const [campAutoTrigger, setCampAutoTrigger] = useState(false);
  const [campTriggerTag, setCampTriggerTag] = useState('');
  const [creatingCamp, setCreatingCamp] = useState(false);
  const [sendingCampId, setSendingCampId] = useState(null);
  const campBodyRef = useRef(null);
  const campSubjectRef = useRef(null);

  // Tag context form
  const [newTagName, setNewTagName] = useState('');
  const [newTagDesc, setNewTagDesc] = useState('');
  const [savingTagCtx, setSavingTagCtx] = useState(false);

  // Settings form
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
      setContacts([]); setTemplates([]); setCampaigns([]); setConfig(null); setTagContexts([]); setContactStats({});
      return;
    }
    loadAllData();
  }, [selectedClientId]);

  async function loadAllData() {
    setLoading(true); setError('');
    try {
      const [cfg, c, t, camp, tc, stats] = await Promise.all([
        getEmailConfig(selectedClientId),
        getEmailContacts(selectedClientId),
        getEmailTemplates(selectedClientId),
        getEmailCampaigns(selectedClientId),
        getTagContexts(selectedClientId),
        getContactStats(selectedClientId),
      ]);
      setConfig(cfg);
      setContacts(c || []);
      setTemplates(t || []);
      setCampaigns(camp || []);
      setTagContexts(tc || []);
      setContactStats(stats || {});
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
  // Also include tags defined in tag context even if no contacts yet
  const allKnownTags = [...new Set([...allTags, ...tagContexts.map(t => t.tag)])].sort();

  // Insert a token at the cursor position of a ref'd textarea/input, update state
  function insertAtCursor(ref, value, setValue, token) {
    const el = ref?.current;
    if (!el) { setValue((value || '') + token); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    setTimeout(() => {
      el.focus();
      const pos = start + token.length;
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    }, 10);
  }

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
      const [c, stats] = await Promise.all([getEmailContacts(selectedClientId), getContactStats(selectedClientId)]);
      setContacts(c || []); setContactStats(stats || {});
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
      const [c, stats] = await Promise.all([getEmailContacts(selectedClientId), getContactStats(selectedClientId)]);
      setContacts(c || []); setContactStats(stats || {});
    } catch (e) { setError(e.message); }
    setAdding(false);
  }

  async function handleDeleteContact(id) {
    try {
      await deleteEmailContact(id);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) { setError(e.message); }
  }

  async function handleViewSends(contact) {
    setViewSendsContact(contact);
    setLoadingSends(true);
    try {
      const sends = await getContactSends(contact.id);
      setViewSendsData(sends || []);
    } catch (e) { setError(e.message); setViewSendsData([]); }
    setLoadingSends(false);
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
      await createEmailCampaign({
        client_id: selectedClientId,
        subject: campSubject,
        html_body: campBody,
        tag_filter: campTags,
        scheduled_at: campAutoTrigger ? null : (campSchedule || undefined),
        trigger_on_tag: campAutoTrigger ? campTriggerTag : null,
        auto_trigger_enabled: !!campAutoTrigger && !!campTriggerTag,
      });
      setCampSubject(''); setCampBody(''); setCampTags([]); setCampSchedule('');
      setCampAutoTrigger(false); setCampTriggerTag('');
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

  // ── Tag context handlers ──
  async function handleSaveTagContext() {
    if (!newTagName.trim() || !selectedClientId) return;
    setSavingTagCtx(true); setError('');
    try {
      await saveTagContext({ client_id: selectedClientId, tag: newTagName.trim(), description: newTagDesc });
      setNewTagName(''); setNewTagDesc('');
      const tc = await getTagContexts(selectedClientId);
      setTagContexts(tc || []);
    } catch (e) { setError(e.message); }
    setSavingTagCtx(false);
  }

  async function handleUpdateTagContext(tag, description) {
    try {
      await saveTagContext({ client_id: selectedClientId, tag, description });
      const tc = await getTagContexts(selectedClientId);
      setTagContexts(tc || []);
    } catch (e) { setError(e.message); }
  }

  async function handleDeleteTagContext(id) {
    try {
      if (id) await deleteTagContext(id);
      const tc = await getTagContexts(selectedClientId);
      setTagContexts(tc || []);
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
                  style={{ padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: selectedClientId === c.id ? 'rgba(74,108,247,0.06)' : 'transparent', color: selectedClientId === c.id ? '#4a6cf7' : '#1a1a2e', fontWeight: selectedClientId === c.id ? 600 : 400 }}>
                  {c.business_name}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedClientId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            {config ? (
              <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> Resend connected</span>
            ) : (
              <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}><Settings size={14} /> Setup needed</span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
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

      {error && (
        <div style={{ padding: '10px 28px', background: '#fef2f2', color: '#dc2626', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
        </div>
      )}

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
            {activeTab === 'tags' && renderTagsTab()}
            {activeTab === 'settings' && renderSettingsTab()}
          </>
        )}
      </div>

      {/* Contact sends modal */}
      {viewSendsContact && (
        <div onClick={() => setViewSendsContact(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 700, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>Send History</div>
                <div style={{ fontSize: 12, color: '#8e8ea0', marginTop: 2 }}>{viewSendsContact.email}</div>
              </div>
              <button onClick={() => setViewSendsContact(null)} style={btnSecondary}><X size={14} /></button>
            </div>
            {loadingSends ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
            ) : viewSendsData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0', fontSize: 13 }}>No sends to this contact yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7ef' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#8e8ea0', fontWeight: 600 }}>Subject</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, color: '#8e8ea0', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#8e8ea0', fontWeight: 600 }}>Sent</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#8e8ea0', fontWeight: 600 }}>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {viewSendsData.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f5' }}>
                      <td style={{ padding: '10px', color: '#1a1a2e', fontWeight: 500 }}>{s.subject || '-'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}><StatusPill status={s.status} /></td>
                      <td style={{ padding: '10px', color: '#5a5a6e', fontSize: 12 }}>{s.sent_at ? new Date(s.sent_at).toLocaleString() : '-'}</td>
                      <td style={{ padding: '10px', color: '#5a5a6e', fontSize: 12 }}>{s.opened_at ? new Date(s.opened_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // TAB: CONTACTS
  // ══════════════════════════════════════════════════════════════
  function renderContactsTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
              <label style={labelStyle}>Tags</label>
              <input style={inputStyle} placeholder="newsletter, vip" value={newTags} onChange={e => setNewTags(e.target.value)} />
              {allKnownTags.length > 0 && (
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                  {allKnownTags.map(tag => {
                    const isSelected = newTags.split(',').map(t => t.trim()).includes(tag);
                    return (
                      <button key={tag} type="button" onClick={() => {
                        const current = newTags.split(',').map(t => t.trim()).filter(Boolean);
                        if (isSelected) setNewTags(current.filter(t => t !== tag).join(', '));
                        else setNewTags([...current, tag].join(', '));
                      }} style={{
                        padding: '2px 7px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        background: isSelected ? '#4a6cf7' : '#f0f0f5',
                        color: isSelected ? '#fff' : '#5a5a6e', border: 'none',
                      }}>{tag}</button>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={handleAddContact} disabled={adding || !newEmail.trim()} style={{ ...btnPrimary, opacity: adding ? 0.6 : 1 }}>
              {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Add
            </button>
          </div>
          {campaigns.some(c => c.auto_trigger_enabled) && (
            <div style={{ marginTop: 10, fontSize: 11, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={12} /> Auto-trigger campaigns active: new contacts with matching tags will receive them automatically.
            </div>
          )}
        </div>

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

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle}>Contacts ({contacts.length})</div>
            <button onClick={loadAllData} style={btnSecondary}><RefreshCw size={13} /> Refresh</button>
          </div>

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
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Sent</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Opened</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => {
                    const stats = contactStats[c.id] || { sent: 0, opened: 0, failed: 0 };
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f5', cursor: 'pointer' }} onClick={() => handleViewSends(c)}>
                        <td style={{ padding: '10px 10px', fontWeight: 600, color: '#1a1a2e' }}>{c.email}</td>
                        <td style={{ padding: '10px 10px', color: '#5a5a6e' }}>{c.name || '-'}</td>
                        <td style={{ padding: '10px 10px' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {(c.tags || []).map((tag, i) => (
                              <span key={i} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: '#e0f2fe', color: '#0ea5e9' }}>{tag}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: '#22c55e', fontWeight: 600 }}>{stats.sent}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: '#4a6cf7', fontWeight: 600 }}>{stats.opened}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}><StatusPill status={c.status} /></td>
                        <td style={{ padding: '10px 10px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleDeleteContact(c.id)} style={{ ...btnDanger, padding: '4px 8px', fontSize: 11 }}><Trash2 size={11} /></button>
                        </td>
                      </tr>
                    );
                  })}
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
              <VarButtons onInsert={token => insertAtCursor(tplSubjectRef, tplSubject, setTplSubject, token)} />
              <input ref={tplSubjectRef} style={inputStyle} placeholder="Welcome, {{name}}!" value={tplSubject} onChange={e => setTplSubject(e.target.value)} />
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
          <label style={labelStyle}>Body <span style={{ fontWeight: 400, color: '#b0b0c0' }}>(plain text or HTML — emails are auto-wrapped in a styled shell)</span></label>
          <VarButtons onInsert={token => insertAtCursor(tplBodyRef, tplBody, setTplBody, token)} />
          <textarea ref={tplBodyRef} style={{ ...inputStyle, minHeight: 200, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} placeholder={'Hey {{name}},\n\nThanks for joining our community...'} value={tplBody} onChange={e => setTplBody(e.target.value)} />
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

          <label style={labelStyle}>Subject</label>
          <VarButtons onInsert={token => insertAtCursor(campSubjectRef, campSubject, setCampSubject, token)} />
          <input ref={campSubjectRef} style={inputStyle} placeholder="Your email subject line" value={campSubject} onChange={e => setCampSubject(e.target.value)} />

          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Filter by tags (leave empty to send to all)</label>
            {allKnownTags.length > 0 ? (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {allKnownTags.map(tag => {
                  const isSelected = campTags.includes(tag);
                  const ctx = tagContexts.find(tc => tc.tag === tag);
                  return (
                    <button key={tag} type="button" title={ctx?.description || ''} onClick={() => {
                      if (isSelected) setCampTags(campTags.filter(t => t !== tag));
                      else setCampTags([...campTags, tag]);
                    }} style={{
                      padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      background: isSelected ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#f0f0f5',
                      color: isSelected ? '#fff' : '#5a5a6e', border: 'none',
                    }}>
                      <Tag size={11} style={{ marginRight: 4 }} />{tag}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#b0b0c0' }}>No tags yet — add tags to contacts first.</div>
            )}
          </div>

          <label style={{ ...labelStyle, marginTop: 12 }}>Body</label>
          <VarButtons onInsert={token => insertAtCursor(campBodyRef, campBody, setCampBody, token)} />
          <textarea ref={campBodyRef} style={{ ...inputStyle, minHeight: 200, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} placeholder={'Hey {{name}},\n\nCheck out our latest...\n\n— The team'} value={campBody} onChange={e => setCampBody(e.target.value)} />

          {/* Auto-trigger toggle */}
          <div style={{ marginTop: 14, padding: 12, background: '#f8f9fc', borderRadius: 8, border: '1px solid #e5e7ef' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>
              <input type="checkbox" checked={campAutoTrigger} onChange={e => setCampAutoTrigger(e.target.checked)} />
              Auto-trigger on new contact with tag
            </label>
            {campAutoTrigger && (
              <div style={{ marginTop: 8 }}>
                <label style={labelStyle}>Trigger tag</label>
                <select style={inputStyle} value={campTriggerTag} onChange={e => setCampTriggerTag(e.target.value)}>
                  <option value="">-- select a tag --</option>
                  {allKnownTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 6 }}>
                  When a new contact is added with this tag, they'll automatically receive this email.
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 14, flexWrap: 'wrap' }}>
            {!campAutoTrigger && (
              <div style={{ minWidth: 200 }}>
                <label style={labelStyle}>Schedule (optional)</label>
                <input type="datetime-local" style={inputStyle} value={campSchedule} onChange={e => setCampSchedule(e.target.value)} />
              </div>
            )}
            <button onClick={handleCreateCampaign} disabled={creatingCamp || !campSubject.trim() || (campAutoTrigger && !campTriggerTag)} style={{ ...btnPrimary, opacity: creatingCamp ? 0.6 : 1 }}>
              {creatingCamp ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : campAutoTrigger ? <Zap size={14} /> : campSchedule ? <Calendar size={14} /> : <Plus size={14} />}
              {campAutoTrigger ? 'Create Auto-Trigger' : campSchedule ? 'Schedule Campaign' : 'Create Draft'}
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
                      <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {c.auto_trigger_enabled && <Zap size={13} color="#f59e0b" />}
                        {c.subject}
                      </div>
                      <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <StatusPill status={c.status} />
                        {c.auto_trigger_enabled && c.trigger_on_tag && (
                          <span style={{ padding: '2px 8px', borderRadius: 8, background: '#fef3c7', color: '#92400e', fontWeight: 600 }}>
                            Auto on #{c.trigger_on_tag}
                          </span>
                        )}
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
                      {(c.status === 'draft' || c.status === 'scheduled') && !c.auto_trigger_enabled && (
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
  // TAB: TAG CONTEXT
  // ══════════════════════════════════════════════════════════════
  function renderTagsTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={cardStyle}>
          <div style={sectionTitle}>Add / Update Tag Description</div>
          <div style={{ fontSize: 12, color: '#8e8ea0', marginBottom: 12 }}>
            Describe each tag so the AI agent knows what kind of email to craft when you say "write an email for <code>newsletter</code>".
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <label style={labelStyle}>Tag name</label>
              <input style={inputStyle} placeholder="e.g. newsletter" value={newTagName} onChange={e => setNewTagName(e.target.value)} list="all-tags" />
              <datalist id="all-tags">
                {allKnownTags.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div style={{ flex: 3, minWidth: 240 }}>
              <label style={labelStyle}>Description</label>
              <input style={inputStyle} placeholder="e.g. General audience — casual tone, weekly tips + product updates" value={newTagDesc} onChange={e => setNewTagDesc(e.target.value)} />
            </div>
            <button onClick={handleSaveTagContext} disabled={savingTagCtx || !newTagName.trim()} style={{ ...btnPrimary, opacity: savingTagCtx ? 0.6 : 1 }}>
              {savingTagCtx ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />} Save
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>All Tags ({tagContexts.length})</div>
          {tagContexts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}>
              <BookOpen size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No tags yet — add tags to contacts or create descriptions above.</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tagContexts.map(tc => (
              <TagContextRow key={tc.tag} tc={tc} onUpdate={handleUpdateTagContext} onDelete={handleDeleteTagContext} />
            ))}
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

// Small child component for inline editing a tag context row
function TagContextRow({ tc, onUpdate, onDelete }) {
  const [desc, setDesc] = useState(tc.description || '');
  const [savingEdit, setSavingEdit] = useState(false);
  const dirty = desc !== (tc.description || '');
  return (
    <div style={{ border: '1px solid #e5e7ef', borderRadius: 10, padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: '#e0f2fe', color: '#0ea5e9' }}>
          <Tag size={11} style={{ marginRight: 4 }} />{tc.tag}
        </span>
        <span style={{ fontSize: 11, color: '#8e8ea0' }}>{tc.contact_count || 0} contacts</span>
      </div>
      <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe this audience..." />
      <button disabled={!dirty || savingEdit} onClick={async () => { setSavingEdit(true); await onUpdate(tc.tag, desc); setSavingEdit(false); }}
        style={{ ...btnPrimary, padding: '6px 12px', fontSize: 12, opacity: (!dirty || savingEdit) ? 0.5 : 1 }}>
        {savingEdit ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Save
      </button>
      {tc.id && (
        <button onClick={() => onDelete(tc.id)} style={{ ...btnDanger, padding: '6px 10px', fontSize: 11 }}><Trash2 size={12} /></button>
      )}
    </div>
  );
}
