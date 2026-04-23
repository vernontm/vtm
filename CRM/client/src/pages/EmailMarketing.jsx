import React, { useState, useEffect, useRef } from 'react';
import {
  getContentClients, getEmailConfig, saveEmailConfig, testMailerliteKey, runMailerliteBackfill,
  getEmailContacts, addEmailContacts, deleteEmailContact, updateEmailContact,
  getEmailTemplates, createEmailTemplate, updateEmailTemplate, deleteEmailTemplate,
  getEmailCampaigns, createEmailCampaign, sendEmailCampaign, deleteEmailCampaign,
  getTagContexts, saveTagContext, deleteTagContext,
  getContactStats, getContactSends,
  generateEmailTemplateAI, editEmailAI, getMailerliteGroups, uploadClientLogo, updateContentClient, createContentClient,
  getEmailSequences, getEmailSequenceDetail, createEmailSequence, updateEmailSequence,
  saveSequenceStep, deleteSequenceStep, enrollSequenceMatching, deleteEmailSequence,
} from '../api';
import EmailEditor, { stripEditorRefs } from '../components/EmailEditor';
import {
  Mail, Users, FileText, Send, Plus, Trash2, Loader, Check, X, ChevronDown,
  Settings, Tag, Clock, RefreshCw, Eye, Calendar, Zap, BookOpen, Info, Cake, Gift,
  Edit3, Search, MailOpen, MousePointer, UserMinus, Globe, Sparkles, Image as ImageIcon, Upload, MessageSquare, BookOpenCheck, ArrowUp, RotateCcw,
} from 'lucide-react';

const STATUS_COLORS = {
  draft:     { bg: 'var(--surface-3)', text: 'var(--muted)', label: 'Draft' },
  scheduled: { bg: 'rgba(14,165,233,0.12)', text: '#0ea5e9', label: 'Scheduled' },
  sending:   { bg: 'rgba(251,191,36,0.12)', text: '#f59e0b', label: 'Sending' },
  sent:      { bg: 'rgba(34,197,94,0.12)', text: '#22c55e', label: 'Sent' },
  partial:   { bg: 'rgba(251,191,36,0.12)', text: '#f59e0b', label: 'Partial (Rollover)' },
  active:    { bg: 'rgba(34,197,94,0.12)', text: '#22c55e', label: 'Active' },
  unsubscribed: { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', label: 'Unsubscribed' },
  bounced:   { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', label: 'Bounced' },
  failed:    { bg: 'rgba(239,68,68,0.12)', text: '#ef4444', label: 'Failed' },
  pending:   { bg: 'var(--surface-3)', text: 'var(--muted)', label: 'Pending' },
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
  { key: 'sequences', label: 'Sequences', Icon: Zap },
  { key: 'tags', label: 'Tag Context', Icon: BookOpen },
  { key: 'settings', label: 'Settings', Icon: Settings },
];

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const inputStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-display)', outline: 'none', width: '100%', boxSizing: 'border-box', background: 'var(--surface-2)', color: 'var(--text)', colorScheme: 'dark' };
const btnPrimary = { background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))', color: 'var(--surface)', borderRadius: 8, border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const btnSecondary = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' };
const btnDanger = { ...btnSecondary, color: '#ef4444', border: '1px solid #fecaca' };
const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 };
const sectionTitle = { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 };
const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, display: 'block' };

