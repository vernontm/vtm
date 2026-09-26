// A mic you can drop next to any text field: it records with expo-audio,
// sends the clip to the server to be transcribed, and hands the text back
// through onText. Self contained, so other screens can add one line and get
// dictation.
//
//   <DictateButton onText={(t) => setInput(prev => prev ? `${prev} ${t}` : t)} />
//
// The recording sheet only exists while it is recording, so nothing polls
// the microphone when the field is just sitting there.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  useAudioRecorder, useAudioRecorderState, RecordingPresets,
  setAudioModeAsync, getRecordingPermissionsAsync, requestRecordingPermissionsAsync,
} from 'expo-audio';
import { transcribeAudio } from '../lib/api';
import { openAppSettings } from '../lib/push';
import { C, T, F } from '../lib/theme';

export const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
export const fmtElapsed = (ms) => {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// iOS asks for the microphone once; after a no, the switch only lives in
// Settings. Same shape as the photo picker's explanation.
export async function ensureMicPermission() {
  try {
    const have = await getRecordingPermissionsAsync();
    if (have?.granted) return true;
    if (have?.canAskAgain !== false) {
      const asked = await requestRecordingPermissionsAsync();
      if (asked?.granted) return true;
      if (asked?.canAskAgain !== false) return false;
    }
  } catch (e) {
    Alert.alert('The microphone is not available', e?.message || 'Try again in a moment.');
    return false;
  }
  Alert.alert(
    'Microphone access is off',
    'Open Settings, tap Microphone, and allow access so you can record a voice note or dictate a message.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ],
  );
  return false;
}

// A pill button with a real label for screen readers.
export function BarButton({ icon, label, onPress, tone = 'soft', disabled, accessibilityLabel }) {
  const bg = tone === 'primary' ? C.ink : tone === 'danger' ? C.redSoft : C.tile;
  const fg = tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? C.red : C.ink;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: disabled ? 0.5 : 1 }}>
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontFamily: F.bold, fontSize: 14, color: fg }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Live level bars, so it is obvious the mic is hearing something.
export function LevelBars({ levels, color = C.ink, height = 34, count = 26 }) {
  const pad = Math.max(0, count - levels.length);
  const shown = [...new Array(pad).fill(0.06), ...levels].slice(-count);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height, gap: 3 }}>
      {shown.map((l, i) => (
        <View key={i} style={{ flex: 1, height: Math.max(3, Math.round(l * height)), borderRadius: 2, backgroundColor: color, opacity: 0.35 + l * 0.65 }} />
      ))}
    </View>
  );
}

// Turns a metering reading (dBFS, quiet is very negative) into 0 to 1.
export const levelOf = (db) => {
  const n = typeof db === 'number' && Number.isFinite(db) ? db : -55;
  return Math.max(0.06, Math.min(1, (n + 55) / 55));
};

// The recorder itself. It only exists while recording: it prepares and
// starts on mount, and always releases the audio session on the way out.
export function Recorder({ onDone, onCancel, maxMs = 120000, children }) {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, 100);
  const [levels, setLevels] = useState([]);
  const [error, setError] = useState('');
  const live = useRef({ started: false, finished: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
        await recorder.prepareToRecordAsync();
        if (!alive) return;
        recorder.record();
        live.current.started = true;
      } catch (e) {
        if (alive) setError(e?.message || 'The microphone would not start.');
      }
    })();
    return () => {
      alive = false;
      if (live.current.started && !live.current.finished) {
        try { const p = recorder.stop(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
      }
      setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!state?.isRecording) return;
    setLevels(prev => [...prev.slice(-25), levelOf(state.metering)]);
  }, [state?.durationMillis]);

  const finish = async () => {
    if (live.current.finished) return;
    live.current.finished = true;
    const ms = state?.durationMillis || 0;
    try {
      await recorder.stop();
      const uri = recorder.uri || state?.url || null;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      if (!uri || ms < 500) { onCancel(ms < 500 ? '' : 'Nothing was recorded.'); return; }
      onDone(uri, ms);
    } catch (e) {
      onCancel(e?.message || 'The recording did not save.');
    }
  };

  const drop = async () => {
    if (live.current.finished) return;
    live.current.finished = true;
    try { await recorder.stop(); } catch (_) {}
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
    onCancel('');
  };

  // A long one stops itself rather than running the battery down.
  useEffect(() => {
    if ((state?.durationMillis || 0) >= maxMs) finish();
  }, [state?.durationMillis]);

  useEffect(() => { if (error) { live.current.finished = true; onCancel(error); } }, [error]);

  return children({ ms: state?.durationMillis || 0, levels, recording: !!state?.isRecording, finish, drop });
}

// A pulsing red dot: the clearest "this is live" there is.
export function PulseDot({ size = 10, color = C.redDot }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.25, duration: 620, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 620, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a }} />;
}

export default function DictateButton({ onText, size = 34, color, style, label = 'Dictate a message' }) {
  const [phase, setPhase] = useState('idle');   // idle · recording · working

  const start = async () => {
    if (phase !== 'idle') return;
    if (!(await ensureMicPermission())) return;
    setPhase('recording');
  };

  const cancelled = (why) => {
    setPhase('idle');
    if (why) Alert.alert('Could not record', why);
  };

  const transcribe = async (uri) => {
    setPhase('working');
    try {
      const r = await transcribeAudio(uri);
      // The helper may hand back { text } or the string itself.
      const text = String((r && typeof r === 'object' ? r.text : r) || '').trim();
      if (!text) { setPhase('idle'); Alert.alert('Nothing came back', 'The recording was too quiet to read. Try again.'); return; }
      onText?.(text);
      setPhase('idle');
    } catch (e) {
      setPhase('idle');
      Alert.alert('Could not turn that into text', e?.message || 'Try again in a moment.');
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={start}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Records what you say and puts it in the box"
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Ionicons name="mic-outline" size={Math.round(size * 0.64)} color={color || C.slate} />
      </TouchableOpacity>

      <Modal visible={phase !== 'idle'} animationType="fade" transparent onRequestClose={() => setPhase('idle')}>
        <View style={{ flex: 1, backgroundColor: 'rgba(11,11,16,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 34, gap: 16 }}>
            {phase === 'recording' ? (
              <Recorder onDone={(uri) => transcribe(uri)} onCancel={cancelled}>
                {({ ms, levels, finish, drop }) => (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <PulseDot />
                      <Text style={[T.h3, { flex: 1 }]}>Listening</Text>
                      <Text style={[T.title, { fontVariant: ['tabular-nums'] }]}>{fmtElapsed(ms)}</Text>
                    </View>
                    <View style={{ padding: 16, borderRadius: 20, backgroundColor: C.tile }}>
                      <LevelBars levels={levels} />
                    </View>
                    <Text style={T.sub}>Say it out loud. The text lands in your message box, and nothing sends on its own.</Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <BarButton icon="close" label="Cancel" tone="soft" onPress={drop} accessibilityLabel="Cancel dictation" />
                      <View style={{ flex: 1 }}>
                        <BarButton icon="checkmark" label="Use it" tone="primary" onPress={finish} accessibilityLabel="Stop recording and turn it into text" />
                      </View>
                    </View>
                  </>
                )}
              </Recorder>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <ActivityIndicator color={C.violet} />
                <Text style={[T.body, { flex: 1 }]}>Turning what you said into text</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
