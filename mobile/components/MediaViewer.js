// One viewer for everything a conversation can carry. Nothing ever opens
// Safari: a photo opens full screen here (pinch and double tap to zoom), a
// video plays with expo-video and its own controls, a voice note plays with
// the inline player, and a PDF or any other file gets a card with a share
// action that hands it to the system sheet (where Save to Files lives).
//
// Also exports the in-bubble preview, so the feed and any other screen draw
// attachments the same way.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, Image, Animated, PanResponder, TouchableOpacity, ActivityIndicator, Share, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { File, Paths } from 'expo-file-system';
import { C, T, F } from '../lib/theme';
import VoiceNote from './VoiceNote';

// ── Small helpers other screens can borrow ──

export const fmtSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
};

// The server stores a type on every attachment, but fall back to the mime
// and the file name so an older row still renders as itself.
export const kindOf = (a) => {
  if (a?.type && ['image', 'video', 'audio', 'file'].includes(a.type)) return a.type;
  const s = `${a?.mime || ''} ${a?.name || ''}`.toLowerCase();
  if (/^image\/|\.(jpe?g|png|gif|webp|heic|heif)$/.test(s)) return 'image';
  if (/^video\/|\.(mov|mp4|m4v|webm)$/.test(s)) return 'video';
  if (/^audio\/|\.(m4a|caf|mp3|aac|wav)$/.test(s)) return 'audio';
  return 'file';
};

export const fileIcon = (a) => {
  const s = `${a?.name || ''} ${a?.mime || ''}`.toLowerCase();
  if (/pdf/.test(s)) return 'document-text';
  if (/(zip|rar|7z|tar|gzip)/.test(s)) return 'file-tray-full';
  if (/(sheet|excel|xls|csv|numbers)/.test(s)) return 'grid';
  if (/(word|\.docx?|rtf|pages)/.test(s)) return 'document';
  if (/(presentation|powerpoint|\.pptx?|keynote)/.test(s)) return 'easel';
  if (/(calendar|\.ics)/.test(s)) return 'calendar';
  if (/(vcard|\.vcf)/.test(s)) return 'person';
  return 'document-outline';
};

export const fileExt = (a) => {
  const m = String(a?.name || a?.url || '').toLowerCase().match(/\.([a-z0-9]{1,6})(?:\?|$)/);
  return m ? m[1].toUpperCase() : 'FILE';
};

const displayName = (a) => String(a?.name || '').trim() || (kindOf(a) === 'image' ? 'Photo' : kindOf(a) === 'video' ? 'Video' : kindOf(a) === 'audio' ? 'Voice note' : 'File');

// Fit inside the bubble at the real aspect ratio, never so small it is hard
// to tap.
export const fitBox = (w, h, maxW = 240, maxH = 300) => {
  if (!w || !h) return { width: maxW, height: Math.round(maxW * 0.72) };
  let s = Math.min(maxW / w, maxH / h);
  if (w * s < 140) s = Math.min(140 / w, maxH / h);
  return { width: Math.round(w * s), height: Math.round(h * s) };
};

// A file name the phone is happy to write, always with an extension.
const safeName = (a) => {
  const raw = String(a?.name || '').split('/').pop().trim();
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 80);
  if (cleaned && /\.[A-Za-z0-9]{1,6}$/.test(cleaned)) return cleaned;
  const k = kindOf(a);
  const ext = /\.([a-z0-9]{1,6})(?:\?|$)/i.exec(String(a?.url || ''))?.[1]
    || (k === 'image' ? 'jpg' : k === 'video' ? 'mp4' : k === 'audio' ? 'm4a' : 'dat');
  return `${cleaned || `vtm-${k}-${Date.now()}`}.${ext}`;
};

// Pull the file down to the cache once, then hand it to the system share
// sheet. On iOS that sheet is also where Save Image, Save Video and Save to
// Files live, which is how a copy gets off the phone without another native
// module.
async function shareAttachment(a, dialogTitle) {
  const name = safeName(a);
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  if (Platform.OS === 'android') { await Share.share({ message: a.url, title: name }, { dialogTitle }); return; }
  let uri = a.url;
  try {
    const dest = new File(Paths.cache, name);
    if (dest.exists) { try { dest.delete(); } catch (_) {} }
    const got = await File.downloadFileAsync(a.url, dest);
    uri = got?.uri || uri;
  } catch (_) { /* fall back to the remote url, the sheet still works */ }
  await Share.share({ url: uri, title: name }, { dialogTitle });
}

// ── In-bubble previews ──

