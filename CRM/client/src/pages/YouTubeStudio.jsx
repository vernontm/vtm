import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  getContentClients, getCompetitorVideos, addCompetitorVideo, batchAddVideos,
  transcribeVideo, analyzeVideo, deleteCompetitorVideo,
  generateYTScript, getYTScripts, updateYTScript, deleteYTScript, completeYTPackage,
  analyzeInspiration, generateThumbnail, getYTThumbnails, deleteYTThumbnail,
  getYTAssets, createYTAsset, deleteYTAsset,
} from '../api';
import {
  Search, Plus, Trash2, Loader, Play, Film, FileText, Image, Upload, Download,
  RefreshCw, Check, X, ChevronDown, Eye, Sparkles, Copy, ExternalLink,
} from 'lucide-react';

const STATUS_COLORS = {
  pending:    { bg: '#f0f0f5', text: '#8e8ea0', label: 'Pending' },
  processing: { bg: '#e0f2fe', text: '#0ea5e9', label: 'Processing' },
  complete:   { bg: '#e8f5e9', text: '#22c55e', label: 'Complete' },
  failed:     { bg: '#fee2e2', text: '#ef4444', label: 'Failed' },
};

function StatusPill({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

const TABS = [
  { key: 'research', label: 'Research', Icon: Search },
  { key: 'scripts', label: 'Scripts', Icon: FileText },
  { key: 'thumbnails', label: 'Thumbnails', Icon: Image },
  { key: 'packages', label: 'Packages', Icon: Download },
];

const inputStyle = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7ef', fontSize: 13,
  fontFamily: 'Inter, sans-serif', outline: 'none', width: '100%', boxSizing: 'border-box',
};
const btnPrimary = {
  background: 'linear-gradient(135deg, #4a6cf7, #6e8efb)', color: '#fff', borderRadius: 8,
  border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
};
const btnSecondary = {
  background: '#f8f9fc', border: '1px solid #e5e7ef', color: '#5a5a6e', borderRadius: 8,
  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
};
const btnDanger = {
  ...btnSecondary, color: '#ef4444', border: '1px solid #fecaca',
};
const cardStyle = {
  background: '#fff', border: '1px solid #e5e7ef', borderRadius: 12, padding: 20,
};
const sectionTitle = { fontSize: 13, fontWeight: 700, color: '#1a1a2e', marginBottom: 12 };
const labelStyle = { fontSize: 11, fontWeight: 600, color: '#8e8ea0', marginBottom: 4, display: 'block' };

export default function YouTubeStudio() {
  // Client
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);

  // Tab
  const [activeTab, setActiveTab] = useState('research');

  // Research
  const [videos, setVideos] = useState([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoChannel, setVideoChannel] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const [transcribingId, setTranscribingId] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);
  // audio upload refs removed — transcription now extracts audio from YouTube URL automatically

  // Scripts
  const [scripts, setScripts] = useState([]);
  const [scriptPrompt, setScriptPrompt] = useState('');
  const [scriptStyle, setScriptStyle] = useState('educational');
  const [generatingScript, setGeneratingScript] = useState(false);
  const [expandedScriptId, setExpandedScriptId] = useState(null);
  const [editingScriptId, setEditingScriptId] = useState(null);
  const [editScriptData, setEditScriptData] = useState({});
  const [completingPackageId, setCompletingPackageId] = useState(null);

  // Thumbnails
  const [thumbnails, setThumbnails] = useState([]);
  const [inspUrls, setInspUrls] = useState(['', '', '']);
  const [analyzingInsp, setAnalyzingInsp] = useState(false);
  const [inspAnalysis, setInspAnalysis] = useState(null);
  const [charRefUrl, setCharRefUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [thumbTitle, setThumbTitle] = useState('');
  const [thumbModel, setThumbModel] = useState('nano-banana');
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const [thumbPromptUsed, setThumbPromptUsed] = useState('');
  const charRefInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const [uploadingCharRef, setUploadingCharRef] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // General
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addingVideo, setAddingVideo] = useState(false);
  const [batchAdding, setBatchAdding] = useState(false);

  // ── Load clients on mount ──
  useEffect(() => {
    (async () => {
      try {
        const data = await getContentClients();
        setClients(data || []);
      } catch (e) { console.error(e); }
    })();
  }, []);

  // ── Reload data when client changes ──
  useEffect(() => {
    if (!selectedClientId) {
      setVideos([]); setScripts([]); setThumbnails([]);
      return;
    }
    loadAllData();
  }, [selectedClientId]);

  async function loadAllData() {
    setLoading(true);
    setError('');
    try {
      const [v, s, t] = await Promise.all([
        getCompetitorVideos(selectedClientId),
        getYTScripts(selectedClientId),
        getYTThumbnails(selectedClientId),
      ]);
      setVideos(v || []);
      setScripts(s || []);
      setThumbnails(t || []);
    } catch (e) {
      console.error(e);
      setError('Failed to load data');
    }
    setLoading(false);
  }

  // ── Helpers ──
  const selectedClient = clients.find(c => c.id === selectedClientId);

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  // ══════════════════════════════════════════════════════════════
  // RESEARCH TAB HANDLERS
  // ══════════════════════════════════════════════════════════════

  // Auto-process: add → transcribe → analyze in one go
  async function autoProcess(videoId) {
    try {
      setTranscribingId(videoId);
      await transcribeVideo({ video_id: videoId });
      const v1 = await getCompetitorVideos(selectedClientId);
      setVideos(v1 || []);
      setTranscribingId(null);

      setAnalyzingId(videoId);
      await analyzeVideo({ video_id: videoId });
      const v2 = await getCompetitorVideos(selectedClientId);
      setVideos(v2 || []);
      setAnalyzingId(null);
    } catch (e) {
      setError(e.message || 'Auto-process failed');
      setTranscribingId(null);
      setAnalyzingId(null);
    }
  }

  async function handleAddVideo() {
    if (!videoUrl.trim() || !selectedClientId) return;
    setAddingVideo(true); setError('');
    try {
      const added = await addCompetitorVideo({
        client_id: selectedClientId,
        video_url: videoUrl.trim(),
        video_title: videoTitle.trim() || undefined,
        channel_name: videoChannel.trim() || undefined,
      });
      setVideoUrl(''); setVideoTitle(''); setVideoChannel('');
      const v = await getCompetitorVideos(selectedClientId);
      setVideos(v || []);
      setAddingVideo(false);

      // Auto-transcribe and analyze in background
      const newId = added?.id || (v || []).find(x => x.video_url === videoUrl.trim())?.id;
      if (newId) autoProcess(newId);
    } catch (e) { setError(e.message || 'Failed to add video'); setAddingVideo(false); }
  }

  async function handleBatchAdd() {
    const urls = batchUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (!urls.length || !selectedClientId) return;
    setBatchAdding(true); setError('');
    try {
      await batchAddVideos({ client_id: selectedClientId, video_urls: urls.map(u => ({ url: u })) });
      setBatchUrls('');
      const v = await getCompetitorVideos(selectedClientId);
      setVideos(v || []);
      setBatchAdding(false);

      // Auto-process each new video sequentially
      const pending = (v || []).filter(x => x.transcription_status === 'pending');
      for (const vid of pending) {
        await autoProcess(vid.id);
      }
    } catch (e) { setError(e.message || 'Failed to batch add'); setBatchAdding(false); }
  }

  async function handleTranscribe(videoId) {
    setTranscribingId(videoId); setError('');
    try {
      await transcribeVideo({ video_id: videoId });
      const v = await getCompetitorVideos(selectedClientId);
      setVideos(v || []);
    } catch (e) { setError(e.message || 'Transcription failed'); }
    setTranscribingId(null);
  }

  async function handleAnalyze(videoId) {
    setAnalyzingId(videoId); setError('');
    try {
      await analyzeVideo({ video_id: videoId });
      const v = await getCompetitorVideos(selectedClientId);
      setVideos(v || []);
    } catch (e) { setError(e.message || 'Analysis failed'); }
    setAnalyzingId(null);
  }

  async function handleDeleteVideo(videoId) {
    setError('');
    try {
      await deleteCompetitorVideo(videoId);
      setVideos(prev => prev.filter(v => v.id !== videoId));
    } catch (e) { setError(e.message || 'Failed to delete'); }
  }

  function getKnowledgeSummary() {
    const analyzed = videos.filter(v => v.analysis);
    let hooks = 0, intros = 0, ctas = 0;
    analyzed.forEach(v => {
      try {
        const a = typeof v.analysis === 'string' ? JSON.parse(v.analysis) : v.analysis;
        if (a.hooks) hooks += Array.isArray(a.hooks) ? a.hooks.length : 1;
        if (a.intros) intros += Array.isArray(a.intros) ? a.intros.length : 1;
        if (a.ctas) ctas += Array.isArray(a.ctas) ? a.ctas.length : 1;
      } catch {}
    });
    return { analyzed: analyzed.length, hooks, intros, ctas };
  }

  // ══════════════════════════════════════════════════════════════
  // SCRIPTS TAB HANDLERS
  // ══════════════════════════════════════════════════════════════

  async function handleGenerateScript() {
    if (!scriptPrompt.trim() || !selectedClientId) return;
    setGeneratingScript(true); setError('');
    try {
      await generateYTScript({
        client_id: selectedClientId,
        prompt: scriptPrompt.trim(),
        style: scriptStyle,
      });
      setScriptPrompt('');
      const s = await getYTScripts(selectedClientId);
      setScripts(s || []);
    } catch (e) { setError(e.message || 'Script generation failed'); }
    setGeneratingScript(false);
  }

  async function handleDeleteScript(id) {
    setError('');
    try {
      await deleteYTScript(id);
      setScripts(prev => prev.filter(s => s.id !== id));
    } catch (e) { setError(e.message || 'Failed to delete script'); }
  }

  function startEditScript(script) {
    setEditingScriptId(script.id);
    setEditScriptData({
      title: script.title || '',
      hook: script.hook || '',
      intro: script.intro || '',
      sections: script.sections || [],
      ctas: script.ctas || [],
      outro: script.outro || '',
      full_script: script.full_script || '',
    });
  }

  async function saveEditScript() {
    if (!editingScriptId) return;
    setError('');
    try {
      await updateYTScript(editingScriptId, editScriptData);
      setEditingScriptId(null);
      const s = await getYTScripts(selectedClientId);
      setScripts(s || []);
    } catch (e) { setError(e.message || 'Failed to update script'); }
  }

  async function handleCompletePackage(scriptId) {
    setCompletingPackageId(scriptId); setError('');
    try {
      await completeYTPackage({ script_id: scriptId });
      const s = await getYTScripts(selectedClientId);
      setScripts(s || []);
    } catch (e) { setError(e.message || 'Failed to complete package'); }
    setCompletingPackageId(null);
  }

  // ══════════════════════════════════════════════════════════════
  // THUMBNAILS TAB HANDLERS
  // ══════════════════════════════════════════════════════════════

  async function handleAnalyzeInspiration() {
    const urls = inspUrls.filter(u => u.trim());
    if (!urls.length) return;
    setAnalyzingInsp(true); setError(''); setInspAnalysis(null);
    try {
      const result = await analyzeInspiration({ urls });
      setInspAnalysis(result);
    } catch (e) { setError(e.message || 'Inspiration analysis failed'); }
    setAnalyzingInsp(false);
  }

  async function uploadFileToStorage(file, subPath) {
    const ext = file.name.split('.').pop();
    const path = `${selectedClientId}/${subPath}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('content-media')
      .upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('content-media').getPublicUrl(path);
    return urlData?.publicUrl || '';
  }

  async function handleCharRefUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCharRef(true);
    try {
      const url = await uploadFileToStorage(file, 'yt-char-ref');
      setCharRefUrl(url);
    } catch (err) { setError('Failed to upload character reference'); }
    setUploadingCharRef(false);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await uploadFileToStorage(file, 'yt-logos');
      setLogoUrl(url);
    } catch (err) { setError('Failed to upload logo'); }
    setUploadingLogo(false);
  }

  async function handleGenerateThumbnail() {
    if (!thumbTitle.trim() || !selectedClientId) return;
    setGeneratingThumb(true); setError(''); setThumbPromptUsed('');
    try {
      const result = await generateThumbnail({
        client_id: selectedClientId,
        title: thumbTitle.trim(),
        model: thumbModel,
        character_ref_url: charRefUrl || undefined,
        logo_url: logoUrl || undefined,
        inspiration_analysis: inspAnalysis || undefined,
      });
      setThumbPromptUsed(result?.prompt_used || '');
      const t = await getYTThumbnails(selectedClientId);
      setThumbnails(t || []);
    } catch (e) { setError(e.message || 'Thumbnail generation failed'); }
    setGeneratingThumb(false);
  }

  async function handleDeleteThumbnail(id) {
    setError('');
    try {
      await deleteYTThumbnail(id);
      setThumbnails(prev => prev.filter(t => t.id !== id));
    } catch (e) { setError(e.message || 'Failed to delete thumbnail'); }
  }

  // ══════════════════════════════════════════════════════════════
  // PACKAGES TAB HELPERS
  // ══════════════════════════════════════════════════════════════

  function getPackages() {
    return scripts.filter(s => s.yt_title);
  }

  function exportPackage(pkg) {
    const tags = Array.isArray(pkg.yt_tags) ? pkg.yt_tags.join(', ') : (pkg.yt_tags || '');
    const text = [
      `TITLE: ${pkg.yt_title}`,
      '',
      `DESCRIPTION:`,
      pkg.yt_description || '',
      '',
      `TAGS: ${tags}`,
      '',
      `SCRIPT:`,
      pkg.full_script || '',
    ].join('\n');
    copyToClipboard(text);
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════

  const kb = getKnowledgeSummary();

  return (
    <div style={{ padding: 0, fontFamily: 'Inter, sans-serif', minHeight: '100vh', background: '#f8f9fc' }}>
      {/* Hidden file inputs for thumbnail uploads */}
      <input ref={charRefInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCharRefUpload} />
      <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />

      {/* ── Top Bar ── */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7ef', padding: '16px 28px',
        display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Film size={22} color="#4a6cf7" />
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>YouTube Studio</span>
        </div>

        {/* Client selector */}
        <div style={{ position: 'relative', minWidth: 200 }}>
          <button
            onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
            style={{
              ...btnSecondary, width: '100%', justifyContent: 'space-between',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedClient ? selectedClient.business_name : 'Select Client'}
            </span>
            <ChevronDown size={14} />
          </button>
          {clientDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
              background: '#fff', border: '1px solid #e5e7ef', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 240, overflowY: 'auto',
              marginTop: 4,
            }}>
              {clients.map(c => (
                <div
                  key={c.id}
                  onClick={() => { setSelectedClientId(c.id); setClientDropdownOpen(false); }}
                  style={{
                    padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                    background: selectedClientId === c.id ? 'rgba(74,108,247,0.06)' : 'transparent',
                    color: selectedClientId === c.id ? '#4a6cf7' : '#1a1a2e',
                    fontWeight: selectedClientId === c.id ? 600 : 400,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,108,247,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = selectedClientId === c.id ? 'rgba(74,108,247,0.06)' : 'transparent'}
                >
                  {c.business_name}
                </div>
              ))}
              {clients.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 12, color: '#8e8ea0', textAlign: 'center' }}>
                  No clients found
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tab buttons */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                background: activeTab === t.key ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#f0f0f5',
                color: activeTab === t.key ? '#fff' : '#5a5a6e',
                transition: 'all 0.15s',
              }}
            >
              <t.Icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error bar ── */}
      {error && (
        <div style={{
          padding: '10px 28px', background: '#fef2f2', color: '#dc2626', fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Main content ── */}
      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#8e8ea0' }}>
            <Loader size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
            <div style={{ marginTop: 8, fontSize: 13 }}>Loading...</div>
          </div>
        )}

        {!selectedClientId && !loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#8e8ea0' }}>
            <Film size={48} strokeWidth={1} />
            <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>Select a client to get started</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Choose a client from the dropdown above.</div>
          </div>
        )}

        {selectedClientId && !loading && (
          <>
            {activeTab === 'research' && renderResearchTab()}
            {activeTab === 'scripts' && renderScriptsTab()}
            {activeTab === 'thumbnails' && renderThumbnailsTab()}
            {activeTab === 'packages' && renderPackagesTab()}
          </>
        )}
      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );

  // ══════════════════════════════════════════════════════════════
  // TAB: RESEARCH
  // ══════════════════════════════════════════════════════════════

  function renderResearchTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Add single video */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Add Competitor Video</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, flex: 2, minWidth: 200 }}
              placeholder="YouTube URL"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddVideo()}
            />
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 140 }}
              placeholder="Title (optional)"
              value={videoTitle}
              onChange={e => setVideoTitle(e.target.value)}
            />
            <input
              style={{ ...inputStyle, flex: 1, minWidth: 140 }}
              placeholder="Channel name"
              value={videoChannel}
              onChange={e => setVideoChannel(e.target.value)}
            />
            <button onClick={handleAddVideo} disabled={addingVideo || !videoUrl.trim()} style={{ ...btnPrimary, opacity: addingVideo ? 0.6 : 1 }}>
              {addingVideo ? <Loader size={14} className="spin" /> : <Plus size={14} />}
              Add
            </button>
          </div>
        </div>

        {/* Batch add */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Batch Add Videos</div>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
            placeholder="Paste multiple YouTube URLs (one per line)"
            value={batchUrls}
            onChange={e => setBatchUrls(e.target.value)}
          />
          <div style={{ marginTop: 10 }}>
            <button onClick={handleBatchAdd} disabled={batchAdding || !batchUrls.trim()} style={{ ...btnPrimary, opacity: batchAdding ? 0.6 : 1 }}>
              {batchAdding ? <Loader size={14} className="spin" /> : <Plus size={14} />}
              Add All
            </button>
          </div>
        </div>

        {/* Video list */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={sectionTitle}>Video Library ({videos.length})</div>
            <button onClick={loadAllData} style={btnSecondary}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {videos.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}>
              <Search size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No videos yet. Add competitor videos above.</div>
            </div>
          )}

          {videos.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7ef' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Title / URL</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Channel</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#8e8ea0' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map(v => {
                    const hasTranscript = !!v.transcript;
                    const hasAnalysis = !!v.analysis;
                    const status = v.status || (hasAnalysis ? 'complete' : hasTranscript ? 'processing' : 'pending');
                    const isExpanded = expandedVideoId === v.id;

                    return (
                      <React.Fragment key={v.id}>
                        <tr style={{ borderBottom: '1px solid #f0f0f5' }}>
                          <td style={{ padding: '10px 10px', maxWidth: 300 }}>
                            <div style={{ fontWeight: 600, color: '#1a1a2e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {v.title || 'Untitled'}
                            </div>
                            <a href={v.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#4a6cf7', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                              <ExternalLink size={10} /> {v.url?.substring(0, 50)}{v.url?.length > 50 ? '...' : ''}
                            </a>
                          </td>
                          <td style={{ padding: '10px 10px', color: '#5a5a6e' }}>{v.channel || '-'}</td>
                          <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                            <StatusPill status={status} />
                          </td>
                          <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                              {!hasTranscript && status !== 'processing' && (
                                <button
                                  onClick={() => handleTranscribe(v.id)}
                                  disabled={transcribingId === v.id}
                                  style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11, opacity: transcribingId === v.id ? 0.6 : 1 }}
                                >
                                  {transcribingId === v.id ? <Loader size={12} className="spin" /> : <Play size={12} />}
                                  Transcribe
                                </button>
                              )}
                              {hasTranscript && !hasAnalysis && (
                                <button
                                  onClick={() => handleAnalyze(v.id)}
                                  disabled={analyzingId === v.id}
                                  style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11, opacity: analyzingId === v.id ? 0.6 : 1 }}
                                >
                                  {analyzingId === v.id ? <Loader size={12} className="spin" /> : <Sparkles size={12} />}
                                  Analyze
                                </button>
                              )}
                              {hasAnalysis && (
                                <button
                                  onClick={() => setExpandedVideoId(isExpanded ? null : v.id)}
                                  style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11 }}
                                >
                                  <Eye size={12} /> {isExpanded ? 'Hide' : 'View'}
                                </button>
                              )}
                              <button onClick={() => handleDeleteVideo(v.id)} style={{ ...btnDanger, padding: '5px 10px', fontSize: 11 }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && hasAnalysis && (
                          <tr>
                            <td colSpan={4} style={{ padding: '12px 10px', background: '#fafbfe' }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8ea0', marginBottom: 6 }}>Analysis</div>
                              <pre style={{
                                background: '#1a1a2e', color: '#e0e0e0', padding: 16, borderRadius: 8,
                                fontSize: 12, overflowX: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                              }}>
                                {typeof v.analysis === 'string' ? v.analysis : JSON.stringify(v.analysis, null, 2)}
                              </pre>
                              {v.transcript && (
                                <>
                                  <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8ea0', marginBottom: 6, marginTop: 12 }}>Transcript</div>
                                  <div style={{
                                    background: '#fff', border: '1px solid #e5e7ef', padding: 12, borderRadius: 8,
                                    fontSize: 12, maxHeight: 200, overflowY: 'auto', lineHeight: 1.5,
                                  }}>
                                    {v.transcript}
                                  </div>
                                </>
                              )}
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

        {/* Knowledge base summary */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Knowledge Base Summary</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Analyzed Videos', value: kb.analyzed, color: '#4a6cf7' },
              { label: 'Hooks Extracted', value: kb.hooks, color: '#22c55e' },
              { label: 'Intros Extracted', value: kb.intros, color: '#f59e0b' },
              { label: 'CTAs Extracted', value: kb.ctas, color: '#a855f7' },
            ].map(item => (
              <div key={item.label} style={{
                background: '#fafbfe', borderRadius: 10, padding: '14px 20px', flex: 1, minWidth: 120,
                border: '1px solid #e5e7ef',
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8ea0', marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: SCRIPTS
  // ══════════════════════════════════════════════════════════════

  function renderScriptsTab() {
    const styleOptions = ['educational', 'entertaining', 'storytelling', 'tutorial'];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Generate script */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Generate YouTube Script</div>
          <label style={labelStyle}>Prompt</label>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical', marginBottom: 12 }}
            placeholder="Describe the video topic, key points to cover, target audience..."
            value={scriptPrompt}
            onChange={e => setScriptPrompt(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...labelStyle, marginBottom: 0, marginRight: 4 }}>Style:</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {styleOptions.map(s => (
                <button
                  key={s}
                  onClick={() => setScriptStyle(s)}
                  style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', textTransform: 'capitalize',
                    background: scriptStyle === s ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#f0f0f5',
                    color: scriptStyle === s ? '#fff' : '#5a5a6e',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={handleGenerateScript} disabled={generatingScript || !scriptPrompt.trim()} style={{ ...btnPrimary, opacity: generatingScript ? 0.6 : 1 }}>
              {generatingScript ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
              Generate Script
            </button>
          </div>
        </div>

        {/* Script list */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Scripts ({scripts.length})</div>

          {scripts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}>
              <FileText size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No scripts yet. Generate one above.</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {scripts.map(s => {
              const isExpanded = expandedScriptId === s.id;
              const isEditing = editingScriptId === s.id;

              return (
                <div key={s.id} style={{ border: '1px solid #e5e7ef', borderRadius: 10, overflow: 'hidden' }}>
                  {/* Script header */}
                  <div
                    style={{
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer', background: isExpanded ? '#fafbfe' : '#fff',
                    }}
                    onClick={() => { if (!isEditing) setExpandedScriptId(isExpanded ? null : s.id); }}
                  >
                    <FileText size={16} color="#4a6cf7" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: 13 }}>{s.title || 'Untitled Script'}</div>
                      <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>
                        {s.style && <span style={{ textTransform: 'capitalize' }}>{s.style}</span>}
                        {s.created_at && <span> &middot; {new Date(s.created_at).toLocaleDateString()}</span>}
                        {s.yt_title && <span style={{ color: '#22c55e', marginLeft: 8 }}><Check size={11} /> Package Ready</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                      {!s.yt_title && (
                        <button
                          onClick={() => handleCompletePackage(s.id)}
                          disabled={completingPackageId === s.id}
                          style={{ ...btnPrimary, padding: '5px 10px', fontSize: 11, opacity: completingPackageId === s.id ? 0.6 : 1 }}
                        >
                          {completingPackageId === s.id ? <Loader size={12} className="spin" /> : <Download size={12} />}
                          Complete Package
                        </button>
                      )}
                      <button onClick={() => isEditing ? saveEditScript() : startEditScript(s)} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11 }}>
                        {isEditing ? <><Check size={12} /> Save</> : <><FileText size={12} /> Edit</>}
                      </button>
                      <button onClick={() => handleDeleteScript(s.id)} style={{ ...btnDanger, padding: '5px 10px', fontSize: 11 }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded script view */}
                  {isExpanded && (
                    <div style={{ padding: '0 16px 16px', background: '#fafbfe' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div>
                            <label style={labelStyle}>Title</label>
                            <input style={inputStyle} value={editScriptData.title} onChange={e => setEditScriptData(d => ({ ...d, title: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Hook</label>
                            <textarea style={{ ...inputStyle, minHeight: 50 }} value={editScriptData.hook} onChange={e => setEditScriptData(d => ({ ...d, hook: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Intro</label>
                            <textarea style={{ ...inputStyle, minHeight: 50 }} value={editScriptData.intro} onChange={e => setEditScriptData(d => ({ ...d, intro: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Outro</label>
                            <textarea style={{ ...inputStyle, minHeight: 50 }} value={editScriptData.outro} onChange={e => setEditScriptData(d => ({ ...d, outro: e.target.value }))} />
                          </div>
                          <div>
                            <label style={labelStyle}>Full Script</label>
                            <textarea style={{ ...inputStyle, minHeight: 200, fontFamily: 'monospace', fontSize: 12 }} value={editScriptData.full_script} onChange={e => setEditScriptData(d => ({ ...d, full_script: e.target.value }))} />
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {s.hook && (
                            <div>
                              <div style={labelStyle}>Hook</div>
                              <div style={{ fontSize: 13, color: '#1a1a2e', lineHeight: 1.5 }}>{s.hook}</div>
                            </div>
                          )}
                          {s.intro && (
                            <div>
                              <div style={labelStyle}>Intro</div>
                              <div style={{ fontSize: 13, color: '#1a1a2e', lineHeight: 1.5 }}>{s.intro}</div>
                            </div>
                          )}
                          {Array.isArray(s.sections) && s.sections.length > 0 && (
                            <div>
                              <div style={labelStyle}>Sections</div>
                              {s.sections.map((sec, i) => (
                                <div key={i} style={{ marginBottom: 10, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid #e5e7ef' }}>
                                  <div style={{ fontWeight: 600, fontSize: 12, color: '#1a1a2e', marginBottom: 4 }}>
                                    {sec.title || `Section ${i + 1}`}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#5a5a6e', lineHeight: 1.5 }}>{sec.content || sec.text || ''}</div>
                                  {sec.b_roll_notes && (
                                    <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 4, fontStyle: 'italic' }}>
                                      B-Roll: {sec.b_roll_notes}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {Array.isArray(s.ctas) && s.ctas.length > 0 && (
                            <div>
                              <div style={labelStyle}>CTAs</div>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {s.ctas.map((cta, i) => (
                                  <li key={i} style={{ fontSize: 12, color: '#5a5a6e', marginBottom: 4 }}>{typeof cta === 'string' ? cta : cta.text || JSON.stringify(cta)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {s.outro && (
                            <div>
                              <div style={labelStyle}>Outro</div>
                              <div style={{ fontSize: 13, color: '#1a1a2e', lineHeight: 1.5 }}>{s.outro}</div>
                            </div>
                          )}
                          {s.full_script && (
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={labelStyle}>Full Script</div>
                                <button onClick={() => copyToClipboard(s.full_script)} style={{ ...btnSecondary, padding: '3px 8px', fontSize: 11 }}>
                                  <Copy size={11} /> Copy
                                </button>
                              </div>
                              <pre style={{
                                background: '#1a1a2e', color: '#e0e0e0', padding: 16, borderRadius: 8,
                                fontSize: 12, overflowX: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                              }}>
                                {s.full_script}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: THUMBNAILS
  // ══════════════════════════════════════════════════════════════

  function renderThumbnailsTab() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Inspiration analysis */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Inspiration Analysis</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inspUrls.map((url, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ ...labelStyle, marginBottom: 0, minWidth: 90 }}>Thumbnail {i + 1}</label>
                <input
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="Paste inspiration thumbnail URL"
                  value={url}
                  onChange={e => {
                    const next = [...inspUrls];
                    next[i] = e.target.value;
                    setInspUrls(next);
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handleAnalyzeInspiration}
              disabled={analyzingInsp || !inspUrls.some(u => u.trim())}
              style={{ ...btnPrimary, opacity: analyzingInsp ? 0.6 : 1 }}
            >
              {analyzingInsp ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
              Analyze
            </button>
            {inspAnalysis && (
              <span style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={14} /> Analysis complete
              </span>
            )}
          </div>
          {inspAnalysis && (
            <div style={{ marginTop: 12 }}>
              <pre style={{
                background: '#1a1a2e', color: '#e0e0e0', padding: 14, borderRadius: 8,
                fontSize: 11, maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap',
              }}>
                {typeof inspAnalysis === 'string' ? inspAnalysis : JSON.stringify(inspAnalysis, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Uploads and generation */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Generate Thumbnail</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Character reference */}
            <div>
              <label style={labelStyle}>Character Reference</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => charRefInputRef.current?.click()} disabled={uploadingCharRef} style={btnSecondary}>
                  {uploadingCharRef ? <Loader size={13} className="spin" /> : <Upload size={13} />}
                  {charRefUrl ? 'Replace' : 'Upload'}
                </button>
                {charRefUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <img src={charRefUrl} alt="char ref" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                    <button onClick={() => setCharRefUrl('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Logo */}
            <div>
              <label style={labelStyle}>Logo</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} style={btnSecondary}>
                  {uploadingLogo ? <Loader size={13} className="spin" /> : <Upload size={13} />}
                  {logoUrl ? 'Replace' : 'Upload'}
                </button>
                {logoUrl && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <img src={logoUrl} alt="logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} />
                    <button onClick={() => setLogoUrl('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Video title */}
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Video Title</label>
            <input
              style={inputStyle}
              placeholder="Enter video title for thumbnail text"
              value={thumbTitle}
              onChange={e => setThumbTitle(e.target.value)}
            />
          </div>

          {/* Model selector */}
          <div style={{ marginTop: 14 }}>
            <label style={labelStyle}>Model</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { key: 'nano-banana', label: 'Nano Banana' },
                { key: 'seedream', label: 'Seedream' },
              ].map(m => (
                <button
                  key={m.key}
                  onClick={() => setThumbModel(m.key)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer',
                    background: thumbModel === m.key ? 'linear-gradient(135deg, #4a6cf7, #6e8efb)' : '#f0f0f5',
                    color: thumbModel === m.key ? '#fff' : '#5a5a6e',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <div style={{ marginTop: 16 }}>
            <button
              onClick={handleGenerateThumbnail}
              disabled={generatingThumb || !thumbTitle.trim()}
              style={{ ...btnPrimary, opacity: generatingThumb ? 0.6 : 1 }}
            >
              {generatingThumb ? <Loader size={14} className="spin" /> : <Image size={14} />}
              Generate Thumbnail
            </button>
          </div>

          {/* Prompt used */}
          {thumbPromptUsed && (
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Generation Prompt Used</label>
              <div style={{
                background: '#f8f9fc', border: '1px solid #e5e7ef', borderRadius: 8, padding: 10,
                fontSize: 12, color: '#5a5a6e', lineHeight: 1.5,
              }}>
                {thumbPromptUsed}
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail results */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Generated Thumbnails ({thumbnails.length})</div>

          {thumbnails.length === 0 && (
            <div style={{ textAlign: 'center', padding: 30, color: '#8e8ea0' }}>
              <Image size={32} strokeWidth={1} />
              <div style={{ marginTop: 8, fontSize: 13 }}>No thumbnails yet. Generate one above.</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {thumbnails.map(t => (
              <div key={t.id} style={{ border: '1px solid #e5e7ef', borderRadius: 10, overflow: 'hidden', background: '#fafbfe' }}>
                {t.image_url && (
                  <img src={t.image_url} alt={t.title || 'thumbnail'} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
                )}
                <div style={{ padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a2e', marginBottom: 4 }}>{t.title || 'Untitled'}</div>
                  <div style={{ fontSize: 11, color: '#8e8ea0', marginBottom: 8 }}>
                    {t.model && <span>{t.model}</span>}
                    {t.created_at && <span> &middot; {new Date(t.created_at).toLocaleDateString()}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {t.image_url && (
                      <a href={t.image_url} target="_blank" rel="noreferrer" style={{ ...btnSecondary, padding: '4px 8px', fontSize: 11, textDecoration: 'none' }}>
                        <ExternalLink size={11} /> Open
                      </a>
                    )}
                    <button onClick={() => handleDeleteThumbnail(t.id)} style={{ ...btnDanger, padding: '4px 8px', fontSize: 11 }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // TAB: PACKAGES
  // ══════════════════════════════════════════════════════════════

  function renderPackagesTab() {
    const packages = getPackages();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={cardStyle}>
          <div style={sectionTitle}>Completed Packages ({packages.length})</div>

          {packages.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#8e8ea0' }}>
              <Download size={36} strokeWidth={1} />
              <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>No packages yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Complete a script package from the Scripts tab to see it here.</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {packages.map(pkg => {
              const tags = Array.isArray(pkg.yt_tags) ? pkg.yt_tags : (pkg.yt_tags ? String(pkg.yt_tags).split(',').map(t => t.trim()) : []);
              const matchingThumb = thumbnails.find(t => t.script_id === pkg.id);

              return (
                <div key={pkg.id} style={{ border: '1px solid #e5e7ef', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                  <div style={{ display: 'flex', gap: 16, padding: 20, flexWrap: 'wrap' }}>
                    {/* Thumbnail preview */}
                    {matchingThumb?.image_url && (
                      <img
                        src={matchingThumb.image_url}
                        alt="thumb"
                        style={{ width: 200, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                      />
                    )}

                    <div style={{ flex: 1, minWidth: 200 }}>
                      {/* YT Title */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Play size={16} color="#ef4444" />
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{pkg.yt_title}</span>
                        <button onClick={() => copyToClipboard(pkg.yt_title)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}>
                          <Copy size={13} />
                        </button>
                      </div>

                      {/* Description */}
                      {pkg.yt_description && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <label style={{ ...labelStyle, marginBottom: 0 }}>Description</label>
                            <button onClick={() => copyToClipboard(pkg.yt_description)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}>
                              <Copy size={11} />
                            </button>
                          </div>
                          <div style={{
                            fontSize: 12, color: '#5a5a6e', lineHeight: 1.5, maxHeight: 80, overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {pkg.yt_description}
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <label style={{ ...labelStyle, marginBottom: 0 }}>Tags</label>
                            <button onClick={() => copyToClipboard(tags.join(', '))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}>
                              <Copy size={11} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {tags.map((tag, i) => (
                              <span key={i} style={{
                                padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                background: '#f0f0f5', color: '#5a5a6e',
                              }}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Export */}
                      <button onClick={() => exportPackage(pkg)} style={btnPrimary}>
                        <Copy size={13} /> Export to Clipboard
                      </button>
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
}
