import React, { createContext, useContext, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const RecorderContext = createContext(null);
export const useRecorder = () => useContext(RecorderContext);

export function RecorderProvider({ children }) {
  const [recording, setRecording] = useState(null); // { leadId, leadName, startedAt }
  const [elapsed, setElapsed]     = useState(0);    // seconds
  const [status, setStatus]       = useState('idle'); // idle | requesting | recording | saving

  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const timerRef         = useRef(null);
  const streamsRef       = useRef([]); // all MediaStream refs to stop on finish
  const recordingRef     = useRef(null); // mirrors recording state for onstop closure

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startTimer = (from = 0) => {
    stopTimer();
    setElapsed(from);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
  };

  const cleanupStreams = () => {
    streamsRef.current.forEach(s => s.getTracks().forEach(t => t.stop()));
    streamsRef.current = [];
  };

  // ── Start recording for a lead ──────────────────────────────────────────────
  const startRecording = useCallback(async (leadId, leadName) => {
    // If already recording a different lead, stop it first
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      await stopRecording();
    }

    setStatus('requesting');

    try {
      // 1. Mic stream (always)
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamsRef.current.push(micStream);

      // 2. System audio via getDisplayMedia (optional — user can cancel)
      let sysAudioStream = null;
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1, height: 1 },
          audio: true,
        });
        // Kill video track immediately — we only want audio
        displayStream.getVideoTracks().forEach(t => t.stop());
        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length > 0) {
          sysAudioStream = new MediaStream(audioTracks);
          streamsRef.current.push(displayStream);
        }
      } catch {
        // User dismissed screen share — mic-only is fine
      }

      // 3. Mix mic + system audio via AudioContext
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaStreamSource(micStream).connect(dest);
      if (sysAudioStream) {
        audioCtx.createMediaStreamSource(sysAudioStream).connect(dest);
      }

      // 4. MediaRecorder on mixed stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      chunksRef.current = [];
      const mr = new MediaRecorder(dest.stream, { mimeType });
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      mr.start(1000); // collect chunks every second

      mediaRecorderRef.current = mr;
      const rec = { leadId, leadName, startedAt: Date.now() };
      recordingRef.current = rec;
      setRecording(rec);
      setStatus('recording');
      startTimer(0);

    } catch (err) {
      cleanupStreams();
      setStatus('idle');
      alert(`Could not start recording: ${err.message}`);
    }
  }, []);

  // ── Stop + upload + transcribe ───────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    return new Promise(resolve => {
      const mr = mediaRecorderRef.current;
      if (!mr || mr.state === 'inactive') { resolve(); return; }

      mr.onstop = async () => {
        stopTimer();
        setStatus('saving');

        const currentRecording = recordingRef.current; // use ref — avoids stale closure
        const durationSeconds = currentRecording
          ? Math.floor((Date.now() - currentRecording.startedAt) / 1000)
          : 0;

        try {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          const path = `${currentRecording?.leadId}/${Date.now()}.webm`;

          // Upload to Supabase Storage
          const { error: uploadErr } = await supabase.storage
            .from('lead-recordings')
            .upload(path, blob, { contentType: 'audio/webm', upsert: false });

          if (uploadErr) throw uploadErr;

          // Notify server to transcribe + log
          const { data: { session } } = await supabase.auth.getSession();
          await fetch('/api/crm/recordings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
            },
            body: JSON.stringify({
              lead_id: currentRecording?.leadId,
              lead_name: currentRecording?.leadName,
              storage_path: path,
              duration_seconds: durationSeconds,
            }),
          });

        } catch (err) {
          console.error('Failed to save recording:', err);
          alert(`Recording saved locally but upload failed: ${err.message}`);
        }

        cleanupStreams();
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        recordingRef.current = null;
        setRecording(null);
        setElapsed(0);
        setStatus('idle');
        resolve();
      };

      mr.stop();
    });
  }, []);

  const isRecordingLead = (leadId) => recording?.leadId === leadId && status === 'recording';

  return (
    <RecorderContext.Provider value={{ recording, elapsed, status, startRecording, stopRecording, isRecordingLead }}>
      {children}
    </RecorderContext.Provider>
  );
}
