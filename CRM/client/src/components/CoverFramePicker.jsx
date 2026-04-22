import React, { useRef, useState, useEffect } from 'react';

/**
 * CoverFramePicker
 * Video player + scrubber so the user can pick an exact cover frame.
 * Also exposes a Y-offset slider: which slice of the 9:16 frame will show
 * in Instagram / TikTok's 1:1 grid thumbnail. A live 1:1 overlay on the
 * video preview shows exactly what's visible inside the grid crop.
 *
 * onChange is called with either a plain `ms` value (legacy, when offsetY
 * hasn't moved from the default 0.5) or `{ ms, offsetY }` once the user
 * touches the Y-offset slider.
 *
 * `initialMs` seeds the initial timestamp.
 * `initialOffsetY` seeds the initial vertical crop center (0 = top, 1 = bottom, default 0.5).
 */
export default function CoverFramePicker({ videoUrl, onChange, initialMs = null, initialOffsetY = 0.5 }) {
  const videoRef = useRef(null);
  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(initialMs != null ? initialMs / 1000 : 0);
  const [enabled,     setEnabled]     = useState(initialMs != null);
  const [loaded,      setLoaded]      = useState(false);
  const [offsetY,     setOffsetY]     = useState(initialOffsetY);
  const [videoMeta,   setVideoMeta]   = useState({ w: 1080, h: 1920 }); // for computing overlay aspect

  // Notify parent on change. Stays backward-compatible: emit plain ms when
  // offsetY is the default 0.5 (center), else emit { ms, offsetY }.
  useEffect(() => {
    if (!enabled) { onChange(null); return; }
    const ms = Math.round(currentTime * 1000);
    // Pass both — parents that only care about ms can read payload?.ms ?? payload
    onChange({ ms, offsetY });
  }, [enabled, currentTime, offsetY, onChange]);

  function handleMetadata() {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration || 0);
    setLoaded(true);
    setVideoMeta({ w: v.videoWidth || 1080, h: v.videoHeight || 1920 });
    // If we have an initialMs, seek the preview to it once metadata loads
    if (initialMs != null) {
      v.currentTime = initialMs / 1000;
    }
  }

  function handleScrub(e) {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  // Keep slider in sync when video plays
  function handleTimeUpdate() {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }

  function fmt(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${ms}`;
  }

  const autoSet = initialMs != null;

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Toggle */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: enabled ? 12 : 0,
      }}>
        <div
          onClick={() => setEnabled(v => !v)}
          style={{
            width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: 'pointer',
            background: enabled ? 'var(--orange)' : '#d1d5db',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: enabled ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
        Set cover frame
        {autoSet && enabled && (
          <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 500 }}>· auto-set to first word</span>
        )}
      </label>

      {enabled && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
          background: '#000',
        }}>
          {/* Video preview with 1:1 grid-crop overlay */}
          <div style={{
            position: 'relative', background: '#000',
            display: 'flex', justifyContent: 'center',
          }}>
            {/* Constrain preview to the video's natural aspect so overlay math is correct */}
            <div style={{
              position: 'relative', height: 260,
              aspectRatio: `${videoMeta.w} / ${videoMeta.h}`,
              maxWidth: '100%',
            }}>
              <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={handleMetadata}
                onTimeUpdate={handleTimeUpdate}
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
                preload="metadata"
                muted
              />
              {/* 1:1 crop overlay — shows what will be visible in the platform grid */}
              {loaded && (() => {
                // For a portrait 9:16 video rendered at height H, the 1:1 crop
                // is a square of side = frame_width. In a full-width preview
                // that square is always the full width (width == height of a
                // square-cropped slice). The crop center shifts by offsetY
                // within the rendered video height.
                const sidePct = 100 * (videoMeta.w / videoMeta.h); // width % for square crop (for portrait this is < 100)
                const cropH = sidePct; // as % of height (a 1:1 box matching full width)
                const cropTop = offsetY * 100 - cropH / 2;
                const clampedTop = Math.max(0, Math.min(100 - cropH, cropTop));
                return (
                  <>
                    {/* Darken outside the crop */}
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: `${clampedTop}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, top: `${clampedTop + cropH}%`, bottom: 0, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
                    {/* Crop frame */}
                    <div style={{
                      position: 'absolute', left: 0, right: 0,
                      top: `${clampedTop}%`, height: `${cropH}%`,
                      border: '2px solid var(--orange)',
                      boxShadow: '0 0 0 1px rgba(0,0,0,0.6) inset',
                      pointerEvents: 'none',
                    }}>
                      <div style={{
                        position: 'absolute', top: -20, left: 4,
                        fontSize: 10, fontWeight: 700, color: 'var(--orange)',
                        background: '#0a0a0c', padding: '2px 6px', borderRadius: 4,
                      }}>GRID 1:1</div>
                    </div>
                  </>
                );
              })()}
            </div>
            {!loaded && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: 'var(--muted)', fontSize: 12,
              }}>
                Loading video…
              </div>
            )}
          </div>

          {/* Timestamp scrubber */}
          <div style={{ padding: '10px 14px 6px', background: '#18181b' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a1a1aa', marginBottom: 4 }}>
              Timestamp
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleScrub}
              disabled={!loaded}
              style={{
                width: '100%', accentColor: 'var(--orange)', cursor: loaded ? 'pointer' : 'not-allowed',
                height: 4, marginBottom: 4,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#a1a1aa', fontFamily: 'monospace' }}>
                {fmt(currentTime)}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: 'var(--orange)',
                background: '#1e2a5e', padding: '2px 8px', borderRadius: 4,
              }}>
                Cover @ {fmt(currentTime)} ({Math.round(currentTime * 1000)} ms)
              </span>
              <span style={{ fontSize: 12, color: '#71717a', fontFamily: 'monospace' }}>
                {fmt(duration)}
              </span>
            </div>
          </div>

          {/* Y-offset scrubber — controls the 1:1 grid crop position */}
          <div style={{ padding: '6px 14px 12px', background: '#18181b', borderTop: '1px solid #27272a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#a1a1aa' }}>
                Grid crop position
              </span>
              <span style={{ fontSize: 10, color: '#71717a' }}>
                {offsetY <= 0.35 ? 'Top' : offsetY >= 0.65 ? 'Bottom' : 'Center'} · {Math.round(offsetY * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={offsetY}
              onChange={e => setOffsetY(parseFloat(e.target.value))}
              disabled={!loaded}
              style={{
                width: '100%', accentColor: 'var(--orange)', cursor: loaded ? 'pointer' : 'not-allowed',
                height: 4,
              }}
            />
            <div style={{ fontSize: 10, color: '#71717a', marginTop: 4, lineHeight: 1.5 }}>
              Shifts the 1:1 crop up or down so the right part of the frame (face, subject, caption) shows in the Instagram / TikTok grid.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
