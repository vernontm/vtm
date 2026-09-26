import React, { useState, useEffect, useCallback, useLayoutEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Share, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getAgreements, getClientActivity, uploadClientFile, deleteClientFile, getClientFileLink,
  uploadSignedAgreement, getAgreementFile, SIGN_BASE, PAY_BASE,
} from '../lib/api';
import { goToConversation } from '../lib/nav';
import { openAppSettings } from '../lib/push';
import { C, T, F, AURORA } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Tile, Label, Button, Segmented, GradientChip, Dot, Progress, Empty } from '../components/ui';
import MediaViewer, { fmtSize } from '../components/MediaViewer';
import Sheet, { SheetRow } from '../components/Sheet';
import DateField from '../components/DateField';
import NudgeSheet from '../components/NudgeSheet';

// The client page (Aura), four tabs. Overview: what is next, the balance, the
// plan, the latest files and activity. Money: what is due next, what has been
// paid, the agreements and the payment schedule, with one-tap share of the
// sign and pay links. Files and Activity: the full lists. The dock is hidden
// here, so the bottom padding is the inset. Data: the agreements pipeline
// plus the client activity bundle (GET /client-activity?client_id=).
//
// Files and agreements both show a real preview instead of a generic row: an
// image draws its own thumbnail, everything else gets a tinted type tile with
// the size, who added it and when. Tapping one opens it in MediaViewer, inside
// the app, never in Safari. Ray can add a file from the phone (camera roll or
// the file browser) and can upload a copy a client signed on paper, which
// marks the agreement signed on the date he picks.

// Journey stages as colored text: green is live, blue is in motion, slate is
// paused, amber is still a lead.
const STAGE = {
  lead: { label: 'Lead', color: C.amber },
  onboarding: { label: 'Onboarding', color: C.blue },
  awaiting_access: { label: 'Awaiting access', color: C.blue },
  scoping: { label: 'Scoping', color: C.blue },
  plan_review: { label: 'Plan review', color: C.blue },
  in_build: { label: 'In build', color: C.blue },
  active: { label: 'Active', color: C.green },
  live: { label: 'Live', color: C.green },
  paused: { label: 'Paused', color: C.slate },
  client: { label: 'Client', color: C.green },
};
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const stageOf = (k) => STAGE[k] || { label: cap(String(k || '').replace(/_/g, ' ')) || 'Client', color: C.slate };

const TABS = ['overview', 'money', 'files', 'activity'];
const tabOf = (t) => (TABS.includes(t) ? t : 'overview');

