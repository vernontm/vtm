import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImsgDirectory, sendImsg, createClient, createContact, getMe } from '../lib/api';
import { C } from '../lib/theme';
import { last10, fmtPhone, KIND } from '../lib/imsg';

export default function NewMessageScreen({ navigation }) {
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

  const chip = (on, color) => ({ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', borderWidth: 1.5, borderColor: on ? color : C.border, backgroundColor: on ? `${color}22` : C.surface2 });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={92}>
      <View style={{ padding: 16, gap: 12, flex: 1 }}>
        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>To</Text>
        {selected ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Text style={{ color: C.text, fontWeight: '700', flex: 1 }}>{selected.name} <Text style={{ color: C.muted, fontWeight: '400' }}>{fmtPhone(selected.phone)}</Text></Text>
            <TouchableOpacity onPress={() => { setSelected(null); setPick(''); }}><Ionicons name="close" size={18} color={C.muted} /></TouchableOpacity>
          </View>
        ) : (
          <TextInput autoFocus style={{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: C.text }}
            placeholder="Name or number…" placeholderTextColor={C.muted} value={pick} onChangeText={t => { setSelected(null); setPick(t); }} />
        )}

        {matches.length > 0 && (
          <FlatList data={matches} keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }} keyExtractor={p => p.kind + p.id}
            renderItem={({ item: p }) => (
              <TouchableOpacity onPress={() => { setSelected(p); setPick(p.name); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, borderBottomColor: C.border, borderBottomWidth: 1 }}>
                <Text style={{ flex: 1, color: C.text, fontWeight: '700', fontSize: 15 }}>{p.name}</Text>
                <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: `${KIND[p.kind].color}22` }}>
                  <Text style={{ color: KIND[p.kind].color, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{KIND[p.kind].label}</Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 12 }}>{fmtPhone(p.phone)}</Text>
              </TouchableOpacity>
            )} />
        )}

        {showQuickAdd && (
          <View style={{ borderColor: C.border, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 12, backgroundColor: C.surface2, gap: 10 }}>
            <Text style={{ color: C.muted, fontSize: 12.5 }}>New number. Add it as a:</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {['lead', 'client', 'contact'].map(k => (
                <TouchableOpacity key={k} style={chip(addKind === k, KIND[k].color)} onPress={() => setAddKind(k)}>
                  <Text style={{ color: addKind === k ? KIND[k].color : C.muted, fontWeight: '700', textTransform: 'capitalize' }}>{k}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={{ backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text }}
              placeholder={addKind === 'contact' ? 'Contact name' : 'Business or person name'} placeholderTextColor={C.muted} value={addName} onChangeText={setAddName} />
          </View>
        )}

        <Text style={{ color: C.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Message</Text>
        <TextInput style={{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: C.text, minHeight: 90, textAlignVertical: 'top' }}
          placeholder="Sends as an iMessage from your business number." placeholderTextColor={C.muted} value={body} onChangeText={setBody} multiline />

        <TouchableOpacity onPress={send} disabled={busy || !targetPhone || !body.trim()}
          style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', opacity: (busy || !targetPhone || !body.trim()) ? 0.5 : 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{busy ? 'Sending…' : (showQuickAdd ? 'Add & send' : 'Send')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