// A video's first frame, muted and paused, with the tap handled by the
// parent so one press opens the viewer.
export function VideoPoster({ url, style }) {
  const player = useVideoPlayer(url ? { uri: url } : null, (p) => { try { p.muted = true; p.currentTime = 0; } catch (_) {} });
  return (
    <VideoView
      style={style}
      player={player}
      pointerEvents="none"
      nativeControls={false}
      contentFit="cover"
      fullscreenOptions={{ enable: false }}
    />
  );
}

// Every attachment except audio, drawn inside a message bubble. Audio is a
// VoiceNote: the caller renders that one so the player keeps its own state.
export function AttachmentPreview({ a, out = false, onOpen, maxWidth = 240 }) {
  const kind = kindOf(a);
  const [dims, setDims] = useState(a?.width && a?.height ? { w: a.width, h: a.height } : null);

  useEffect(() => {
    if (dims || kind !== 'image' || !a?.url) return;
    let alive = true;
    Image.getSize(a.url, (w, h) => { if (alive) setDims({ w, h }); }, () => {});
    return () => { alive = false; };
  }, [a?.url, kind]);

  if (!a?.url) return null;
  const box = fitBox(dims?.w, dims?.h, maxWidth, 300);

  if (kind === 'image') {
    return (
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.9}
        accessibilityRole="imagebutton"
        accessibilityLabel={`Open ${displayName(a)}`}
        style={{ alignSelf: out ? 'flex-end' : 'flex-start', borderRadius: 20, overflow: 'hidden', backgroundColor: C.tile }}>
        <Image source={{ uri: a.url }} style={box} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  if (kind === 'video') {
    const vbox = fitBox(dims?.w || a?.width, dims?.h || a?.height, maxWidth, 280);
    return (
      <TouchableOpacity
        onPress={onOpen}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={`Play ${displayName(a)}`}
        style={{ alignSelf: out ? 'flex-end' : 'flex-start', borderRadius: 20, overflow: 'hidden', backgroundColor: '#0B0B10' }}>
        <VideoPoster url={a.url} style={vbox} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(11,11,16,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play" size={24} color="#FFFFFF" style={{ marginLeft: 3 }} />
          </View>
        </View>
        {a.size ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 10, bottom: 10, height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(11,11,16,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 11, color: '#FFFFFF' }}>{fmtSize(a.size)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  }

  // A PDF or anything else: a card with its icon, name and size.
  const meta = [fileExt(a), fmtSize(a.size)].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Open ${displayName(a)}`}
      style={{ alignSelf: out ? 'flex-end' : 'flex-start', width: maxWidth, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 20, backgroundColor: out ? C.ink : C.tile }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: out ? 'rgba(255,255,255,0.18)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={fileIcon(a)} size={20} color={out ? '#FFFFFF' : C.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[T.body, { fontFamily: F.bold, fontSize: 14, color: out ? '#FFFFFF' : C.ink }]}>{displayName(a)}</Text>
        {meta ? <Text style={[T.meta, { fontSize: 11, color: out ? 'rgba(255,255,255,0.7)' : C.slate }]}>{meta}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={out ? 'rgba(255,255,255,0.7)' : C.slate} />
    </TouchableOpacity>
  );
}

// ── The full screen viewer ──

function GlassButton({ icon, label, onPress, busy, wide }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ height: 44, paddingHorizontal: wide ? 20 : 16, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}>
      {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name={icon} size={18} color="#FFFFFF" />}
      <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#FFFFFF' }}>{label}</Text>
    </TouchableOpacity>
  );
}

const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 280;

// Pinch and double tap to zoom, drag to move once zoomed. Written on
// PanResponder so it needs no gesture library.
function ZoomableImage({ uri }) {
  const scaleA = useRef(new Animated.Value(1)).current;
  const txA = useRef(new Animated.Value(0)).current;
  const tyA = useRef(new Animated.Value(0)).current;
  const size = useRef({ w: 0, h: 0 }).current;
  const st = useRef({ scale: 1, tx: 0, ty: 0, startScale: 1, startTx: 0, startTy: 0, startDist: 0, lastTap: 0 }).current;

  const apply = (scale, tx, ty) => {
    const maxX = Math.max(0, (size.w * (scale - 1)) / 2);
    const maxY = Math.max(0, (size.h * (scale - 1)) / 2);
    st.scale = Math.max(1, Math.min(MAX_ZOOM, scale));
    st.tx = Math.max(-maxX, Math.min(maxX, tx));
    st.ty = Math.max(-maxY, Math.min(maxY, ty));
    scaleA.setValue(st.scale);
    txA.setValue(st.tx);
    tyA.setValue(st.ty);
  };

  const spring = (scale, tx, ty) => {
    st.scale = scale; st.tx = tx; st.ty = ty;
    Animated.parallel([
      Animated.spring(scaleA, { toValue: scale, useNativeDriver: false, friction: 8 }),
      Animated.spring(txA, { toValue: tx, useNativeDriver: false, friction: 8 }),
      Animated.spring(tyA, { toValue: ty, useNativeDriver: false, friction: 8 }),
    ]).start();
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.touches.length === 2 || st.scale > 1 || Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4,
      onPanResponderGrant: (e) => {
        st.startScale = st.scale; st.startTx = st.tx; st.startTy = st.ty; st.startDist = 0;
        const now = Date.now();
        if (e.nativeEvent.touches.length === 1 && now - st.lastTap < DOUBLE_TAP_MS) {
          st.lastTap = 0;
          if (st.scale > 1.05) spring(1, 0, 0); else spring(2.5, 0, 0);
          return;
        }
        st.lastTap = now;
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          const d = Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
          if (!st.startDist) { st.startDist = d; st.startScale = st.scale; return; }
          apply(st.startScale * (d / st.startDist), st.tx, st.ty);
          return;
        }
        if (st.scale > 1) apply(st.scale, st.startTx + g.dx, st.startTy + g.dy);
      },
      onPanResponderRelease: () => {
        st.startDist = 0;
        if (st.scale <= 1.05) spring(1, 0, 0);
      },
    }),
  ).current;

  return (
    <View
      {...pan.panHandlers}
      onLayout={(e) => { size.w = e.nativeEvent.layout.width; size.h = e.nativeEvent.layout.height; }}
      style={{ flex: 1, overflow: 'hidden' }}>
      <Animated.Image
        source={{ uri }}
        accessibilityLabel="Photo, pinch or double tap to zoom"
        resizeMode="contain"
        style={{ flex: 1, transform: [{ scale: scaleA }, { translateX: txA }, { translateY: tyA }] }}
      />
    </View>
  );
}

function VideoBody({ url }) {
  const player = useVideoPlayer(url ? { uri: url } : null, (p) => { try { p.play(); } catch (_) {} });
  return (
    <VideoView
      style={{ flex: 1 }}
      player={player}
      contentFit="contain"
      nativeControls
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture
    />
  );
}

function FileBody({ a }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 12 }}>
      <View style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={fileIcon(a)} size={42} color="#FFFFFF" />
      </View>
      <Text numberOfLines={3} style={[T.h3, { color: '#FFFFFF', textAlign: 'center' }]}>{displayName(a)}</Text>
      <Text style={[T.sub, { color: 'rgba(255,255,255,0.7)', textAlign: 'center' }]}>
        {[fileExt(a), fmtSize(a.size)].filter(Boolean).join(' · ')}
      </Text>
      <Text style={[T.sub, { color: 'rgba(255,255,255,0.5)', textAlign: 'center' }]}>
        Open elsewhere hands this to another app on your phone, or saves it to Files.
      </Text>
    </View>
  );
}

function ViewerBody({ a, onClose }) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState('');
  const kind = kindOf(a);

  const run = async (mode, dialogTitle) => {
    if (busy) return;
    setBusy(mode);
    try { await shareAttachment(a, dialogTitle); }
    catch (e) { Alert.alert('Could not open it', e?.message || 'Something went wrong.'); }
    finally { setBusy(''); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#06060A' }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TouchableOpacity
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="close" size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: '#FFFFFF' }}>{displayName(a)}</Text>
          {a.size ? <Text style={{ fontFamily: F.body, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{fmtSize(a.size)}</Text> : null}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {kind === 'image' ? <ZoomableImage uri={a.url} />
          : kind === 'video' ? <VideoBody url={a.url} />
            : kind === 'audio' ? (
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
                <VoiceNote attachment={a} onDark full />
              </View>
            ) : <FileBody a={a} />}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 14) + 4 }}>
        {kind === 'file' ? (
          <GlassButton icon="open-outline" label="Open elsewhere" wide busy={busy === 'open'} onPress={() => run('open', 'Open with')} />
        ) : (
          <>
            <GlassButton icon="share-outline" label="Share" busy={busy === 'share'} onPress={() => run('share', 'Share')} />
            {kind === 'image' || kind === 'video' ? (
              <GlassButton icon="download-outline" label="Save" busy={busy === 'save'} onPress={() => run('save', 'Save')} />
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

export default function MediaViewer({ attachment, onClose }) {
  return (
    <Modal visible={!!attachment} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      {attachment ? <ViewerBody key={attachment.url} a={attachment} onClose={onClose} /> : null}
    </Modal>
  );
}
