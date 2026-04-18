import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * CoverFramePicker
 * Shows a video player + scrubber so the user can pick an exact cover frame.
 * onChange(ms) fires whenever the selected timestamp changes (null = no cover set).
 */
export default function CoverFramePicker({ videoUrl, onChange }) {
  const videoRef = useRef(null);
  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [enabled,     setEnabled]     = useState(false);
  const [loaded,      setLoaded]      = useState(false);

  // Notify parent on change
  useEffect(() => {
    onChange(enabled ? Math.round(currentTime * 1000) : null);
  }, [enabled, currentTime, onChange]);

  function handleMetadata() {
    setDuration(videoRef.current.duration || 0);
    setLoaded(true);
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

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Toggle */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        fontSize: 13, fontWeight: 600, color: '#1a1a2e', marginBottom: enabled ? 12 : 0,
      }}>
        <div
          onClick={() => setEnabled(v => !v)}
          style={{
            width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: 'pointer',
            background: enabled ? '#4a6cf7' : '#d1d5db',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: enabled ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
        Set cover frame
      </label>

      {enabled && (
        <div style={{
          border: '1px solid #e5e7ef', borderRadius: 10, overflow: 'hidden',
          background: '#000',
        }}>
          {/* Video preview */}
          <div style={{ position: 'relative', background: '#000' }}>
            <video
              ref={videoRef}
              src={videoUrl}
              onLoadedMetadata={handleMetadata}
              onTimeUpdate={handleTimeUpdate}
              style={{ width: '100%', maxHeight: 220, display: 'block', objectFit: 'contain' }}
              preload="metadata"
              muted
            />
            {!loaded && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#8e8ea0', fontSize: 12,
              }}>
                Loading video…
              </div>
            )}
          </div>

          {/* Scrubber */}
          <div style={{ padding: '10px 14px 12px', background: '#18181b' }}>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleScrub}
              disabled={!loaded}
              style={{
                width: '100%', accentColor: '#4a6cf7', cursor: loaded ? 'pointer' : 'not-allowed',
                height: 4, marginBottom: 6,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#a1a1aa', fontFamily: 'monospace' }}>
                {fmt(currentTime)}
              </span>
              <span style={{
                fontSize: 11, fontWeight: 600, color: '#4a6cf7',
                background: '#1e2a5e', padding: '2px 8px', borderRadius: 4,
              }}>
                Cover @ {fmt(currentTime)} ({Math.round(currentTime * 1000)} ms)
              </span>
              <span style={{ fontSize: 12, color: '#71717a', fontFamily: 'monospace' }}>
                {fmt(duration)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
