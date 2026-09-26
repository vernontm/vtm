// A voice note, played inline in a bubble: play and pause, a waveform you can
// scrub, elapsed and total time, and the server's transcript underneath when
// there is one (collapsed to two lines with a way to open it up).
//
// The app never transcribes here: it only shows `attachment.transcript` when
// the server put one on the record.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, PanResponder, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { C, T, F } from '../lib/theme';

// 0:07, 1:24. Seconds in, clock out.
export const fmtClock = (secs) => {
  const s = Math.max(0, Math.round(Number(secs) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const BARS = 32;
const clamp01 = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

// A stable pseudo waveform per file, so the same note always looks the same.
// Real sample data would need the audio decoded on the phone; this only has
// to read as a voice note and give the scrub a target.
function waveform(seed) {
  const s = String(seed || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  const out = [];
  for (let i = 0; i < BARS; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const base = (h % 1000) / 1000;
    // Taper the ends so it looks like speech rather than a block.
    const edge = Math.sin((Math.PI * (i + 0.5)) / BARS);
    out.push(0.22 + base * 0.78 * (0.45 + 0.55 * edge));
  }
  return out;
}

export default function VoiceNote({ attachment, out = false, onDark = false, full = false, style }) {
  const url = attachment?.url || '';
  const player = useAudioPlayer(url ? { uri: url } : null, { updateInterval: 150 });
  const status = useAudioPlayerStatus(player);
  const [expanded, setExpanded] = useState(false);
  const [dragFrac, setDragFrac] = useState(null);
  const [trackW, setTrackW] = useState(0);

  const trackWRef = useRef(0);
  const originX = useRef(0);
  const fracRef = useRef(0);
  const seekRef = useRef(() => {});
  const wave = useMemo(() => waveform(url), [url]);

  const stated = Number(attachment?.duration_ms) > 0 ? Number(attachment.duration_ms) / 1000 : 0;
  const loaded = Number(status?.duration) > 0 ? Number(status.duration) : 0;
  const total = stated || loaded;
  const at = Number(status?.currentTime) || 0;
  const playing = !!status?.playing;
  const progress = dragFrac != null ? dragFrac : (total ? clamp01(at / total) : 0);
  const shown = dragFrac != null && total ? dragFrac * total : at;

  // The responder is built once, so it reads live values through a ref that
  // is refreshed after every render.
  useEffect(() => {
    seekRef.current = async (frac) => {
      if (!total) return;
      try { await player.seekTo(clamp01(frac) * total); } catch (_) {}
    };
  });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        const f = clamp01(e.nativeEvent.locationX / (trackWRef.current || 1));
        fracRef.current = f;
        setDragFrac(f);
      },
      onPanResponderMove: (e, g) => {
        const f = clamp01((g.moveX - originX.current) / (trackWRef.current || 1));
        fracRef.current = f;
        setDragFrac(f);
      },
      onPanResponderRelease: () => { const f = fracRef.current; setDragFrac(null); seekRef.current(f); },
      onPanResponderTerminate: () => { const f = fracRef.current; setDragFrac(null); seekRef.current(f); },
    }),
  ).current;

  // Rewind when it runs out, so the next tap starts from the top.
  useEffect(() => {
    if (status?.didJustFinish) { player.seekTo(0).catch(() => {}); }
  }, [status?.didJustFinish]);

  const toggle = async () => {
    try {
      if (playing) { player.pause(); return; }
      // After a recording iOS keeps routing audio to the earpiece until the
      // session says otherwise, so reset it before every play.
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false }).catch(() => {});
      if (total && at >= total - 0.2) await player.seekTo(0).catch(() => {});
      player.play();
    } catch (_) {}
  };

  const fg = onDark ? '#FFFFFF' : out ? '#FFFFFF' : C.ink;
  const dim = onDark ? 'rgba(255,255,255,0.35)' : out ? 'rgba(255,255,255,0.38)' : 'rgba(11,11,16,0.22)';
  const sub = onDark ? 'rgba(255,255,255,0.68)' : out ? 'rgba(255,255,255,0.7)' : C.slate;
  const knobBg = onDark ? 'rgba(255,255,255,0.14)' : out ? 'rgba(255,255,255,0.18)' : '#FFFFFF';
  const litTo = Math.round(progress * BARS);
  const transcript = String(attachment?.transcript || '').trim();
  const longText = transcript.length > 96;

  return (
    <View style={[{ gap: 8, width: full ? undefined : 250 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause this voice note' : 'Play this voice note'}
          activeOpacity={0.8}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: knobBg, alignItems: 'center', justifyContent: 'center' }}>
          {playing && status?.isBuffering ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <Ionicons name={playing ? 'pause' : 'play'} size={18} color={fg} style={playing ? null : { marginLeft: 2 }} />
          )}
        </TouchableOpacity>

        <View style={{ flex: 1, gap: 2 }}>
          <View
            {...pan.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel="Scrub the voice note"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            onLayout={(e) => { trackWRef.current = e.nativeEvent.layout.width; setTrackW(e.nativeEvent.layout.width); }}
            style={{ height: 30, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 26, gap: 2 }}>
              {wave.map((h, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: Math.max(3, Math.round(h * 24)),
                    borderRadius: 2,
                    backgroundColor: i < litTo ? fg : dim,
                  }}
                />
              ))}
            </View>
            {trackW > 0 ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, Math.min(trackW - 10, progress * trackW - 5)), width: 10, height: 10, borderRadius: 5, backgroundColor: fg, opacity: dragFrac != null || playing || at > 0 ? 1 : 0 }} />
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[T.meta, { color: sub, fontSize: 11, fontVariant: ['tabular-nums'] }]}>{fmtClock(shown)}</Text>
            <Text style={[T.meta, { color: sub, fontSize: 11, fontVariant: ['tabular-nums'] }]}>{total ? fmtClock(total) : '0:00'}</Text>
          </View>
        </View>
      </View>

      {transcript ? (
        <View style={{ gap: 2 }}>
          <Text numberOfLines={expanded ? undefined : 2} style={[T.body, { fontSize: 14, color: onDark ? 'rgba(255,255,255,0.86)' : out ? 'rgba(255,255,255,0.86)' : C.slate }]}>
            {transcript}
          </Text>
          {longText ? (
            <TouchableOpacity
              onPress={() => setExpanded(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Show less of the transcript' : 'Show the whole transcript'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 12, color: onDark ? '#FFFFFF' : out ? '#FFFFFF' : C.violet }}>
                {expanded ? 'Less' : 'More'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
