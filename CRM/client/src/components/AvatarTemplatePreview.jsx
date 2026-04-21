import React, { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { getLooks } from '../api';

// Renders a 9:16 preview of how the avatar's template will look on video:
//   - one of the avatar's looks as the background
//   - logo overlaid at the correct corner + size
//   - a sample caption styled by caption_style (2-3 words highlighted)
//
// Live-updates from the editor draft — doesn't refetch when text fields change.

export default function AvatarTemplatePreview({ avatar, draft, previewWidth = 240 }) {
  const [looks, setLooks] = useState([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getLooks(avatar.id).then(rows => {
      if (!cancelled) { setLooks(rows || []); setIdx(0); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [avatar.id]);

  const look = looks[idx] || null;
  const w = previewWidth;
  const h = Math.round(w * 16 / 9);

  // Scale from 1080-wide source to the preview width so on-video sizes map visually.
  const scale = w / 1080;

  const cap = draft?.caption_style || {};
  const logoPos = draft?.logo_position || 'tr';
  const logoSize = draft?.logo_size_pct ?? 12;
  const logoPx = Math.round(w * (logoSize / 100));
  const pad = Math.round(32 * scale);

  // Build a sample caption chunk that respects words_per_chunk
  const sampleText = useMemo(() => {
    const wpc = Math.max(1, cap.words_per_chunk || 2);
    const pool = ['THIS', 'IS', 'YOUR', 'CAPTION', 'LIVE', 'PREVIEW'];
    return pool.slice(0, wpc).join(' ');
  }, [cap.words_per_chunk]);

  const logoStyle = (() => {
    const base = { position: 'absolute', width: logoPx, height: 'auto', pointerEvents: 'none' };
    if (logoPos === 'tl') return { ...base, top: pad,           left: pad };
    if (logoPos === 'tr') return { ...base, top: pad,           right: pad };
    if (logoPos === 'bl') return { ...base, bottom: pad,        left: pad };
    return                      { ...base, bottom: pad,         right: pad };
  })();

  const captionY = (cap.y_position ?? 0.75) * h;
  const captionFontPx = Math.max(8, Math.round((cap.size || 64) * scale));
  const strokeWidth = Math.max(1, Math.round((cap.stroke_width ?? 6) * scale));
  // Text shadow layers approximate an outline
  const outline = cap.stroke || '#000000';
  const textShadow = [
    `-${strokeWidth}px -${strokeWidth}px 0 ${outline}`,
    `${strokeWidth}px -${strokeWidth}px 0 ${outline}`,
    `-${strokeWidth}px ${strokeWidth}px 0 ${outline}`,
    `${strokeWidth}px ${strokeWidth}px 0 ${outline}`,
    `0 ${strokeWidth}px 0 ${outline}`,
    `0 -${strokeWidth}px 0 ${outline}`,
    `${strokeWidth}px 0 0 ${outline}`,
    `-${strokeWidth}px 0 0 ${outline}`,
  ].join(', ');

  const words = sampleText.split(' ');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)' }}>
          <Eye size={13} /> Live preview
        </div>
        {looks.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setIdx(i => (i - 1 + looks.length) % looks.length)} style={nav}>
              <ChevronLeft size={12} />
            </button>
            <button onClick={() => setIdx(i => (i + 1) % looks.length)} style={nav}>
              <ChevronRight size={12} />
            </button>
          </div>
        )}
      </div>

      <div style={{
        width: w, height: h, position: 'relative', borderRadius: 10, overflow: 'hidden',
        background: 'var(--surface-3)', margin: '0 auto',
        border: '1px solid var(--border)',
      }}>
        {look ? (
          <img src={look.image_url} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--muted)', fontSize: 11, textAlign: 'center', padding: 14,
          }}>
            No looks yet —<br />import some to preview
          </div>
        )}

        {/* Logo overlay */}
        {draft?.logo_url && (
          <img src={draft.logo_url} alt="logo" style={logoStyle} />
        )}

        {/* Caption overlay */}
        {look && (
          <div style={{
            position: 'absolute', left: 0, right: 0,
            top: captionY, transform: 'translateY(-50%)',
            textAlign: 'center',
            fontFamily: `${cap.font || 'Montserrat'}, var(--font-display, sans-serif)`,
            fontWeight: 900, letterSpacing: '0.01em',
            fontSize: captionFontPx,
            lineHeight: 1.05,
            padding: `0 ${Math.round(40 * scale)}px`,
            color: cap.color || '#FFFFFF',
            textShadow,
            pointerEvents: 'none',
          }}>
            {words.map((wd, i) => (
              <span key={i} style={{
                color: i === 0 ? (cap.highlight || '#ff9b26') : (cap.color || '#FFFFFF'),
                marginRight: i < words.length - 1 ? '0.35em' : 0,
              }}>{wd}</span>
            ))}
          </div>
        )}
      </div>

      {look && (
        <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 6, opacity: 0.75 }}>
          angle {idx + 1} / {looks.length}
        </div>
      )}
    </div>
  );
}

const nav = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
  background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--muted)', padding: 0,
};
