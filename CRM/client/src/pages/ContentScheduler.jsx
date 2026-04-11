import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  getContentClients, getContentClient, createContentClient, updateContentClient, deleteContentClient,
  getContentScripts, createContentScript, updateContentScript, deleteContentScript, clearContentScripts,
  getScheduleConfig, saveScheduleConfig,
  parseScripts, generateCaptions, autoScheduleContent, processBrandBible,
} from '../api';
import {
  Search, Plus, Building2, Globe, ChevronDown, ChevronUp, Edit3,
  Trash2, Check, X, Eye, RefreshCw, Loader, Sparkles, Calendar,
  Upload, Download, Clock, Film, Image, Mic, Send, FileText,
  Play, ChevronLeft, ChevronRight, Copy, GripVertical, Settings,
} from 'lucide-react';

const STATUS_COLORS = {
  draft: { bg: '#f0f0f5', text: '#8e8ea0', label: 'Draft' },
  media_uploaded: { bg: '#e0f2fe', text: '#0ea5e9', label: 'Media Ready' },
  caption_ready: { bg: '#fff3e0', text: '#f59e0b', label: 'Caption Ready' },
  scheduled: { bg: '#e8f5e9', text: '#22c55e', label: 'Scheduled' },
  exported: { bg: '#f3e8ff', text: '#a855f7', label: 'Exported' },
  posted: { bg: '#e8f5e9', text: '#16a34a', label: 'Posted' },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return (
    <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

export default function ContentScheduler() {
  // Client state
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [client, setClient] = useState(null);
  const [showProfile, setShowProfile] = useState(false);

  // Content state
  const [scripts, setScripts] = useState([]);
  const [selectedScripts, setSelectedScripts] = useState(new Set());
  const [scheduleConfig, setScheduleConfig] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [editingCell, setEditingCell] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showClientModal, setShowClientModal] = useState(false); // add/edit client
  const [editingClient, setEditingClient] = useState(null); // null = add new, object = edit
  const [showMediaModal, setShowMediaModal] = useState(null); // script object
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [uploadProgress, setUploadProgress] = useState({}); // { scriptId: percent }
  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [dragOverId, setDragOverId] = useState(null);
  const [savingClient, setSavingClient] = useState(false);
  const [processingBible, setProcessingBible] = useState(false);
  const brandBibleUploadRef = useRef(null);

  // Schedule modal state
  const [schedTimeslots, setSchedTimeslots] = useState(['10:00', '14:00', '18:00', '22:00']);
  const [schedTimezone, setSchedTimezone] = useState('America/Chicago');
  const [newSlot, setNewSlot] = useState('');

  // Client form state
  const emptyClientForm = {
    business_name: '', owner_name: '', industry: '', website_url: '',
    instagram_handle: '', tiktok_handle: '', facebook_handle: '', threads_handle: '', youtube_handle: '', linkedin_handle: '',
    instagram_id: '', tiktok_id: '', facebook_id: '', threads_id: '', youtube_id: '', linkedin_id: '',
    brand_bible: '', target_audience: '', preferred_tone: 'friendly', notes: '',
  };
  const [clientForm, setClientForm] = useState(emptyClientForm);

  const fileInputRef = useRef(null);
  const scriptUploadRef = useRef(null);
  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);

  // ── Load clients on mount ──
  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      const data = await getContentClients();
      setClients(data || []);
    } catch (e) { console.error(e); }
  }

  // ── Load client data when selected ──
  useEffect(() => {
    if (!selectedClientId) { setClient(null); setScripts([]); return; }
    loadClientData(selectedClientId);
  }, [selectedClientId]);

  async function loadClientData(clientId) {
    setLoading(true);
    try {
      const [c, s, sc] = await Promise.all([
        getContentClient(clientId),
        getContentScripts(clientId),
        getScheduleConfig(clientId),
      ]);
      setClient(c);
      setScripts(s || []);
      setScheduleConfig(sc);
      if (sc) {
        setSchedTimeslots(sc.time_slots || ['10:00', '14:00', '18:00', '22:00']);
        setSchedTimezone(sc.timezone || 'America/Chicago');
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  // ── Speech recognition ──
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = 'en-US';
    r.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      if (last.isFinal) setChatInput(prev => (prev ? prev + ' ' : '') + last[0].transcript);
    };
    r.onend = () => { if (listeningRef.current) { try { r.start(); } catch (e) {} } };
    r.onerror = (e) => {
      if (e.error === 'aborted' || e.error === 'not-allowed') { listeningRef.current = false; setIsListening(false); }
    };
    recognitionRef.current = r;
  }, []);

  function toggleMic() {
    if (!recognitionRef.current) return;
    if (listeningRef.current) {
      listeningRef.current = false; recognitionRef.current.stop(); setIsListening(false);
    } else {
      listeningRef.current = true; setIsListening(true);
      try { recognitionRef.current.start(); } catch (e) {}
    }
  }

  // ── Media upload ──
  async function handleMediaDrop(e, script) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    if (!files.length) return;
    await uploadMedia(files, script);
  }

  async function uploadMedia(files, script) {
    const urls = [];
    let mediaType = 'image';

    for (const file of files) {
      if (file.type.startsWith('video')) mediaType = 'video';
      const filePath = `${client.id}/${script.id}/${Date.now()}_${file.name}`;

      setUploadProgress(prev => ({ ...prev, [script.id]: 0 }));

      const { data, error } = await supabase.storage
        .from('content-media')
        .upload(filePath, file);

      if (error) {
        console.error('Upload error:', error);
        continue;
      }

      setUploadProgress(prev => ({ ...prev, [script.id]: 100 }));

      const { data: urlData } = supabase.storage
        .from('content-media')
        .getPublicUrl(filePath);

      urls.push(urlData.publicUrl);
    }

    if (urls.length === 0) return;
    if (files.length > 1) mediaType = 'carousel';

    const existingUrls = script.media_urls || [];
    const allUrls = [...existingUrls, ...urls];

    await updateContentScript(script.id, {
      media_urls: allUrls,
      media_type: mediaType,
      status: script.status === 'draft' ? 'media_uploaded' : script.status,
    });

    setUploadProgress(prev => { const n = { ...prev }; delete n[script.id]; return n; });
    loadClientData(client.id);
  }

  // ── Inline edit ──
  function startEdit(scriptId, field, value) {
    setEditingCell({ id: scriptId, field });
    setEditValue(value || '');
  }

  async function saveEdit() {
    if (!editingCell) return;
    await updateContentScript(editingCell.id, { [editingCell.field]: editValue });
    setEditingCell(null);
    setEditValue('');
    loadClientData(client.id);
  }

  // ── Select scripts ──
  function toggleSelect(id) {
    setSelectedScripts(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }
  function selectAll() {
    if (selectedScripts.size === scripts.length) setSelectedScripts(new Set());
    else setSelectedScripts(new Set(scripts.map(s => s.id)));
  }

  // ── CSV Export ──
  function exportCSV() {
    const selected = scripts.filter(s => selectedScripts.has(s.id));
    if (!selected.length) return;

    const platformIds = [client.instagram_id, client.tiktok_id, client.facebook_id, client.threads_id, client.youtube_id, client.linkedin_id].filter(Boolean);
    const accountIds = platformIds.join(',');

    const rows = selected.map(script => {
      const description = [script.caption, script.hashtags].filter(Boolean).join(' ');
      const mediaUrls = script.media_urls ? script.media_urls.join('; ') : '';
      const dt = script.scheduled_datetime
        ? new Date(script.scheduled_datetime).toISOString().slice(0, 16).replace('T', ' ')
        : '';
      const firstComment = script.first_comment || '';
      const tags = script.tags || '';

      return [description, mediaUrls, dt, accountIds, firstComment, tags]
        .map(field => {
          const s = String(field);
          if (s.includes(',') || s.includes('"') || s.includes('\n'))
            return `"${s.replace(/"/g, '""')}"`;
          return s;
        }).join(',');
    });

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${client.business_name}_scheduled_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    // Mark as exported
    selected.forEach(s => updateContentScript(s.id, { status: 'exported' }));
    setTimeout(() => loadClientData(client.id), 500);
  }

  // ── Chat/Command handler ──
  async function handleCommand() {
    const cmd = chatInput.trim().toLowerCase();
    if (!cmd || !client) return;
    setChatInput('');

    if (cmd.includes('generate caption') || cmd.includes('create caption')) {
      setActionLoading('captions');
      try {
        const scriptIds = selectedScripts.size > 0 ? Array.from(selectedScripts) : undefined;
        const result = await generateCaptions({ client_id: client.id, script_ids: scriptIds });
        await loadClientData(client.id);
        alert(`Generated captions for ${result.updated} scripts`);
      } catch (e) { alert('Failed: ' + e.message); }
      setActionLoading('');
    } else if (cmd.includes('auto schedule') || cmd.includes('schedule all')) {
      setActionLoading('schedule');
      try {
        const result = await autoScheduleContent({ client_id: client.id });
        await loadClientData(client.id);
        alert(`Scheduled ${result.scheduled} scripts`);
      } catch (e) { alert('Failed: ' + e.message); }
      setActionLoading('');
    } else if (cmd.includes('upload') || cmd.includes('import script')) {
      scriptUploadRef.current?.click();
    } else if (cmd.includes('export')) {
      if (selectedScripts.size === 0) { selectAll(); }
      setTimeout(() => exportCSV(), 100);
    } else {
      alert('Commands: "generate captions", "auto schedule all", "upload scripts", "export"');
    }
  }

  // ── Script file upload ──
  async function handleScriptUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !client) return;
    e.target.value = '';

    setActionLoading('parsing');
    try {
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');

      if (isPdf || isImage) {
        // Send as base64 for Claude native processing
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result.split(',')[1]);
          reader.readAsDataURL(file);
        });
        const result = await parseScripts({
          client_id: client.id,
          file_base64: base64,
          media_type: file.type,
          file_name: file.name,
        });
        await loadClientData(client.id);
        alert(`Parsed ${Array.isArray(result) ? result.length : 0} scripts`);
      } else {
        // Text files
        const text = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.readAsText(file);
        });
        const result = await parseScripts({ client_id: client.id, text });
        await loadClientData(client.id);
        alert(`Parsed ${Array.isArray(result) ? result.length : 0} scripts`);
      }
    } catch (err) { alert('Parse failed: ' + err.message); }
    setActionLoading('');
  }

  // ── Delete selected ──
  async function deleteSelected() {
    if (!selectedScripts.size || !confirm(`Delete ${selectedScripts.size} scripts?`)) return;
    for (const id of selectedScripts) await deleteContentScript(id);
    setSelectedScripts(new Set());
    loadClientData(client.id);
  }

  // ── Save schedule config ──
  async function handleSaveSchedule() {
    try {
      await saveScheduleConfig({ client_id: client.id, time_slots: schedTimeslots, timezone: schedTimezone });
      setShowScheduleModal(false);
      loadClientData(client.id);
    } catch (e) { alert('Failed: ' + e.message); }
  }

  // ── Client add/edit ──
  function openAddClient() {
    setEditingClient(null);
    setClientForm(emptyClientForm);
    setShowClientModal(true);
  }
  function openEditClient() {
    if (!client) return;
    setEditingClient(client);
    setClientForm({
      business_name: client.business_name || '',
      owner_name: client.owner_name || '',
      industry: client.industry || '',
      website_url: client.website_url || '',
      instagram_handle: client.instagram_handle || '',
      tiktok_handle: client.tiktok_handle || '',
      facebook_handle: client.facebook_handle || '',
      threads_handle: client.threads_handle || '',
      youtube_handle: client.youtube_handle || '',
      linkedin_handle: client.linkedin_handle || '',
      instagram_id: client.instagram_id || '',
      tiktok_id: client.tiktok_id || '',
      facebook_id: client.facebook_id || '',
      threads_id: client.threads_id || '',
      youtube_id: client.youtube_id || '',
      linkedin_id: client.linkedin_id || '',
      brand_bible: client.brand_bible || '',
      target_audience: client.target_audience || '',
      preferred_tone: client.preferred_tone || 'friendly',
      notes: client.notes || '',
    });
    setShowClientModal(true);
  }
  async function handleBrandBibleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setProcessingBible(true);

    try {
      const isPdf = file.type === 'application/pdf';
      const isImage = file.type.startsWith('image/');

      if (isPdf || isImage) {
        // Read as base64 for PDF/image - Claude handles natively
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const result = ev.target.result;
            resolve(result.split(',')[1]); // strip data:...;base64, prefix
          };
          reader.readAsDataURL(file);
        });

        const { brand_bible } = await processBrandBible({
          client_id: editingClient?.id || null,
          file_base64: base64,
          media_type: file.type,
          file_name: file.name,
          business_name: clientForm.business_name,
        });
        setClientForm(prev => ({ ...prev, brand_bible: brand_bible }));
      } else {
        // Text-based files (.txt, .md, .docx text extraction)
        const fileText = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.readAsText(file);
        });

        const { brand_bible } = await processBrandBible({
          client_id: editingClient?.id || null,
          file_text: fileText,
          file_name: file.name,
          business_name: clientForm.business_name,
        });
        setClientForm(prev => ({ ...prev, brand_bible: brand_bible }));
      }
    } catch (err) {
      alert('Failed to process file: ' + err.message);
    }
    setProcessingBible(false);
  }

  async function handleSaveClient() {
    if (!clientForm.business_name.trim()) return;
    setSavingClient(true);
    try {
      if (editingClient) {
        await updateContentClient(editingClient.id, clientForm);
      } else {
        const created = await createContentClient(clientForm);
        if (created?.id) setSelectedClientId(created.id);
      }
      await loadClients();
      if (editingClient) await loadClientData(editingClient.id);
      setShowClientModal(false);
    } catch (e) { alert('Failed: ' + e.message); }
    setSavingClient(false);
  }

  // ── Styles ──
  const pageStyle = { padding: '24px 28px', maxWidth: 1400, margin: '0 auto' };
  const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 20, marginBottom: 16 };
  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid #e5e7ef', background: '#f8f9fc', fontSize: 14,
    color: '#1a1a2e', outline: 'none', fontFamily: 'inherit',
  };
  const btnPrimary = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 18px', borderRadius: 10, border: 'none',
    background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  };
  const btnGhost = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 8, border: '1px solid #e5e7ef',
    background: 'transparent', color: '#1a1a2e', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  };
  const modalOverlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modalBox = {
    background: '#fff', borderRadius: 16, padding: 28, width: '90%', maxWidth: 520,
    maxHeight: '85vh', overflow: 'auto',
  };
  const thStyle = { padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };

  // ── Render ──
  return (
    <div style={pageStyle}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: 0 }}>Content Scheduler</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btnPrimary} onClick={openAddClient}><Plus size={14} /> Add Client</button>
          {client && (
            <>
              <button style={btnGhost} onClick={openEditClient}><Edit3 size={14} /> Edit Client</button>
              <button style={btnGhost} onClick={() => setShowScheduleModal(true)}><Clock size={14} /> Schedule Settings</button>
            </>
          )}
        </div>
      </div>

      {/* Client Selector */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Building2 size={18} style={{ color: '#4a6cf7' }} />
          <select
            value={selectedClientId}
            onChange={e => setSelectedClientId(e.target.value)}
            style={{ ...inputStyle, width: 300, cursor: 'pointer' }}
          >
            <option value="">Select a client...</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.business_name}</option>
            ))}
          </select>
          {client && (
            <button style={btnGhost} onClick={() => setShowProfile(!showProfile)}>
              {showProfile ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showProfile ? 'Hide' : 'Profile'}
            </button>
          )}
        </div>

        {/* Client profile summary */}
        {client && showProfile && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f0f0f5' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13, marginBottom: 10 }}>
              <div><span style={{ color: '#8e8ea0' }}>Industry:</span> {client.industry || '-'}</div>
              <div><span style={{ color: '#8e8ea0' }}>Tone:</span> {client.preferred_tone || '-'}</div>
              <div><span style={{ color: '#8e8ea0' }}>Website:</span> {client.website_url || '-'}</div>
            </div>

            {/* Platform handles & IDs */}
            <div style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600, marginBottom: 6 }}>Social Accounts</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {[
                { label: 'IG', handle: client.instagram_handle, id: client.instagram_id, color: '#E1306C' },
                { label: 'TT', handle: client.tiktok_handle, id: client.tiktok_id, color: '#000' },
                { label: 'FB', handle: client.facebook_handle, id: client.facebook_id, color: '#1877F2' },
                { label: 'Threads', handle: client.threads_handle, id: client.threads_id, color: '#000' },
                { label: 'YT', handle: client.youtube_handle, id: client.youtube_id, color: '#FF0000' },
                { label: 'LI', handle: client.linkedin_handle, id: client.linkedin_id, color: '#0A66C2' },
              ].filter(p => p.handle || p.id).map((p, i) => (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: '#f0f0f5', color: p.color, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {p.label}: {p.handle || '-'}
                  {p.id && <span style={{ color: '#8e8ea0', fontWeight: 400 }}>(ID: {p.id})</span>}
                </span>
              ))}
              {![client.instagram_handle, client.tiktok_handle, client.facebook_handle, client.threads_handle].some(Boolean) && (
                <span style={{ fontSize: 12, color: '#ccc' }}>No accounts added yet</span>
              )}
            </div>

            {client.brand_bible && (
              <div style={{ padding: 12, background: '#f8f9fc', borderRadius: 10, fontSize: 12, color: '#555', maxHeight: 100, overflow: 'auto' }}>
                <strong style={{ color: '#1a1a2e' }}>Brand Bible:</strong> {client.brand_bible.slice(0, 300)}{client.brand_bible.length > 300 ? '...' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Command Input */}
      {client && (
        <div style={{ ...cardStyle, padding: 0 }}>
          <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="file" ref={scriptUploadRef} accept=".txt,.pdf,.docx" onChange={handleScriptUpload} style={{ display: 'none' }} />
            <button onClick={() => scriptUploadRef.current?.click()} style={{ ...btnGhost, flexShrink: 0 }}>
              <Upload size={14} /> Upload Scripts
            </button>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCommand(); }}
              placeholder="Type a command: generate captions, auto schedule, export..."
              style={{ ...inputStyle, border: 'none', background: 'transparent' }}
            />
            <button onClick={toggleMic} style={{
              width: 36, height: 36, borderRadius: 10, border: '1px solid #e5e7ef',
              background: isListening ? 'rgba(255,60,60,0.1)' : '#f8f9fc',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isListening ? '#ef4444' : '#8e8ea0', flexShrink: 0,
            }}>
              <Mic size={16} />
            </button>
            <button onClick={handleCommand} disabled={!chatInput.trim()} style={{
              width: 36, height: 36, borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: chatInput.trim() ? 1 : 0.4, flexShrink: 0,
            }}>
              <Send size={15} style={{ color: '#fff' }} />
            </button>
          </div>
          {actionLoading && (
            <div style={{ padding: '8px 20px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4a6cf7' }}>
              <Loader size={14} className="spin" />
              {actionLoading === 'parsing' && 'Parsing scripts...'}
              {actionLoading === 'captions' && 'Generating captions...'}
              {actionLoading === 'schedule' && 'Auto-scheduling...'}
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      {client && scripts.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={scripts.length > 0 && selectedScripts.size === scripts.length}
                onChange={selectAll} style={{ accentColor: '#4a6cf7' }} />
              Select All ({scripts.length})
            </label>
            {selectedScripts.size > 0 && (
              <>
                <span style={{ fontSize: 12, color: '#4a6cf7', fontWeight: 600 }}>{selectedScripts.size} selected</span>
                <button style={{ ...btnGhost, fontSize: 11, color: '#ef4444' }} onClick={deleteSelected}>
                  <Trash2 size={12} /> Delete
                </button>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnGhost} onClick={async () => {
              setActionLoading('captions');
              const ids = selectedScripts.size > 0 ? Array.from(selectedScripts) : undefined;
              await generateCaptions({ client_id: client.id, script_ids: ids });
              await loadClientData(client.id);
              setActionLoading('');
            }}>
              <Sparkles size={13} /> Generate Captions
            </button>
            <button style={btnGhost} onClick={async () => {
              setActionLoading('schedule');
              await autoScheduleContent({ client_id: client.id });
              await loadClientData(client.id);
              setActionLoading('');
            }}>
              <Calendar size={13} /> Auto Schedule
            </button>
            <button style={{ ...btnPrimary, opacity: selectedScripts.size > 0 ? 1 : 0.4 }}
              onClick={exportCSV} disabled={selectedScripts.size === 0}>
              <Download size={14} /> Export CSV
            </button>
            <button style={btnGhost} onClick={() => loadClientData(client.id)}>
              <RefreshCw size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Content Table */}
      {client && (
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#8e8ea0' }}>
              <Loader size={20} className="spin" />
            </div>
          ) : scripts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#8e8ea0', fontSize: 13 }}>
              No content yet. Upload scripts or add content manually.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7ef' }}>
                    <th style={{ ...thStyle, width: 30 }}></th>
                    <th style={{ ...thStyle, width: 80 }}>Media</th>
                    <th style={{ ...thStyle, minWidth: 140 }}>Title</th>
                    <th style={{ ...thStyle, minWidth: 160 }}>Hook</th>
                    <th style={{ ...thStyle, minWidth: 180 }}>Caption</th>
                    <th style={{ ...thStyle, minWidth: 120 }}>Hashtags</th>
                    <th style={{ ...thStyle, minWidth: 120 }}>1st Comment</th>
                    <th style={{ ...thStyle, width: 150 }}>Scheduled</th>
                    <th style={{ ...thStyle, width: 90 }}>Status</th>
                    <th style={{ ...thStyle, width: 60 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map(script => (
                    <tr key={script.id} style={{ borderBottom: '1px solid #f5f5f8', verticalAlign: 'top' }}>
                      {/* Checkbox */}
                      <td style={{ padding: 10 }}>
                        <input type="checkbox" checked={selectedScripts.has(script.id)}
                          onChange={() => toggleSelect(script.id)} style={{ accentColor: '#4a6cf7' }} />
                      </td>

                      {/* Media */}
                      <td style={{ padding: 10 }}>
                        <div
                          onDragOver={e => { e.preventDefault(); setDragOverId(script.id); }}
                          onDragLeave={() => setDragOverId(null)}
                          onDrop={e => handleMediaDrop(e, script)}
                          style={{
                            width: 64, height: 64, borderRadius: 8,
                            border: dragOverId === script.id ? '2px dashed #4a6cf7' : '2px dashed #e5e7ef',
                            background: dragOverId === script.id ? 'rgba(74,108,247,0.05)' : '#f8f9fc',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', position: 'relative', overflow: 'hidden',
                          }}
                          onClick={() => {
                            if (script.media_urls?.length) {
                              setShowMediaModal(script);
                              setCarouselIndex(0);
                            } else {
                              const inp = document.createElement('input');
                              inp.type = 'file';
                              inp.multiple = true;
                              inp.accept = 'image/*,video/*';
                              inp.onchange = (e) => uploadMedia(Array.from(e.target.files), script);
                              inp.click();
                            }
                          }}
                        >
                          {uploadProgress[script.id] !== undefined ? (
                            <div style={{ textAlign: 'center', fontSize: 10, color: '#4a6cf7', fontWeight: 600 }}>
                              {Math.round(uploadProgress[script.id])}%
                            </div>
                          ) : script.media_urls?.length ? (
                            <>
                              {script.media_type === 'video' ? (
                                <video src={script.media_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <img src={script.media_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                              {script.media_urls.length > 1 && (
                                <span style={{
                                  position: 'absolute', top: 2, right: 2,
                                  background: 'rgba(0,0,0,0.6)', color: '#fff',
                                  fontSize: 9, padding: '1px 5px', borderRadius: 8,
                                }}>
                                  1/{script.media_urls.length}
                                </span>
                              )}
                            </>
                          ) : (
                            <Upload size={16} style={{ color: '#ccc' }} />
                          )}
                        </div>
                      </td>

                      {/* Editable cells */}
                      {['title', 'hook', 'caption', 'hashtags', 'first_comment'].map(field => (
                        <td key={field} style={{ padding: 10, maxWidth: 200 }}>
                          {editingCell?.id === script.id && editingCell?.field === field ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <textarea value={editValue} onChange={e => setEditValue(e.target.value)}
                                style={{ ...inputStyle, fontSize: 12, minHeight: 50, resize: 'vertical' }}
                                autoFocus />
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button onClick={saveEdit} style={{ ...btnGhost, padding: '2px 8px', fontSize: 10, color: '#22c55e' }}>
                                  <Check size={10} />
                                </button>
                                <button onClick={() => setEditingCell(null)} style={{ ...btnGhost, padding: '2px 8px', fontSize: 10, color: '#ef4444' }}>
                                  <X size={10} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => startEdit(script.id, field, script[field])}
                              style={{
                                cursor: 'pointer', fontSize: 12, color: script[field] ? '#1a1a2e' : '#ccc',
                                maxHeight: 60, overflow: 'hidden', lineHeight: 1.4,
                              }}
                              title={script[field] || 'Click to edit'}
                            >
                              {script[field] ? (script[field].length > 80 ? script[field].slice(0, 80) + '...' : script[field]) : '...'}
                            </div>
                          )}
                        </td>
                      ))}

                      {/* Scheduled datetime */}
                      <td style={{ padding: 10 }}>
                        {editingCell?.id === script.id && editingCell?.field === 'scheduled_datetime' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input type="datetime-local" value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              style={{ ...inputStyle, fontSize: 11, padding: '6px 8px' }} autoFocus />
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={async () => {
                                await updateContentScript(editingCell.id, {
                                  scheduled_datetime: new Date(editValue).toISOString(),
                                  status: 'scheduled',
                                });
                                setEditingCell(null);
                                loadClientData(client.id);
                              }} style={{ ...btnGhost, padding: '2px 8px', fontSize: 10, color: '#22c55e' }}>
                                <Check size={10} />
                              </button>
                              <button onClick={() => setEditingCell(null)} style={{ ...btnGhost, padding: '2px 8px', fontSize: 10, color: '#ef4444' }}>
                                <X size={10} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => startEdit(script.id, 'scheduled_datetime',
                              script.scheduled_datetime ? new Date(script.scheduled_datetime).toISOString().slice(0, 16) : ''
                            )}
                            style={{ cursor: 'pointer', fontSize: 12, color: script.scheduled_datetime ? '#1a1a2e' : '#ccc' }}
                          >
                            {script.scheduled_datetime
                              ? new Date(script.scheduled_datetime).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                })
                              : 'Not set'}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={{ padding: 10 }}><StatusPill status={script.status} /></td>

                      {/* Actions */}
                      <td style={{ padding: 10 }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={async () => {
                            setActionLoading('captions');
                            await generateCaptions({ client_id: client.id, script_ids: [script.id] });
                            await loadClientData(client.id);
                            setActionLoading('');
                          }} style={{ ...btnGhost, padding: '4px 6px' }} title="Regenerate caption">
                            <Sparkles size={12} />
                          </button>
                          <button onClick={async () => {
                            if (confirm('Delete this script?')) {
                              await deleteContentScript(script.id);
                              loadClientData(client.id);
                            }
                          }} style={{ ...btnGhost, padding: '4px 6px', color: '#ef4444' }} title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!client && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '60px 20px', color: '#8e8ea0' }}>
          Select a client to manage their content schedule.
        </div>
      )}

      {/* ── Media Preview Modal ── */}
      {showMediaModal && (
        <div style={modalOverlay} onClick={() => setShowMediaModal(null)}>
          <div style={{ ...modalBox, maxWidth: 700 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {showMediaModal.title || 'Media Preview'}
              </h3>
              <button onClick={() => setShowMediaModal(null)} style={{ ...btnGhost, padding: '4px 8px' }}><X size={16} /></button>
            </div>

            <div style={{ position: 'relative', background: '#000', borderRadius: 12, overflow: 'hidden', minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {showMediaModal.media_type === 'video' ? (
                <video src={showMediaModal.media_urls[carouselIndex]} controls style={{ maxWidth: '100%', maxHeight: 500 }} />
              ) : (
                <img src={showMediaModal.media_urls[carouselIndex]} style={{ maxWidth: '100%', maxHeight: 500, objectFit: 'contain' }} />
              )}

              {showMediaModal.media_urls.length > 1 && (
                <>
                  <button onClick={() => setCarouselIndex(i => Math.max(0, i - 1))}
                    style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={18} />
                  </button>
                  <button onClick={() => setCarouselIndex(i => Math.min(showMediaModal.media_urls.length - 1, i + 1))}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronRight size={18} />
                  </button>
                  <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
                    {showMediaModal.media_urls.map((_, i) => (
                      <span key={i} onClick={() => setCarouselIndex(i)} style={{
                        width: 8, height: 8, borderRadius: '50%', cursor: 'pointer',
                        background: i === carouselIndex ? '#fff' : 'rgba(255,255,255,0.4)',
                      }} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* URL copy */}
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={showMediaModal.media_urls[carouselIndex]} readOnly
                style={{ ...inputStyle, fontSize: 11, flex: 1 }} />
              <button onClick={() => navigator.clipboard.writeText(showMediaModal.media_urls[carouselIndex])}
                style={btnGhost}><Copy size={13} /> Copy URL</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Config Modal ── */}
      {showScheduleModal && (
        <div style={modalOverlay} onClick={() => setShowScheduleModal(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>Auto-Schedule Settings</h3>

            <label style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600 }}>Timezone</label>
            <select value={schedTimezone} onChange={e => setSchedTimezone(e.target.value)}
              style={{ ...inputStyle, marginBottom: 16 }}>
              <option value="America/Chicago">Central (America/Chicago)</option>
              <option value="America/New_York">Eastern (America/New_York)</option>
              <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
              <option value="America/Denver">Mountain (America/Denver)</option>
              <option value="UTC">UTC</option>
            </select>

            <label style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600 }}>Post Times</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {schedTimeslots.map((slot, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 8, background: '#f8f9fc', border: '1px solid #e5e7ef',
                }}>
                  <Clock size={12} style={{ color: '#4a6cf7' }} />
                  <span style={{ fontSize: 13 }}>{slot}</span>
                  <button onClick={() => setSchedTimeslots(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 0 }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input type="time" value={newSlot} onChange={e => setNewSlot(e.target.value)}
                style={{ ...inputStyle, width: 140 }} />
              <button style={btnGhost} onClick={() => {
                if (newSlot && !schedTimeslots.includes(newSlot)) {
                  setSchedTimeslots(prev => [...prev, newSlot].sort());
                  setNewSlot('');
                }
              }}>
                <Plus size={13} /> Add Slot
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={btnGhost} onClick={() => setShowScheduleModal(false)}>Cancel</button>
              <button style={btnPrimary} onClick={handleSaveSchedule}><Check size={14} /> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Client Add/Edit Modal ── */}
      {showClientModal && (
        <div style={modalOverlay} onClick={() => setShowClientModal(false)}>
          <div style={{ ...modalBox, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>
              {editingClient ? `Edit ${editingClient.business_name}` : 'Add Content Client'}
            </h3>

            {/* Basic Info */}
            <div style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600, marginBottom: 6 }}>Basic Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <input style={inputStyle} placeholder="Business Name *" value={clientForm.business_name}
                onChange={e => setClientForm({ ...clientForm, business_name: e.target.value })} />
              <input style={inputStyle} placeholder="Owner Name" value={clientForm.owner_name}
                onChange={e => setClientForm({ ...clientForm, owner_name: e.target.value })} />
              <input style={inputStyle} placeholder="Industry" value={clientForm.industry}
                onChange={e => setClientForm({ ...clientForm, industry: e.target.value })} />
              <input style={inputStyle} placeholder="Website URL" value={clientForm.website_url}
                onChange={e => setClientForm({ ...clientForm, website_url: e.target.value })} />
              <input style={inputStyle} placeholder="Target Audience" value={clientForm.target_audience}
                onChange={e => setClientForm({ ...clientForm, target_audience: e.target.value })} />
              <select style={inputStyle} value={clientForm.preferred_tone}
                onChange={e => setClientForm({ ...clientForm, preferred_tone: e.target.value })}>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
                <option value="hype">Hype</option>
                <option value="educational">Educational</option>
              </select>
            </div>

            {/* Social Handles */}
            <div style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600, marginBottom: 6 }}>Social Handles</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <input style={inputStyle} placeholder="Instagram @handle" value={clientForm.instagram_handle}
                onChange={e => setClientForm({ ...clientForm, instagram_handle: e.target.value })} />
              <input style={inputStyle} placeholder="TikTok @handle" value={clientForm.tiktok_handle}
                onChange={e => setClientForm({ ...clientForm, tiktok_handle: e.target.value })} />
              <input style={inputStyle} placeholder="Facebook handle" value={clientForm.facebook_handle}
                onChange={e => setClientForm({ ...clientForm, facebook_handle: e.target.value })} />
              <input style={inputStyle} placeholder="Threads @handle" value={clientForm.threads_handle}
                onChange={e => setClientForm({ ...clientForm, threads_handle: e.target.value })} />
              <input style={inputStyle} placeholder="YouTube channel" value={clientForm.youtube_handle}
                onChange={e => setClientForm({ ...clientForm, youtube_handle: e.target.value })} />
              <input style={inputStyle} placeholder="LinkedIn handle" value={clientForm.linkedin_handle}
                onChange={e => setClientForm({ ...clientForm, linkedin_handle: e.target.value })} />
            </div>

            {/* SocialPilot Account IDs */}
            <div style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600, marginBottom: 6 }}>SocialPilot Account IDs</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <input style={inputStyle} placeholder="Instagram ID" value={clientForm.instagram_id}
                onChange={e => setClientForm({ ...clientForm, instagram_id: e.target.value })} />
              <input style={inputStyle} placeholder="TikTok ID" value={clientForm.tiktok_id}
                onChange={e => setClientForm({ ...clientForm, tiktok_id: e.target.value })} />
              <input style={inputStyle} placeholder="Facebook ID" value={clientForm.facebook_id}
                onChange={e => setClientForm({ ...clientForm, facebook_id: e.target.value })} />
              <input style={inputStyle} placeholder="Threads ID" value={clientForm.threads_id}
                onChange={e => setClientForm({ ...clientForm, threads_id: e.target.value })} />
              <input style={inputStyle} placeholder="YouTube ID" value={clientForm.youtube_id}
                onChange={e => setClientForm({ ...clientForm, youtube_id: e.target.value })} />
              <input style={inputStyle} placeholder="LinkedIn ID" value={clientForm.linkedin_id}
                onChange={e => setClientForm({ ...clientForm, linkedin_id: e.target.value })} />
            </div>

            {/* Brand Bible */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600 }}>Brand Bible</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="file" ref={brandBibleUploadRef} accept=".pdf,.txt,.docx,.doc,.md,image/*"
                  onChange={handleBrandBibleUpload} style={{ display: 'none' }} />
                <button style={{ ...btnGhost, fontSize: 11, padding: '4px 10px' }}
                  onClick={() => brandBibleUploadRef.current?.click()}
                  disabled={processingBible}>
                  {processingBible ? <><Loader size={11} className="spin" /> Processing...</> : <><Upload size={11} /> Upload File</>}
                </button>
              </div>
            </div>
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical', marginBottom: 16 }}
              placeholder="Brand voice, core hashtags, posting guidelines... or upload a PDF/document above"
              value={clientForm.brand_bible}
              onChange={e => setClientForm({ ...clientForm, brand_bible: e.target.value })} />

            {/* Notes */}
            <input style={{ ...inputStyle, marginBottom: 16 }} placeholder="Notes"
              value={clientForm.notes}
              onChange={e => setClientForm({ ...clientForm, notes: e.target.value })} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {editingClient && (
                  <button style={{ ...btnGhost, color: '#ef4444' }} onClick={async () => {
                    if (confirm(`Delete ${editingClient.business_name}? This will also delete all their content.`)) {
                      await deleteContentClient(editingClient.id);
                      setShowClientModal(false);
                      setSelectedClientId('');
                      setClient(null);
                      loadClients();
                    }
                  }}>
                    <Trash2 size={13} /> Delete Client
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnGhost} onClick={() => setShowClientModal(false)}>Cancel</button>
                <button style={{ ...btnPrimary, opacity: !clientForm.business_name.trim() || savingClient ? 0.5 : 1 }}
                  onClick={handleSaveClient} disabled={!clientForm.business_name.trim() || savingClient}>
                  {savingClient ? <Loader size={14} className="spin" /> : <Check size={14} />}
                  {editingClient ? 'Save Changes' : 'Add Client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
