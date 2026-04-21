import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * CoverFramePicker
 * Shows a video player + scrubber so the user can pick an exact cover frame.
 * onChange(ms) fires whenever the selected timestamp changes (null = no cover set).
 *
 * If `initialMs` is null, auto-detects the first audio onset (≈ first spoken
 * word) and seeds the cover to 100 ms after it.
 */
export default function CoverFramePicker({ videoUrl, onChange, initialMs = null }) {
  const videoRef = useRef(null);
  const [duration,    setDuration]    = useState(0);
  const [currentTime, setCurrentTime] = useState(initialMs != null ? initialMs / 1000 : 0);
  const [enabled,     setEnabled]     = useState(initialMs != null);
  const [loaded,      setLoaded]      = useState(false);
  const [detecting,   setDetecting]   = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const didAutoRef = useRef(false);

  // Notify parent on change
  useEffect(() => {
    onChange(enabled ? Math.round(currentTime * 1000) : null);
  }, [enabled, currentTime, onChange]);

  // ── Auto-detect first audio onset (≈ first spoken word) ──────────────
  // Runs once per video when no initialMs was provided. Downloads the
  // media, decodes its audio, then scans for the first sample block whose
  // RMS crosses a threshold for ~50ms sustained. Sets the cover to that
  // timestamp + 100ms so the mouth is already open on the thumbnail.
  const autoDetectOnset = useCallback(async () => {
    if (didAutoRef.current) return;
    if (initialMs != null) return;
    if (!videoUrl) return;
    didAutoRef.current = true;
    setDetecting(true);
    try {
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error('fetch failed');
      const buf = await res.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('no AudioContext');
      const ctx = new Ctx();
      const audio = await ctx.decodeAudioData(buf);
      const data = audio.getChannelData(0); // mono analysis
      const sr = audio.sampleRate;

      // Normalize by peak so a quiet track isn't ignored
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
      if (peak < 0.001) { ctx.close(); return; } // essentially silent

      const threshold = Math.max(0.04, peak * 0.18); // adaptive
      const winSamples = Math.max(1, Math.floor(sr * 0.02));  // 20 ms
      const sustainHops = 3; // need 3 consecutive hops (~60 ms) above

      let hopsAbove = 0;
      let onsetSample = null;
      for (let i = 0; i + winSamples < data.length; i += winSamples) {
        let sumSq = 0;
        for (let j = 0; j < winSamples; j++) {
          const s = data[i + j];
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / winSamples);
        if (rms > threshold) {
          hopsAbove++;
          if (hopsAbove === 1) onsetSample = i;
          if (hopsAbove >= sustainHops) break;
        } else {
          hopsAbove = 0;
          onsetSample = null;
        }
      }
      ctx.close();
      if (onsetSample == null) return;

      // Add 100 ms so the first word has started, not just its attack
      const onsetSec = onsetSample / sr + 0.1;
      const clamped = Math.min(Math.max(onsetSec, 0), (videoRef.current?.duration || onsetSec));
      setCurrentTime(clamped);
      setEnabled(true);
      setAutoDetected(true);
      if (videoRef.current) videoRef.current.currentTime = clamped;
    } catch {
      // silent — fall back to user-pick
    } finally {
      setDetecting(false);
    }
  }, [videoUrl, initialMs]);

  useEffect(() => { autoDetectOnset(); }, [autoDetectOnset]);

  function handleMetadata() {
    setDuration(videoRef.current.duration || 0);
    setLoaded(true);
  }

  function handleScrub(e) {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    setAutoDetected(false);
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
        {detecting && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>· detecting first word…</span>}
        {autoDetected && !detecting && (
          <span style={{ fontSize: 11, color: 'var(--orange)', fontWeight: 500 }}>· auto-set to first word</span>
        )}
      </label>

      {enabled && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
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
                justifyContent: 'center', color: 'var(--muted)', fontSize: 12,
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
                width: '100%', accentColor: 'var(--orange)', cursor: loaded ? 'pointer' : 'not-allowed',
                height: 4, marginBottom: 6,
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
        </div>
      )}
    </div>
  );
}
