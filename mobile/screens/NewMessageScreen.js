import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getImsgDirectory, sendImsg, createClient, createContact, getMe, uploadFile } from '../lib/api';
import { openAppSettings } from '../lib/push';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, Avatar, Chip, Button, Label, IconButton, KIND_COLOR } from '../components/ui';
import { last10, fmtPhone, KIND } from '../lib/imsg';

// Start a text: pick someone from the directory or type a number. A new
// number gets added as a lead (or client / contact) before the first message.
// One photo, video or file can ride along, the same 40 MB ceiling the
// conversation composer uses.
const MAX_ATTACH = 40 * 1024 * 1024;
const kindOfMime = (mime) => {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'file';
};
const fmtSize = (n) => {
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};
const ICON_FOR = { image: 'image', video: 'videocam', audio: 'mic', file: 'document-outline' };

export default function NewMessageScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [directory, setDirectory] = useState([]);
  const [pick, setPick] = useState('');
  const [selected, setSelected] = useState(null);
  const [addKind, setAddKind] = useState('lead');
  const [addName, setAddName] = useState('');
  const [body, setBody] = useState('');
  const [attach, setAttach] = useState(null);   // { uri, name, mime, type, size, width, height, preview }
  const [stage, setStage] = useState('');       // what the send is busy doing
  const [busy, setBusy] = useState(false);

  useEffect(() => { getImsgDirectory().then(d => setDirectory(d || [])).catch(() => {}); }, []);

  const digits = pick.replace(/\D/g, '');
  const isNumber = digits.length >= 10;
  const exact = useMemo(() => directory.find(p => last10(p.phone) === last10(pick)), [directory, pick]);
  const matches = useMemo(() => {
    const q = pick.trim().toLowerCase();
    if (!q || selected) return [];
    return directory.filter(p => p.name.toLowerCase().includes(q) || last10(p.phone).includes(digits)).slice(0, 8);
  }, [directory, pick, selected, digits]);
  const showQuickAdd = isNumber && !selected && !exact;
  const targetPhone = selected ? selected.phone : (isNumber ? pick : null);

  // A photo or a video out of the library.
  const pickMedia = async () => {
    if (busy) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        // iOS asks for photo access once; after that the switch lives in Settings.
        return Alert.alert('Photos access is off', 'Open Settings, tap Photos, and allow access so you can send photos and videos.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]);
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85, allowsMultipleSelection: false });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      if (a.fileSize && a.fileSize > MAX_ATTACH) return Alert.alert('Too big', 'Keep photos and videos under 40 MB.');
      const isVideo = a.type === 'video' || /^video\//.test(a.mimeType || '');
      setAttach({
        uri: a.uri,
        name: a.fileName || `${isVideo ? 'video' : 'photo'}-${Date.now()}.${isVideo ? 'mov' : 'jpg'}`,
        mime: a.mimeType || (isVideo ? 'video/quicktime' : 'image/jpeg'),
        type: isVideo ? 'video' : 'image',
        size: a.fileSize || null,
        width: a.width || null,
        height: a.height || null,
        preview: isVideo ? null : a.uri,
      });
    } catch (e) { Alert.alert('Could not open your photos', e.message); }
  };
  // Anything else: a PDF, a contract, a spreadsheet.
  const pickFile = async () => {
    if (busy) return;
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const f = res.assets[0];
      if (f.size && f.size > MAX_ATTACH) return Alert.alert('Too big', 'Keep files under 40 MB.');
      const type = kindOfMime(f.mimeType);
      setAttach({
        uri: f.uri,
        name: f.name || `file-${Date.now()}`,
        mime: f.mimeType || 'application/octet-stream',
        type,
        size: f.size || null,
        width: null,
        height: null,
        preview: type === 'image' ? f.uri : null,
      });
    } catch (e) { Alert.alert('Could not open your files', e.message); }
  };

  const send = async () => {
    if (!targetPhone) return Alert.alert('Pick a person or enter a valid number.');
    const text = body.trim();
    if (!text && !attach) return Alert.alert('Add a message or an attachment.');
    setBusy(true);
    try {
      if (showQuickAdd) {
        setStage('Adding them');
        const name = addName.trim() || fmtPhone(targetPhone);
        if (addKind === 'contact') {
          const me = await getMe();
          const wsId = me?.clients?.[0]?.id || null;
          await createContact(wsId, { name, phone: targetPhone });
        } else {
          await createClient({ business_name: name, contact_phone: targetPhone, stage: addKind === 'lead' ? 'lead' : 'onboarding', lead_temperature: 'warm', source: 'mobile' });
        }
      }
      let attachments;
      if (attach) {
        setStage(`Uploading the ${attach.type === 'file' ? 'file' : attach.type}`);
        const up = await uploadFile(attach.uri, attach.name, attach.mime);
        attachments = [{ url: up.url, type: attach.type, name: attach.name, mime: up.mime || attach.mime, size: up.size || attach.size, width: attach.width, height: attach.height }];
      }
      setStage('Sending');
      await sendImsg(targetPhone, text, attachments);
      navigation.replace('Conversation', { phone: targetPhone });
    } catch (e) { Alert.alert('Could not send', e.message); }
    finally { setBusy(false); setStage(''); }
  };

  const field = { minHeight: 48, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 16, paddingVertical: 12, fontFamily: F.body, fontSize: 16, color: C.ink };
  const canSend = !!targetPhone && (!!body.trim() || !!attach);

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <HeaderBar title="New message" sub="Sends as an iMessage from the business number" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: Math.max(insets.bottom, 18) + 10, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8 }}>
            <Label>To</Label>
            {selected ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingLeft: 12, borderRadius: 18, backgroundColor: C.tile }}>
                <Avatar name={selected.name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[T.body, { fontFamily: F.bold }]}>{selected.name}</Text>
                  <Text style={T.sub}>{KIND[selected.kind]?.label || 'Contact'} · {fmtPhone(selected.phone)}</Text>
                </View>
                <TouchableOpacity onPress={() => { setSelected(null); setPick(''); }} accessibilityLabel="Change recipient" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close" size={18} color={C.ink} />
                </TouchableOpacity>
              </View>
            ) : (
              <TextInput autoFocus style={field} placeholder="Name or number" placeholderTextColor={C.slate} value={pick} onChangeText={t => { setSelected(null); setPick(t); }} />
            )}
          </View>

          {matches.length > 0 && (
            <View style={{ gap: 6 }}>
              {matches.map(p => (
                <TouchableOpacity key={p.kind + p.id} onPress={() => { setSelected(p); setPick(p.name); }} activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingLeft: 12, borderRadius: 18, backgroundColor: C.bg, borderWidth: 1, borderColor: C.line }}>
                  <Avatar name={p.name} size={36} tone="tile" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[T.body, { fontFamily: F.bold }]}>{p.name}</Text>
                    <Text style={T.sub}>{fmtPhone(p.phone)}</Text>
                  </View>
                  <Text style={[T.meta, { color: KIND_COLOR[p.kind] || C.slate }]}>{KIND[p.kind]?.label || 'Contact'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {showQuickAdd && (
            <View style={{ gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(11,11,16,0.3)' }}>
              <Text style={T.sub}>New number. Add it as a:</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['lead', 'client', 'contact'].map(k => <Chip key={k} label={KIND[k].label} active={addKind === k} onPress={() => setAddKind(k)} />)}
              </View>
              <TextInput style={[field, { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line }]} placeholder={addKind === 'contact' ? 'Contact name' : 'Business or person name'} placeholderTextColor={C.slate} value={addName} onChangeText={setAddName} />
            </View>
          )}

          <View style={{ gap: 8 }}>
            <Label>Message</Label>
            <TextInput style={[field, { minHeight: 110, textAlignVertical: 'top' }]} placeholder={attach ? 'Add a note, or send the attachment on its own' : 'Type your text'} placeholderTextColor={C.slate} value={body} onChangeText={setBody} multiline />
          </View>

          {/* Attach: one photo, video or file, the same ceiling as the
              conversation composer. */}
          <View style={{ gap: 8 }}>
            <Label right={attach ? (fmtSize(attach.size) || 'Attached') : '40 MB max'}>Attachment</Label>
            {attach ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18, backgroundColor: C.tile }}>
                <View style={{ width: 56, height: 56, borderRadius: 14, overflow: 'hidden', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  {attach.preview
                    ? <Image source={{ uri: attach.preview }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                    : <Ionicons name={ICON_FOR[attach.type] || 'document-outline'} size={22} color={C.ink} />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={[T.body, { fontFamily: F.bold }]}>{attach.name}</Text>
                  <Text numberOfLines={1} style={T.sub}>{busy ? (stage || 'Working') : 'Ready to send'}</Text>
                </View>
                {busy
                  ? <ActivityIndicator color={C.ink} style={{ width: 36 }} />
                  : <IconButton icon="close" size={36} white label="Remove the attachment" onPress={() => setAttach(null)} />}
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Photo or video" icon="image-outline" onPress={pickMedia} />
                <Chip label="File" icon="document-outline" onPress={pickFile} />
              </View>
            )}
          </View>

          <Button label={showQuickAdd ? 'Add and send' : 'Send'} busy={busy} disabled={!canSend} onPress={send} icon="arrow-up" />
          {busy ? <Text style={[T.sub, { textAlign: 'center' }]}>{stage || 'Sending'}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
