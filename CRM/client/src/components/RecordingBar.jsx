import React from 'react';
import { MicOff, Loader2 } from 'lucide-react';
import { useRecorder } from '../context/RecorderContext';

function fmt(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function RecordingBar() {
  const { recording, elapsed, status, stopRecording } = useRecorder();

  if (!recording && status === 'idle') return null;

  const isSaving = status === 'saving';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
      background: isSaving ? '#1a1a2e' : '#f87171',
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 44,
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      fontFamily: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Pulse dot */}
        {!isSaving && (
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: 'var(--surface)',
            boxShadow: '0 0 0 0 rgba(255,255,255,0.6)',
            animation: 'recPulse 1.2s infinite',
          }} />
        )}
        {isSaving && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />}
        <span style={{ fontSize: 13, fontWeight: 700 }}>
          {isSaving ? 'Saving & transcribing…' : `Recording — ${recording?.leadName || 'Lead'}`}
        </span>
        {!isSaving && (
          <span style={{
            fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: 6,
          }}>
            {fmt(elapsed)}
          </span>
        )}
      </div>

      {!isSaving && (
        <button
          onClick={stopRecording}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff', borderRadius: 6, padding: '5px 14px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
        >
          <MicOff size={13} /> Stop Recording
        </button>
      )}

      <style>{`
        @keyframes recPulse {
          0%   { box-shadow: 0 0 0 0 rgba(255,255,255,0.6); }
          70%  { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
