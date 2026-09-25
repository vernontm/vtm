import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getImsgDirectory, sendImsg, createClient, createContact, getMe } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, Avatar, Chip, Button, Label, KIND_COLOR } from '../components/ui';
import { last10, fmtPhone, KIND } from '../lib/imsg';

// Start a text: pick someone from the directory or type a number. A new
// number gets added as a lead (or client / contact) before the first message.
export default function NewMessageScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [directory, setDirectory] = useState([]);
  const [pick, setPick] = useState('');
  const [selected, setSelected] = useState(null);
  const [addKind, setAddKind] = useState('lead');
  const [addName, setAddName] = useState('');
  const [body, setBody] = useState('');
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

  const send = async () => {
    if (!targetPhone) return Alert.alert('Pick a person or enter a valid number.');
    if (!body.trim()) return Alert.alert('Enter a message.');
    setBusy(true);
    try {
      if (showQuickAdd) {
        const name = addName.trim() || fmtPhone(targetPhone);
        if (addKind === 'contact') {
          const me = await getMe();
          const wsId = me?.clients?.[0]?.id || null;
          await createContact(wsId, { name, phone: targetPhone });
        } else {
          await createClient({ business_name: name, contact_phone: targetPhone, stage: addKind === 'lead' ? 'lead' : 'onboarding', lead_temperature: 'warm', source: 'mobile' });
        }
      }
      await sendImsg(targetPhone, body.trim());
      navigation.replace('Conversation', { phone: targetPhone });
    } catch (e) { Alert.alert('Could not send', e.message); }
    finally { setBusy(false); }
  };

  const field = { minHeight: 48, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 16, paddingVertical: 12, fontFamily: F.body, fontSize: 16, color: C.ink };

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
            <TextInput style={[field, { minHeight: 110, textAlignVertical: 'top' }]} placeholder="Type your text" placeholderTextColor={C.slate} value={body} onChangeText={setBody} multiline />
          </View>

          <Button label={busy ? 'Sending' : (showQuickAdd ? 'Add and send' : 'Send')} busy={busy} disabled={!targetPhone || !body.trim()} onPress={send} icon="arrow-up" />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
