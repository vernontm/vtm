import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getImsgThreads, getImsgDirectory } from '../lib/api';
import { C } from '../lib/theme';
import { last10, firstName, fmtPhone, fmtTime, KIND, tempOf, colorForEmployee } from '../lib/imsg';

// Two-way iMessage inbox: conversations from the business number, grouped by
// phone. Names, type, temperature and assignee come from the directory + thread.
export default function MessagesScreen({ navigation }) {
  const [threads, setThreads] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');

  const byPhone = useMemo(() => {
    const m = {};
    for (const p of directory) m[last10(p.phone)] = p;
    return m;
  }, [directory]);
  const nameOf = (phone) => byPhone[last10(phone)]?.name || fmtPhone(phone);
  const kindOf = (phone) => byPhone[last10(phone)]?.kind || null;
  const tempKeyOf = (phone) => byPhone[last10(phone)]?.temperature || null;

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [th, dir] = await Promise.all([getImsgThreads().catch(() => []), getImsgDirectory().catch(() => [])]);
      setThreads(th || []);
      setDirectory(dir || []);
    } catch (e) { Alert.alert('Could not load', e.message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const list = useMemo(() => {
    const arr = (threads || []).slice().sort(
      (a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0)
    );
    const needle = q.trim().toLowerCase();
    if (!needle) return arr;
    return arr.filter(t =>
      nameOf(t.phone).toLowerCase().includes(needle) ||
      fmtPhone(t.phone).toLowerCase().includes(needle) ||
      (t.assigned_to_name || '').toLowerCase().includes(needle) ||
      (t.last?.body || '').toLowerCase().includes(needle));
  }, [threads, q, byPhone]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><ActivityIndicator color={C.blue} style={{ marginTop: 40 }} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
      <TextInput
        style={{ backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text, marginBottom: 12 }}
        placeholder="Search conversations…" placeholderTextColor={C.muted} value={q} onChangeText={setQ}
      />
      <FlatList
        data={list}
        keyExtractor={t => t.phone}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.blue} />}
        ListEmptyComponent={<Text style={{ color: C.muted, textAlign: 'center', marginTop: 30 }}>No conversations yet. Tap + to text someone.</Text>}
        renderItem={({ item: t }) => {
          const kind = kindOf(t.phone);
          const temp = tempOf(tempKeyOf(t.phone));
          const unread = (t.unread || 0) > 0;
          return (
            <TouchableOpacity onPress={() => navigation.navigate('Conversation', { phone: t.phone })}
              style={{ backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {unread && (
                  <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{t.unread}</Text>
                  </View>
                )}
                {temp && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: temp.color }} />}
                <Text numberOfLines={1} style={{ flex: 1, color: C.text, fontWeight: unread ? '800' : '700', fontSize: 15 }}>{nameOf(t.phone)}</Text>
                {kind && (
                  <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: `${KIND[kind].color}22`, borderWidth: 1, borderColor: `${KIND[kind].color}55` }}>
                    <Text style={{ color: KIND[kind].color, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{KIND[kind].label}</Text>
                  </View>
                )}
                <Text style={{ color: C.muted, fontSize: 11 }}>{fmtTime(t.last?.created_at)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Text numberOfLines={1} style={{ flex: 1, color: unread ? C.text : C.muted, fontSize: 13 }}>
                  {t.last?.direction === 'out' ? 'You: ' : ''}{t.last?.body || ''}
                </Text>
                {t.assigned_to_name ? (
                  <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colorForEmployee(t.assigned_to || t.assigned_to_name) }}>
                    <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{firstName(t.assigned_to_name)}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <TouchableOpacity onPress={() => navigation.navigate('NewMessage')}
        style={{ position: 'absolute', bottom: 24, right: 20, backgroundColor: C.blue, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 }}>
        <Ionicons name="create" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
