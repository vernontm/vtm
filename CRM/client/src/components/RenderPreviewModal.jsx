import React, { useEffect, useState } from 'react';
import { X, Calendar, Loader, ExternalLink, Copy, Check } from 'lucide-react';
import { getContentClients, scheduleRender } from '../api';

const STATUS_PILL = {
  draft:              { bg: '#f0f0f5', text: '#8e8ea0', label: 'Draft' },
  pending:            { bg: '#e0f2fe', text: '#0284c7', label: 'Queued' },
  generating_audio:   { bg: '#fef3c7', text: '#a16207', label: 'Generating audio…' },
  generating_clips:   { bg: '#fde68a', text: '#ca8a04', label: 'HeyGen clips…' },
  stitching:          { bg: '#e9d5ff', text: '#7c3aed', label: 'Stitching…' },
  done:               { bg: '#dcfce7', text: '#15803d', label: 'Done' },
  failed:             { bg: '#fee2e2', text: '#dc2626', label: 'Failed' },
};

export default function RenderPreviewModal({ render, avatar, onClose, onScheduled, onDelete }) {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [caption, setCaption] = useState(render.script || '');
  const [hashtags, setHashtags] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(!!render.scheduled_post_id);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getContentClients().then(setClients).catch(() => {});
  }, []);

  async function handleSchedule() {
    if (!clientId) return setError('Pick a client');
    setScheduling(true); setError('');
    try {
      await scheduleRender(render.id, { client_id: clientId, caption, hashtags });
      setScheduled(true);
      onScheduled?.();
    } catch (e) { setError(e.message); }
    finally { setScheduling(false); }
  }

  async function copyUrl() {
    if (!render.final_video_url) return;
    try { await navigator.clipboard.writeText(render.final_video_url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  const pill = STATUS_PILL[render.status] || STATUS_PILL.draft;
  const done = render.status === 'done' && render.final_video_url;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: 900, width: '90vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>
              {render.title || 'Untitled render'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {avatar?.name} · {new Date(render.created_at).toLocaleString()}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: pill.bg, color: pill.text, padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
              {pill.label}
            </span>
            <button onClick={onClose} className="btn-ghost" style={{ padding: 4 }}><X size={16} /></button>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 10px', color: '#fca5a5', fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        {render.status === 'failed' && render.error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 12px', color: '#fca5a5', fontSize: 12, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Render failed</div>
            {render.error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: done ? '360px 1fr' : '1fr', gap: 18 }}>
          {done && (
            <video controls src={render.final_video_url}
              style={{ width: '100%', borderRadius: 10, background: '#000', aspectRatio: '9 / 16' }} />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {done && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <a href={render.final_video_url} target="_blank" rel="noreferrer"
                  className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  <ExternalLink size={11} /> Open in new tab
                </a>
                <button onClick={copyUrl} className="btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy URL'}
                </button>
                {render.duration_secs && (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {render.duration_secs.toFixed(1)}s</span>
                )}
              </div>
            )}

            <div>
              <Label>Script</Label>
              <div style={{ ...box, maxHeight: 140, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {render.script}
              </div>
            </div>

            {render.status !== 'done' && render.status !== 'failed' && (
              <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
                  <Loader size={13} className="spin" />
                  The local render worker on your Mac will pick this up. Keep <code style={{ background: 'var(--surface-3)', padding: '1px 6px', borderRadius: 4 }}>npm run dev</code> running in CRM/server.
                </div>
              </div>
            )}

            {done && !scheduled && (
              <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Schedule under a client</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                  <div>
                    <Label>Content client</Label>
                    <select value={clientId} onChange={e => setClientId(e.target.value)} style={input}>
                      <option value="">— pick a client —</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.business_name || c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Caption</Label>
                    <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={3}
                      style={{ ...input, resize: 'vertical' }} />
                  </div>
                  <div>
                    <Label>Hashtags</Label>
                    <input value={hashtags} onChange={e => setHashtags(e.target.value)} style={input}
                      placeholder="#mindset #ai #trading" />
                  </div>
                  <button onClick={handleSchedule} disabled={scheduling || !clientId}
                    className="btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center', opacity: (scheduling || !clientId) ? 0.5 : 1, marginTop: 4 }}>
                    {scheduling ? <Loader size={13} className="spin" /> : <Calendar size={13} />}
                    {scheduling ? 'Scheduling...' : 'Add to Content → Scheduler'}
                  </button>
                </div>
              </div>
            )}

            {scheduled && (
              <div style={{ padding: 12, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center', color: '#22c55e', fontSize: 12 }}>
                <Check size={14} /> Added to the Content Scheduler under this client. Open the Content page to set a post time.
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <button onClick={onDelete} className="btn-ghost" style={{ color: '#f87171', fontSize: 12 }}>
            Delete render
          </button>
          <button onClick={onClose} className="btn-ghost">Close</button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 5 }}>{children}</div>;
}

const input = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  background: 'var(--surface-3)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12,
  fontFamily: 'var(--font-display)', outline: 'none',
};

const box = {
  padding: '10px 12px', borderRadius: 8,
  background: 'var(--surface-3)', border: '1px solid var(--border)',
  color: 'var(--text)',
};