const DYNAMIC_VARS = [
  { token: '{{name}}', label: 'Name' },
  { token: '{{email}}', label: 'Email' },
  { token: '{{discount_code}}', label: 'Discount Code' },
];

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Click-to-open multi-select for tags. Keeps a comma-separated string in `value`
// so existing call sites (newTags state) don't need to change.
function TagSelect({ value, onChange, options = [], placeholder = 'Select tags...' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const selected = (value || '').split(',').map(t => t.trim()).filter(Boolean);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (tag) => {
    const next = selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag];
    onChange(next.join(', '));
  };
  const removeSelected = (tag) => onChange(selected.filter(t => t !== tag).join(', '));
  const addCustom = () => {
    const t = query.trim();
    if (!t) return;
    if (!selected.includes(t)) onChange([...selected, t].join(', '));
    setQuery('');
  };

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()) && !selected.includes(o));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          minHeight: 36, padding: '5px 30px 5px 8px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--surface)', cursor: 'pointer', display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
          fontSize: 13, position: 'relative',
        }}
      >
        {selected.length === 0 && (
          <span style={{ color: 'var(--muted)', padding: '3px 2px' }}>{placeholder}</span>
        )}
        {selected.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 12, background: 'var(--accent-dim)', color: 'var(--orange)',
            fontSize: 11, fontWeight: 600,
          }}>
            {tag}
            <span role="button" onClick={(e) => { e.stopPropagation(); removeSelected(tag); }} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
          </span>
        ))}
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 10 }}>▾</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 40,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 20px rgba(10,20,40,0.08)', maxHeight: 260, overflow: 'auto',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="Search or create tag..."
              style={{ width: '100%', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          {filtered.length === 0 && !query && (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>No more tags</div>
          )}
          {filtered.map(tag => (
            <div key={tag} onClick={() => toggle(tag)} style={{
              padding: '8px 12px', fontSize: 13, cursor: 'pointer', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
               onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span>{tag}</span>
            </div>
          ))}
          {query && !options.some(o => o.toLowerCase() === query.toLowerCase()) && (
            <div onClick={addCustom} style={{
              padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--orange)', fontWeight: 600,
              borderTop: '1px solid var(--border)',
            }}>
              + Create "{query.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Small helper: append a dynamic variable to a text state
function VarButtons({ onInsert }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
      {DYNAMIC_VARS.map(v => (
        <button key={v.token} type="button" onClick={() => onInsert(v.token)} style={{
          padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
          background: 'var(--accent-dim)', color: 'var(--orange)', border: '1px solid #c7d2fe',
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
  const [sequences, setSequences] = useState([]);
  const [seqSort, setSeqSort] = useState('alpha'); // 'alpha' | 'recent' | 'subs'
  const [seqFilter, setSeqFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [seqView, setSeqView] = useState('grid'); // 'grid' | 'list'
  const [editingSeq, setEditingSeq] = useState(null); // sequence detail object when editor open
  const [newSeqOpen, setNewSeqOpen] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [newSeqTag, setNewSeqTag] = useState('');
  const [savingSeq, setSavingSeq] = useState(false);
  const [tagContexts, setTagContexts] = useState([]);
  const [contactStats, setContactStats] = useState({});

  // Contact send modal
  const [viewSendsContact, setViewSendsContact] = useState(null);
  const [viewSendsData, setViewSendsData] = useState([]);
  const [loadingSends, setLoadingSends] = useState(false);

  // View broadcast modal
  const [viewCampaign, setViewCampaign] = useState(null);

  // Add contact form
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newTags, setNewTags] = useState('');
  const [newBdayMonth, setNewBdayMonth] = useState('');
  const [newBdayDay, setNewBdayDay] = useState('');
  const [newDiscount, setNewDiscount] = useState('');
  const [newSignedUpAt, setNewSignedUpAt] = useState('');
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkPreview, setBulkPreview] = useState([]); // parsed contact objects
  const [bulkError, setBulkError] = useState('');
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newCountry, setNewCountry] = useState('');
  const bulkFileRef = useRef(null);
  const [adding, setAdding] = useState(false);
  const [editContactId, setEditContactId] = useState(null);
  const [editForm, setEditForm] = useState({ birthday_month: '', birthday_day: '', discount_code: '', signed_up_at: '' });

  // Template form
  const [tplName, setTplName] = useState('');
  const [tplSubject, setTplSubject] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplPreview, setTplPreview] = useState('');
  const [tplShowPreview, setTplShowPreview] = useState(false);
  const [tplType, setTplType] = useState('blast');
  const [savingTpl, setSavingTpl] = useState(false);
  const [editingTplId, setEditingTplId] = useState(null);
  const tplSubjectRef = useRef(null);
  // AI template generator + logo upload
  const [aiGenOpen, setAiGenOpen] = useState(false);
  const [aiGenPrompt, setAiGenPrompt] = useState('');
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoInputRef = useRef(null);
  // New client modal
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientWebsite, setNewClientWebsite] = useState('');
  const [newClientTone, setNewClientTone] = useState('');
  const [newClientPrimary, setNewClientPrimary] = useState('#E8650A');
  const [newClientSecondary, setNewClientSecondary] = useState('var(--surface-3)');
  const [creatingClient, setCreatingClient] = useState(false);

  // Campaign form
  const [campSubject, setCampSubject] = useState('');
  const [campBody, setCampBody] = useState('');
  const [campPreview, setCampPreview] = useState('');
  const [campShowPreview, setCampShowPreview] = useState(false);
  const [campTags, setCampTags] = useState([]);
  const [campSchedule, setCampSchedule] = useState('');
  const [campAutoTrigger, setCampAutoTrigger] = useState(false);
  const [campTriggerTag, setCampTriggerTag] = useState('');
  const [campTriggerType, setCampTriggerType] = useState('tag'); // 'tag' | 'birthday'
  const [creatingCamp, setCreatingCamp] = useState(false);
  const [sendingCampId, setSendingCampId] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const [campFilter, setCampFilter] = useState('all'); // all | draft | scheduled | sending | sent
  const [campSearch, setCampSearch] = useState('');
  const campSubjectRef = useRef(null);
  const campBodyEditorRef = useRef(null);

  // Template picker (campaigns + sequence steps)
  // tplPicker: null | { onApply: ({ html, template_html, body_text, subject, preview_text, has_slot }) => void }
  const [tplPicker, setTplPicker] = useState(null);

  // Active template wrapper for the broadcast composer.
  // When set, campBody is ONLY the editable body paragraph; the wrapper HTML
  // has a {{body}} placeholder that gets substituted on save.
  const [campTemplateId, setCampTemplateId] = useState('');
  const [campTemplateHtml, setCampTemplateHtml] = useState(null);
  const [campTemplateName, setCampTemplateName] = useState('');
  const [campCtaText, setCampCtaText] = useState('Get Access');
  const [campCtaUrl, setCampCtaUrl] = useState('https://www.vernontm.com/book-call');
  const [campShowLivePreview, setCampShowLivePreview] = useState(false);

  // MailerLite groups — populated when composer opens. Each: { id, name, total, active }
  const [mlGroups, setMlGroups] = useState([]);
  const [mlGroupsLoading, setMlGroupsLoading] = useState(false);
  const [mlGroupsError, setMlGroupsError] = useState('');
  // Selected group ids (strings, as they come back from ML). Empty = send to all active contacts.
  const [campGroupIds, setCampGroupIds] = useState([]);

  // AI agent panel state
  const [aiMessages, setAiMessages] = useState([]); // { role: 'user'|'ai'|'system', text, message? }
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSelection, setAiSelection] = useState(null); // { refId, text, tag }
  const [aiHistory, setAiHistory] = useState([]); // previous HTMLs for "undo last AI change"

  // Tag context form
  const [newTagName, setNewTagName] = useState('');
  const [newTagDesc, setNewTagDesc] = useState('');
  const [savingTagCtx, setSavingTagCtx] = useState(false);

  // Settings form
  const [cfgMlApiKey, setCfgMlApiKey] = useState('');        // MailerLite (primary)
  const [cfgFromEmail, setCfgFromEmail] = useState('');
  const [cfgFromName, setCfgFromName] = useState('');
  const [cfgDailyLimit, setCfgDailyLimit] = useState('100');
  const [savingConfig, setSavingConfig] = useState(false);
  const [mlTestStatus, setMlTestStatus] = useState(null);    // { ok, message }
  const [mlTesting, setMlTesting] = useState(false);
  const [mlBackfillStatus, setMlBackfillStatus] = useState(null);
  const [mlBackfilling, setMlBackfilling] = useState(false);

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
      setContacts([]); setTemplates([]); setCampaigns([]); setSequences([]); setConfig(null); setTagContexts([]); setContactStats({});
      return;
    }
    loadAllData();
  }, [selectedClientId]);

  async function loadAllData() {
    setLoading(true); setError('');
    try {
      const [cfg, c, t, camp, tc, stats, seqs] = await Promise.all([
        getEmailConfig(selectedClientId),
        getEmailContacts(selectedClientId),
        getEmailTemplates(selectedClientId),
        getEmailCampaigns(selectedClientId),
        getTagContexts(selectedClientId),
        getContactStats(selectedClientId),
        getEmailSequences(selectedClientId).catch(() => []),
      ]);
      setConfig(cfg);
      setContacts(c || []);
      setTemplates(t || []);
      setCampaigns(camp || []);
      setTagContexts(tc || []);
      setContactStats(stats || {});
      setSequences(seqs || []);
      if (cfg) {
        setCfgFromEmail(cfg.from_email || '');
        setCfgFromName(cfg.from_name || '');
        setCfgDailyLimit(String(cfg.daily_limit || 100));
        setCfgMlApiKey('');
        setMlTestStatus(null);
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
        contacts: [{
          email: newEmail.trim(),
          name: newName.trim(),
          tags,
          birthday_month: newBdayMonth ? parseInt(newBdayMonth) : null,
          birthday_day: newBdayDay ? parseInt(newBdayDay) : null,
          discount_code: newDiscount.trim() || null,
          signed_up_at: newSignedUpAt ? new Date(newSignedUpAt).toISOString() : null,
          city: newCity.trim() || null,
          state: newState.trim() || null,
          country: newCountry.trim() || null,
        }],
      });
      setNewEmail(''); setNewName(''); setNewTags(''); setNewBdayMonth(''); setNewBdayDay('');
      setNewDiscount(''); setNewSignedUpAt(''); setNewCity(''); setNewState(''); setNewCountry('');
      const [c, stats] = await Promise.all([getEmailContacts(selectedClientId), getContactStats(selectedClientId)]);
      setContacts(c || []); setContactStats(stats || {});
    } catch (e) { setError(e.message); }
    setAdding(false);
  }

  // Parse a single CSV line respecting quoted fields
  function parseCsvLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim().replace(/^'/, ''));
  }

  // Smart bulk parser: handles CSV with header (email/name/tags/city/state/country/...)
  // OR positional "email, name, tag1, tag2..." format.
  function parseBulkContacts(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [];

    // Detect header row: look for an "email" field
    const firstFields = parseCsvLine(lines[0]).map(f => f.toLowerCase());
    const hasHeader = firstFields.some(f => f === 'email');

    if (hasHeader) {
      const headers = firstFields;
      const idx = (name) => headers.indexOf(name);
      const out = [];
      for (let i = 1; i < lines.length; i++) {
        const cells = parseCsvLine(lines[i]);
        if (!cells.length) continue;
        const email = (cells[idx('email')] || '').toLowerCase().trim();
        if (!email) continue;
        const tagsRaw = idx('tags') >= 0 ? (cells[idx('tags')] || '') : '';
        const tags = tagsRaw.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
        out.push({
          email,
          name: cells[idx('first_name')] || cells[idx('name')] || '',
          tags,
          city: idx('city') >= 0 ? cells[idx('city')] || null : null,
          state: idx('state') >= 0 ? cells[idx('state')] || null : null,
          country: idx('country') >= 0 ? cells[idx('country')] || null : null,
        });
      }
      return out;
    }

    // Positional fallback
    return lines.map(line => {
      const cells = parseCsvLine(line);
      const email = (cells[0] || '').toLowerCase().trim();
      return {
        email,
        name: cells[1] || '',
        tags: cells.slice(2).filter(Boolean),
      };
    }).filter(c => c.email);
  }

  function reparseBulk(text) {
    setBulkEmails(text);
    setBulkError('');
    try {
      const parsed = parseBulkContacts(text);
      setBulkPreview(parsed);
    } catch (e) {
      setBulkError(e.message);
      setBulkPreview([]);
    }
  }

  function handleBulkFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => reparseBulk(String(reader.result || ''));
    reader.onerror = () => setBulkError('Failed to read file');
    reader.readAsText(file);
  }

  async function handleBulkAdd() {
    const contactsList = bulkPreview.length ? bulkPreview : parseBulkContacts(bulkEmails);
    if (!contactsList.length || !selectedClientId) return;
    setAdding(true); setError('');
    try {
      await addEmailContacts({ client_id: selectedClientId, contacts: contactsList });
      setBulkEmails(''); setBulkPreview([]); setBulkError('');
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

  async function handleSaveEdit(contactId) {
    try {
      await updateEmailContact({
        contact_id: contactId,
        birthday_month: editForm.birthday_month || null,
        birthday_day: editForm.birthday_day || null,
        discount_code: editForm.discount_code || null,
        signed_up_at: editForm.signed_up_at ? new Date(editForm.signed_up_at).toISOString() : null,
      });
      const c = await getEmailContacts(selectedClientId);
      setContacts(c || []);
      setEditContactId(null);
    } catch (e) { setError(e.message); }
  }

  function startEditContact(c) {
    setEditContactId(c.id);
    setEditForm({
      birthday_month: c.birthday_month || '',
      birthday_day: c.birthday_day || '',
      discount_code: c.discount_code || '',
      signed_up_at: c.signed_up_at ? new Date(c.signed_up_at).toISOString().slice(0, 10) : '',
    });
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
        await updateEmailTemplate(editingTplId, { name: tplName, subject: tplSubject, html_body: tplBody, preview_text: tplPreview, template_type: tplType });
      } else {
        await createEmailTemplate({ client_id: selectedClientId, name: tplName, subject: tplSubject, html_body: tplBody, preview_text: tplPreview, template_type: tplType });
      }
      setTplName(''); setTplSubject(''); setTplBody(''); setTplPreview(''); setTplShowPreview(false); setTplType('blast'); setEditingTplId(null);
      const t = await getEmailTemplates(selectedClientId);
      setTemplates(t || []);
    } catch (e) { setError(e.message); }
    setSavingTpl(false);
  }

  function startEditTemplate(t) {
    setTplName(t.name); setTplSubject(t.subject); setTplBody(t.html_body || ''); setTplPreview(t.preview_text || ''); setTplShowPreview(!!t.preview_text); setTplType(t.template_type); setEditingTplId(t.id);
    setActiveTab('templates');
  }

  // ── AI template generator ──
  async function handleAIGenerate() {
    if (!selectedClientId) return;
    setAiGenLoading(true); setError('');
    try {
      const r = await generateEmailTemplateAI({
        client_id: selectedClientId,
        prompt: aiGenPrompt.trim(),
        template_type: tplType,
      });
      if (r.subject) setTplSubject(r.subject);
      if (r.preview_text) { setTplPreview(r.preview_text); setTplShowPreview(true); }
      if (r.html_body) setTplBody(r.html_body);
      if (!tplName.trim()) setTplName(aiGenPrompt.trim().slice(0, 40) || `AI ${tplType} template`);
      setAiGenOpen(false);
      setAiGenPrompt('');
    } catch (e) { setError('AI generation failed: ' + e.message); }
    setAiGenLoading(false);
  }

  // ── Logo upload ──
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function handleLogoUpload(file) {
    if (!file || !selectedClientId) return;
    setLogoUploading(true); setError('');
    try {
      const b64 = await fileToBase64(file);
      await uploadClientLogo({
        client_id: selectedClientId,
        filename: file.name,
        content_type: file.type,
        data_base64: b64,
      });
      // Refresh clients
      const data = await getContentClients();
      setClients(data || []);
    } catch (e) { setError('Logo upload failed: ' + e.message); }
    setLogoUploading(false);
    if (logoInputRef.current) logoInputRef.current.value = '';
  }
  async function handleBrandColorChange(field, value) {
    if (!selectedClientId) return;
    try {
      await updateContentClient(selectedClientId, { [field]: value });
      const data = await getContentClients();
      setClients(data || []);
    } catch (e) { setError('Color save failed: ' + e.message); }
  }

  // ── New client ──
  async function handleCreateClient() {
    if (!newClientName.trim()) return;
    setCreatingClient(true); setError('');
    try {
      const created = await createContentClient({
        business_name: newClientName.trim(),
        website_url: newClientWebsite.trim() || null,
        preferred_tone: newClientTone.trim() || null,
        brand_primary_color: newClientPrimary,
        brand_secondary_color: newClientSecondary,
      });
      const data = await getContentClients();
      setClients(data || []);
      const newId = created?.id || created?.[0]?.id;
      if (newId) setSelectedClientId(newId);
      setNewClientOpen(false);
      setNewClientName(''); setNewClientWebsite(''); setNewClientTone('');
      setNewClientPrimary('#E8650A'); setNewClientSecondary('var(--surface-3)');
    } catch (e) { setError('Create client failed: ' + e.message); }
    setCreatingClient(false);
  }

  // ── Load MailerLite groups when composer opens ──
  useEffect(() => {
    if (!showComposer || !selectedClientId) return;
    (async () => {
      setMlGroupsLoading(true); setMlGroupsError('');
      try {
        const res = await getMailerliteGroups(selectedClientId);
        setMlGroups(res?.groups || []);
      } catch (e) {
        setMlGroupsError(e.message);
        setMlGroups([]);
      }
      setMlGroupsLoading(false);
    })();
  }, [showComposer, selectedClientId]);

  // ── AI agent handlers ──
  async function handleAiSend() {
    const instruction = aiInput.trim();
    if (!instruction || !selectedClientId) return;
    // Grab current HTML (prefer template-full doc if active, else campBody)
    const currentHtml = campTemplateHtml
      ? String(campTemplateHtml)
          .replace(/\{\{body\}\}/g, campBody || '')
          .replace(/\{\{cta_text\}\}/g, campCtaText || 'Learn more')
          .replace(/\{\{cta_url\}\}/g, campCtaUrl || '#')
      : campBody;
    if (!currentHtml || !currentHtml.trim()) {
      setAiMessages(prev => [...prev, { role: 'user', text: instruction }, { role: 'system', text: 'No email content yet — pick a template or write some content first.' }]);
      setAiInput('');
      return;
    }
    // Build selection payload if user has something tagged
    let selection = null;
    if (aiSelection?.refId && campBodyEditorRef.current?.getElementHtml) {
      const outer = campBodyEditorRef.current.getElementHtml(aiSelection.refId);
      selection = { ...aiSelection, outerHtml: outer || '' };
    }
    setAiMessages(prev => [...prev, { role: 'user', text: instruction, selection }]);
    setAiInput('');
    setAiLoading(true);
    try {
      // Snapshot current HTML for undo
      setAiHistory(prev => [...prev.slice(-9), currentHtml]);
      const res = await editEmailAI({
        client_id: selectedClientId,
        html: currentHtml,
        instruction,
        selection,
      });
      const newHtml = res?.html;
      if (!newHtml) throw new Error('AI returned empty HTML');
      // If wrapper-based, we can't really split body back out — so flip to
      // standalone mode: stash the new HTML as the template body and clear the
      // wrapper. That way the editor becomes the sole source of truth.
      if (campTemplateHtml) {
        setCampTemplateHtml(null);
        setCampTemplateId('');
        setCampTemplateName('');
      }
      setCampBody(newHtml);
      // Tell the editor to re-render the iframe immediately
      if (campBodyEditorRef.current?.setHtml) campBodyEditorRef.current.setHtml(newHtml);
      setAiMessages(prev => [...prev, { role: 'ai', text: res.message || 'Updated.' }]);
      setAiSelection(null);
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'system', text: 'Error: ' + e.message }]);
    }
    setAiLoading(false);
  }

  function handleAiUndo() {
    if (!aiHistory.length) return;
    const prev = aiHistory[aiHistory.length - 1];
    setAiHistory(h => h.slice(0, -1));
    setCampBody(prev);
    if (campBodyEditorRef.current?.setHtml) campBodyEditorRef.current.setHtml(prev);
    setAiMessages(m => [...m, { role: 'system', text: 'Reverted last AI change.' }]);
  }

  // ── Campaign handlers ──
  async function handleCreateCampaign() {
    if (!campSubject.trim() || !selectedClientId) return;
    setCreatingCamp(true); setError('');
    try {
      // Strip visual merge-tag chip wrappers — keep the raw token so the
      // send-side substitution (`{{name}}` -> contact.name) still works cleanly.
      const unwrapChips = (html) => (html || '')
        .replace(/<span[^>]*class=["'][^"']*merge-tag[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '$1')
        .replace(/&nbsp;/g, ' ');
      const cleanBody = stripEditorRefs(unwrapChips(campBody));
      // If a template wrapper is active, substitute the editable body + CTA into placeholders
      const finalHtml = campTemplateHtml
        ? String(campTemplateHtml)
            .replace(/\{\{body\}\}/g, cleanBody || '')
            .replace(/\{\{cta_text\}\}/g, campCtaText || 'Learn more')
            .replace(/\{\{cta_url\}\}/g, campCtaUrl || '#')
        : cleanBody;
      // Group IDs get prefixed "ml:" so the API can distinguish them from tag names.
      const groupFilter = (campGroupIds || []).map(id => `ml:${id}`);
      const result = await createEmailCampaign({
        client_id: selectedClientId,
        subject: campSubject,
        html_body: finalHtml,
        preview_text: campPreview,
        tag_filter: groupFilter,
        scheduled_at: campSchedule || undefined,
      });
      if (result?.schedule_warning) {
        alert('Saved locally, but MailerLite schedule failed: ' + result.schedule_warning);
      }
      setCampSubject(''); setCampBody(''); setCampPreview(''); setCampShowPreview(false); setCampTags([]); setCampGroupIds([]); setCampSchedule('');
      setCampTemplateId(''); setCampTemplateHtml(null); setCampTemplateName('');
      setAiMessages([]); setAiHistory([]); setAiSelection(null);
      setCampCtaText('Get Access'); setCampCtaUrl('https://www.vernontm.com/book-call');
      setCampShowLivePreview(false);
      setShowComposer(false);
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
    const hasMl = !!cfgMlApiKey.trim() || !!config?.mailerlite_api_key_masked;
    if (!hasMl) { setError('MailerLite API key required'); return; }
    setSavingConfig(true); setError('');
    try {
      const payload = {
        client_id: selectedClientId,
        from_email: cfgFromEmail.trim(),
        from_name: cfgFromName.trim(),
        daily_limit: parseInt(cfgDailyLimit) || 100,
      };
      if (cfgMlApiKey.trim()) payload.mailerlite_api_key = cfgMlApiKey.trim();
      await saveEmailConfig(payload);
      setCfgMlApiKey('');
      const cfg = await getEmailConfig(selectedClientId);
      setConfig(cfg);
    } catch (e) { setError(e.message); }
    setSavingConfig(false);
  }

  async function handleTestMailerlite() {
    if (!cfgMlApiKey.trim()) { setMlTestStatus({ ok: false, message: 'Enter a key first' }); return; }
    setMlTesting(true); setMlTestStatus(null);
    try {
      const r = await testMailerliteKey(cfgMlApiKey.trim());
      setMlTestStatus({ ok: true, message: `Connected as ${r?.account?.name || r?.account?.email || 'MailerLite account'}` });
    } catch (e) {
      setMlTestStatus({ ok: false, message: e.message });
    }
    setMlTesting(false);
  }

  async function handleMailerliteBackfill() {
    if (!selectedClientId) return;
    if (!window.confirm('Push every active contact without a MailerLite subscriber id into MailerLite? This can take a while.')) return;
    setMlBackfilling(true); setMlBackfillStatus(null);
    try {
      const r = await runMailerliteBackfill(selectedClientId, { only_unsynced: true, limit: 500 });
      setMlBackfillStatus(r);
    } catch (e) {
      setMlBackfillStatus({ ok: false, error: e.message });
    }
    setMlBackfilling(false);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  return (
    <div style={{ fontFamily: 'var(--font-display)', height: '100%', minHeight: '100vh', display: 'flex', background: 'var(--surface-2)' }}>
      {/* ══════ LEFT CLIENT SIDEBAR ══════ */}
      <div style={{
        width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ padding: '18px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mail size={18} color="var(--orange)" />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Email Marketing</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
          <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Clients
          </div>
          {clients.length === 0 && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--muted)' }}>No clients yet</div>
          )}
          <div style={{ padding: '4px 12px 10px' }}>
            <button onClick={() => setNewClientOpen(true)} style={{
              width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.15)',
              background: 'var(--accent-dim)', color: 'var(--orange)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Plus size={13} /> New Client
            </button>
          </div>
          {clients.map(c => (
            <div
              key={c.id}
              onClick={() => setSelectedClientId(c.id)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
                color: selectedClientId === c.id ? 'var(--orange)' : 'var(--text)',
                background: selectedClientId === c.id ? 'rgba(255,155,38,0.06)' : 'transparent',
                borderLeft: selectedClientId === c.id ? '3px solid var(--orange)' : '3px solid transparent',
                fontWeight: selectedClientId === c.id ? 600 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                transition: 'all 0.15s',
              }}
            >
              <span className="private-value">{c.business_name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════ RIGHT MAIN AREA ══════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar with client name + tabs + status */}
        <div style={{
          background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 24px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
            {selectedClient ? <span className="private-value">{selectedClient.business_name}</span> : 'Select a Client'}
          </h2>
          {selectedClientId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              {config ? (
                <span style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> Resend connected</span>
              ) : (
                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}><Settings size={14} /> Setup needed</span>
              )}
            </div>
          )}
          {selectedClientId && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  background: activeTab === t.key ? 'linear-gradient(135deg, var(--orange), #ee7c1a)' : 'var(--surface-3)',
                  color: activeTab === t.key ? 'var(--surface)' : 'var(--muted)', transition: 'all 0.15s',
                }}>
                  <t.Icon size={14} /> {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '10px 24px', background: 'rgba(220,38,38,0.1)', color: '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}><X size={14} /></button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', minWidth: 0 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ marginTop: 8, fontSize: 13 }}>Loading...</div>
            </div>
          )}

          {!selectedClientId && !loading && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
              <Mail size={48} strokeWidth={1} />
              <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>Select a client from the sidebar</div>
            </div>
          )}

          {selectedClientId && !loading && (
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              {activeTab === 'contacts' && renderContactsTab()}
              {activeTab === 'templates' && renderTemplatesTab()}
              {activeTab === 'campaigns' && renderCampaignsTab()}
              {activeTab === 'sequences' && renderSequencesTab()}
              {activeTab === 'tags' && renderTagsTab()}
              {activeTab === 'settings' && renderSettingsTab()}
            </div>
          )}
        </div>
      </div>

      {/* Template picker modal (campaigns + sequences) */}
      {tplPicker && (
        <TemplatePickerModal
          templates={templates}
          initialTemplateId={tplPicker.initialTemplateId}
          onClose={() => setTplPicker(null)}
          onApply={(data) => { tplPicker?.onApply?.(data); setTplPicker(null); }}
        />
      )}

      {/* Contact sends modal */}
      {viewSendsContact && (
        <div onClick={() => setViewSendsContact(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, maxWidth: 700, width: '100%', maxHeight: '80vh', overflow: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Send History</div>
                <div className="private-value" style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{viewSendsContact.email}</div>
              </div>
              <button onClick={() => setViewSendsContact(null)} style={btnSecondary}><X size={14} /></button>
            </div>
            {loadingSends ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}><Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
            ) : viewSendsData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)', fontSize: 13 }}>No sends to this contact yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Subject</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Sent</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {viewSendsData.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', color: 'var(--text)', fontWeight: 500 }}>{s.subject || '-'}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}><StatusPill status={s.status} /></td>
                      <td style={{ padding: '10px', color: 'var(--muted)', fontSize: 12 }}>{s.sent_at ? new Date(s.sent_at).toLocaleString() : '-'}</td>
                      <td style={{ padding: '10px', color: 'var(--muted)', fontSize: 12 }}>{s.opened_at ? new Date(s.opened_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* View broadcast modal */}
      {viewCampaign && (() => {
        const c = viewCampaign;
        const recipients = c.total_recipients || c.sent_count || 0;
        const openRate = recipients > 0 && c.opened_count ? ((c.opened_count / recipients) * 100).toFixed(1) + '%' : '-';
        const dateLabel = c.sent_at || c.scheduled_at || c.updated_at || c.created_at;
        const d = dateLabel ? new Date(dateLabel) : null;
        const rawBody = c.html_body || c.body || '';
        const previewHtml = rawBody.trim().toLowerCase().startsWith('<!doctype') || rawBody.trim().toLowerCase().startsWith('<html')
          ? rawBody
          : `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:20px;color:#1a1a2e;line-height:1.6;max-width:640px;margin:0 auto;}</style></head><body>${rawBody}</body></html>`;
        return (
          <div onClick={() => setViewCampaign(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, maxWidth: 900, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Broadcast</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', wordBreak: 'break-word' }}>{c.subject}</div>
                  {c.preview_text && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{c.preview_text}</div>
                  )}
                </div>
                <button onClick={() => setViewCampaign(null)} style={btnSecondary}><X size={14} /></button>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Status</div>
                  <div style={{ marginTop: 6 }}><StatusPill status={c.status} /></div>
                </div>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{c.sent_at ? 'Sent' : c.scheduled_at ? 'Scheduled' : 'Updated'}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginTop: 6 }}>{d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}</div>
                </div>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Recipients</div>
                  <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 700, marginTop: 4 }}>{recipients || '-'}</div>
                </div>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Opened</div>
                  <div style={{ fontSize: 16, color: 'var(--text)', fontWeight: 700, marginTop: 4 }}>{c.opened_count || 0} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>({openRate})</span></div>
                </div>
                <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>Failed</div>
                  <div style={{ fontSize: 16, color: c.failed_count ? '#ef4444' : 'var(--surface-3)', fontWeight: 700, marginTop: 4 }}>{c.failed_count || 0}</div>
                </div>
              </div>

              {/* Auto-trigger info */}
              {c.auto_trigger_enabled && (
                <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.trigger_type === 'birthday' ? <Cake size={14} /> : <Zap size={14} />}
                  Auto-trigger: {c.trigger_type === 'birthday' ? 'sends on contact birthday' : <>sends when contact gets tag <strong>{c.trigger_on_tag}</strong></>}
                </div>
              )}

              {/* HTML preview */}
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Email preview</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
                {rawBody ? (
                  <iframe
                    title="Broadcast preview"
                    srcDoc={previewHtml}
                    sandbox=""
                    style={{ width: '100%', height: 500, border: 0, background: 'var(--surface)' }}
                  />
                ) : (
                  <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No body content.</div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                {(c.status === 'draft' || c.status === 'scheduled') && !c.auto_trigger_enabled && (
                  <button onClick={() => { handleSendCampaign(c.id); setViewCampaign(null); }} disabled={sendingCampId === c.id || !config} style={{ ...btnPrimary, opacity: (sendingCampId === c.id || !config) ? 0.6 : 1 }}>
                    <Zap size={14} /> Send now
                  </button>
                )}
                {c.status !== 'sending' && (
                  <button onClick={() => { if (confirm('Delete this broadcast?')) { handleDeleteCampaign(c.id); setViewCampaign(null); } }} style={btnDanger}>
                    <Trash2 size={14} /> Delete
                  </button>
                )}
                <button onClick={() => setViewCampaign(null)} style={btnSecondary}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* New client modal */}
      {newClientOpen && (
        <div onClick={() => !creatingClient && setNewClientOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, maxWidth: 480, width: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Create New Client</div>
              <button onClick={() => setNewClientOpen(false)} disabled={creatingClient} style={btnSecondary}><X size={13} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Business Name *</label>
                <input style={inputStyle} placeholder="Acme Coffee Co." value={newClientName} onChange={e => setNewClientName(e.target.value)} autoFocus />
              </div>
              <div>
                <label style={labelStyle}>Website (optional)</label>
                <input style={inputStyle} placeholder="https://example.com" value={newClientWebsite} onChange={e => setNewClientWebsite(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Preferred Tone (optional)</label>
                <input style={inputStyle} placeholder="warm, confident, direct" value={newClientTone} onChange={e => setNewClientTone(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Primary Color</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="color" value={newClientPrimary} onChange={e => setNewClientPrimary(e.target.value)}
                      style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                    <input style={inputStyle} value={newClientPrimary} onChange={e => setNewClientPrimary(e.target.value)} />
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Secondary Color</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="color" value={newClientSecondary} onChange={e => setNewClientSecondary(e.target.value)}
                      style={{ width: 44, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                    <input style={inputStyle} value={newClientSecondary} onChange={e => setNewClientSecondary(e.target.value)} />
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Logo and brand bible can be added from Settings after creation.
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={handleCreateClient} disabled={creatingClient || !newClientName.trim()}
                  style={{ ...btnPrimary, opacity: (creatingClient || !newClientName.trim()) ? 0.6 : 1 }}>
                  {creatingClient ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                  Create Client
                </button>
                <button onClick={() => setNewClientOpen(false)} disabled={creatingClient} style={btnSecondary}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI template generator modal */}
      {aiGenOpen && (
        <div onClick={() => !aiGenLoading && setAiGenOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.5)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, maxWidth: 520, width: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={16} color="#E8650A" /> Generate Template with AI
              </div>
              <button onClick={() => setAiGenOpen(false)} disabled={aiGenLoading} style={btnSecondary}><X size={13} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
              Uses <strong className="private-value">{selectedClient?.business_name}</strong>'s brand bible, logo, and colors to produce a ready-to-send HTML template.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Template Type</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['welcome', 'blast'].map(t => (
                    <button key={t} onClick={() => setTplType(t)} style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                      background: tplType === t ? 'linear-gradient(135deg, var(--orange), #ee7c1a)' : 'var(--surface-3)',
                      color: tplType === t ? 'var(--surface)' : 'var(--muted)',
                    }}>{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>What should this email accomplish? (optional)</label>
                <textarea style={{ ...inputStyle, minHeight: 90, fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder="e.g. Announce our Spring Sale - 25% off all blends, urgency around Friday deadline, drive clicks to /shop"
                  value={aiGenPrompt} onChange={e => setAiGenPrompt(e.target.value)} />
              </div>
              {!selectedClient?.logo_url && (
                <div style={{ fontSize: 11, padding: 8, background: 'rgba(180,83,9,0.15)', color: '#fbbf24', borderRadius: 6 }}>
                  Tip: upload a logo in Settings for better results.
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                <button onClick={handleAIGenerate} disabled={aiGenLoading} style={{
                  background: 'linear-gradient(135deg, #E8650A, #f59e0b)', color: 'var(--surface)', borderRadius: 8, border: 'none',
                  padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex',
                  alignItems: 'center', gap: 6, opacity: aiGenLoading ? 0.6 : 1,
                }}>
                  {aiGenLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                  {aiGenLoading ? 'Generating...' : 'Generate'}
                </button>
                <button onClick={() => setAiGenOpen(false)} disabled={aiGenLoading} style={btnSecondary}>Cancel</button>
              </div>
            </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle} >Add Contact</div>
            <button type="button" onClick={() => setShowMoreFields(s => !s)} style={{
              background: 'transparent', border: 'none', color: 'var(--orange)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              <ChevronDown size={13} style={{ transform: showMoreFields ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              {showMoreFields ? 'Hide details' : 'More details'}
            </button>
          </div>
          {/* Primary row — fast path */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 2fr) minmax(140px, 1fr) minmax(180px, 1.5fr) auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} placeholder="email@example.com" value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && newEmail.trim() && handleAddContact()} autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Name</label>
              <input style={inputStyle} placeholder="First Last" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Tags</label>
              <TagSelect value={newTags} onChange={setNewTags} options={allKnownTags} placeholder="Choose tags..." />
            </div>
            <button onClick={handleAddContact} disabled={adding || !newEmail.trim()} style={{ ...btnPrimary, opacity: adding ? 0.6 : 1, height: 38 }}>
              {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Add
            </button>
          </div>

          {/* Secondary fields — collapsed by default */}
          {showMoreFields && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e5e7ef',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <div>
                <label style={labelStyle}><Cake size={10} style={{ marginRight: 3 }} />Birthday Month</label>
                <select style={inputStyle} value={newBdayMonth} onChange={e => setNewBdayMonth(e.target.value)}>
                  <option value="">Month</option>
                  {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Birthday Day</label>
                <select style={inputStyle} value={newBdayDay} onChange={e => setNewBdayDay(e.target.value)}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}><Gift size={10} style={{ marginRight: 3 }} />Discount Code</label>
                <input style={inputStyle} placeholder="WELCOME10" value={newDiscount} onChange={e => setNewDiscount(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Signed Up</label>
                <input type="date" style={inputStyle} value={newSignedUpAt} onChange={e => setNewSignedUpAt(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>City</label>
                <input style={inputStyle} placeholder="Houston" value={newCity} onChange={e => setNewCity(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>State</label>
                <input style={inputStyle} placeholder="TX" value={newState} onChange={e => setNewState(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <input style={inputStyle} placeholder="US" value={newCountry} onChange={e => setNewCountry(e.target.value)} />
              </div>
            </div>
          )}

          {campaigns.some(c => c.auto_trigger_enabled) && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Info size={12} /> Auto-trigger campaigns active: new contacts with matching tags will receive them automatically.
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle}>Bulk Import</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input ref={bulkFileRef} type="file" accept=".csv,text/csv,text/plain" style={{ display: 'none' }}
                onChange={e => { handleBulkFile(e.target.files?.[0]); if (bulkFileRef.current) bulkFileRef.current.value = ''; }} />
              <button onClick={() => bulkFileRef.current?.click()} style={btnSecondary}>
                <Upload size={13} /> Upload CSV
              </button>
              {(bulkEmails || bulkPreview.length > 0) && (
                <button onClick={() => { setBulkEmails(''); setBulkPreview([]); setBulkError(''); }} style={btnSecondary}>
                  <X size={13} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Drag-drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--orange)'; e.currentTarget.style.background = '#eef2ff'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.background = 'var(--surface-2)'; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '#c7d2fe';
              e.currentTarget.style.background = 'var(--surface-2)';
              const f = e.dataTransfer.files?.[0];
              if (f) handleBulkFile(f);
            }}
            style={{
              border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 10, padding: 14, background: 'var(--surface-2)',
              fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 10,
              transition: 'all 0.15s',
            }}
          >
            Drop a CSV here, paste below, or click <strong>Upload CSV</strong>. Headers like <code>email,first_name,tags,city,state,country</code> are auto-detected.
          </div>

          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
            placeholder={'email,first_name,tags,city,state,country\njohn@example.com,John,"newsletter,vip",Houston,TX,US'}
            value={bulkEmails}
            onChange={e => reparseBulk(e.target.value)}
          />

          {bulkError && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>{bulkError}</div>
          )}

          {bulkPreview.length > 0 && (
            <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: 'var(--surface-2)', fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Preview · {bulkPreview.length} contact{bulkPreview.length === 1 ? '' : 's'} ready</span>
                <span style={{ color: 'var(--muted)', fontWeight: 500 }}>
                  {(() => {
                    const existingEmails = new Set(contacts.map(c => (c.email || '').toLowerCase()));
                    const dupes = bulkPreview.filter(p => existingEmails.has(p.email)).length;
                    return dupes > 0 ? `${dupes} already in list (will update tags)` : 'all new';
                  })()}
                </span>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600 }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600 }}>Tags</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--muted)', fontWeight: 600 }}>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.slice(0, 100).map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="private-value" style={{ padding: '6px 10px', color: 'var(--text)' }}>{p.email}</td>
                        <td className="private-value" style={{ padding: '6px 10px', color: 'var(--muted)' }}>{p.name || '-'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{(p.tags || []).join(', ') || '-'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{[p.city, p.state, p.country].filter(Boolean).join(', ') || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bulkPreview.length > 100 && (
                  <div style={{ padding: 8, fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>+{bulkPreview.length - 100} more...</div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button onClick={handleBulkAdd} disabled={adding || bulkPreview.length === 0}
              style={{ ...btnPrimary, opacity: (adding || bulkPreview.length === 0) ? 0.6 : 1 }}>
              {adding ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
              Import {bulkPreview.length || ''} contact{bulkPreview.length === 1 ? '' : 's'}
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
                  <span key={tag} style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: 'var(--surface-3)', color: 'var(--muted)' }}>
                    <Tag size={10} style={{ marginRight: 3 }} />{tag} ({count})
                  </span>
                );
              })}
            </div>
          )}

          {contacts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
              <Users size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No contacts yet. Add some above.</div>
            </div>
          )}

          {contacts.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Email</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Tags</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Birthday</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Signed Up</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Sent</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Opened</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => {
                    const stats = contactStats[c.id] || { sent: 0, opened: 0, failed: 0 };
                    const isEditing = editContactId === c.id;
                    return (
                      <React.Fragment key={c.id}>
                        <tr style={{ borderBottom: isEditing ? 'none' : '1px solid var(--border)', cursor: 'pointer' }} onClick={() => !isEditing && handleViewSends(c)}>
                          <td className="private-value" style={{ padding: '10px 10px', fontWeight: 600, color: 'var(--text)' }}>{c.email}</td>
                          <td className="private-value" style={{ padding: '10px 10px', color: 'var(--muted)' }}>{c.name || '-'}</td>
                          <td style={{ padding: '10px 10px' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {(c.tags || []).map((tag, i) => (
                                <span key={i} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }}>{tag}</span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '10px 10px', color: 'var(--muted)', fontSize: 12 }}>
                            {c.birthday_month && c.birthday_day ? `${MONTHS[c.birthday_month]} ${c.birthday_day}` : '-'}
                          </td>
                          <td style={{ padding: '10px 10px', color: 'var(--muted)', fontSize: 12, fontFamily: 'monospace' }}>{c.discount_code || '-'}</td>
                          <td style={{ padding: '10px 10px', color: 'var(--muted)', fontSize: 12 }}>
                            {c.signed_up_at ? new Date(c.signed_up_at).toLocaleDateString() : '-'}
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'center', color: '#22c55e', fontWeight: 600 }}>{stats.sent}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--orange)', fontWeight: 600 }}>{stats.opened}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'center' }}><StatusPill status={c.status} /></td>
                          <td style={{ padding: '10px 10px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => isEditing ? setEditContactId(null) : startEditContact(c)} style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11, marginRight: 4 }}>
                              {isEditing ? <X size={11} /> : <Eye size={11} />}
                            </button>
                            <button onClick={() => handleDeleteContact(c.id)} style={{ ...btnDanger, padding: '4px 8px', fontSize: 11 }}><Trash2 size={11} /></button>
                          </td>
                        </tr>
                        {isEditing && (
                          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                            <td colSpan={10} style={{ padding: '12px 10px' }}>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ minWidth: 170 }}>
                                  <label style={labelStyle}>Birthday</label>
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <select style={{ ...inputStyle, flex: 1 }} value={editForm.birthday_month} onChange={e => setEditForm({ ...editForm, birthday_month: e.target.value })}>
                                      <option value="">Month</option>
                                      {MONTHS.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                                    </select>
                                    <select style={{ ...inputStyle, width: 70 }} value={editForm.birthday_day} onChange={e => setEditForm({ ...editForm, birthday_day: e.target.value })}>
                                      <option value="">Day</option>
                                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 140 }}>
                                  <label style={labelStyle}>Discount Code</label>
                                  <input style={inputStyle} value={editForm.discount_code} onChange={e => setEditForm({ ...editForm, discount_code: e.target.value })} />
                                </div>
                                <div style={{ flex: 1, minWidth: 140 }}>
                                  <label style={labelStyle}>Signed Up</label>
                                  <input type="date" style={inputStyle} value={editForm.signed_up_at} onChange={e => setEditForm({ ...editForm, signed_up_at: e.target.value })} />
                                </div>
                                <button onClick={() => handleSaveEdit(c.id)} style={btnPrimary}><Check size={13} /> Save</button>
                                <button onClick={() => setEditContactId(null)} style={btnSecondary}><X size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
                    background: tplType === t ? 'linear-gradient(135deg, var(--orange), #ee7c1a)' : 'var(--surface-3)',
                    color: tplType === t ? 'var(--surface)' : 'var(--muted)',
                  }}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          {!tplShowPreview && (
            <div style={{ marginBottom: 10 }}>
              <button type="button" onClick={() => setTplShowPreview(true)} style={{ ...btnSecondary, fontSize: 11, padding: '5px 10px' }}>
                <Plus size={12} /> Add preview text
              </button>
            </div>
          )}
          {tplShowPreview && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Preview text <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(shown in inbox before they open)</span></label>
              <input style={inputStyle} placeholder="A short teaser shown under the subject in most inboxes" value={tplPreview} onChange={e => setTplPreview(e.target.value)} />
            </div>
          )}
          <label style={labelStyle}>Body <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(rich editor · switch to HTML source for full control · emails auto-wrapped in styled shell)</span></label>
          <VarButtons onInsert={token => setTplBody((tplBody || '') + token)} />
          <EmailEditor value={tplBody} onChange={setTplBody} clientId={selectedClientId} placeholder="Hey {{name}}," height={320} />
          <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={handleSaveTemplate} disabled={savingTpl || !tplName.trim() || !tplSubject.trim()} style={{ ...btnPrimary, opacity: savingTpl ? 0.6 : 1 }}>
              {savingTpl ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              {editingTplId ? 'Update Template' : 'Save Template'}
            </button>
            <button type="button" onClick={() => setAiGenOpen(true)} style={{
              background: 'linear-gradient(135deg, #E8650A, #f59e0b)', color: 'var(--surface)', borderRadius: 8, border: 'none',
              padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', gap: 6,
            }}>
              <Sparkles size={14} /> Generate with AI
            </button>
            {editingTplId && (
              <button onClick={() => { setEditingTplId(null); setTplName(''); setTplSubject(''); setTplBody(''); setTplPreview(''); setTplShowPreview(false); setTplType('blast'); }} style={btnSecondary}>
                <X size={13} /> Cancel
              </button>
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>Templates ({templates.length})</div>
          {templates.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
              <FileText size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No templates yet. Create one above.</div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {templates.map(t => (
              <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
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
    // Broadcast-style tabs
    const statusTabs = [
      { key: 'all', label: 'All broadcasts', match: () => true },
      { key: 'draft', label: 'Drafts', match: c => c.status === 'draft' },
      { key: 'scheduled', label: 'Scheduled', match: c => c.status === 'scheduled' },
      { key: 'sending', label: 'Processing', match: c => c.status === 'sending' || c.status === 'partial' },
      { key: 'sent', label: 'Published', match: c => c.status === 'sent' },
      { key: 'sequences', label: 'Sequences', jumpTo: 'sequences', count: sequences.length },
    ];
    const counts = {};
    statusTabs.forEach(t => {
      counts[t.key] = t.count !== undefined ? t.count : campaigns.filter(t.match).length;
    });
    const filtered = campaigns.filter(statusTabs.find(t => t.key === campFilter)?.match || (() => true))
      .filter(c => !campSearch || (c.subject || '').toLowerCase().includes(campSearch.toLowerCase()));

    // ─────────────────────────────────────────────────────────────
    // Composer modal — two-column layout:
    //   LEFT: scrollable meta (subject/preview/audience/schedule) + editor
    //   RIGHT: AI agent chat (click-to-tag element from editor)
    // ─────────────────────────────────────────────────────────────
    const activeClient = clients.find(c => c.id === selectedClientId);
    const hasBrandBible = !!(activeClient?.brand_bible?.trim());

    const composer = showComposer && (
      <div onClick={() => setShowComposer(false)} style={{
        position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--surface)', borderRadius: 14, maxWidth: 1400, width: '100%', height: '94vh',
          display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gridTemplateRows: '100%', overflow: 'hidden',
        }}>
          {/* ─── LEFT: form + editor ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden', borderRight: '1px solid var(--border)' }}>
            {/* Header */}
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <Edit3 size={16} color="var(--orange)" />
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>New Broadcast</div>

              {/* Template picker — moved to header for compactness */}
              <select
                value={campTemplateId}
                onChange={(e) => {
                  const tplId = e.target.value;
                  if (!tplId) { setCampTemplateId(''); setCampTemplateHtml(null); setCampTemplateName(''); return; }
                  setTplPicker({
                    initialTemplateId: tplId,
                    onApply: ({ template_html, body_text, subject, preview_text, has_slot, name }) => {
                      if (has_slot && template_html) {
                        setCampTemplateId(tplId); setCampTemplateHtml(template_html); setCampTemplateName(name || ''); setCampBody(body_text || '');
                      } else {
                        setCampTemplateId(tplId); setCampTemplateHtml(null); setCampTemplateName(name || ''); setCampBody(template_html || '');
                      }
                      if (subject && !campSubject) setCampSubject(subject);
                      if (preview_text && !campPreview) setCampPreview(preview_text);
                    },
                  });
                }}
                style={{ marginLeft: 12, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer' }}
              >
                <option value="">Start from template…</option>
                {templates.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </select>

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="datetime-local"
                  style={{ ...inputStyle, width: 200, padding: '6px 10px', fontSize: 12 }}
                  value={campSchedule}
                  onChange={e => setCampSchedule(e.target.value)}
                  title="Schedule (optional)"
                />
                <button onClick={() => setShowComposer(false)} style={{ ...btnSecondary, padding: '6px 10px' }}><X size={13} /></button>
                <button onClick={handleCreateCampaign} disabled={creatingCamp || !campSubject.trim()} style={{ ...btnPrimary, padding: '6px 14px', opacity: creatingCamp ? 0.6 : 1 }}>
                  {creatingCamp ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : campSchedule ? <Calendar size={13} /> : <Check size={13} />}
                  {campSchedule ? 'Schedule' : 'Save Draft'}
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Subject + Preview row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Subject line</label>
                  <input ref={campSubjectRef} style={{ ...inputStyle, fontSize: 14, padding: '10px 12px' }} placeholder="Your email subject line" value={campSubject} onChange={e => setCampSubject(e.target.value)} />
                  <div style={{ marginTop: 4 }}>
                    <VarButtons onInsert={token => insertAtCursor(campSubjectRef, campSubject, setCampSubject, token)} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Preview text <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input style={{ ...inputStyle, fontSize: 14, padding: '10px 12px' }} placeholder="Teaser shown under subject" value={campPreview} onChange={e => setCampPreview(e.target.value)} />
                </div>
              </div>

              {/* Audience — MailerLite groups dropdown */}
              <div>
                <label style={labelStyle}>
                  Send to <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(MailerLite groups — leave empty for all subscribers)</span>
                </label>
                {mlGroupsLoading ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading groups from MailerLite…
                  </div>
                ) : mlGroupsError ? (
                  <div style={{ fontSize: 12, color: '#ef4444' }}>MailerLite error: {mlGroupsError}</div>
                ) : mlGroups.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>No groups found in MailerLite yet.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {mlGroups.map(g => {
                      const isSelected = campGroupIds.includes(g.id);
                      return (
                        <button key={g.id} type="button" onClick={() => {
                          setCampGroupIds(isSelected ? campGroupIds.filter(id => id !== g.id) : [...campGroupIds, g.id]);
                        }} style={{
                          padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: isSelected ? 'linear-gradient(135deg, var(--orange), #ee7c1a)' : 'var(--surface-2)',
                          color: isSelected ? 'var(--surface)' : 'var(--text)',
                          border: '1px solid ' + (isSelected ? 'transparent' : 'var(--border)'),
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          <Users size={11} />{g.name}
                          <span style={{ opacity: 0.7, fontWeight: 500 }}>{g.active || g.total || 0}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Template chip */}
              {campTemplateHtml && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid #1e3a5f', borderRadius: 8, fontSize: 12 }}>
                  <FileText size={13} color="#60a5fa" />
                  <span style={{ color: '#60a5fa' }}>Using template: <strong>{campTemplateName || 'Template'}</strong></span>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>— only body slot editable (AI edits apply to full HTML).</span>
                  <button type="button" onClick={() => { setCampTemplateId(''); setCampTemplateHtml(null); setCampTemplateName(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={11} /> Remove</button>
                </div>
              )}

              {/* Merge tag buttons */}
              <div>
                <VarButtons onInsert={token => {
                  const chip = `<span class="merge-tag" contenteditable="false" style="display:inline-block; background:#eff6ff; border:1px solid #60a5fa; color:#1d4ed8; padding:1px 7px; border-radius:5px; font-size:0.92em; font-weight:600; line-height:1.4; margin:0 1px; white-space:nowrap;">${token}</span>&nbsp;`;
                  if (campBodyEditorRef.current?.insertHtml) campBodyEditorRef.current.insertHtml(chip);
                  else setCampBody((campBody || '') + token);
                }} />
              </div>

              {/* Editor — fills remaining height */}
              <div style={{ flex: 1, minHeight: 420, display: 'flex', flexDirection: 'column' }}>
                <EmailEditor
                  ref={campBodyEditorRef}
                  value={campBody}
                  onChange={setCampBody}
                  onSelectionChange={setAiSelection}
                  clientId={selectedClientId}
                  placeholder={campTemplateHtml ? 'Type your message here — slots into the template body.' : 'Hey {{name}},'}
                  height={480}
                />
              </div>

              {/* CTA inputs (only for slot templates) */}
              {campTemplateHtml && (
                <div style={{ padding: 10, background: 'rgba(255,155,38,0.06)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                  <div>
                    <label style={{ ...labelStyle, color: '#fb923c' }}>CTA text</label>
                    <input style={inputStyle} placeholder="Get Access" value={campCtaText} onChange={e => setCampCtaText(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: '#fb923c' }}>CTA URL</label>
                    <input style={inputStyle} placeholder="https://..." value={campCtaUrl} onChange={e => setCampCtaUrl(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── RIGHT: AI agent panel ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-2)', minWidth: 0, height: '100%', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={15} color="var(--orange)" />
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>AI Editor</div>
              {hasBrandBible && (
                <span title="This client's brand bible is loaded — AI responses will match their voice" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#4ade80', background: 'rgba(34,197,94,0.1)', padding: '3px 8px', borderRadius: 12 }}>
                  <BookOpenCheck size={10} /> Brand bible
                </span>
              )}
              {aiHistory.length > 0 && (
                <button onClick={handleAiUndo} title="Undo last AI change" style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11 }}>
                  <RotateCcw size={11} /> Undo
                </button>
              )}
            </div>

            {/* Messages */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aiMessages.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: 10, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MessageSquare size={13} /> Ask me to edit anything
                  </div>
                  Try: "Rewrite this more professionally", "Remove the video card", "Change the CTA color to green", "Add a testimonials section".
                  <div style={{ marginTop: 8, fontSize: 11, fontStyle: 'italic' }}>
                    Tip: click any text in the editor first — the AI will target it.
                  </div>
                </div>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '92%',
                  padding: '8px 12px',
                  borderRadius: 10,
                  fontSize: 12, lineHeight: 1.5,
                  background: m.role === 'user' ? 'var(--orange)' : m.role === 'system' ? 'rgba(239,68,68,0.08)' : 'var(--surface)',
                  color: m.role === 'user' ? 'var(--surface)' : m.role === 'system' ? '#fca5a5' : 'var(--text)',
                  border: m.role !== 'user' ? '1px solid var(--border)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.selection && (
                    <div style={{ fontSize: 10, opacity: 0.8, marginBottom: 4, fontStyle: 'italic' }}>
                      → &lt;{m.selection.tag}&gt; "{(m.selection.text || '').slice(0, 60)}…"
                    </div>
                  )}
                  {m.text}
                </div>
              ))}
              {aiLoading && (
                <div style={{ alignSelf: 'flex-start', padding: '8px 12px', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Thinking…
                </div>
              )}
            </div>

            {/* Selection chip */}
            {aiSelection && (
              <div style={{ padding: '8px 12px', background: 'rgba(255,155,38,0.12)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <MousePointer size={11} color="var(--orange)" />
                <span style={{ color: 'var(--orange)', fontWeight: 600 }}>&lt;{aiSelection.tag}&gt;</span>
                <span style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  "{aiSelection.text}"
                </span>
                <button onClick={() => setAiSelection(null)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                  <X size={11} />
                </button>
              </div>
            )}

            {/* Composer input */}
            <form onSubmit={e => { e.preventDefault(); handleAiSend(); }} style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0, background: 'var(--surface-2)' }}>
              <textarea
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend(); } }}
                placeholder={aiSelection ? `Edit this ${aiSelection.tag}…` : 'Ask the AI to edit your email…'}
                rows={2}
                disabled={aiLoading}
                style={{ ...inputStyle, resize: 'none', fontSize: 13, padding: '8px 10px', fontFamily: 'inherit' }}
              />
              <button type="submit" disabled={aiLoading || !aiInput.trim()} style={{ ...btnPrimary, padding: '0 12px', opacity: (aiLoading || !aiInput.trim()) ? 0.5 : 1 }}>
                <ArrowUp size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    );

    return (
      <div>
        {composer}

        {!config && (
          <div style={{ ...cardStyle, background: 'rgba(251,191,36,0.12)', borderColor: '#fbbf24', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={16} /> Set up your MailerLite API key in the Settings tab before sending.
            </div>
          </div>
        )}

        {/* Header: title + New Broadcast */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Broadcasts <span style={{ color: 'var(--muted)', fontWeight: 500, fontSize: 16 }}>{campaigns.length}</span>
          </div>
          <button onClick={() => { setShowComposer(true); }} style={{ ...btnPrimary, background: 'var(--surface)', color: '#fff', padding: '10px 18px' }}>
            <Plus size={14} /> New Broadcast
          </button>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
          {statusTabs.map(t => (
            <button key={t.key} onClick={() => t.jumpTo ? setActiveTab(t.jumpTo) : setCampFilter(t.key)} style={{
              padding: '10px 14px', border: 'none', background: 'transparent',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              color: campFilter === t.key ? 'var(--orange)' : 'var(--muted)',
              borderBottom: campFilter === t.key ? '2px solid var(--orange)' : '2px solid transparent',
              marginBottom: -1, display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
              {t.label}
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'var(--surface-3)', color: 'var(--muted)', fontWeight: 600 }}>
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Search + refresh */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative', maxWidth: 340 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              style={{ ...inputStyle, paddingLeft: 36 }}
              placeholder="Search broadcasts..."
              value={campSearch}
              onChange={e => setCampSearch(e.target.value)}
            />
          </div>
          <button onClick={loadAllData} style={btnSecondary}><RefreshCw size={13} /> Refresh</button>
        </div>

        {/* Broadcast table */}
        {filtered.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 50, color: 'var(--muted)' }}>
            <Send size={32} strokeWidth={1} />
            <div style={{ marginTop: 8, fontSize: 13 }}>No broadcasts in this view.</div>
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Subject line</th>
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Date</th>
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Recipients</th>
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Opened</th>
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Open rate</th>
                    <th style={{ textAlign: 'right', padding: '12px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Failed</th>
                    <th style={{ textAlign: 'center', padding: '12px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const recipients = c.total_recipients || c.sent_count || 0;
                    const openRate = recipients > 0 && c.opened_count ? ((c.opened_count / recipients) * 100).toFixed(2) + '%' : '-';
                    const dateLabel = c.sent_at || c.scheduled_at || c.updated_at || c.created_at;
                    const d = dateLabel ? new Date(dateLabel) : null;
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s', cursor: 'pointer' }}
                          onClick={() => setViewCampaign(c)}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {c.auto_trigger_enabled
                              ? (c.trigger_type === 'birthday' ? <Cake size={14} color="#f59e0b" /> : <Zap size={14} color="#f59e0b" />)
                              : <FileText size={14} color="#b0b0c0" />}
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.subject}</div>
                              {c.preview_text && (
                                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {c.preview_text}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
                          {d ? (
                            <>
                              <div>{d.toLocaleString('en-US', { weekday: 'short' })} {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</div>
                              <div style={{ color: 'var(--muted)' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                            </>
                          ) : '-'}
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{recipients || '-'}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text)' }}>{c.opened_count || '-'}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: 'var(--text)' }}>{openRate}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: c.failed_count ? '#ef4444' : '#b0b0c0' }}>{c.failed_count || '-'}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}><StatusPill status={c.status} /></td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          {(c.status === 'draft' || c.status === 'scheduled') && !c.auto_trigger_enabled && (
                            <button onClick={() => handleSendCampaign(c.id)} disabled={sendingCampId === c.id || !config} style={{ ...btnPrimary, padding: '5px 10px', fontSize: 11, marginRight: 4, opacity: (sendingCampId === c.id || !config) ? 0.6 : 1 }}>
                              {sendingCampId === c.id ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />} Send
                            </button>
                          )}
                          {c.status !== 'sending' && (
                            <button onClick={() => handleDeleteCampaign(c.id)} style={{ ...btnDanger, padding: '5px 8px', fontSize: 11 }}><Trash2 size={12} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // SEQUENCE HANDLERS
  // ══════════════════════════════════════════════════════════════
  async function reloadSequences() {
    try {
      const s = await getEmailSequences(selectedClientId);
      setSequences(s || []);
    } catch (e) { setError(e.message); }
  }
  async function handleCreateSequence() {
    if (!newSeqName.trim()) return;
    setSavingSeq(true);
    try {
      const created = await createEmailSequence({
        client_id: selectedClientId,
        name: newSeqName.trim(),
        trigger_tags_all: newSeqTag.trim() ? [newSeqTag.trim()] : [],
      });
      setNewSeqOpen(false); setNewSeqName(''); setNewSeqTag('');
      await reloadSequences();
      if (created?.id) {
        const detail = await getEmailSequenceDetail(created.id);
        setEditingSeq(detail);
      }
    } catch (e) { setError(e.message); }
    setSavingSeq(false);
  }
  async function handleOpenSequence(id) {
    try { const d = await getEmailSequenceDetail(id); setEditingSeq(d); }
    catch (e) { setError(e.message); }
  }
  async function handleUpdateSequence(updates) {
    if (!editingSeq) return;
    try {
      await updateEmailSequence({ id: editingSeq.id, ...updates });
      setEditingSeq({ ...editingSeq, ...updates });
      reloadSequences();
    } catch (e) { setError(e.message); }
  }
  async function handleDeleteSequence(id) {
    if (!confirm('Delete this sequence and all its data?')) return;
    try {
      await deleteEmailSequence(id);
      if (editingSeq?.id === id) setEditingSeq(null);
      reloadSequences();
    } catch (e) { setError(e.message); }
  }
  async function handleAddStep() {
    if (!editingSeq) return;
    try {
      const nextOrder = (editingSeq.steps?.length || 0) + 1;
      await saveSequenceStep({
        sequence_id: editingSeq.id,
        step_order: nextOrder,
        subject: '',
        html_body: '',
        delay_amount: nextOrder === 1 ? 0 : 1,
        delay_unit: 'days',
      });
      const d = await getEmailSequenceDetail(editingSeq.id);
      setEditingSeq(d); reloadSequences();
    } catch (e) { setError(e.message); }
  }
  async function handleSaveStep(step) {
    if (!editingSeq) return;
    try {
      await saveSequenceStep({ ...step, sequence_id: editingSeq.id });
      const d = await getEmailSequenceDetail(editingSeq.id);
      setEditingSeq(d); reloadSequences();
    } catch (e) { setError(e.message); }
  }
  async function handleDeleteStep(id) {
    if (!confirm('Delete this step?')) return;
    try {
      await deleteSequenceStep(id);
      const d = await getEmailSequenceDetail(editingSeq.id);
      setEditingSeq(d); reloadSequences();
    } catch (e) { setError(e.message); }
  }
  async function handleEnrollMatching() {
    if (!editingSeq) return;
    try {
      const r = await enrollSequenceMatching(editingSeq.id);
      alert(`Enrolled ${r.enrolled || 0} contact(s).`);
      const d = await getEmailSequenceDetail(editingSeq.id);
      setEditingSeq(d); reloadSequences();
    } catch (e) { setError(e.message); }
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: SEQUENCES
  // ══════════════════════════════════════════════════════════════
  function renderSequencesTab() {
    let list = [...sequences];
    if (seqFilter === 'active') list = list.filter(s => s.active);
    else if (seqFilter === 'inactive') list = list.filter(s => !s.active);
    if (seqSort === 'alpha') list.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    else if (seqSort === 'recent') list.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    else if (seqSort === 'subs') list.sort((a,b) => (b.subscribers||0) - (a.subscribers||0));

    const pillSelect = {
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999,
      padding: '6px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer',
      fontFamily: 'var(--font-display)', outline: 'none', fontWeight: 500,
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.5 }}>Sequences</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <select value={seqSort} onChange={e => setSeqSort(e.target.value)} style={pillSelect}>
              <option value="alpha">Alphabetical</option>
              <option value="recent">Most recent</option>
              <option value="subs">Subscribers</option>
            </select>
            <select value={seqFilter} onChange={e => setSeqFilter(e.target.value)} style={pillSelect}>
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={() => setSeqView('list')} style={{ padding: '7px 10px', background: seqView === 'list' ? 'var(--surface-3)' : 'var(--surface)', border: 'none', cursor: 'pointer', color: 'var(--muted)' }} title="List view">☰</button>
              <button onClick={() => setSeqView('grid')} style={{ padding: '7px 10px', background: seqView === 'grid' ? 'var(--surface-3)' : 'var(--surface)', border: 'none', cursor: 'pointer', color: 'var(--muted)' }} title="Grid view">▦</button>
            </div>
            <button onClick={() => setNewSeqOpen(true)} style={{ ...btnPrimary, background: 'var(--surface)' }}>
              <Plus size={14} /> New sequence
            </button>
          </div>
        </div>

        {/* Empty */}
        {list.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <Zap size={36} strokeWidth={1} />
            <div style={{ marginTop: 10, fontSize: 14 }}>No sequences yet. Create one to automate multi-email drips.</div>
          </div>
        ) : seqView === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {list.map(s => <SequenceCard key={s.id} seq={s} onOpen={() => handleOpenSequence(s.id)} onDelete={() => handleDeleteSequence(s.id)} />)}
          </div>
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Name</th>
                  <th style={{ textAlign: 'left', padding: '12px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Trigger</th>
                  <th style={{ textAlign: 'right', padding: '12px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Emails</th>
                  <th style={{ textAlign: 'right', padding: '12px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Subs</th>
                  <th style={{ textAlign: 'right', padding: '12px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Open rate</th>
                  <th style={{ textAlign: 'center', padding: '12px 10px', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 16px' }}></th>
                </tr>
              </thead>
              <tbody>
                {list.map(s => (
                  <tr key={s.id} onClick={() => handleOpenSequence(s.id)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text)' }}>{s.name}</td>
                    <td style={{ padding: '12px 10px', color: 'var(--muted)' }}>{s.trigger_tag ? <span style={{ background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 10, fontSize: 11 }}>{s.trigger_tag}</span> : '—'}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: 'var(--text)' }}>{s.steps_count || 0}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: 'var(--text)', fontWeight: 600 }}>{s.subscribers || 0}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: 'var(--muted)' }}>{(s.open_rate || 0).toFixed(1)}%</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.active ? 'rgba(34,197,94,0.12)' : 'var(--surface-3)', color: s.active ? '#22c55e' : 'var(--muted)' }}>
                        {s.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDeleteSequence(s.id)} style={{ ...btnDanger, padding: '5px 8px', fontSize: 11 }}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* New sequence modal */}
        {newSeqOpen && (
          <div onClick={() => !savingSeq && setNewSeqOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, maxWidth: 460, width: '100%', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>New sequence</div>
                <button onClick={() => setNewSeqOpen(false)} style={btnSecondary}><X size={14} /></button>
              </div>
              <label style={labelStyle}>Name</label>
              <input autoFocus style={inputStyle} placeholder="e.g. Welcome series" value={newSeqName} onChange={e => setNewSeqName(e.target.value)} />
              <div style={{ height: 10 }} />
              <label style={labelStyle}>Trigger tag (optional)</label>
              <input style={inputStyle} placeholder="e.g. newsletter" value={newSeqTag} onChange={e => setNewSeqTag(e.target.value)} list="all-tags-seq" />
              <datalist id="all-tags-seq">{allKnownTags.map(t => <option key={t} value={t} />)}</datalist>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>Contacts with this tag will be auto-enrolled when the sequence is active.</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
                <button onClick={() => setNewSeqOpen(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleCreateSequence} disabled={savingSeq || !newSeqName.trim()} style={{ ...btnPrimary, opacity: (savingSeq || !newSeqName.trim()) ? 0.6 : 1 }}>
                  {savingSeq ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />} Create
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Editor modal */}
        {editingSeq && (
          <SequenceEditor
            seq={editingSeq}
            allTags={allKnownTags}
            templates={templates}
            clientId={selectedClientId}
            onClose={() => setEditingSeq(null)}
            onUpdate={handleUpdateSequence}
            onAddStep={handleAddStep}
            onSaveStep={handleSaveStep}
            onDeleteStep={handleDeleteStep}
            onEnrollMatching={handleEnrollMatching}
            onDelete={() => handleDeleteSequence(editingSeq.id)}
          />
        )}
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
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
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
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--muted)' }}>
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
          <div style={sectionTitle}>Email Provider — <span className="private-value">{selectedClient?.business_name}</span></div>
          {config?.mailerlite_api_key_masked && (
            <div style={{ marginBottom: 14, padding: 12, background: 'rgba(34,197,94,0.08)', borderRadius: 8, fontSize: 12, color: '#1a7a3a' }}>
              <Check size={14} style={{ marginRight: 6 }} />
              MailerLite connected: <code>{config.mailerlite_api_key_masked}</code>
              <> &middot; From: {config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email}</>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>
                MailerLite API Key <span style={{ color: 'var(--accent)' }}>(primary — used for all sends)</span>
                {config?.mailerlite_api_key_masked && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> (leave blank to keep current)</span>}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...inputStyle, flex: 1 }} type="password" placeholder="eyJ0eX..." value={cfgMlApiKey} onChange={e => { setCfgMlApiKey(e.target.value); setMlTestStatus(null); }} />
                <button onClick={handleTestMailerlite} disabled={mlTesting || !cfgMlApiKey.trim()} style={{ ...btnSecondary, opacity: (mlTesting || !cfgMlApiKey.trim()) ? 0.5 : 1 }}>
                  {mlTesting ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={13} />} Test
                </button>
              </div>
              {mlTestStatus && (
                <div style={{ marginTop: 6, fontSize: 12, color: mlTestStatus.ok ? '#1a7a3a' : '#b94b4b' }}>
                  {mlTestStatus.ok ? '✓ ' : '✗ '}{mlTestStatus.message}
                </div>
              )}
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                Get your key at mailerlite.com → Integrations → API. All new signups land in the <strong>VTM - General List</strong> group automatically.
              </div>
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
            </div>
            <button onClick={handleSaveConfig} disabled={savingConfig || !cfgFromEmail.trim()} style={{ ...btnPrimary, alignSelf: 'flex-start', opacity: savingConfig ? 0.6 : 1 }}>
              {savingConfig ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
              Save Configuration
            </button>
          </div>
        </div>

        {config?.mailerlite_api_key_masked && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Sync Contacts to MailerLite</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
              New signups sync automatically. Use this to push <strong>existing</strong> contacts that haven't been synced yet — each one joins <strong>VTM - General List</strong> plus a group per tag.
            </div>
            <button onClick={handleMailerliteBackfill} disabled={mlBackfilling} style={{ ...btnSecondary, opacity: mlBackfilling ? 0.6 : 1 }}>
              {mlBackfilling ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />}
              {mlBackfilling ? 'Syncing…' : 'Sync Existing Contacts'}
            </button>
            {mlBackfillStatus && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 12, lineHeight: 1.6 }}>
                {mlBackfillStatus.error ? (
                  <span style={{ color: '#b94b4b' }}>✗ {mlBackfillStatus.error}</span>
                ) : (
                  <>
                    <div>Processed <strong>{mlBackfillStatus.total}</strong> · Synced <strong style={{ color: '#1a7a3a' }}>{mlBackfillStatus.synced}</strong> · Failed <strong style={{ color: '#b94b4b' }}>{mlBackfillStatus.failed}</strong></div>
                    {!!mlBackfillStatus.errors?.length && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer' }}>First {mlBackfillStatus.errors.length} errors</summary>
                        <ul style={{ margin: '6px 0 0 20px', fontSize: 11 }}>
                          {mlBackfillStatus.errors.map((e, i) => <li key={i}>{e}</li>)}
                        </ul>
                      </details>
                    )}
                    {mlBackfillStatus.total >= 500 && (
                      <div style={{ marginTop: 6, color: 'var(--muted)' }}>Batched 500 at a time — click again to continue.</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div style={cardStyle}>
          <div style={sectionTitle}>Branding — used by AI template generator</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
              <label style={labelStyle}>Logo</label>
              <div style={{
                width: 160, height: 160, border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 10, background: 'var(--surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              }}>
                {selectedClient?.logo_url ? (
                  <img src={selectedClient.logo_url} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <ImageIcon size={36} color="#b0b0c0" strokeWidth={1} />
                )}
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => handleLogoUpload(e.target.files?.[0])} />
              <button onClick={() => logoInputRef.current?.click()} disabled={logoUploading} style={{ ...btnSecondary, opacity: logoUploading ? 0.6 : 1 }}>
                {logoUploading ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                {selectedClient?.logo_url ? 'Replace logo' : 'Upload logo'}
              </button>
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Primary color (CTA buttons, accents)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={selectedClient?.brand_primary_color || '#E8650A'}
                    onChange={e => handleBrandColorChange('brand_primary_color', e.target.value)}
                    style={{ width: 48, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                  <input style={inputStyle} value={selectedClient?.brand_primary_color || ''}
                    onChange={e => handleBrandColorChange('brand_primary_color', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Secondary color (headings, dark)</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={selectedClient?.brand_secondary_color || 'var(--surface-3)'}
                    onChange={e => handleBrandColorChange('brand_secondary_color', e.target.value)}
                    style={{ width: 48, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }} />
                  <input style={inputStyle} value={selectedClient?.brand_secondary_color || ''}
                    onChange={e => handleBrandColorChange('brand_secondary_color', e.target.value)} />
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                These values plus the client's brand bible are used when you click <strong>Generate with AI</strong> on a template.
              </div>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={sectionTitle}>How Sending Works</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            <p>All email delivery runs through MailerLite:</p>
            <ul style={{ paddingLeft: 20 }}>
              <li><strong>New signups</strong> (forms, CRM, lead magnets) are pushed into MailerLite groups automatically — everyone joins <strong>VTM - General List</strong>, plus a group per tag</li>
              <li><strong>Broadcasts</strong> are created in MailerLite and sent to the groups matching their tag filter</li>
              <li><strong>Sequences / drip automations</strong> are set up in MailerLite directly (triggered by group membership)</li>
              <li><strong>Open &amp; click stats</strong> are pulled back via the "Refresh stats" button on each campaign</li>
            </ul>
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
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }}>
          <Tag size={11} style={{ marginRight: 4 }} />{tc.tag}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tc.contact_count || 0} contacts</span>
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

// ══════════════════════════════════════════════════════════════
// SEQUENCE CARD
// ══════════════════════════════════════════════════════════════
function SequenceCard({ seq, onOpen, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const emailsLabel = seq.steps_count === 1 ? '1 email' : `${seq.steps_count || 0} emails`;
  const dayLabel = seq.total_days === 1 ? '1 day' : `${seq.total_days || 0} day`;
  return (
    <div onClick={onOpen} style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
      cursor: 'pointer', transition: 'box-shadow 0.15s, transform 0.15s',
      display: 'flex', flexDirection: 'column',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(10,20,40,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
      {/* Status badge row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, minHeight: 20 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
          padding: '3px 8px', borderRadius: 10,
          background: seq.active ? 'rgba(34,197,94,0.12)' : 'var(--surface-3)',
          color: seq.active ? '#22c55e' : 'var(--muted)',
        }}>
          {seq.active ? 'Active' : 'Inactive'}
        </span>
        <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}>⋮</button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: 26, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(10,20,40,0.1)', zIndex: 5, minWidth: 140 }}>
              <button onClick={() => { setMenuOpen(false); onOpen(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>Edit</button>
              <button onClick={() => { setMenuOpen(false); onDelete(); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444' }}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Mail size={18} color="var(--text)" />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seq.name}</div>
      </div>

      <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginTop: 14 }}>
        A {dayLabel} sequence with {emailsLabel}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 18 }}>
        <MetricCol label="SUBS" value={seq.subscribers || 0} />
        <MetricCol label="OPEN" value={`${(seq.open_rate || 0).toFixed(seq.open_rate >= 10 ? 0 : 1)}%`} />
        <MetricCol label="CLICK" value={`${(seq.click_rate || 0).toFixed(seq.click_rate >= 10 ? 0 : 1)}%`} />
        <MetricCol label="UNSUB" value={seq.unsubscribers || 0} />
      </div>
    </div>
  );
}

function MetricCol({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SEQUENCE EDITOR MODAL
// ══════════════════════════════════════════════════════════════
function SequenceEditor({ seq, allTags, templates, clientId, onClose, onUpdate, onAddStep, onSaveStep, onDeleteStep, onEnrollMatching, onDelete }) {
  const initAll = Array.isArray(seq.trigger_tags_all) && seq.trigger_tags_all.length
    ? seq.trigger_tags_all : (seq.trigger_tag ? [seq.trigger_tag] : []);
  const initNone = Array.isArray(seq.trigger_tags_none) ? seq.trigger_tags_none : [];
  const [name, setName] = useState(seq.name || '');
  const [tagsAll, setTagsAll] = useState(initAll);
  const [tagsNone, setTagsNone] = useState(initNone);
  const [sendDays, setSendDays] = useState(Array.isArray(seq.send_days) ? seq.send_days : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
  const [winStart, setWinStart] = useState(seq.send_window_start ? seq.send_window_start.slice(0,5) : '');
  const [winEnd, setWinEnd] = useState(seq.send_window_end ? seq.send_window_end.slice(0,5) : '');
  const [winTz, setWinTz] = useState(seq.send_timezone || 'America/Chicago');
  const [active, setActive] = useState(!!seq.active);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const a = Array.isArray(seq.trigger_tags_all) && seq.trigger_tags_all.length
      ? seq.trigger_tags_all : (seq.trigger_tag ? [seq.trigger_tag] : []);
    const n = Array.isArray(seq.trigger_tags_none) ? seq.trigger_tags_none : [];
    setName(seq.name || '');
    setTagsAll(a); setTagsNone(n);
    setSendDays(Array.isArray(seq.send_days) ? seq.send_days : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']);
    setWinStart(seq.send_window_start ? seq.send_window_start.slice(0,5) : '');
    setWinEnd(seq.send_window_end ? seq.send_window_end.slice(0,5) : '');
    setWinTz(seq.send_timezone || 'America/Chicago');
    setActive(!!seq.active);
    setDirty(false);
  }, [seq.id]);

  function toggleDay(d) {
    const next = sendDays.includes(d) ? sendDays.filter(x => x !== d) : [...sendDays, d];
    setSendDays(next); setDirty(true);
  }

  async function saveHeader() {
    await onUpdate({
      name, trigger_tags_all: tagsAll, trigger_tags_none: tagsNone,
      send_days: sendDays, active,
      send_window_start: winStart || null,
      send_window_end: winEnd || null,
      send_timezone: winTz || 'America/Chicago',
    });
    setDirty(false);
  }

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-display)', outline: 'none', width: '100%', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)' };
  const lbl = { display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 };
  const primary = { background: 'var(--accent)', color: '#1a1a1a', borderRadius: 8, border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
  const secondary = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 12, maxWidth: 900, width: '100%', maxHeight: '92vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sequence</div>
            <input value={name} onChange={e => { setName(e.target.value); setDirty(true); }}
              style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', border: 'none', outline: 'none', width: '100%', padding: 0, fontFamily: 'var(--font-display)', marginTop: 2 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)', cursor: 'pointer', fontWeight: 600 }}>
              <span>Active</span>
              <span onClick={() => { setActive(a => !a); setDirty(true); }}
                style={{ display: 'inline-block', width: 38, height: 22, background: active ? 'var(--accent)' : 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 11, position: 'relative', transition: 'background 0.15s' }}>
                <span style={{ position: 'absolute', top: 2, left: active ? 18 : 2, width: 18, height: 18, background: '#fff', borderRadius: 9, transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}/>
              </span>
            </label>
            <button onClick={onClose} style={secondary}><X size={14} /></button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
          <MetricBox label="SUBSCRIBERS" value={seq.subscribers || 0} />
          <MetricBox label="OPEN RATE" value={`${(seq.open_rate || 0).toFixed(2)}%`} />
          <MetricBox label="CLICK RATE" value={`${(seq.click_rate || 0).toFixed(2)}%`} />
          <MetricBox label="UNSUBSCRIBERS" value={seq.unsubscribers || 0} />
          <MetricBox label="TOTAL SENT" value={seq.total_sent || 0} />
        </div>

        {/* Settings */}
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>Qualification rules</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
            <TagMultiPicker
              label="Contact must have ALL of these tags"
              hint="Contact is only enrolled if they have every tag listed here."
              color="#22c55e"
              values={tagsAll}
              allTags={allTags}
              exclude={tagsNone}
              onChange={next => { setTagsAll(next); setDirty(true); }}
            />
            <TagMultiPicker
              label="Contact must NOT have any of these tags"
              hint="Contacts with any of these tags are excluded."
              color="#ef4444"
              values={tagsNone}
              allTags={allTags}
              exclude={tagsAll}
              onChange={next => { setTagsNone(next); setDirty(true); }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            <div>
              <label style={lbl}>Send time window</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="time" value={winStart} onChange={e => { setWinStart(e.target.value); setDirty(true); }} style={{ ...inp, width: 120 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>to</span>
                <input type="time" value={winEnd} onChange={e => { setWinEnd(e.target.value); setDirty(true); }} style={{ ...inp, width: 120 }} />
                {(winStart || winEnd) && (
                  <button onClick={() => { setWinStart(''); setWinEnd(''); setDirty(true); }} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: 11, cursor: 'pointer', padding: '4px 6px' }}>Clear</button>
                )}
              </div>
              <select value={winTz} onChange={e => { setWinTz(e.target.value); setDirty(true); }} style={{ ...inp, marginTop: 6 }}>
                <option value="America/Chicago">America/Chicago (CT)</option>
                <option value="America/New_York">America/New_York (ET)</option>
                <option value="America/Denver">America/Denver (MT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
                <option value="America/Phoenix">America/Phoenix (AZ)</option>
                <option value="America/Anchorage">America/Anchorage (AK)</option>
                <option value="Pacific/Honolulu">Pacific/Honolulu (HI)</option>
                <option value="Europe/London">Europe/London (UK)</option>
                <option value="Europe/Paris">Europe/Paris (CET)</option>
                <option value="Asia/Dubai">Asia/Dubai</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Australia/Sydney">Australia/Sydney</option>
                <option value="UTC">UTC</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                {winStart && winEnd
                  ? `Sends only between ${winStart} and ${winEnd}. Emails due outside the window wait until it reopens.`
                  : 'Leave empty to allow sending any time of day.'}
              </div>
            </div>
            <div>
              <label style={lbl}>Allowed send days</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => {
                  const on = sendDays.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDay(d)} style={{
                      padding: '6px 10px', borderRadius: 8, border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'),
                      background: on ? 'var(--accent)' : 'var(--surface)', color: on ? '#1a1a1a' : 'var(--muted)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>{d}</button>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button disabled={!dirty} onClick={saveHeader} style={{ ...primary, opacity: dirty ? 1 : 0.5 }}>
              <Check size={14} /> Save settings
            </button>
            <button onClick={onEnrollMatching} style={secondary}>
              <Users size={14} /> Enroll matching contacts
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={onDelete} style={{ background: 'var(--surface)', border: '1px solid #fecaca', color: '#ef4444', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={14} /> Delete sequence
            </button>
          </div>
        </div>

        {/* Steps */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Emails in this sequence</div>
          <button onClick={onAddStep} style={primary}><Plus size={14} /> Add email</button>
        </div>
        {(seq.steps || []).length === 0 ? (
          <div style={{ border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 10, padding: 28, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            No emails yet. Click "Add email" to create the first one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(seq.steps || []).map((step, i) => (
              <StepEditor key={step.id} step={step} index={i} templates={templates} clientId={clientId} onSave={onSaveStep} onDelete={() => onDeleteStep(step.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function StepEditor({ step, index, templates = [], clientId, onSave, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const [subject, setSubject] = useState(step.subject || '');
  const [preview, setPreview] = useState(step.preview_text || '');
  const [body, setBody] = useState(step.html_body || '');
  const [amount, setAmount] = useState(step.delay_amount ?? 1);
  const [unit, setUnit] = useState(step.delay_unit || 'days');
  const [saving, setSaving] = useState(false);

  // Template wrapper state (same model as the broadcast composer)
  const [tplId, setTplId] = useState('');
  const [tplHtml, setTplHtml] = useState(null);
  const [tplName, setTplName] = useState('');
  const [ctaText, setCtaText] = useState('Get Access');
  const [ctaUrl, setCtaUrl] = useState('https://www.vernontm.com/book-call');
  const [showPreview, setShowPreview] = useState(false);
  const editorRef = useRef(null);

  useEffect(() => {
    setSubject(step.subject || '');
    setPreview(step.preview_text || '');
    setBody(step.html_body || '');
    setAmount(step.delay_amount ?? 1);
    setUnit(step.delay_unit || 'days');
    setTplId(''); setTplHtml(null); setTplName('');
  }, [step.id]);

  function applyTemplate(templateId) {
    if (!templateId) { setTplId(''); setTplHtml(null); setTplName(''); return; }
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    const hasSlot = !!(tpl.html_body || '').includes('{{body}}');
    setTplId(templateId);
    if (hasSlot) {
      setTplHtml(tpl.html_body || '');
      setTplName(tpl.name || '');
      setBody('');
    } else {
      setTplHtml(null);
      setTplName(tpl.name || '');
      setBody(tpl.html_body || '');
    }
    if (tpl.subject && !subject) setSubject(tpl.subject);
    if (tpl.preview_text && !preview) setPreview(tpl.preview_text);
  }

  const unwrapChips = (html) => (html || '')
    .replace(/<span[^>]*class=["'][^"']*merge-tag[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, '$1')
    .replace(/&nbsp;/g, ' ');

  function renderFinal() {
    const cleanBody = unwrapChips(body);
    if (tplHtml) {
      return String(tplHtml)
        .replace(/\{\{body\}\}/g, cleanBody || '')
        .replace(/\{\{cta_text\}\}/g, ctaText || 'Learn more')
        .replace(/\{\{cta_url\}\}/g, ctaUrl || '#');
    }
    return cleanBody;
  }

  async function save() {
    setSaving(true);
    const finalHtml = renderFinal();
    await onSave({ id: step.id, step_order: step.step_order, subject, preview_text: preview, html_body: finalHtml, delay_amount: parseInt(amount) || 0, delay_unit: unit });
    setSaving(false);
  }

  const inp = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'var(--font-display)', outline: 'none', boxSizing: 'border-box', background: 'var(--surface)', color: 'var(--text)' };
  const primary = { background: 'var(--surface)', color: 'var(--surface)', borderRadius: 8, border: 'none', padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: 'var(--surface)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {subject || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Untitled email</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            {index === 0 && amount === 0 ? 'Sends immediately after enrollment' : `Sends ${amount} ${unit} after ${index === 0 ? 'enrollment' : 'previous email'}`}
          </div>
        </div>
        <ChevronDown size={16} color="#8e8ea0" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </div>
      {expanded && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Send email</span>
            <input type="number" min="0" style={{ ...inp, width: 80 }} value={amount} onChange={e => setAmount(e.target.value)} />
            <select style={{ ...inp, width: 110 }} value={unit} onChange={e => setUnit(e.target.value)}>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>after {index === 0 ? 'enrollment' : 'last email'}</span>
          </div>
          <input style={inp} placeholder="Subject line" value={subject} onChange={e => setSubject(e.target.value)} />
          <input style={inp} placeholder="Preview text (optional)" value={preview} onChange={e => setPreview(e.target.value)} />

          {/* Template picker dropdown */}
          {templates && templates.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>Start from template</div>
              <select
                value={tplId}
                onChange={e => applyTemplate(e.target.value)}
                style={{ ...inp, width: '100%', cursor: 'pointer' }}
              >
                <option value="">-- Select a template --</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Template banner */}
          {tplHtml && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(59,130,246,0.08)', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12 }}>
              <FileText size={13} color="#2563eb" />
              <span style={{ color: '#60a5fa' }}>Using template: <strong>{tplName || 'Template'}</strong></span>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>— only the body below is editable.</span>
              <button
                type="button"
                onClick={() => { setTplId(''); setTplHtml(null); setTplName(''); }}
                style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <X size={11} /> Remove
              </button>
            </div>
          )}

          {/* Merge-tag chip buttons (insert at cursor) */}
          <VarButtons onInsert={token => {
            const chip = `<span class="merge-tag" contenteditable="false" style="display:inline-block; background:#eff6ff; border:1px solid #60a5fa; color:#1d4ed8; padding:1px 7px; border-radius:5px; font-size:0.92em; font-weight:600; line-height:1.4; margin:0 1px; white-space:nowrap;">${token}</span>&nbsp;`;
            if (editorRef.current?.insertHtml) {
              editorRef.current.insertHtml(chip);
            } else {
              setBody((body || '') + token);
            }
          }} />

          {/* Rich email editor (never raw HTML) */}
          <EmailEditor
            ref={editorRef}
            value={body}
            onChange={setBody}
            clientId={clientId}
            placeholder={tplHtml ? 'Type your message here — this is what goes in the editable slot.' : 'Hey {{name}},'}
            height={280}
          />

          {/* CTA editor (when template wrapper is active) */}
          {tplHtml && (
            <div style={{ padding: 12, background: 'rgba(255,155,38,0.08)', border: '1px solid #fed7aa', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#fb923c', marginBottom: 8, letterSpacing: 0.3 }}>CTA BUTTON</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px', minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: '#fb923c', fontWeight: 600, marginBottom: 4 }}>Button text</div>
                  <input style={inp} placeholder="Get Access" value={ctaText} onChange={e => setCtaText(e.target.value)} />
                </div>
                <div style={{ flex: '2 1 280px', minWidth: 220 }}>
                  <div style={{ fontSize: 11, color: '#fb923c', fontWeight: 600, marginBottom: 4 }}>Button URL</div>
                  <input style={inp} placeholder="https://..." value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Live preview toggle + iframe */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: showPreview ? 'var(--surface-3)' : 'var(--surface-2)', color: showPreview ? 'var(--surface)' : 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              <Eye size={13} /> {showPreview ? 'Hide preview' : 'Show live preview'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>See how the email will look to subscribers.</span>
          </div>
          {showPreview && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: '#0a0a0a' }}>
              <iframe
                title="Step live preview"
                srcDoc={(() => {
                  const cleanBody = unwrapChips(body) || '<span style="opacity:0.4">[your message here]</span>';
                  if (tplHtml) {
                    return String(tplHtml)
                      .replace(/\{\{body\}\}/g, cleanBody)
                      .replace(/\{\{cta_text\}\}/g, ctaText || 'Learn more')
                      .replace(/\{\{cta_url\}\}/g, ctaUrl || '#');
                  }
                  return `<div style="padding:24px; font-family:Helvetica,Arial,sans-serif; background:#fff;">${cleanBody}</div>`;
                })()}
                sandbox=""
                style={{ width: '100%', height: 520, border: 0, background: '#0a0a0a' }}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => onDelete()} style={{ background: 'var(--surface)', border: '1px solid #fecaca', color: '#ef4444', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Trash2 size={12} />
            </button>
            <button onClick={save} disabled={saving} style={{ ...primary, opacity: saving ? 0.6 : 1 }}>
              {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MULTI-TAG PICKER (include/exclude)
// ══════════════════════════════════════════════════════════════
function TagMultiPicker({ label, hint, color = 'var(--surface-3)', values = [], allTags = [], exclude = [], onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const lowerQ = query.toLowerCase();
  const available = allTags.filter(t =>
    !values.includes(t) &&
    !exclude.includes(t) &&
    (t.toLowerCase().includes(lowerQ))
  );
  const canCreate = query.trim() && !allTags.includes(query.trim()) && !values.includes(query.trim());

  function add(tag) {
    const t = tag.trim(); if (!t) return;
    if (values.includes(t)) return;
    onChange([...values, t]);
    setQuery('');
  }
  function remove(tag) { onChange(values.filter(v => v !== tag)); }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 }}>{label}</div>
      <div
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          minHeight: 38, padding: '6px 10px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'text',
        }}
      >
        {values.map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: color + '1a', color, padding: '3px 8px', borderRadius: 10,
            fontSize: 12, fontWeight: 600,
          }}>
            {v}
            <button onClick={e => { e.stopPropagation(); remove(v); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color, padding: 0, display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && query.trim()) { e.preventDefault(); add(query.trim()); }
            else if (e.key === 'Backspace' && !query && values.length) remove(values[values.length - 1]);
          }}
          placeholder={values.length ? '' : 'Click to add tags...'}
          style={{ flex: 1, minWidth: 120, border: 'none', outline: 'none', fontSize: 13, background: 'transparent', padding: '4px 0', fontFamily: 'var(--font-display)' }}
        />
      </div>
      {open && (available.length > 0 || canCreate) && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(10,20,40,0.08)', maxHeight: 220, overflowY: 'auto',
        }}>
          {available.slice(0, 50).map(t => (
            <div key={t} onClick={() => add(t)} style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {t}
            </div>
          ))}
          {canCreate && (
            <div onClick={() => add(query.trim())} style={{ padding: '8px 12px', fontSize: 13, color: color, cursor: 'pointer', borderTop: available.length ? '1px solid var(--border)' : 'none', fontWeight: 600 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              + Create "{query.trim()}"
            </div>
          )}
        </div>
      )}
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// TEMPLATE PICKER MODAL
// Lets the user pick a saved template, type body content for the
// {{body}} placeholder, live-preview the rendered HTML, then apply
// the finished HTML to the calling composer/step editor.
// ══════════════════════════════════════════════════════════════
function TemplatePickerModal({ templates, onClose, onApply, initialTemplateId }) {
  const [selectedId, setSelectedId] = useState(initialTemplateId || templates?.[0]?.id || null);
  const [bodyText, setBodyText] = useState('');
  const selected = templates.find(t => t.id === selectedId) || null;

  const hasBodyVar = selected?.html_body?.includes('{{body}}');

  // Render preview: replace {{body}} with the user's typed content
  // (HTML-escaped + newlines -> <br>). If the template has no {{body}}
  // placeholder, preview the raw HTML as-is.
  function renderHtml() {
    if (!selected) return '';
    const raw = selected.html_body || '';
    if (!hasBodyVar) return raw;
    const esc = (bodyText || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    return raw.replace(/\{\{body\}\}/g, esc || '<span style="opacity:0.4">[your message here]</span>');
  }

  const btnGhost = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const btnPrimary = { background: 'linear-gradient(135deg, var(--orange), var(--orange-dark))', color: 'var(--surface)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.55)', zIndex: 1100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 14, width: '100%', maxWidth: 1100, height: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Use a template</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Type your message — the rest of the email stays on-brand.</div>
          </div>
          <button onClick={onClose} style={btnGhost}><X size={14} /></button>
        </div>

        {/* Body split: left = list + body textarea, right = preview */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Left column */}
          <div style={{ width: 360, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5, marginBottom: 8 }}>TEMPLATES ({templates.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {templates.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', padding: 10, textAlign: 'center' }}>No templates yet. Create one in the Templates tab.</div>
                )}
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                      border: selectedId === t.id ? '2px solid var(--orange)' : '1px solid var(--border)',
                      background: selectedId === t.id ? '#eff3ff' : 'var(--surface)',
                      cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || '(no subject)'}</div>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 0.5, marginBottom: 8 }}>
                YOUR MESSAGE {hasBodyVar ? '' : '(template has no editable section)'}
              </div>
              <textarea
                disabled={!hasBodyVar}
                value={bodyText}
                onChange={e => setBodyText(e.target.value)}
                placeholder={hasBodyVar ? 'Type the paragraph that goes in the editable slot...' : 'This template is fully hard-coded.'}
                style={{
                  flex: 1, resize: 'none', padding: 12, borderRadius: 8, border: '1px solid var(--border)',
                  fontSize: 13, fontFamily: 'var(--font-display)', outline: 'none', lineHeight: 1.6,
                  background: hasBodyVar ? 'var(--surface)' : 'var(--surface-2)', color: 'var(--text)',
                }}
              />
            </div>
          </div>

          {/* Right column: preview */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface-2)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)' }}>
              <Eye size={14} color="#8e8ea0" />
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Preview</div>
              {selected && <div style={{ fontSize: 11, color: 'var(--muted)' }}>— {selected.subject}</div>}
            </div>
            <div style={{ flex: 1, overflow: 'hidden', padding: 0 }}>
              {selected ? (
                <iframe
                  title="Template preview"
                  srcDoc={renderHtml()}
                  style={{ width: '100%', height: '100%', border: 0, background: 'var(--surface)' }}
                  sandbox=""
                />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Select a template to preview</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {hasBodyVar ? 'Your message replaces the {{body}} slot. Everything else stays as-is.' : 'No editable slot — template will be applied as-is.'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>Cancel</button>
            <button
              disabled={!selected}
              onClick={() => onApply({
                id: selected?.id || '',
                html: renderHtml(),
                template_html: selected?.html_body || '',
                body_text: bodyText,
                has_slot: !!hasBodyVar,
                name: selected?.name || '',
                subject: selected?.subject || '',
                preview_text: selected?.preview_text || '',
              })}
              style={{ ...btnPrimary, opacity: selected ? 1 : 0.5 }}
            >
              <Check size={14} /> Use this template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