// Date-only strings ("2026-10-15") are a local calendar day, not UTC midnight.
const parseDate = (s) => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s);
  return isNaN(d) ? null : d;
};
const fmtDay = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };
const fmtMonth = (s) => { const d = parseDate(s); return d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''; };
const fmtDateTime = (s) => { const d = parseDate(s); return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
const dayKey = (s) => { const d = parseDate(s); return d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : 'undated'; };
const dayLabel = (s) => {
  const d = parseDate(s);
  if (!d) return 'Undated';
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};
const money = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const isSigned = (a) => !!a && (a.status === 'signed' || !!a.signed_at);
const open = (url) => Linking.openURL(url).catch(e => Alert.alert('Could not open the link', e.message));
const hairline = { borderTopWidth: 1, borderTopColor: C.line };
const rowTitle = { fontFamily: F.bold, fontSize: 14, lineHeight: 18, color: C.ink };

// Where an agreement stands, as a dot color and a one-line sub.
const agState = (a) => {
  if (isSigned(a)) return { dot: C.green, sub: a.signed_at ? `Signed ${fmtDay(a.signed_at)}` : 'Signed' };
  if (a.status === 'sent' || a.status === 'approved') return { dot: C.amberDot, sub: 'Sent, waiting for signature' };
  return { dot: C.slate, sub: 'Drafted' };
};

// Activity rows carry a kind; each gets its own dot color. An agreement is
// amber while unsigned.
const kindDot = (a) => {
  switch (a.kind) {
    case 'text': return C.ink;
    case 'agreement': return a.severity === 'red' ? C.redDot : a.severity === 'amber' ? C.amberDot : C.green;
    case 'meeting': return C.violet;
    case 'payment': return C.green;
    default: return C.slate;   // nudge, note
  }
};
const isUnsignedRow = (a) => a.kind === 'agreement' && (a.severity === 'amber' || a.severity === 'red' || /unsigned|waiting|not signed/i.test(`${a.title || ''} ${a.sub || ''}`));

// The same buckets the server sorts files into (client-activity.js fileKind),
// so a row we just uploaded looks identical to one that came back from the API.
const kindOfFile = (mime, fileName) => {
  const m = String(mime || '').toLowerCase(), n = String(fileName || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  if (/word|\.docx?$/.test(m + n)) return 'doc';
  if (/sheet|excel|csv|\.xlsx?$/.test(m + n)) return 'sheet';
  if (/presentation|powerpoint|\.pptx?$/.test(m + n)) return 'slides';
  if (/zip|compressed/.test(m + n)) return 'zip';
  if (/\.(jpe?g|png|gif|heic|heif|webp)$/.test(n)) return 'image';
  if (/\.(mov|mp4|m4v|webm)$/.test(n)) return 'video';
  if (/\.(m4a|caf|mp3|aac|wav)$/.test(n)) return 'audio';
  return 'file';
};
// A tinted tile per file type: the preview for anything that is not an image.
const FILE_TONE = {
  image: { icon: 'image-outline', bg: C.blueSoft, fg: C.blue },
  video: { icon: 'videocam-outline', bg: C.blueSoft, fg: C.blue },
  audio: { icon: 'mic-outline', bg: AURORA.lilac, fg: C.violet },
  pdf: { icon: 'document-text-outline', bg: C.redSoft, fg: C.red },
  doc: { icon: 'document-outline', bg: C.blueSoft, fg: C.blue },
  sheet: { icon: 'grid-outline', bg: C.greenSoft, fg: C.green },
  slides: { icon: 'easel-outline', bg: C.amberSoft, fg: C.amber },
  zip: { icon: 'archive-outline', bg: C.tile2, fg: C.slate },
  file: { icon: 'document-outline', bg: C.tile2, fg: C.slate },
};
const fileTone = (k) => FILE_TONE[k] || FILE_TONE.file;
// MediaViewer speaks the attachment vocabulary: image, video, audio or file.
const viewerType = (k) => (k === 'image' || k === 'video' || k === 'audio' ? k : 'file');
// uploaded_by is an email; the row only has space for the person.
const shortWho = (s) => String(s || '').split('@')[0].replace(/[._]+/g, ' ').trim() || null;
const pad2 = (n) => String(n).padStart(2, '0');
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const MAX_FILE_BYTES = 40 * 1024 * 1024;    // what the phone will send
const MAX_SIGNED_BYTES = 25 * 1024 * 1024;  // what agreements.js accepts for a signed copy
const SIGNED_NOTE = 'Signed outside the platform. A signed copy was uploaded from the app.';
const PLAN_TONE = {
  unsigned: { label: 'Unsigned', color: C.amber, dot: C.amberDot },
  draft: { label: 'Draft', color: C.slate, dot: C.slate },
  active: { label: 'Active', color: C.green, dot: C.green },
  signed: { label: 'Signed', color: C.green, dot: C.green },
  past_due: { label: 'Past due', color: C.red, dot: C.redDot },
  paused: { label: 'Paused', color: C.slate, dot: C.slate },
  cancelled: { label: 'Cancelled', color: C.slate, dot: C.slate },
};
const planTone = (s) => PLAN_TONE[s] || { label: cap(String(s || '').replace(/_/g, ' ')) || 'Plan', color: C.slate, dot: C.slate };

// The activity endpoint used to return bare crm_client_activity rows; fold
// that shape into the bundle so an older deploy still renders.
const normalizeActivity = (r) => {
  if (Array.isArray(r)) {
    return { activity: r.map(x => ({ kind: x.type || 'note', at: x.created_at, title: x.title || x.tag || cap(String(x.type || 'note')), sub: x.body ? String(x.body).slice(0, 160) : null })) };
  }
  return r && typeof r === 'object' ? r : {};
};

export default function ClientDetailScreen({ route, navigation }) {
  const client = route.params?.client || {};
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(tabOf(route.params?.tab));
  const [data, setData] = useState(null);   // agreements + payments
  const [act, setAct] = useState(null);     // the activity bundle: client, files, activity, next_up, balance, plan
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nudge, setNudge] = useState(null);
  const [viewer, setViewer] = useState(null);       // what MediaViewer is showing
  const [pickOpen, setPickOpen] = useState(false);  // the Add file chooser
  const [adding, setAdding] = useState(false);
  const [localFiles, setLocalFiles] = useState([]); // added this session, shown before the refresh lands
  const [mine, setMine] = useState(() => new Set());     // ids Ray added here, the only ones he can delete
  const [removed, setRemoved] = useState(() => new Set());
  const [signFor, setSignFor] = useState(null);     // the agreement getting a signed copy
  const [signFile, setSignFile] = useState(null);
  const [signDate, setSignDate] = useState(todayYmd());
  const [signBusy, setSignBusy] = useState(false);

  // The screen draws its own header; keep the native one off if the navigator still shows it.
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  useEffect(() => { if (route.params?.tab) setTab(tabOf(route.params.tab)); }, [route.params?.tab]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    const [ag, ac] = await Promise.allSettled([getAgreements(client.id), getClientActivity(client.id)]);
    if (ag.status === 'fulfilled') setData(ag.value || {});
    if (ac.status === 'fulfilled') setAct(normalizeActivity(ac.value));
    const errs = [ag, ac].filter(r => r.status === 'rejected').map(r => r.reason?.message || 'Request failed');
    if (errs.length) Alert.alert('Could not load everything', Array.from(new Set(errs)).join('\n'));
    setLoading(false); setRefreshing(false);
  }, [client.id]);
  useEffect(() => { load(); }, [load]);

  const shareLink = async (label, url) => {
    try { await Share.share({ message: url }); }
    catch { Alert.alert(label, url); }
  };

  // Pick one thing off the phone. 'photo' is the camera roll, 'file' is the
  // file browser (PDFs, scans, anything). Returns { uri, name, mime, size },
  // or null when the picker was dismissed or access is off.
  const pickAsset = async (source) => {
    if (source === 'photo') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        // iOS asks once; after that the switch lives in Settings.
        Alert.alert('Photos access is off', 'Open Settings, tap Photos, and allow access so you can add photos and videos.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]);
        return null;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, allowsMultipleSelection: false });
      if (res.canceled || !res.assets?.length) return null;
      const a = res.assets[0];
      const isVideo = a.type === 'video' || /^video\//.test(a.mimeType || '');
      return {
        uri: a.uri,
        name: a.fileName || `${isVideo ? 'video' : 'photo'}-${Date.now()}.${isVideo ? 'mov' : 'jpg'}`,
        mime: a.mimeType || (isVideo ? 'video/quicktime' : 'image/jpeg'),
        size: Number(a.fileSize) || 0,
      };
    }
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return null;
    const a = res.assets[0];
    return { uri: a.uri, name: a.name || `file-${Date.now()}`, mime: a.mimeType || 'application/octet-stream', size: Number(a.size) || 0 };
  };

  // Add a file to this client: pick it, upload it through a signed upload, and
  // show it in the list straight away while the bundle refreshes behind it.
  const addFile = async (source) => {
    try {
      const asset = await pickAsset(source);
      if (!asset) return;
      if (asset.size && asset.size > MAX_FILE_BYTES) return Alert.alert('Too big', 'Keep files under 40 MB.');
      setAdding(true);
      const saved = await uploadClientFile(client.id, asset.uri, asset.name, asset.mime);
      const row = (saved && saved.item) || saved || {};
      const local = {
        id: row.id || `pending-${Date.now()}`,
        name: row.name || asset.name,
        url: row.url || null,
        mime: row.mime || asset.mime,
        kind: kindOfFile(row.mime || asset.mime, row.name || asset.name),
        by_name: row.uploaded_by || 'You',
        at: row.created_at || new Date().toISOString(),
        size: Number(row.size) || asset.size || 0,
      };
      setLocalFiles(prev => [local, ...prev]);
      setMine(prev => new Set(prev).add(local.id));
      setTab('files');
      load(true);
    } catch (e) { Alert.alert('Could not add the file', e.message); }
    finally { setAdding(false); }
  };

  // Only a file added in this session can be removed here; anything older is
  // managed in the web CRM.
  const removeFile = (f) => Alert.alert('Delete this file', `${f.name || 'This file'} will be removed from ${name}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      setLocalFiles(prev => prev.filter(x => x.id !== f.id));
      setRemoved(prev => new Set(prev).add(f.id));
      try { await deleteClientFile(f.id); load(true); }
      catch (e) {
        setRemoved(prev => { const nx = new Set(prev); nx.delete(f.id); return nx; });
        Alert.alert('Could not delete it', e.message);
      }
    } },
  ]);

  // Every file opens inside the app. A Dropbox-backed row carries no public
  // url, so ask the API for a short-lived one first.
  const openFile = async (f) => {
    try {
      let url = f.url || null;
      if (!url && f.id) { const r = await getClientFileLink(f.id); url = (r && r.url) || null; }
      if (!url) return Alert.alert('No preview yet', 'There is no link on this file to open.');
      const kind = f.kind || kindOfFile(f.mime, f.name);
      setViewer({ url, type: viewerType(kind), name: f.name || 'File', mime: f.mime || null, size: Number(f.size) || 0 });
    } catch (e) { Alert.alert('Could not open the file', e.message); }
  };

  // The stored agreement PDF lives in a private bucket, so it needs a signed
  // link. With no stored copy, fall back to the signing page.
  const openAgreementFile = async (a) => {
    if (!a) return;
    if (!a.file_url) {
      if (a.sign_token) return open(`${SIGN_BASE}${a.sign_token}`);
      return Alert.alert('Nothing to open', 'No signed copy is stored on this agreement yet.');
    }
    try {
      const r = await getAgreementFile(a.id);
      const url = r && r.url;
      if (!url) throw new Error('No link came back for that copy.');
      const outside = (a.terms && a.terms.signed_outside) || {};
      const nm = outside.file_name || `${a.title || 'Agreement'}.pdf`;
      const mime = outside.mime || 'application/pdf';
      setViewer({ url, type: viewerType(kindOfFile(mime, nm)), name: nm, mime, size: Number(outside.size) || 0 });
    } catch (e) { Alert.alert('Could not open the copy', e.message); }
  };

  // A client who signed on paper or in another tool still counts: pick the
  // copy, pick the date it was signed, and the agreement is marked signed.
  const startSigned = (a) => { setSignFile(null); setSignDate(todayYmd()); setSignFor(a); };
  const closeSigned = () => { setSignFor(null); setSignFile(null); };
  const pickSigned = async (source) => {
    try {
      const asset = await pickAsset(source);
      if (!asset) return;
      if (asset.size && asset.size > MAX_SIGNED_BYTES) return Alert.alert('Too big', 'Keep a signed copy under 25 MB.');
      setSignFile(asset);
    } catch (e) { Alert.alert('Could not open the picker', e.message); }
  };
  const submitSigned = async () => {
    const a = signFor;
    if (!a || !signFile) return;
    setSignBusy(true);
    try {
      await uploadSignedAgreement(a.id, signFile.uri, signFile.name, signFile.mime, { signed_on: signDate, note: SIGNED_NOTE });
      closeSigned();
      await load(true);
      Alert.alert('Marked signed', `${a.title || 'The agreement'} is signed as of ${fmtDay(signDate)}, from the copy you uploaded.`);
    } catch (e) { Alert.alert('Could not mark it signed', e.message); }
    finally { setSignBusy(false); }
  };

  const agreements = data?.agreements || [];
  const ag = agreements[0] || null;
  const payments = data?.payments || [];
  const files = act?.files || [];
  const activity = act?.activity || [];
  const info = act?.client || {};

  // The record may arrive slim (from a home tile: id, name, phone, email);
  // the activity bundle fills in the rest.
  const name = client.business_name || client.name || client.client_name || info.name || client.owner_name || 'Client';
  const owner = client.owner_name || info.owner_name || null;
  const phone = client.contact_phone || client.phone || info.phone || null;
  const email = client.contact_email || client.email || info.email || null;
  const st = stageOf(client.stage || info.stage);
  const since = fmtMonth(client.created_at || info.since);
  const headLead = [owner && owner !== name ? owner : null, since ? `client since ${since}` : null].filter(Boolean).join(' · ');

  // Money math, in schedule order (the API returns payments oldest first).
  const paidSum = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const paidCount = payments.filter(p => p.status === 'paid').length;
  const allSum = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const total = Number(ag?.total_amount || 0) || allSum;
  const next = payments.find(p => p.status !== 'paid') || null;
  const unsigned = !!ag && !isSigned(ag);
  const payUrl = ag?.sign_token ? `${PAY_BASE}${ag.sign_token}` : null;
  const signUrl = ag?.sign_token ? `${SIGN_BASE}${ag.sign_token}` : null;
  const firstPaid = payments[0]?.status === 'paid' ? payments[0] : null;

  // Scheduled or overdue when the row carries a due date; pending otherwise.
  const dueAt = next ? (next.due_date || next.due_at || null) : null;
  const nextStatus = !next ? null
    : dueAt && new Date(dueAt) < new Date() ? { label: 'Overdue', color: C.red, dot: C.redDot }
    : dueAt ? { label: 'Scheduled', color: C.green, dot: C.green }
    : { label: 'Pending', color: C.amber, dot: C.amberDot };

  // The plan, short: the one the client picked, or read off the schedule.
  const planLabel = (() => {
    const picked = ag?.selected_plan;
    if (typeof picked === 'string' && picked) return picked;
    if (picked?.label) return picked.label;
    const amts = payments.map(p => Number(p.amount || 0));
    if (amts.length === 2 && amts[0] && amts[0] === amts[1]) return '50 / 50';
    if (amts.length) return `${amts.length} ${amts.length === 1 ? 'payment' : 'payments'}`;
    if (ag?.payment_mode) return ag.payment_mode === 'custom' ? 'Custom' : cap(ag.payment_mode);
    return 'No plan yet';
  })();
  const quoted = client.potential_value
    ? `Quoted $${Number(client.potential_value).toLocaleString()}${client.potential_value_type === 'monthly' ? '/mo' : ' one-time'}`
    : null;

  // Overview figures: from the bundle, else read off the schedule.
  const bal = act?.balance || { due: next ? Number(next.amount || 0) : 0, due_on: dueAt, paid: paidSum, total };
  const plan = act?.plan || (ag ? {
    label: ag.title || 'Service agreement',
    monthly: Number(ag.terms?.monthly?.[0]?.amount) || null,
    starts: null,
    status: isSigned(ag) ? 'active' : (ag.status === 'sent' || ag.status === 'approved') ? 'unsigned' : 'draft',
  } : null);
  const nextUp = act?.next_up || null;
  const unsignedAg = agreements.find(a => !isSigned(a) && (a.status === 'sent' || a.status === 'approved')) || null;

  // What the Files list actually shows: anything added in this session sits on
  // top of the bundle until the refresh catches up, and a row deleted a moment
  // ago disappears immediately instead of flickering back.
  const allFiles = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const f of [...localFiles, ...files]) {
      const k = f.id || f.url || f.name;
      if (!k || seen.has(k) || removed.has(f.id)) continue;
      seen.add(k); out.push(f);
    }
    return out;
  }, [localFiles, files, removed]);

  const groups = useMemo(() => {
    const out = []; const idx = {};
    for (const a of activity) {
      const k = dayKey(a.at);
      if (idx[k] == null) { idx[k] = out.length; out.push({ key: k, label: dayLabel(a.at), items: [] }); }
      out[idx[k]].items.push(a);
    }
    return out;
  }, [activity]);

  const draftAgreement = () => navigation.navigate('AgreementDraft', {
    client: { ...client, id: client.id, business_name: client.business_name || name, owner_name: owner || client.owner_name, contact_phone: phone, contact_email: email },
  });
  const nudgeAgreement = (a) => {
    const id = a.agreement_id || a.target_id || unsignedAg?.id || a.id;
    if (!id) return Alert.alert('Nothing to nudge', 'No unsigned agreement is on file for this client.');
    setNudge({ kind: 'agreement', id, label: a.title || unsignedAg?.title || 'Agreement', client_name: name });
  };

  // Plain functions for the repeated blocks, not inner components.
  const seeAll = (t) => (
    <TouchableOpacity onPress={() => setTab(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`See all ${t}`}>
      <Text style={[T.meta, { color: C.ink }]}>See all</Text>
    </TouchableOpacity>
  );
  // The preview itself: an image draws a real thumbnail, everything else gets
  // its tinted type tile. A PDF first page would need a rasterizer the app
  // does not carry, so a PDF reads as a red document tile with its details.
  const filePreview = (f, kind, size = 44) => (
    kind === 'image' && f.url
      ? <Image source={{ uri: f.url }} resizeMode="cover" style={{ width: size, height: size, borderRadius: 12, backgroundColor: C.tile2 }} />
      : (
        <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: fileTone(kind).bg, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={fileTone(kind).icon} size={Math.round(size * 0.45)} color={fileTone(kind).fg} />
        </View>
      )
  );
  const fileRow = (f, i) => {
    const kind = f.kind || kindOfFile(f.mime, f.name);
    const meta = [shortWho(f.by_name), fmtDay(f.at), fmtSize(f.size)].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity key={f.id || `${f.name}-${i}`} activeOpacity={0.75} onPress={() => openFile(f)} accessibilityLabel={`Open ${f.name || 'this file'}`}
        style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6 }, i ? hairline : null]}>
        {filePreview(f, kind)}
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Text numberOfLines={1} style={rowTitle}>{f.name || 'File'}</Text>
          <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{meta || cap(kind)}</Text>
        </View>
        {mine.has(f.id)
          ? <IconButton icon="trash-outline" size={34} white color={C.red} label="Delete this file" onPress={() => removeFile(f)} />
          : <Ionicons name="chevron-forward" size={16} color={C.slate} />}
      </TouchableOpacity>
    );
  };
  const addFileLink = () => (
    <TouchableOpacity onPress={() => setPickOpen(true)} disabled={adding} accessibilityLabel="Add a file to this client"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {adding ? <ActivityIndicator size="small" color={C.ink} /> : <Ionicons name="add" size={15} color={C.ink} />}
      <Text style={[T.meta, { color: C.ink }]}>{adding ? 'Uploading' : 'Add file'}</Text>
    </TouchableOpacity>
  );
  // An agreement row reads like a document: the state as a tinted tile, the
  // signed copy one tap away, and an upload control while it is unsigned.
  const agreementRow = (a, i) => {
    const s = agState(a);
    const signed = isSigned(a);
    const tint = signed ? { bg: C.greenSoft, fg: C.green }
      : (a.status === 'sent' || a.status === 'approved') ? { bg: C.amberSoft, fg: C.amber }
      : { bg: C.tile2, fg: C.slate };
    const sub = [s.sub, a.file_url ? 'Tap to read the signed copy' : null].filter(Boolean).join(' · ');
    return (
      <View key={a.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 6 }, i ? hairline : null]}>
        <TouchableOpacity activeOpacity={0.75} disabled={!a.file_url && !a.sign_token} onPress={() => openAgreementFile(a)}
          accessibilityLabel={`Open ${a.title || 'this agreement'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: tint.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={signed ? 'document-text' : 'document-text-outline'} size={20} color={tint.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <Text numberOfLines={1} style={rowTitle}>{a.title || 'Service agreement'}</Text>
            <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{sub}</Text>
          </View>
        </TouchableOpacity>
        {signed ? (
          a.file_url
            ? <IconButton icon="eye-outline" size={34} white label="Open the signed copy" onPress={() => openAgreementFile(a)} />
            : a.sign_token ? <Button label="View" kind="white" small onPress={() => open(`${SIGN_BASE}${a.sign_token}`)} /> : null
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {a.sign_token ? <Button label="Share link" kind="white" small onPress={() => shareLink('Sign link', `${SIGN_BASE}${a.sign_token}`)} /> : null}
            <IconButton icon="cloud-upload-outline" size={34} white label="Upload a signed copy" onPress={() => startSigned(a)} />
          </View>
        )}
      </View>
    );
  };
  const activityRow = (a, i) => (
    <View key={a.id || `${a.kind}-${a.at}-${i}`} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 }, i ? hairline : null]}>
      <Dot color={kindDot(a)} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={2} style={rowTitle}>{a.title || cap(a.kind || 'activity')}</Text>
        <Text numberOfLines={2} style={[T.sub, { fontSize: 12 }]}>{[a.sub, fmtDateTime(a.at)].filter(Boolean).join(' · ')}</Text>
      </View>
      {isUnsignedRow(a) ? <Button label="Nudge" kind="white" small onPress={() => nudgeAgreement(a)} />
        : a.link ? <IconButton icon="open-outline" size={34} white label="Open" onPress={() => open(a.link)} /> : null}
    </View>
  );

  const overviewTab = () => (
    <>
      {/* Next */}
      <Tile style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Label>Next</Label>
          {nextUp ? (
            <>
              <Text numberOfLines={2} style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>{nextUp.title || 'Meeting'}</Text>
              <Text numberOfLines={2} style={T.sub}>{[fmtDateTime(nextUp.start_time), nextUp.location || (nextUp.meet_link ? 'Google Meet' : null)].filter(Boolean).join(' · ')}</Text>
            </>
          ) : (
            <>
              <Text style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>Nothing scheduled</Text>
              <Text style={T.sub}>Book the next meeting from the calendar.</Text>
            </>
          )}
        </View>
        {nextUp?.meet_link ? <Button label="Join" icon="videocam-outline" kind="white" small onPress={() => open(nextUp.meet_link)} />
          : nextUp?.location ? <Button label="Directions" icon="navigate-outline" kind="white" small onPress={() => open(nextUp.maps_url || `https://maps.apple.com/?q=${encodeURIComponent(nextUp.location)}`)} />
          : null}
      </Tile>

      {/* Balance + plan */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Label>Balance</Label>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[T.h3, { color: Number(bal.due) > 0 ? C.ink : C.green }]}>{money(bal.due)}</Text>
          <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{Number(bal.due) > 0 ? (bal.due_on ? `due ${fmtDay(bal.due_on)}` : 'due') : 'nothing due'}</Text>
          <Progress value={Number(bal.total) ? Number(bal.paid || 0) / Number(bal.total) : 0} />
          <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{money(bal.paid)} of {money(bal.total)} paid</Text>
        </Tile>
        <Tile style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <Label>Plan</Label>
          {plan ? (
            <>
              <Text numberOfLines={2} style={[T.h3, { fontSize: 18, lineHeight: 22 }]}>{plan.label || 'Plan'}</Text>
              <Text numberOfLines={2} style={[T.sub, { fontSize: 12 }]}>
                {[plan.monthly ? `${money(plan.monthly)}/mo` : null, plan.starts ? `starts ${fmtDay(plan.starts)}` : null].filter(Boolean).join(' · ') || 'One-time'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Dot color={planTone(plan.status).dot} />
                <Text style={[T.meta, { color: planTone(plan.status).color }]}>{planTone(plan.status).label}</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={[T.h3, { fontSize: 18, lineHeight: 22 }]}>No plan yet</Text>
              <Text numberOfLines={3} style={[T.sub, { fontSize: 12 }]}>{quoted || 'Draft an agreement to set one.'}</Text>
            </>
          )}
        </Tile>
      </View>

      {/* Files */}
      <Tile style={{ gap: 4, paddingVertical: 14 }}>
        <Label right={allFiles.length > 3 ? seeAll('files') : addFileLink()}>Files</Label>
        {allFiles.length === 0
          ? <Text style={[T.sub, { paddingVertical: 8 }]}>No files yet. Tap Add file to send one from your phone.</Text>
          : allFiles.slice(0, 3).map(fileRow)}
      </Tile>

      {/* Activity */}
      <Tile style={{ gap: 4, paddingVertical: 14 }}>
        <Label right={activity.length > 4 ? seeAll('activity') : null}>Activity</Label>
        {activity.length === 0 ? <Text style={[T.sub, { paddingVertical: 8 }]}>Nothing yet.</Text> : activity.slice(0, 4).map(activityRow)}
      </Tile>
    </>
  );

  const moneyTab = () => (
    <>
      {/* Next payment */}
      <Tile style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Label>Next payment</Label>
          {payments.length === 0 ? (
            <>
              <Text style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>No payment schedule yet</Text>
              <Text style={T.sub}>Draft and send an agreement to build one.</Text>
            </>
          ) : next ? (
            <>
              <Text numberOfLines={1} adjustsFontSizeToFit style={[T.numeral, { fontSize: 30, lineHeight: 34, letterSpacing: -1 }]}>{money(next.amount)}</Text>
              <Text numberOfLines={2} style={T.sub}>{[next.label || 'Payment', next.due_condition].filter(Boolean).join(' · ')}</Text>
            </>
          ) : (
            <>
              <Text style={[T.numeral, { fontSize: 30, lineHeight: 34, letterSpacing: -1 }]}>$0</Text>
              <Text style={T.sub}>Nothing due</Text>
            </>
          )}
        </View>
        {next ? (
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={nextStatus.dot} />
              <Text style={[T.meta, { color: nextStatus.color }]}>{nextStatus.label}</Text>
            </View>
            {payUrl ? <Button label="Send pay link" kind="white" small onPress={() => shareLink('Payment link', payUrl)} /> : null}
          </View>
        ) : payments.length ? (
          <Text style={[T.meta, { color: C.green }]}>All paid</Text>
        ) : null}
      </Tile>

      {/* Paid so far + plan */}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile style={{ flex: 1, gap: 8 }}>
          <Label>Paid so far</Label>
          <Text style={T.h3}>
            {money(paidSum)} <Text style={[T.sub, { fontFamily: F.semi, letterSpacing: 0 }]}>of {money(total)}</Text>
          </Text>
          <Progress value={total ? paidSum / total : 0} />
          <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>
            {paidCount ? `${paidCount} of ${payments.length} paid${firstPaid?.paid_at ? ` · first ${fmtDay(firstPaid.paid_at)}` : ''}` : payments.length ? 'No payments yet' : 'No schedule yet'}
          </Text>
        </Tile>
        <Tile style={{ flex: 1, gap: 8 }}>
          <Label>Plan</Label>
          <Text numberOfLines={1} adjustsFontSizeToFit style={[T.h3, { fontSize: 20, lineHeight: 24 }]}>{planLabel}</Text>
          <Text numberOfLines={3} style={[T.sub, { fontSize: 12, lineHeight: 17 }]}>
            {ag ? (ag.title || 'Service agreement') : (quoted || 'No agreement yet')}
          </Text>
        </Tile>
      </View>

      {/* Agreements */}
      <Tile style={{ gap: 4, paddingVertical: 14 }}>
        <Label right={(
          <TouchableOpacity onPress={draftAgreement} accessibilityLabel="Draft a new agreement" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[T.meta, { color: C.ink }]}>Send new</Text>
          </TouchableOpacity>
        )}>Agreements</Label>
        {agreements.length === 0 ? (
          <Text style={[T.sub, { paddingVertical: 8 }]}>No agreement yet. Tap Draft agreement to write one from the texts and call notes.</Text>
        ) : agreements.map(agreementRow)}
      </Tile>

      {/* Payments */}
      <Tile style={{ gap: 4, paddingVertical: 14 }}>
        <Label right={payments.length ? `${money(allSum)} total` : null}>Payments</Label>
        {payments.length === 0 ? (
          <Text style={[T.sub, { paddingVertical: 8 }]}>No payment schedule yet.</Text>
        ) : payments.map((p, i) => (
          <View key={p.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6 }, i ? hairline : null]}>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text numberOfLines={1} style={rowTitle}>{p.label || 'Payment'} · {money(p.amount)}</Text>
              {p.due_condition ? <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{p.due_condition}</Text> : null}
            </View>
            <Text style={[T.meta, { color: p.status === 'paid' ? C.green : C.amber }]}>
              {p.status === 'paid' ? `Paid ${fmtDay(p.paid_at)}`.trim() : 'Pending'}
            </Text>
          </View>
        ))}
        {(next && payUrl) || (unsigned && signUrl) ? (
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8 }}>
            {next && payUrl ? <Button label="Send pay link" small onPress={() => shareLink('Payment link', payUrl)} /> : null}
            {unsigned && signUrl ? <Button label="Share sign link" kind="white" small onPress={() => shareLink('Sign link', signUrl)} /> : null}
          </View>
        ) : null}
      </Tile>
    </>
  );

  const filesTab = () => (
    <Tile style={{ gap: 4, paddingVertical: 14 }}>
      <Label right={addFileLink()}>{allFiles.length ? `Files · ${allFiles.length}` : 'Files'}</Label>
      {allFiles.length === 0 ? (
        <Empty icon="folder-open-outline" title="No files yet" sub="Files the client shares and the ones you add from your phone show up here." />
      ) : allFiles.map(fileRow)}
    </Tile>
  );

  const activityTab = () => (activity.length === 0 ? (
    <Empty icon="pulse-outline" title="No activity yet" sub="Texts, meetings, payments, agreements and nudges land here." />
  ) : groups.map(g => (
    <View key={g.key} style={{ gap: 6 }}>
      <Label>{g.label}</Label>
      <Tile style={{ gap: 4, paddingVertical: 8 }}>{g.items.map(activityRow)}</Tile>
    </View>
  )));

  return (
    <Screen>
      <HeaderBar onBack={() => navigation.goBack()} right={<IconButton icon="ellipsis-horizontal" label="More" onPress={() => {}} />}>
        <Text numberOfLines={1} style={[T.h2, { fontSize: 24, lineHeight: 28 }]}>{name}</Text>
        <Text numberOfLines={1} style={[T.sub, { marginTop: 1 }]}>
          {headLead ? `${headLead} · ` : ''}<Text style={{ color: st.color, fontFamily: F.bold }}>{st.label}</Text>
        </Text>
      </HeaderBar>

      {/* Reach them, or start an agreement */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        <Button label="Message" icon="chatbubble-outline" small disabled={!phone} onPress={() => goToConversation(phone)} />
        <Button label="Call" icon="call-outline" kind="soft" small disabled={!phone} onPress={() => open(`tel:${phone}`)} />
        <Button label="Email" icon="mail-outline" kind="soft" small disabled={!email} onPress={() => open(`mailto:${email}`)} />
        <GradientChip label="Draft agreement" onPress={draftAgreement} />
      </ScrollView>

      <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 4 }}>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'overview', label: 'Overview' },
          { value: 'money', label: 'Money' },
          { value: 'files', label: 'Files' },
          { value: 'activity', label: 'Activity' },
        ]} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>
        {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 24 }} />
          : tab === 'overview' ? overviewTab()
          : tab === 'money' ? moneyTab()
          : tab === 'files' ? filesTab()
          : activityTab()}
      </ScrollView>

      <NudgeSheet target={nudge} onClose={() => setNudge(null)} onSent={() => load(true)} />

      {/* Every file and every signed copy opens here, inside the app. */}
      <MediaViewer attachment={viewer} onClose={() => setViewer(null)} />

      {/* Add a file: the camera roll or the file browser. The picker opens a
          beat after the sheet closes, or iOS drops it behind the modal. */}
      <Sheet visible={pickOpen} title="Add a file" onClose={() => setPickOpen(false)}>
        <SheetRow label="Photo or video" sub="From your camera roll" left={<Ionicons name="images-outline" size={18} color={C.ink} />}
          onPress={() => { setPickOpen(false); setTimeout(() => addFile('photo'), 250); }} />
        <SheetRow label="Browse files" sub="A PDF, a scan, anything on your phone" left={<Ionicons name="folder-open-outline" size={18} color={C.ink} />}
          onPress={() => { setPickOpen(false); setTimeout(() => addFile('file'), 250); }} />
      </Sheet>

      {/* A copy the client signed on paper or in another tool. */}
      <Sheet visible={!!signFor} title="Upload a signed copy" onClose={closeSigned}>
        <Text style={T.sub}>
          This marks {signFor?.title || 'the agreement'} signed and keeps your copy on it. The CRM records that it was signed outside the platform, and who uploaded it.
        </Text>

        <Label>Signed on</Label>
        <DateField value={signDate} onChange={setSignDate} style={{ backgroundColor: C.tile, borderWidth: 0, borderRadius: 16, paddingVertical: 13 }} />

        <Label>The signed copy</Label>
        {signFile ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.tile, borderRadius: 16, padding: 12 }}>
            {filePreview({ url: signFile.uri, name: signFile.name }, kindOfFile(signFile.mime, signFile.name), 40)}
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text numberOfLines={1} style={rowTitle}>{signFile.name}</Text>
              <Text numberOfLines={1} style={[T.sub, { fontSize: 12 }]}>{fmtSize(signFile.size) || 'Ready to upload'}</Text>
            </View>
            <IconButton icon="close" size={32} white label="Remove this file" onPress={() => setSignFile(null)} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Photo" icon="images-outline" kind="soft" small onPress={() => pickSigned('photo')} />
            <Button label="Browse" icon="folder-open-outline" kind="soft" small onPress={() => pickSigned('file')} />
          </View>
        )}

        <Button label="Mark signed" icon="checkmark" busy={signBusy} disabled={!signFile} onPress={submitSigned} style={{ marginTop: 4 }} />
      </Sheet>
    </Screen>
  );
}
