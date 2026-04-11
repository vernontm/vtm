import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, RotateCw, Settings,
} from 'lucide-react';

const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function VideoPlayer({
  src,
  poster,
  onTimeUpdate,
  onComplete,
  initialTime = 0,
  stillWatchingInterval = 1800, // seconds (default 30 min)
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showStillWatching, setShowStillWatching] = useState(false);
  const [buffered, setBuffered] = useState(0);

  const hideTimer = useRef(null);
  const stillWatchingTimer = useRef(null);
  const completionFired = useRef(false);
  const lastReportedTime = useRef(0);

  // Seek to initial time on load
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      if (initialTime > 0 && initialTime < v.duration) {
        v.currentTime = initialTime;
      }
    };
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, [initialTime]);

  // "Still watching?" timer
  const resetStillWatchingTimer = useCallback(() => {
    clearTimeout(stillWatchingTimer.current);
    if (stillWatchingInterval > 0) {
      stillWatchingTimer.current = setTimeout(() => {
        const v = videoRef.current;
        if (v && !v.paused) {
          v.pause();
          setPlaying(false);
          setShowStillWatching(true);
        }
      }, stillWatchingInterval * 1000);
    }
  }, [stillWatchingInterval]);

  // Handle time updates
  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);

    // Buffered
    if (v.buffered.length > 0) {
      setBuffered(v.buffered.end(v.buffered.length - 1));
    }

    // Report progress every 5 seconds
    if (Math.abs(v.currentTime - lastReportedTime.current) >= 5) {
      lastReportedTime.current = v.currentTime;
      onTimeUpdate?.(v.currentTime, v.duration);
    }

    // Completion at 95%
    if (!completionFired.current && v.duration > 0 && v.currentTime / v.duration >= 0.95) {
      completionFired.current = true;
      onComplete?.();
    }
  }, [onTimeUpdate, onComplete]);

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    setShowControls(true);
    if (playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [playing]);

  useEffect(() => {
    if (!playing) setShowControls(true);
    else scheduleHide();
  }, [playing, scheduleHide]);

  // Fullscreen detection
  useEffect(() => {
    const handleFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFS);
    return () => document.removeEventListener('fullscreenchange', handleFS);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const v = videoRef.current;
      if (!v) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 10);
          break;
        case 'ArrowRight':
        case 'l':
          e.preventDefault();
          v.currentTime = Math.min(v.duration, v.currentTime + 10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          v.volume = Math.min(1, v.volume + 0.1);
          setVolume(v.volume);
          break;
        case 'ArrowDown':
          e.preventDefault();
          v.volume = Math.max(0, v.volume - 0.1);
          setVolume(v.volume);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setPlaying(true);
      resetStillWatchingTimer();
    } else {
      v.pause();
      setPlaying(false);
      clearTimeout(stillWatchingTimer.current);
    }
  }

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function handleVolumeChange(e) {
    const v = videoRef.current;
    if (!v) return;
    const val = parseFloat(e.target.value);
    v.volume = val;
    setVolume(val);
    if (val === 0) { v.muted = true; setMuted(true); }
    else { v.muted = false; setMuted(false); }
  }

  function handleSeek(e) {
    const v = videoRef.current;
    const bar = progressRef.current;
    if (!v || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = pct * v.duration;
    setCurrentTime(v.currentTime);
  }

  function handleSpeedChange(s) {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = s;
    setSpeed(s);
    setShowSpeedMenu(false);
  }

  function toggleFullscreen() {
    const c = containerRef.current;
    if (!c) return;
    if (!document.fullscreenElement) {
      c.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  function handleStillWatchingContinue() {
    setShowStillWatching(false);
    const v = videoRef.current;
    if (v) {
      v.play();
      setPlaying(true);
      resetStillWatchingTimer();
    }
  }

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;

  if (!src) {
    return (
      <div style={{
        aspectRatio: '16/9', background: '#111', borderRadius: 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8,
      }}>
        <Play size={48} style={{ color: '#444' }} />
        <p style={{ color: '#666', fontSize: 14 }}>No video available</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={scheduleHide}
      onClick={(e) => { if (e.target === videoRef.current) togglePlay(); }}
      style={{
        position: 'relative', borderRadius: isFullscreen ? 0 : 12, overflow: 'hidden',
        background: '#000', aspectRatio: isFullscreen ? undefined : '16/9',
        width: '100%', height: isFullscreen ? '100%' : undefined, cursor: showControls ? 'default' : 'none',
      }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); onComplete?.(); }}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        playsInline
      />

      {/* Big center play button (when paused) */}
      {!playing && !showStillWatching && (
        <button
          onClick={togglePlay}
          style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 72, height: 72, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'rgba(232,101,10,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s',
          }}
        >
          <Play size={32} style={{ color: '#fff', marginLeft: 3 }} />
        </button>
      )}

      {/* Controls bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
        padding: '30px 16px 12px',
        opacity: showControls ? 1 : 0,
        transition: 'opacity 0.3s',
        pointerEvents: showControls ? 'auto' : 'none',
      }}>
        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          style={{
            width: '100%', height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2,
            cursor: 'pointer', position: 'relative', marginBottom: 10,
          }}
          onMouseDown={(e) => {
            handleSeek(e);
            const onMove = (ev) => handleSeek(ev);
            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
        >
          {/* Buffered */}
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 2,
            background: 'rgba(255,255,255,0.2)', width: `${bufPct}%`,
          }} />
          {/* Progress */}
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 2,
            background: '#E8650A', width: `${pct}%`, transition: 'width 0.1s linear',
          }} />
          {/* Thumb */}
          <div style={{
            position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
            left: `${pct}%`, width: 12, height: 12, borderRadius: '50%',
            background: '#E8650A', border: '2px solid #fff',
            opacity: showControls ? 1 : 0, transition: 'opacity 0.2s',
          }} />
        </div>

        {/* Buttons row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={togglePlay} style={btnStyle}>
            {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
          </button>

          <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10; }} style={btnStyle}>
            <RotateCcw size={16} />
          </button>
          <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }} style={btnStyle}>
            <RotateCw size={16} />
          </button>

          <span style={{ fontSize: 12, color: '#ccc', fontFamily: 'DM Mono, monospace', minWidth: 80 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div style={{ flex: 1 }} />

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={toggleMute} style={btnStyle}>
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              style={{ width: 60, accentColor: '#E8650A', cursor: 'pointer' }}
            />
          </div>

          {/* Speed */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              style={{ ...btnStyle, fontSize: 12, fontFamily: 'DM Mono, monospace', minWidth: 40 }}
            >
              {speed}x
            </button>
            {showSpeedMenu && (
              <div style={{
                position: 'absolute', bottom: '100%', right: 0, marginBottom: 8,
                background: '#1a1a1a', border: '1px solid #333', borderRadius: 8,
                padding: 4, minWidth: 80, zIndex: 10,
              }}>
                {speeds.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSpeedChange(s)}
                    style={{
                      display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                      background: s === speed ? 'rgba(232,101,10,0.2)' : 'transparent',
                      color: s === speed ? '#E8650A' : '#ccc', cursor: 'pointer', borderRadius: 4,
                      fontSize: 13, textAlign: 'left', fontFamily: 'DM Mono, monospace',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={toggleFullscreen} style={btnStyle}>
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {/* "Still watching?" modal */}
      {showStillWatching && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 16, zIndex: 20,
        }}>
          <h3 style={{ fontFamily: 'Syne', color: '#fff', fontSize: 22 }}>Still watching?</h3>
          <p style={{ color: '#999', fontSize: 14 }}>Video paused due to inactivity</p>
          <button
            onClick={handleStillWatchingContinue}
            style={{
              padding: '10px 32px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#E8650A', color: '#fff', fontSize: 15, fontWeight: 600,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Continue Watching
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
  padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 4, transition: 'background 0.15s',
};
