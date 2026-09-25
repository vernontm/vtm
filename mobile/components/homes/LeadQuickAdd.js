import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createClient } from '../../lib/api';
import { C, T, F } from '../../lib/theme';
import { Tile, Label, Chip } from '../ui';
import { fmtPhone } from '../../lib/imsg';

// Add a lead in one line: a name, a number, an @handle or a profile link.
// The chips say where it came from; Paste a DM takes a whole message and
// keeps it as the notes. A name or a number is enough; the rest comes later.
const MODES = [
  { key: 'tiktok', label: 'From TikTok', icon: 'logo-tiktok' },
  { key: 'instagram', label: 'From Instagram', icon: 'logo-instagram' },
  { key: 'dm', label: 'Paste a DM', icon: 'chatbubble-ellipses-outline' },
];
const LINK_RE = /(tiktok\.com|instagram\.com)\/@?([A-Za-z0-9._]+)/i;
const HANDLE_RE = /^@([A-Za-z0-9._]{2,40})$/;

// US numbers go out as +1 and ten digits, the shape the texting bridge uses.
const normalizePhone = (digits) => {
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return `+${digits}`;
};

// One value (a line) into the fields it fills. `platform` is the chip that is
// selected (tiktok or instagram) or null for a pasted DM.
function parseValue(text, platform) {
  const digits = text.replace(/[\s().+-]/g, '');
  if (/^\d{7,15}$/.test(digits)) {
    return { business_name: fmtPhone(digits), owner_name: '', contact_phone: normalizePhone(digits), source: platform || 'manual' };
  }
  const link = text.match(LINK_RE);
  if (link) {
    const from = link[1].toLowerCase().startsWith('tiktok') ? 'tiktok' : 'instagram';
    const handle = `@${link[2]}`;
    return { business_name: handle, owner_name: '', [from]: text, source: from };
  }
  const handle = text.match(HANDLE_RE);
  if (handle) {
    const from = platform || 'tiktok';
    return { business_name: `@${handle[1]}`, owner_name: '', [from]: `@${handle[1]}`, source: from };
  }
  return { business_name: text, owner_name: text, source: platform || 'manual' };
}

// The whole input into the createClient body, or null when there is nothing to add.
export function parseLead(raw, mode) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (mode === 'dm') {
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const first = lines[0] || text;
    // The message itself may say where it came from; a link in the first line still wins.
    const hint = /tiktok/i.test(text) ? 'tiktok' : /instagram|\big\b/i.test(text) ? 'instagram' : null;
    return { ...parseValue(first, hint), notes: text, stage: 'lead' };
  }
  return { ...parseValue(text, mode), stage: 'lead' };
}

export default function LeadQuickAdd({ startCount = 0 }) {
  const [mode, setMode] = useState('tiktok');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(null);      // the name just added, shown for two seconds
  const [addedToday, setAddedToday] = useState(0); // added from this tile since it loaded
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const add = async () => {
    const body = parseLead(value, mode);
    if (!body) return;
    setBusy(true);
    try {
      await createClient(body);
      const name = body.business_name;
      setValue('');
      setAddedToday(n => n + 1);
      setAdded(name);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setAdded(null), 2000);
    } catch (e) { Alert.alert('Could not add the lead', e.message); }
    finally { setBusy(false); }
  };

  const dm = mode === 'dm';
  const total = startCount + addedToday;
  const canAdd = !!value.trim() && !busy;

  return (
    <Tile style={{ gap: 10, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label>Add a lead</Label>
        <Text style={[T.meta, { color: total ? C.green : C.slate }]}>Today: {total} added</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: dm ? 'flex-end' : 'center', gap: 8 }}>
        <View style={{ flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: dm ? 10 : 0, justifyContent: 'center' }}>
          <TextInput
            style={{ fontFamily: F.body, fontSize: 16, color: C.ink, paddingVertical: dm ? 2 : 12, maxHeight: dm ? 132 : undefined }}
            placeholder={dm ? 'Paste the message. The first line becomes the name' : 'Name, number, @handle or link'}
            placeholderTextColor={C.slate}
            value={value} onChangeText={setValue}
            multiline={dm} autoCapitalize={dm ? 'sentences' : 'none'} autoCorrect={false}
            returnKeyType={dm ? 'default' : 'done'} onSubmitEditing={dm ? undefined : add} blurOnSubmit={!dm}
          />
        </View>
        <TouchableOpacity onPress={add} disabled={!canAdd} accessibilityLabel="Add the lead"
          style={{ height: 48, paddingHorizontal: 18, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: canAdd ? 1 : 0.5 }}>
          {busy ? <ActivityIndicator color="#FFFFFF" size="small" /> : (
            <>
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={[T.button, { color: '#FFFFFF' }]}>Add</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {MODES.map(m => (
          <Chip key={m.key} label={m.label} icon={m.icon} active={mode === m.key} onPress={() => setMode(m.key)} style={{ backgroundColor: mode === m.key ? C.ink : '#FFFFFF' }} />
        ))}
      </View>
      {added ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={16} color={C.green} />
          <Text numberOfLines={1} style={[T.meta, { color: C.green, flexShrink: 1 }]}>Added {added}</Text>
        </View>
      ) : (
        <Text style={T.sub}>A name or a number is enough. Add the rest later.</Text>
      )}
    </Tile>
  );
}
