import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Play, Mic, FileText, X, ExternalLink } from 'lucide-react';

// Photos, videos and files on an iMessage bubble. The API puts them on a
// message row as attachments: [{ url, type: 'image'|'video'|'audio'|'file',
// name, mime, size, width, height }]. Images render inline and open full size
// in the lightbox; everything else is a tile that opens the file in a new tab.

// What a text with only media reads as in the conversation list.
export function mediaLabel(atts) {
  const types = (Array.isArray(atts) ? atts : []).map(a => a && a.type);
  if (!types.length) return '';
  if (types.every(t => t === 'image')) return types.length === 1 ? 'Photo' : `${types.length} photos`;
  if (types.every(t => t === 'video')) return types.length === 1 ? 'Video' : `${types.length} videos`;
  if (types.every(t => t === 'audio')) return 'Voice memo';
  return 'Attachment';
}

// Fit an image inside a box while keeping its shape. Without dimensions we
// fall back to a 4:3 placeholder box so the bubble does not jump on load.
function mediaBox(w, h, max = 260) {
  if (!w || !h) return { width: max, height: Math.round(max * 0.75) };
  const r = Math.min(max / w, max / h, 1);
  return { width: Math.max(140, Math.round(w * r)), height: Math.max(100, Math.round(h * r)) };
}

export default function MessageAttachments({ items, out, onOpenImage }) {
  const list = Array.isArray(items) ? items.filter(a => a && a.url) : [];
  if (!list.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: out ? 'flex-end' : 'flex-start', marginBottom: 4 }}>
      {list.map((a, i) => a.type === 'image' ? (
        <button key={i} onClick={() => onOpenImage && onOpenImage(a.url)} title="Open full size"
          style={{ padding: 0, border: out ? 'none' : '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', cursor: 'zoom-in', background: 'var(--surface-2)', lineHeight: 0, display: 'block' }}>
          <img src={a.url} alt={a.name || 'Photo'} loading="lazy"
            style={{ ...mediaBox(a.width, a.height), objectFit: 'cover', display: 'block' }} />
        </button>
      ) : (
        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
          title={a.type === 'video' ? 'Play video' : 'Open file'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', width: 220, boxSizing: 'border-box',
            height: a.type === 'video' ? 120 : 56, padding: '0 14px', borderRadius: 14,
            background: out ? 'var(--orange)' : 'var(--surface-2)', border: out ? 'none' : '1px solid var(--border)',
            color: out ? '#fff' : 'var(--text)',
          }}>
          <span style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: out ? 'rgba(255,255,255,0.22)' : 'var(--surface)', border: out ? 'none' : '1px solid var(--border)' }}>
            {a.type === 'video' ? <Play size={17} /> : a.type === 'audio' ? <Mic size={17} /> : <FileText size={17} />}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.type === 'video' ? 'Video' : a.type === 'audio' ? 'Voice memo' : (a.name || 'File')}
          </span>
        </a>
      ))}
    </div>
  );
}

// Full screen photo. Click anywhere or press escape to close.
export function Lightbox({ url, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!url || typeof document === 'undefined') return null;
  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <img src={url} alt="" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '84vh', objectFit: 'contain', borderRadius: 10 }} />
      <button onClick={onClose} title="Close (esc)"
        style={{ position: 'absolute', top: 20, right: 22, width: 40, height: 40, borderRadius: '50%', cursor: 'pointer', border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={19} />
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 26, left: '50%', transform: 'translateX(-50%)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
        <ExternalLink size={14} /> Open in a new tab
      </a>
    </div>,
    document.body
  );
}
