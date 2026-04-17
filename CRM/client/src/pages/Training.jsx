import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  PlayCircle, Upload, Edit2, Trash2, Check, X, Loader,
  BookOpen, Clock, ChevronLeft, Plus, Video, Search, Lock,
} from 'lucide-react';
import { getTrainingVideos, getTrainingUploadUrl, createTrainingVideo, updateTrainingVideo, deleteTrainingVideo, saveTrainingProgress } from '../api';
import { useTeam } from '../context/TeamContext';

const CATEGORIES = ['General', 'Onboarding', 'Tools', 'Processes', 'Sales', 'Other'];

const CAT_COLORS = {
  General:    { bg: '#4a6cf722', fg: '#4a6cf7' },
  Onboarding: { bg: '#00d1d122', fg: '#00a8a8' },
  Tools:      { bg: '#784bd122', fg: '#784bd1' },
  Processes:  { bg: '#fdab3d22', fg: '#d97706' },
  Sales:      { bg: '#4a6cf722', fg: '#22c55e' },
  Other:      { bg: '#e5e7ef',   fg: '#8e8ea0' },
};

function formatDuration(secs) {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationMins(secs) {
  if (!secs) return null;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s > 0 ? s + 's' : ''}`.trim() : `${s}s`;
}

function isYouTube(url) { return /youtu\.?be/.test(url); }
function isVimeo(url)   { return /vimeo\.com/.test(url); }

function getEmbedUrl(url) {
  if (isYouTube(url)) {
    const match = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=1` : url;
  }
  if (isVimeo(url)) {
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}?autoplay=1` : url;
  }
  return null;
}

// ── Video Card ─────────────────────────────────────────────────────────────────
function VideoCard({ video, onClick, onEdit, onDelete, isOwner }) {
  const progress   = video.progress;
  const pct        = (progress && video.duration_seconds > 0)
    ? Math.min(100, Math.round((progress.watched_seconds / video.duration_seconds) * 100))
    : 0;
  const completed  = progress?.completed;
  const catStyle   = CAT_COLORS[video.category] || CAT_COLORS.Other;

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', border: '1px solid #e5e7ef', borderRadius: 12,
        overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(74,108,247,0.13)'; e.currentTarget.style.borderColor = '#4a6cf740'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e5e7ef'; }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 140, background: 'linear-gradient(135deg, #1a1a2e 0%, #0a0a12 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        {video.thumbnail_url ? (
          <img src={video.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        ) : (
          <Video size={36} color="#4a6cf750" />
        )}
        {completed && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: '#22c55e', borderRadius: '50%',
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Check size={13} color="#fff" strokeWidth={3} />
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0, transition: 'opacity 0.15s', background: 'rgba(0,0,0,0.35)',
        }}
          className="card-play-overlay"
        >
          <PlayCircle size={44} color="#fff" />
        </div>
        {video.duration_seconds > 0 && (
          <div style={{
            position: 'absolute', bottom: 6, right: 8,
            background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 4,
          }}>
            {formatDuration(video.duration_seconds)}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {pct > 0 && (
        <div style={{ height: 3, background: '#e5e7ef' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: completed ? '#22c55e' : '#4a6cf7', transition: 'width 0.3s' }} />
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a2e', lineHeight: 1.3, flex: 1 }}>
            {video.title}
          </div>
          {isOwner && (
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => onEdit(video)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#8e8ea0', borderRadius: 4 }}
                title="Edit"
              >
                <Edit2 size={12} />
              </button>
              <button
                onClick={() => onDelete(video)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: '#ff5c5c', borderRadius: 4 }}
                title="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
        {video.description && (
          <div style={{ fontSize: 11, color: '#8e8ea0', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {video.description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: catStyle.bg, color: catStyle.fg }}>
            {video.category}
          </span>
          {pct > 0 && !completed && (
            <span style={{ fontSize: 10, color: '#8e8ea0' }}>{pct}% watched</span>
          )}
          {completed && (
            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>✓ Completed</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Video Player Modal ─────────────────────────────────────────────────────────
function PlayerModal({ video, onClose, onProgressSave }) {
  const videoRef    = useRef(null);
  const saveTimerRef = useRef(null);
  const embedUrl    = getEmbedUrl(video.video_url);
  const isEmbed     = !!embedUrl;

  const saveProgress = useCallback(async (el) => {
    if (!el || isEmbed) return;
    const watched  = Math.floor(el.currentTime);
    const total    = Math.floor(el.duration) || video.duration_seconds || 1;
    const completed = (watched / total) >= 0.9;
    try {
      await saveTrainingProgress({ video_id: video.id, watched_seconds: watched, completed });
      onProgressSave(video.id, watched, completed);
    } catch { /* silent */ }
  }, [video.id, isEmbed]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const handleTime = () => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveProgress(el), 30000);
    };
    const handleEnded = () => saveProgress(el);
    const handlePause = () => saveProgress(el);

    el.addEventListener('timeupdate', handleTime);
    el.addEventListener('ended', handleEnded);
    el.addEventListener('pause', handlePause);
    return () => {
      el.removeEventListener('timeupdate', handleTime);
      el.removeEventListener('ended', handleEnded);
      el.removeEventListener('pause', handlePause);
      clearTimeout(saveTimerRef.current);
      saveProgress(el);
    };
  }, [saveProgress]);

  // Restore position
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video.progress?.watched_seconds) return;
    const pct = video.duration_seconds > 0 ? video.progress.watched_seconds / video.duration_seconds : 0;
    if (pct < 0.95) el.currentTime = video.progress.watched_seconds;
  }, []);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#0a0a12', borderRadius: 14, width: '100%', maxWidth: 900, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #1e1e2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {video.title}
            </div>
            {video.description && (
              <div style={{ fontSize: 11, color: '#6b6b80', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {video.description}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {video.duration_seconds > 0 && (
              <span style={{ fontSize: 11, color: '#6b6b80', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} /> {formatDurationMins(video.duration_seconds)}
              </span>
            )}
            <button onClick={onClose} style={{ background: '#1e1e2e', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#6b6b80', padding: '5px 8px', display: 'flex', alignItems: 'center' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Player */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {isEmbed ? (
            <iframe
              src={embedUrl}
              style={{ width: '100%', aspectRatio: '16/9', border: 'none', display: 'block' }}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <video
              ref={videoRef}
              src={video.video_url}
              controls
              autoPlay
              style={{ width: '100%', aspectRatio: '16/9', display: 'block', background: '#000' }}
            />
          )}

          {/* Details */}
          <div style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => { const c = CAT_COLORS[video.category] || CAT_COLORS.Other; return (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: c.bg, color: c.fg }}>
                  {video.category}
                </span>
              ); })()}
              {video.progress?.completed && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Check size={12} strokeWidth={3} /> Completed
                </span>
              )}
            </div>
            {video.description && (
              <p style={{ fontSize: 13, color: '#8e8ea0', lineHeight: 1.6, marginTop: 10 }}>{video.description}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Upload / Edit Modal ────────────────────────────────────────────────────────
function VideoFormModal({ existing, onClose, onSave }) {
  const [title,        setTitle]       = useState(existing?.title || '');
  const [description,  setDesc]        = useState(existing?.description || '');
  const [category,     setCategory]    = useState(existing?.category || 'General');
  const [urlInput,     setUrlInput]    = useState('');
  const [file,         setFile]        = useState(null);
  const [uploading,    setUploading]   = useState(false);
  const [uploadPct,    setUploadPct]   = useState(0);
  const [error,        setError]       = useState('');
  const fileRef = useRef();

  const isEdit = !!existing;

  async function handleSave() {
    if (!title.trim()) return setError('Title is required');
    setError('');
    setUploading(true);
    try {
      if (isEdit) {
        const updated = await updateTrainingVideo(existing.id, { title, description, category });
        onSave(updated);
      } else {
        let videoUrl = null;
        let path = null;

        if (file) {
          // Upload file via signed URL
          const { signedUrl, publicUrl, path: p } = await getTrainingUploadUrl(file.name);
          // Upload with XMLHttpRequest for progress
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.upload.onprogress = e => { if (e.lengthComputable) setUploadPct(Math.round(e.loaded / e.total * 100)); };
            xhr.onload  = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
            xhr.onerror = () => reject(new Error('Upload failed'));
            xhr.open('PUT', signedUrl);
            xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
            xhr.send(file);
          });
          videoUrl = publicUrl;
          path = p;
        } else if (urlInput.trim()) {
          videoUrl = urlInput.trim();
        } else {
          return setError('Please select a file or enter a URL');
        }

        const created = await createTrainingVideo({ title, description, category, video_url: videoUrl, path });
        onSave(created);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
    color: '#1a1a2e', background: '#f5f7fa', border: '1px solid #e5e7ef',
    outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={16} color="#4a6cf7" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a2e' }}>{isEdit ? 'Edit Video' : 'Upload Training Video'}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8e8ea0' }}><X size={17} /></button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ background: '#ff5c5c15', border: '1px solid #ff5c5c40', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: '#ff5c5c' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>Title *</label>
            <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. How to use the CRM" autoFocus />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>Description</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: 70 }}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="What will admins learn from this video?"
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>Category</label>
            <select style={inputStyle} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {!isEdit && (
            <>
              {/* File upload */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>Upload Video File</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/*"
                  style={{ display: 'none' }}
                  onChange={e => { setFile(e.target.files[0] || null); setUrlInput(''); }}
                />
                <button
                  onClick={() => fileRef.current.click()}
                  style={{
                    width: '100%', padding: '28px 16px', borderRadius: 10, border: '2px dashed #d1d5db',
                    background: file ? '#4a6cf710' : '#f9fafb', cursor: 'pointer', display: 'flex',
                    flexDirection: 'column', alignItems: 'center', gap: 8, color: '#6b7280',
                    borderColor: file ? '#4a6cf7' : '#d1d5db', transition: 'all 0.15s',
                  }}
                >
                  <Upload size={22} color={file ? '#4a6cf7' : '#9ca3af'} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: file ? '#4a6cf7' : '#374151' }}>
                    {file ? file.name : 'Click to choose a video file'}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>MP4, WebM, MOV up to 5 GB</span>
                </button>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 1, background: '#e5e7ef' }} />
                <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>OR PASTE A URL</span>
                <div style={{ flex: 1, height: 1, background: '#e5e7ef' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 5 }}>YouTube / Vimeo / Direct URL</label>
                <input
                  style={inputStyle}
                  value={urlInput}
                  onChange={e => { setUrlInput(e.target.value); setFile(null); }}
                  placeholder="https://youtube.com/watch?v=... or direct video URL"
                />
              </div>
            </>
          )}

          {/* Upload progress */}
          {uploading && uploadPct > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#6b7280' }}>Uploading…</span>
                <span style={{ fontSize: 11, color: '#4a6cf7', fontWeight: 700 }}>{uploadPct}%</span>
              </div>
              <div style={{ height: 6, background: '#e5e7ef', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${uploadPct}%`, background: '#4a6cf7', borderRadius: 3, transition: 'width 0.2s' }} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e5e7ef', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={uploading}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: '#4a6cf7', color: '#fff', fontSize: 13, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: uploading ? 0.7 : 1 }}
          >
            {uploading ? <><Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Uploading…</> : isEdit ? 'Save Changes' : 'Add Video'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Training() {
  const { isOwner } = useTeam();
  const [videos,       setVideos]      = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState('');
  const [activeTab,    setActiveTab]   = useState('All');
  const [playing,      setPlaying]     = useState(null);
  const [showForm,     setShowForm]    = useState(false);
  const [editVideo,    setEditVideo]   = useState(null);
  const [toast,        setToast]       = useState('');

  useEffect(() => {
    getTrainingVideos()
      .then(setVideos)
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  async function handleDelete(video) {
    if (!window.confirm(`Delete "${video.title}"? This cannot be undone.`)) return;
    try {
      await deleteTrainingVideo(video.id);
      setVideos(prev => prev.filter(v => v.id !== video.id));
      showToast('Video deleted');
    } catch (e) { showToast('Error: ' + e.message); }
  }

  function handleSave(saved) {
    setVideos(prev => {
      const idx = prev.findIndex(v => v.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = { ...prev[idx], ...saved }; return next; }
      return [...prev, saved];
    });
    setShowForm(false);
    setEditVideo(null);
    showToast(editVideo ? 'Video updated' : 'Video added');
  }

  function handleProgressSave(videoId, watchedSecs, completed) {
    setVideos(prev => prev.map(v => v.id === videoId
      ? { ...v, progress: { ...(v.progress || {}), watched_seconds: watchedSecs, completed } }
      : v
    ));
  }

  // Categories present in library
  const presentCats = ['All', ...CATEGORIES.filter(c => videos.some(v => v.category === c))];

  const filtered = videos.filter(v => {
    const matchCat = activeTab === 'All' || v.category === activeTab;
    const q = search.toLowerCase();
    const matchSearch = !q || v.title.toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const totalVideos    = videos.length;
  const completedCount = videos.filter(v => v.progress?.completed).length;
  const inProgressCount = videos.filter(v => v.progress?.watched_seconds > 0 && !v.progress?.completed).length;

  return (
    <div style={{ padding: 24, minHeight: '100%', background: '#f5f7fa' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BookOpen size={22} color="#4a6cf7" />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e' }}>Training</div>
            <div style={{ fontSize: 12, color: '#8e8ea0' }}>Internal video library for the team</div>
          </div>
        </div>
        {isOwner && (
          <button
            onClick={() => { setEditVideo(null); setShowForm(true); }}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '9px 16px' }}
          >
            <Plus size={14} /> Add Video
          </button>
        )}
      </div>

      {/* ── Stats bar ── */}
      {totalVideos > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Total Videos', value: totalVideos, color: '#4a6cf7' },
            { label: 'Completed',    value: completedCount, color: '#22c55e' },
            { label: 'In Progress',  value: inProgressCount, color: '#fdab3d' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #e5e7ef', borderRadius: 10, padding: '12px 18px', flex: '1 1 120px', minWidth: 120 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: '#8e8ea0', marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Search + Category tabs ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7ef', borderRadius: 12, marginBottom: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7ef', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#8e8ea0' }} />
            <input
              style={{ width: '100%', padding: '7px 10px 7px 30px', borderRadius: 7, fontSize: 13, color: '#1a1a2e', background: '#f5f7fa', border: '1px solid #e5e7ef', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Search videos…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {presentCats.map(cat => {
              const active = activeTab === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
                    cursor: 'pointer', border: `1px solid ${active ? '#4a6cf7' : '#e5e7ef'}`,
                    background: active ? '#4a6cf7' : '#fff', color: active ? '#fff' : '#6b7280',
                    transition: 'all 0.12s',
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Video grid ── */}
        <div style={{ padding: 16 }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: '#8e8ea0', gap: 10 }}>
              <Loader size={18} style={{ animation: 'spin 0.7s linear infinite' }} /> Loading videos…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8e8ea0' }}>
              <Video size={40} style={{ opacity: 0.2, marginBottom: 14 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                {totalVideos === 0 ? 'No training videos yet' : 'No videos match your search'}
              </div>
              {isOwner && totalVideos === 0 && (
                <button
                  onClick={() => setShowForm(true)}
                  style={{ marginTop: 12, padding: '9px 20px', borderRadius: 8, background: '#4a6cf7', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  + Upload First Video
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {filtered.map(video => (
                <VideoCard
                  key={video.id}
                  video={video}
                  isOwner={isOwner}
                  onClick={() => setPlaying(video)}
                  onEdit={v => { setEditVideo(v); setShowForm(true); }}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Player Modal ── */}
      {playing && (
        <PlayerModal
          video={playing}
          onClose={() => setPlaying(null)}
          onProgressSave={handleProgressSave}
        />
      )}

      {/* ── Upload / Edit Modal ── */}
      {showForm && (
        <VideoFormModal
          existing={editVideo}
          onClose={() => { setShowForm(false); setEditVideo(null); }}
          onSave={handleSave}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
          background: '#fff', border: '1px solid #4a6cf7', color: '#1a1a2e',
          padding: '10px 20px', borderRadius: 8, fontSize: 13, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Check size={14} color="#4a6cf7" /> {toast}
        </div>
      )}

      <style>{`
        .card-play-overlay { opacity: 0 !important; }
        div:hover > .card-play-overlay { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
