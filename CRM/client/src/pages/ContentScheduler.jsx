import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  getContentClients, getContentClient, createContentClient, updateContentClient, deleteContentClient,
  getContentScripts, createContentScript, updateContentScript, deleteContentScript, clearContentScripts,
  getScheduleConfig, saveScheduleConfig,
  parseScripts, generateCaptions, autoScheduleContent, processBrandBible, generateContent,
  processBulkUpload,
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

function StatusPill({ status, onClick }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  const clickable = status === 'exported';
  return (
    <span
      onClick={clickable ? onClick : undefined}
      title={clickable ? 'Click to reset (allow re-export)' : ''}
      style={{
        padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
        background: s.bg, color: s.text,
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      {s.label}
    </span>
  );
}

const SIDEBAR_SECTIONS = [
  { key: 'content', label: 'Content', Icon: Film },
  { key: 'generator', label: 'Generator', Icon: Sparkles },
  { key: 'exported', label: 'Exported', Icon: Download },
  { key: 'docs', label: 'Docs', Icon: FileText },
];

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
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'calendar'
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [activeSection, setActiveSection] = useState('content');

  // Generator state
  const [genMessages, setGenMessages] = useState([]);
  const [genInput, setGenInput] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genResults, setGenResults] = useState([]);
  const genEndRef = useRef(null);
  const genChatRef = useRef(null);
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
  const bulkUploadRef = useRef(null);
  const recognitionRef = useRef(null);
  const listeningRef = useRef(false);

  // Bulk upload state
  const [bulkUploads, setBulkUploads] = useState([]); // [{ id, name, status, progress, error }]
  const [bulkDragOver, setBulkDragOver] = useState(false);

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
    const selected = scripts.filter(s => selectedScripts.has(s.id) && s.status !== 'exported');
    if (!selected.length) { alert('No unexported scripts selected'); return; }

    // Build list of platform IDs that are filled in
    const platformIds = [
      client.instagram_id, client.tiktok_id, client.facebook_id,
      client.threads_id, client.youtube_id, client.linkedin_id,
    ].filter(Boolean);

    const rows = [];
    for (const script of selected) {
      const description = [script.caption, script.hashtags].filter(Boolean).join(' ');
      const mediaUrls = script.media_urls ? script.media_urls.join('; ') : '';
      const dt = script.scheduled_datetime
        ? new Date(script.scheduled_datetime).toLocaleString('sv-SE', { timeZone: schedTimezone || 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace('T', ' ')
        : '';
      const firstComment = script.first_comment || '';
      const tags = script.tags || '';

      // One row per platform account
      for (const accountId of platformIds) {
        rows.push([description, mediaUrls, dt, accountId, firstComment, tags]
          .map(field => {
            const s = String(field);
            if (s.includes(',') || s.includes('"') || s.includes('\n'))
              return `"${s.replace(/"/g, '""')}"`;
            return s;
          }).join(','));
      }
    }

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

  // ── Export approved generated content to CSV ──
  function exportApprovedCSV() {
    const approved = genResults.filter(r => r.approved && !r.rejected);
    if (!approved.length) { alert('No approved posts to export'); return; }
    if (!client) return;

    const platformIds = [
      client.instagram_id, client.tiktok_id, client.facebook_id,
      client.threads_id, client.youtube_id, client.linkedin_id,
    ].filter(Boolean);

    const rows = [];
    for (const post of approved) {
      const description = [post.caption, post.hashtags].filter(Boolean).join(' ');
      const firstComment = post.first_comment || '';

      for (const accountId of platformIds) {
        rows.push([description, '', '', accountId, firstComment, '']
          .map(field => {
            const s = String(field);
            if (s.includes(',') || s.includes('"') || s.includes('\n'))
              return `"${s.replace(/"/g, '""')}"`;
            return s;
          }).join(','));
      }
    }

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${client.business_name}_generated_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        if (!scheduleConfig) {
          await saveScheduleConfig({ client_id: client.id, time_slots: schedTimeslots, timezone: schedTimezone });
        }
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
      // Treat as a pasted script -- create a new row with it
      const rawText = chatInput.trim();
      try {
        await createContentScript([{
          client_id: client.id,
          title: rawText.split('\n')[0].slice(0, 80) || 'New Script',
          full_script: rawText,
          status: 'draft',
          sort_order: scripts.length + 1,
        }]);
        await loadClientData(client.id);
      } catch (err) { alert('Failed to add script: ' + err.message); }
    }
  }

  // ── Content Generator handler ──
  async function handleGenerate() {
    if (!genInput.trim() || !client) return;
    const userMsg = genInput.trim();
    setGenInput('');
    setGenMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setGenLoading(true);
    try {
      const result = await generateContent({ client_id: client.id, prompt: userMsg });
      const posts = result.posts || [];
      setGenMessages(prev => [...prev, { role: 'assistant', content: `Generated ${posts.length} post${posts.length !== 1 ? 's' : ''}` }]);
      setGenResults(prev => [...prev, ...posts.map(p => ({ ...p, approved: false, rejected: false }))]);
    } catch (e) {
      setGenMessages(prev => [...prev, { role: 'assistant', content: 'Error: ' + e.message }]);
    }
    setGenLoading(false);
  }

  // ── Approve generated post (save to content scripts) ──
  async function approveGenPost(index) {
    const post = genResults[index];
    if (!post || !client) return;
    try {
      await createContentScript([{
        client_id: client.id,
        title: post.title || 'Generated Post',
        caption: post.caption || '',
        hashtags: post.hashtags || '',
        first_comment: post.first_comment || '',
        full_script: post.full_script || post.caption || '',
        status: 'caption_ready',
        sort_order: scripts.length + 1,
      }]);
      setGenResults(prev => prev.map((r, i) => i === index ? { ...r, approved: true, rejected: false } : r));
      await loadClientData(client.id);
    } catch (e) {
      alert('Failed to save post: ' + e.message);
    }
  }

  // ── Reject generated post ──
  function rejectGenPost(index) {
    setGenResults(prev => prev.map((r, i) => i === index ? { ...r, rejected: true, approved: false } : r));
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

  // ── Bulk video upload ──
  async function handleBulkUpload(e) {
    e.preventDefault();
    setBulkDragOver(false);
    const files = Array.from(e.dataTransfer?.files || e.target?.files || []);
    const videoFiles = files.filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/') || /\.(mp4|mov|avi|mkv|webm|mp3|m4a|wav)$/i.test(f.name));
    if (!videoFiles.length || !client) return;
    if (e.target?.value) e.target.value = '';

    // Initialize tracking
    const uploads = videoFiles.map((f, i) => ({
      id: `bulk-${Date.now()}-${i}`,
      name: f.name,
      file: f,
      status: 'queued', // queued → uploading → transcribing → generating → done → error
      progress: 0,
      error: null,
    }));
    setBulkUploads(prev => [...prev, ...uploads]);

    // Process each file sequentially
    for (const upload of uploads) {
      try {
        // Step 1: Upload to Supabase Storage
        setBulkUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'uploading', progress: 10 } : u));

        const safeName = upload.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${client.id}/bulk/${Date.now()}_${safeName}`;
        console.log('Uploading to storage:', filePath, 'size:', upload.file.size, 'type:', upload.file.type);

        // Upload via REST API directly (bypasses JS client issues)
        const { data: { session: uploadSession } } = await supabase.auth.getSession();
        const uploadToken = uploadSession?.access_token;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/content-media/${filePath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${uploadToken}`,
            'x-upsert': 'false',
          },
          body: upload.file,
        });

        if (!uploadRes.ok) {
          const errBody = await uploadRes.text();
          console.error('Storage upload error:', uploadRes.status, errBody);
          throw new Error('Storage upload failed: ' + errBody);
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/content-media/${filePath}`;

        setBulkUploads(prev => prev.map(u => u.id === upload.id ? { ...u, progress: 30 } : u));

        // Step 2: Create script row
        const scriptData = {
          client_id: client.id,
          title: upload.file.name.replace(/\.[^.]+$/, ''),
          media_urls: [publicUrl],
          media_type: 'video',
          status: 'draft',
          sort_order: (scripts.length || 0) + uploads.indexOf(upload) + 1,
        };
        const created = await createContentScript(scriptData);
        const scriptId = Array.isArray(created) ? created[0]?.id : created?.id;

        if (!scriptId) throw new Error('Failed to create script row');

        setBulkUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'transcribing', progress: 50 } : u));

        // Step 3: Transcribe + AI generate via API (pass storage_path for server-side download with service key)
        const result = await processBulkUpload({
          client_id: client.id,
          script_id: scriptId,
          storage_path: filePath,
          file_name: upload.file.name,
        });

        setBulkUploads(prev => prev.map(u => u.id === upload.id ? {
          ...u,
          status: 'done',
          progress: 100,
          result,
        } : u));

      } catch (err) {
        console.error('Bulk upload error for', upload.name, err);
        setBulkUploads(prev => prev.map(u => u.id === upload.id ? {
          ...u,
          status: 'error',
          progress: 0,
          error: err.message,
        } : u));
      }
    }

    // Refresh the scripts list
    await loadClientData(client.id);
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

  // ── Scroll gen chat to bottom ──
  useEffect(() => {
    if (genChatRef.current) {
      genChatRef.current.scrollTop = genChatRef.current.scrollHeight;
    }
  }, [genMessages, genLoading]);

  // ── Derived data ──
  const exportedScripts = scripts.filter(s => s.status === 'exported');

  // ── Styles ──
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
  const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 20, marginBottom: 16 };
  const thStyle = { padding: '8px 10px', textAlign: 'left', color: '#8e8ea0', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' };

  // ── Render ──
  return (
    <div className="cs-page" style={{ height: '100%', display: 'flex' }}>
      {/* ══════ LEFT SIDEBAR ══════ */}
      <div className="cs-sidebar" style={{
        width: 200, background: '#fff', borderRight: '1px solid #e5e7ef',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {/* Sidebar header */}
        <div style={{ padding: '18px 16px 10px', fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>
          Content Scheduler
        </div>

        {/* Client list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 8px' }}>
          <div style={{ padding: '6px 16px 4px', fontSize: 10, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Clients
          </div>
          {clients.length === 0 && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: '#ccc' }}>No clients yet</div>
          )}
          {clients.map(c => (
            <div
              key={c.id}
              onClick={() => setSelectedClientId(c.id)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
                color: selectedClientId === c.id ? '#4a6cf7' : '#1a1a2e',
                background: selectedClientId === c.id ? 'rgba(74,108,247,0.06)' : 'transparent',
                borderLeft: selectedClientId === c.id ? '3px solid #4a6cf7' : '3px solid transparent',
                fontWeight: selectedClientId === c.id ? 600 : 400,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                transition: 'all 0.15s',
              }}
            >
              {c.business_name}
            </div>
          ))}

        </div>

        {/* Sidebar bottom buttons */}
        <div style={{ padding: '8px 12px 14px', borderTop: '1px solid #f0f0f5', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={openAddClient} style={{
            ...btnGhost, width: '100%', justifyContent: 'center', fontSize: 12, padding: '7px 10px',
          }}>
            <Plus size={13} /> Add Client
          </button>
          {client && (
            <button onClick={() => setShowScheduleModal(true)} style={{
              ...btnGhost, width: '100%', justifyContent: 'center', fontSize: 12, padding: '7px 10px',
            }}>
              <Settings size={13} /> Schedule Settings
            </button>
          )}
        </div>
      </div>

      {/* ══════ SECTIONS SIDEBAR ══════ */}
      {client && (
        <div className="cs-sections" style={{
          width: 56, background: '#fafbfd', borderRight: '1px solid #e5e7ef',
          display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
          paddingTop: 16, gap: 4,
        }}>
          {SIDEBAR_SECTIONS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setActiveSection(key)} title={label}
              style={{
                width: 42, height: 42, borderRadius: 10, border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                background: activeSection === key ? 'rgba(74,108,247,0.12)' : 'transparent',
                color: activeSection === key ? '#4a6cf7' : '#8e8ea0',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}>
              <Icon size={18} />
              <span style={{ fontSize: 9, fontWeight: 600 }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ══════ RIGHT MAIN AREA ══════ */}
      <div className="cs-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Top bar */}
        <div className="cs-topbar" style={{
          padding: '12px 20px', borderBottom: '1px solid #e5e7ef', background: '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a2e' }}>
              {client ? client.business_name : 'Select a Client'}
            </h2>
            {client && (
              <>
                <button style={{ ...btnGhost, fontSize: 11, padding: '4px 10px' }} onClick={openEditClient}>
                  <Edit3 size={12} /> Edit
                </button>
                <button style={{ ...btnGhost, fontSize: 11, padding: '4px 10px' }} onClick={() => setShowProfile(!showProfile)}>
                  {showProfile ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {showProfile ? 'Hide' : 'Profile'}
                </button>
              </>
            )}
          </div>
          <div className="cs-topbar-right" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {client && activeSection === 'content' && (
              <>
                {/* View toggle */}
                <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid #e5e7ef' }}>
                  <button onClick={() => setViewMode('table')} style={{
                    padding: '5px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: viewMode === 'table' ? '#4a6cf7' : '#fff',
                    color: viewMode === 'table' ? '#fff' : '#8e8ea0',
                  }}>Table</button>
                  <button onClick={() => setViewMode('calendar')} style={{
                    padding: '5px 12px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: viewMode === 'calendar' ? '#4a6cf7' : '#fff',
                    color: viewMode === 'calendar' ? '#fff' : '#8e8ea0',
                  }}>Calendar</button>
                </div>
                <button style={btnGhost} onClick={() => loadClientData(client.id)}>
                  <RefreshCw size={12} />
                </button>
              </>
            )}
            {client && activeSection === 'exported' && (
              <button style={btnGhost} onClick={() => loadClientData(client.id)}>
                <RefreshCw size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Client profile (collapsible, starts minimized) */}
          {client && showProfile && (
            <div style={{ ...cardStyle }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13, marginBottom: 10 }} className="cs-profile-grid">
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

          {/* ── No client selected ── */}
          {!client && (
            <div style={{ ...cardStyle, textAlign: 'center', padding: '60px 20px', color: '#8e8ea0' }}>
              Select a client from the sidebar to manage their content schedule.
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ══ CONTENT SECTION ══ */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {client && activeSection === 'content' && (
            <>
              {/* Command Input */}
              <div style={{ ...cardStyle, padding: 0 }}>
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="file" ref={scriptUploadRef} accept=".txt,.pdf,.docx" onChange={handleScriptUpload} style={{ display: 'none' }} />
                  <button onClick={() => scriptUploadRef.current?.click()} style={{ ...btnGhost, flexShrink: 0 }}>
                    <Upload size={14} /> Upload Scripts
                  </button>
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommand(); } }}
                    placeholder="Paste a script to add it, or type: generate captions, auto schedule, export..."
                    rows={1}
                    style={{ ...inputStyle, border: 'none', background: 'transparent', resize: 'none', minHeight: 20, maxHeight: 120, overflow: 'auto', lineHeight: '20px' }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
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

              {/* Bulk Video Upload */}
              <div
                onDragOver={e => { e.preventDefault(); setBulkDragOver(true); }}
                onDragLeave={() => setBulkDragOver(false)}
                onDrop={handleBulkUpload}
                onClick={() => bulkUploadRef.current?.click()}
                style={{
                  ...cardStyle, padding: '20px 24px', cursor: 'pointer',
                  border: bulkDragOver ? '2px dashed #4a6cf7' : '2px dashed #e5e7ef',
                  background: bulkDragOver ? '#4a6cf708' : '#fafbfe',
                  display: 'flex', alignItems: 'center', gap: 16,
                  transition: 'all 0.2s',
                }}
              >
                <input type="file" ref={bulkUploadRef} accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.m4a,.wav" multiple onChange={handleBulkUpload} style={{ display: 'none' }} />
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Film size={18} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 2 }}>
                    Bulk Video Upload
                  </p>
                  <p style={{ fontSize: 11, color: '#8e8ea0' }}>
                    Drag & drop video files here. Each video will be transcribed and auto-generate title, caption, hashtags & first comment using the client's brand bible.
                  </p>
                </div>
                <Upload size={18} color="#8e8ea0" />
              </div>

              {/* Bulk Upload Progress */}
              {bulkUploads.length > 0 && (
                <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e' }}>
                      Bulk Processing ({bulkUploads.filter(u => u.status === 'done').length}/{bulkUploads.length} complete)
                    </span>
                    {bulkUploads.every(u => u.status === 'done' || u.status === 'error') && (
                      <button onClick={() => setBulkUploads([])} style={{ ...btnGhost, fontSize: 11 }}>
                        <X size={12} /> Clear
                      </button>
                    )}
                  </div>
                  {bulkUploads.map(u => (
                    <div key={u.id} style={{
                      padding: '8px 16px', borderBottom: '1px solid #f0f0f5',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <Film size={14} color={u.status === 'done' ? '#22c55e' : u.status === 'error' ? '#ef4444' : '#4a6cf7'} />
                      <span style={{ fontSize: 12, color: '#1a1a2e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#8e8ea0', flexShrink: 0, minWidth: 80, textAlign: 'right' }}>
                        {u.status === 'queued' && 'Queued...'}
                        {u.status === 'uploading' && 'Uploading...'}
                        {u.status === 'transcribing' && 'Transcribing...'}
                        {u.status === 'generating' && 'AI Generating...'}
                        {u.status === 'done' && <span style={{ color: '#22c55e', fontWeight: 600 }}>✓ Done</span>}
                        {u.status === 'error' && <span style={{ color: '#ef4444' }} title={u.error}>✕ Failed</span>}
                      </span>
                      {u.status !== 'done' && u.status !== 'error' && (
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: '#e5e7ef', overflow: 'hidden' }}>
                          <div style={{ width: `${u.progress}%`, height: '100%', background: '#4a6cf7', borderRadius: 2, transition: 'width 0.3s' }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Toolbar */}
              <div className="cs-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="cs-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button style={{ ...btnPrimary, fontSize: 12, padding: '6px 14px' }} onClick={async () => {
                    try {
                      await createContentScript([{ client_id: client.id, title: 'New Script', full_script: '', status: 'draft', sort_order: scripts.length + 1 }]);
                      await loadClientData(client.id);
                    } catch (err) { console.error('Add row failed:', err); alert('Failed to add row: ' + err.message); }
                  }}>
                    <Plus size={13} /> Add Row
                  </button>
                  {scripts.length > 0 && (
                    <label style={{ fontSize: 12, color: '#8e8ea0', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={scripts.length > 0 && selectedScripts.size === scripts.length}
                        onChange={selectAll} style={{ accentColor: '#4a6cf7' }} />
                      Select All ({scripts.length})
                    </label>
                  )}
                  {selectedScripts.size > 0 && (
                    <>
                      <span style={{ fontSize: 12, color: '#4a6cf7', fontWeight: 600 }}>{selectedScripts.size} selected</span>
                      <button style={{ ...btnGhost, fontSize: 11, color: '#ef4444' }} onClick={deleteSelected}>
                        <Trash2 size={12} /> Delete
                      </button>
                    </>
                  )}
                </div>
                <div className="cs-toolbar-right" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {scripts.length > 0 && <button style={btnGhost} onClick={async () => {
                    setActionLoading('captions');
                    const ids = selectedScripts.size > 0 ? Array.from(selectedScripts) : undefined;
                    await generateCaptions({ client_id: client.id, script_ids: ids });
                    await loadClientData(client.id);
                    setActionLoading('');
                  }}>
                    <Sparkles size={13} /> Generate Captions
                  </button>}
                  {scripts.length > 0 && <button style={btnGhost} onClick={async () => {
                    setActionLoading('schedule');
                    try {
                      // Auto-save default config if none exists
                      if (!scheduleConfig) {
                        await saveScheduleConfig({ client_id: client.id, time_slots: schedTimeslots, timezone: schedTimezone });
                      }
                      await autoScheduleContent({ client_id: client.id });
                      await loadClientData(client.id);
                    } catch (e) { alert('Schedule failed: ' + e.message); }
                    setActionLoading('');
                  }}>
                    <Calendar size={13} /> Auto Schedule
                  </button>}
                  {scripts.length > 0 && <button style={{ ...btnPrimary, opacity: selectedScripts.size > 0 ? 1 : 0.4 }}
                    onClick={exportCSV} disabled={selectedScripts.size === 0}>
                    <Download size={14} /> Export CSV
                  </button>}
                </div>
              </div>

              {/* Calendar View */}
              {viewMode === 'calendar' && (() => {
                const year = calendarMonth.getFullYear();
                const month = calendarMonth.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
                const tz = schedTimezone || 'America/Chicago';

                // Group scripts by date (in client timezone)
                const byDate = {};
                scripts.forEach(s => {
                  if (!s.scheduled_datetime) return;
                  const d = new Date(s.scheduled_datetime);
                  const localDate = d.toLocaleDateString('en-CA', { timeZone: tz });
                  if (!byDate[localDate]) byDate[localDate] = [];
                  byDate[localDate].push(s);
                });

                // Build calendar grid cells
                const cells = [];
                for (let i = 0; i < firstDay; i++) cells.push(null);
                for (let d = 1; d <= daysInMonth; d++) cells.push(d);
                while (cells.length % 7 !== 0) cells.push(null);

                const monthName = new Date(year, month).toLocaleString('en-US', { month: 'long', year: 'numeric' });

                return (
                  <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                    {/* Calendar header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e5e7ef' }}>
                      <button onClick={() => setCalendarMonth(new Date(year, month - 1))} style={btnGhost}><ChevronLeft size={16} /></button>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>{monthName}</h3>
                      <button onClick={() => setCalendarMonth(new Date(year, month + 1))} style={btnGhost}><ChevronRight size={16} /></button>
                    </div>

                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid #e5e7ef' }}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                        <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#8e8ea0', textTransform: 'uppercase' }}>{d}</div>
                      ))}
                    </div>

                    {/* Calendar grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                      {cells.map((day, i) => {
                        if (day === null) return <div key={`empty-${i}`} style={{ minHeight: 110, background: '#fafafa', borderRight: i % 7 !== 6 ? '1px solid #f0f0f5' : 'none', borderBottom: '1px solid #f0f0f5' }} />;

                        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                        const dayScripts = byDate[dateStr] || [];
                        const isToday = dateStr === todayStr;

                        return (
                          <div key={day} style={{
                            minHeight: 110, padding: 6,
                            borderRight: i % 7 !== 6 ? '1px solid #f0f0f5' : 'none',
                            borderBottom: '1px solid #f0f0f5',
                            background: isToday ? 'rgba(74,108,247,0.04)' : '#fff',
                          }}>
                            <div style={{
                              fontSize: 12, fontWeight: isToday ? 700 : 500, marginBottom: 4,
                              color: isToday ? '#4a6cf7' : '#8e8ea0',
                              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            }}>
                              {isToday ? (
                                <span style={{ background: '#4a6cf7', color: '#fff', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{day}</span>
                              ) : day}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              {dayScripts.slice(0, 3).map(s => {
                                const time = new Date(s.scheduled_datetime).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
                                const sc = STATUS_COLORS[s.status] || STATUS_COLORS.draft;
                                return (
                                  <div key={s.id} title={`${s.title}\n${time}\n${s.caption || ''}`} style={{
                                    padding: '3px 6px', borderRadius: 6, fontSize: 10, lineHeight: 1.3,
                                    background: sc.bg, color: sc.text, cursor: 'pointer',
                                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                                  }}>
                                    {s.media_urls?.length > 0 && <Film size={9} style={{ marginRight: 3, verticalAlign: 'middle' }} />}
                                    <span style={{ fontWeight: 600 }}>{time}</span>{' '}
                                    <span style={{ opacity: 0.85 }}>{s.title || 'Untitled'}</span>
                                  </div>
                                );
                              })}
                              {dayScripts.length > 3 && (
                                <div style={{ fontSize: 10, color: '#4a6cf7', fontWeight: 600, cursor: 'pointer', paddingLeft: 4 }}>
                                  +{dayScripts.length - 3} more
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Unscheduled count */}
                    {scripts.filter(s => !s.scheduled_datetime).length > 0 && (
                      <div style={{ padding: '10px 20px', borderTop: '1px solid #e5e7ef', fontSize: 12, color: '#8e8ea0' }}>
                        <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                        {scripts.filter(s => !s.scheduled_datetime).length} unscheduled scripts
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Content Table */}
              {viewMode === 'table' && (
                <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
                  {loading ? (
                    <div style={{ textAlign: 'center', padding: 60, color: '#8e8ea0' }}>
                      <Loader size={20} className="spin" />
                    </div>
                  ) : scripts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: '#8e8ea0', fontSize: 13 }}>
                      No content yet. Click "Add Row" above, upload scripts, or type a command.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7ef' }}>
                            <th style={{ ...thStyle, width: 30 }}></th>
                            <th style={{ ...thStyle, width: 80 }}>Media</th>
                            <th style={{ ...thStyle, minWidth: 140 }}>Title</th>
                            <th style={{ ...thStyle, minWidth: 160 }}>Script</th>
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
                              {['title', 'full_script', 'caption', 'hashtags', 'first_comment'].map(field => (
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
                              <td style={{ padding: 10 }}><StatusPill status={script.status} onClick={async () => {
                                await updateContentScript(script.id, { status: script.scheduled_datetime ? 'scheduled' : 'caption_ready' });
                                loadClientData(client.id);
                              }} /></td>

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
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ══ GENERATOR SECTION ══ */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {client && activeSection === 'generator' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Chat area */}
              <div style={{ ...cardStyle, padding: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7ef', fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>
                  Content Generator
                </div>
                {/* Messages */}
                <div ref={genChatRef} style={{
                  flex: 1, minHeight: 200, maxHeight: 340, overflowY: 'auto', padding: '16px 20px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  {genMessages.length === 0 && !genLoading && (
                    <div style={{ textAlign: 'center', padding: '40px 10px', color: '#8e8ea0', fontSize: 13 }}>
                      Describe what content you want to generate.<br />
                      <span style={{ fontSize: 12, color: '#bbb' }}>
                        e.g. "Create 10 Threads posts about AI tools" or "Generate 5 TikTok scripts about dating red flags"
                      </span>
                    </div>
                  )}
                  {genMessages.map((msg, i) => (
                    <div key={i} style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '80%',
                      padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                      background: msg.role === 'user' ? 'linear-gradient(135deg, #4a6cf7, #3b5de7)' : '#f0f0f5',
                      color: msg.role === 'user' ? '#fff' : '#1a1a2e',
                    }}>
                      {msg.content}
                    </div>
                  ))}
                  {genLoading && (
                    <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: 12, background: '#f0f0f5', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8e8ea0' }}>
                      <Loader size={14} className="spin" /> Generating...
                    </div>
                  )}
                </div>

                {/* Input area */}
                <div style={{ borderTop: '1px solid #e5e7ef', padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <textarea
                    value={genInput}
                    onChange={e => setGenInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
                    placeholder="Describe content to generate..."
                    rows={1}
                    style={{ ...inputStyle, border: 'none', background: '#f8f9fc', resize: 'none', minHeight: 20, maxHeight: 100, overflow: 'auto', lineHeight: '20px', flex: 1 }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
                  />
                  <button onClick={handleGenerate} disabled={!genInput.trim() || genLoading} style={{
                    width: 36, height: 36, borderRadius: 10, border: 'none',
                    background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: genInput.trim() && !genLoading ? 1 : 0.4, flexShrink: 0,
                  }}>
                    <Send size={15} style={{ color: '#fff' }} />
                  </button>
                </div>
              </div>

              {/* Generated results list */}
              {genResults.length > 0 && (
                <div style={{ ...cardStyle, padding: 0 }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>
                      Generated Posts ({genResults.length})
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {genResults.some(r => r.approved && !r.rejected) && (
                        <button style={btnPrimary} onClick={exportApprovedCSV}>
                          <Download size={14} /> Export Approved
                        </button>
                      )}
                      <button style={btnGhost} onClick={() => setGenResults([])}>
                        <Trash2 size={12} /> Clear All
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                    {genResults.map((post, idx) => (
                      <div key={idx} style={{
                        padding: '14px 20px', borderBottom: '1px solid #f0f0f5',
                        opacity: post.rejected ? 0.4 : 1,
                        background: post.approved ? 'rgba(34,197,94,0.04)' : post.rejected ? '#fafafa' : '#fff',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {post.title && (
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: 4 }}>
                                {post.title}
                              </div>
                            )}
                            <div style={{ fontSize: 13, color: '#333', lineHeight: 1.5, marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                              {post.caption || post.content || ''}
                            </div>
                            {post.hashtags && (
                              <div style={{ fontSize: 12, color: '#4a6cf7', marginBottom: 4 }}>
                                {post.hashtags}
                              </div>
                            )}
                            {post.first_comment && (
                              <div style={{ fontSize: 12, color: '#8e8ea0', fontStyle: 'italic' }}>
                                1st comment: {post.first_comment}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            {!post.approved && !post.rejected && (
                              <>
                                <button
                                  onClick={() => approveGenPost(idx)}
                                  title="Approve and save"
                                  style={{
                                    width: 32, height: 32, borderRadius: 8, border: '1px solid #d1fae5',
                                    background: '#ecfdf5', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', color: '#22c55e',
                                  }}
                                >
                                  <Check size={14} />
                                </button>
                                <button
                                  onClick={() => {
                                    const newCaption = prompt('Edit caption:', post.caption || post.content || '');
                                    if (newCaption !== null) {
                                      setGenResults(prev => prev.map((r, i) => i === idx ? { ...r, caption: newCaption, content: newCaption } : r));
                                    }
                                  }}
                                  title="Edit"
                                  style={{
                                    width: 32, height: 32, borderRadius: 8, border: '1px solid #fef3c7',
                                    background: '#fffbeb', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', color: '#f59e0b',
                                  }}
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => rejectGenPost(idx)}
                                  title="Reject"
                                  style={{
                                    width: 32, height: 32, borderRadius: 8, border: '1px solid #fee2e2',
                                    background: '#fef2f2', cursor: 'pointer', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', color: '#ef4444',
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </>
                            )}
                            {post.approved && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#22c55e', padding: '6px 10px', background: '#ecfdf5', borderRadius: 8 }}>
                                Approved
                              </span>
                            )}
                            {post.rejected && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', padding: '6px 10px', background: '#fef2f2', borderRadius: 8 }}>
                                Rejected
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ══ EXPORTED SECTION ══ */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {client && activeSection === 'exported' && (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7ef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e' }}>
                  Exported Scripts ({exportedScripts.length})
                </div>
              </div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#8e8ea0' }}>
                  <Loader size={20} className="spin" />
                </div>
              ) : exportedScripts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px 20px', color: '#8e8ea0', fontSize: 13 }}>
                  No exported content yet. Export scripts from the Content tab.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7ef' }}>
                        <th style={{ ...thStyle, width: 80 }}>Media</th>
                        <th style={{ ...thStyle, minWidth: 140 }}>Title</th>
                        <th style={{ ...thStyle, minWidth: 180 }}>Caption</th>
                        <th style={{ ...thStyle, minWidth: 120 }}>Hashtags</th>
                        <th style={{ ...thStyle, minWidth: 120 }}>1st Comment</th>
                        <th style={{ ...thStyle, width: 150 }}>Scheduled</th>
                        <th style={{ ...thStyle, width: 90 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exportedScripts.map(script => (
                        <tr key={script.id} style={{ borderBottom: '1px solid #f5f5f8', verticalAlign: 'top' }}>
                          <td style={{ padding: 10 }}>
                            <div style={{
                              width: 64, height: 64, borderRadius: 8,
                              border: '2px dashed #e5e7ef', background: '#f8f9fc',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              overflow: 'hidden',
                            }}>
                              {script.media_urls?.length ? (
                                script.media_type === 'video' ? (
                                  <video src={script.media_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <img src={script.media_urls[0]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )
                              ) : (
                                <Film size={16} style={{ color: '#ccc' }} />
                              )}
                            </div>
                          </td>
                          <td style={{ padding: 10, fontSize: 12, color: '#1a1a2e' }}>
                            {script.title || '-'}
                          </td>
                          <td style={{ padding: 10, fontSize: 12, color: '#1a1a2e', maxWidth: 200 }}>
                            <div style={{ maxHeight: 60, overflow: 'hidden', lineHeight: 1.4 }}>
                              {script.caption ? (script.caption.length > 100 ? script.caption.slice(0, 100) + '...' : script.caption) : '-'}
                            </div>
                          </td>
                          <td style={{ padding: 10, fontSize: 12, color: '#4a6cf7' }}>
                            {script.hashtags || '-'}
                          </td>
                          <td style={{ padding: 10, fontSize: 12, color: '#555' }}>
                            {script.first_comment || '-'}
                          </td>
                          <td style={{ padding: 10, fontSize: 12, color: '#1a1a2e' }}>
                            {script.scheduled_datetime
                              ? new Date(script.scheduled_datetime).toLocaleString('en-US', {
                                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                })
                              : 'Not set'}
                          </td>
                          <td style={{ padding: 10 }}>
                            <StatusPill status={script.status} onClick={async () => {
                              await updateContentScript(script.id, { status: script.scheduled_datetime ? 'scheduled' : 'caption_ready' });
                              loadClientData(client.id);
                            }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Quick Command */}
              <div style={{ borderTop: '1px solid #e5e7ef', padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: '#f8f9fc', borderRadius: 12, padding: '10px 14px', border: '1px solid #e5e7ef' }}>
                  <textarea
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommand(); } }}
                    placeholder="Type a command: generate captions, auto schedule, export..."
                    rows={1}
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      color: '#1a1a2e', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5,
                      resize: 'none', minHeight: 20, maxHeight: 80,
                    }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px'; }}
                  />
                  <button onClick={handleCommand} disabled={!chatInput.trim()} style={{
                    width: 32, height: 32, borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #4a6cf7, #3b5de7)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: chatInput.trim() ? 1 : 0.4, flexShrink: 0,
                  }}>
                    <Send size={14} style={{ color: '#fff' }} />
                  </button>
                </div>
                {actionLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#4a6cf7' }}>
                    <Loader size={12} className="spin" /> {actionLoading === 'captions' ? 'Generating captions...' : actionLoading === 'schedule' ? 'Scheduling...' : 'Processing...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* ══ DOCS SECTION ══ */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {client && activeSection === 'docs' && (
            <div style={{ ...cardStyle }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 16px' }}>Content Agent Commands</h3>
              <p style={{ fontSize: 13, color: '#8e8ea0', marginBottom: 20, lineHeight: 1.6 }}>
                Use the command bar in any section. Paste scripts to create rows, or type commands to manage content.
              </p>

              {[
                {
                  category: 'Script Management',
                  commands: [
                    { cmd: 'Paste any text', desc: 'Creates a new script row from pasted text' },
                    { cmd: 'Upload scripts', desc: 'Opens file picker for .txt, .pdf, .docx' },
                    { cmd: 'Import scripts', desc: 'Same as upload' },
                  ],
                },
                {
                  category: 'Caption Generation',
                  commands: [
                    { cmd: 'Generate captions', desc: 'AI generates titles, captions, hashtags for all scripts' },
                    { cmd: 'Create captions', desc: 'Same as generate captions' },
                    { cmd: 'Select rows + generate captions', desc: 'Only generates for selected scripts' },
                  ],
                },
                {
                  category: 'Scheduling',
                  commands: [
                    { cmd: 'Auto schedule', desc: 'Assigns time slots to all unscheduled scripts' },
                    { cmd: 'Schedule all', desc: 'Same as auto schedule' },
                    { cmd: 'Settings icon (gear)', desc: 'Open schedule settings to change time slots and timezone' },
                  ],
                },
                {
                  category: 'Export',
                  commands: [
                    { cmd: 'Export', desc: 'Exports selected scripts as CSV for SocialPilot' },
                    { cmd: 'Select rows + Export CSV', desc: 'Creates one row per platform per script' },
                  ],
                },
                {
                  category: 'Content Generator',
                  commands: [
                    { cmd: 'Create 10 Threads posts about [topic]', desc: 'AI generates posts in Generator tab' },
                    { cmd: 'Generate 5 TikTok scripts about [topic]', desc: 'Creates platform-specific content' },
                    { cmd: 'Write Instagram captions for [topic]', desc: 'Generates IG-optimized posts' },
                    { cmd: 'Approve / Reject / Edit', desc: 'Review generated posts before saving' },
                    { cmd: 'Export Approved', desc: 'Download approved generated posts as CSV' },
                  ],
                },
                {
                  category: 'Status Workflow',
                  commands: [
                    { cmd: 'Draft → Caption Ready → Scheduled → Exported → Posted', desc: 'Content lifecycle' },
                    { cmd: 'Click "Exported" pill', desc: 'Resets status to allow re-export' },
                  ],
                },
              ].map(({ category, commands }) => (
                <div key={category} style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: '#4a6cf7', textTransform: 'uppercase',
                    letterSpacing: '0.05em', marginBottom: 8, paddingBottom: 6,
                    borderBottom: '1px solid #f0f0f5',
                  }}>
                    {category}
                  </div>
                  {commands.map(({ cmd, desc }) => (
                    <div key={cmd} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '8px 0', borderBottom: '1px solid #fafafa', gap: 12,
                    }}>
                      <code style={{
                        fontSize: 12, color: '#1a1a2e', background: '#f8f9fc',
                        padding: '3px 8px', borderRadius: 6, fontFamily: 'monospace',
                        flexShrink: 0,
                      }}>
                        {cmd}
                      </code>
                      <span style={{ fontSize: 12, color: '#8e8ea0', textAlign: 'right' }}>{desc}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

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
          <div className="cs-modal" style={modalBox} onClick={e => e.stopPropagation()}>
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
          <div className="cs-modal" style={{ ...modalBox, maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700 }}>
              {editingClient ? `Edit ${editingClient.business_name}` : 'Add Content Client'}
            </h3>

            {/* Basic Info */}
            <div style={{ fontSize: 12, color: '#8e8ea0', fontWeight: 600, marginBottom: 6 }}>Basic Info</div>
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
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
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
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
            <div className="cs-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
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

        @media (max-width: 768px) {
          .cs-page { flex-direction: column !important; }
          .cs-sidebar { width: 100% !important; flex-direction: row !important; border-right: none !important; border-bottom: 1px solid #e5e7ef; overflow-x: auto; max-height: none !important; }
          .cs-sidebar > div:first-child { display: none !important; }
          .cs-sidebar > div:nth-child(2) { display: flex !important; flex-direction: row !important; overflow-x: auto; padding: 0 !important; gap: 0 !important; }
          .cs-sidebar > div:nth-child(2) > div { white-space: nowrap; border-left: none !important; border-bottom: 3px solid transparent; padding: 10px 14px !important; font-size: 12px !important; }
          .cs-sidebar > div:last-child { display: none !important; }
          .cs-main { min-width: 0 !important; }
          .cs-topbar { flex-wrap: wrap !important; }
          .cs-topbar h2 { font-size: 15px !important; }
          .cs-topbar-right { width: 100%; flex-wrap: wrap; }

          .cs-toolbar { flex-direction: column; align-items: flex-start !important; gap: 10px !important; }
          .cs-toolbar-left { flex-wrap: wrap; }
          .cs-toolbar-right { width: 100%; flex-wrap: wrap; justify-content: flex-start !important; }
          .cs-toolbar-right button { font-size: 11px !important; padding: 5px 8px !important; }

          .cs-page table { min-width: 800px; }

          .cs-modal { width: 95vw !important; max-width: 95vw !important; margin: 20px auto !important; max-height: 85vh; overflow-y: auto; }
          .cs-form-grid { grid-template-columns: 1fr !important; }
          .cs-profile-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
