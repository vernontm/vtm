import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getImsgThreads, getImsgDirectory, getAssignees } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Segmented, Avatar, Dot, Empty, TEMP, KIND_COLOR, DOCK_SPACE } from '../components/ui';
import { setInboxUnread, unreadOf } from '../lib/inboxBadge';
import { last10, firstName, fmtPhone, fmtTime, colorForEmployee } from '../lib/imsg';

// The iMessage inbox: one tile per conversation from the business number.
// Names, type, temperature and assignee come from the directory + thread.
const BUSINESS_NUMBER = '(714) 713-3409';

export default function MessagesScreen({ navigation }) {
  const [threads, setThreads] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMe(user)).catch(() => {});
    getAssignees().then(r => setAssignees(Array.isArray(r) ? r : (r?.employees || []))).catch(() => {});
  }, []);

  const byPhone = useMemo(() => {
    const m = {};
    for (const p of directory) m[last10(p.phone)] = p;
    return m;
  }, [directory]);
  const personOf = (phone) => byPhone[last10(phone)];
  const nameOf = (phone) => personOf(phone)?.name || fmtPhone(phone);
  // My roster id (threads are assigned to roster ids, not auth ids).
  const myRosterId = useMemo(() => assignees.find(a => a.user_id === me?.id || (a.email && me?.email && a.email.toLowerCase() === me.email.toLowerCase()))?.id || null, [assignees, me]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [th, dir] = await Promise.all([getImsgThreads().catch(() => []), getImsgDirectory().catch(() => [])]);
      setThreads(th || []);
      setDirectory(dir || []);
      setInboxUnread(unreadOf(th));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const list = useMemo(() => {
    let arr = (threads || []).slice().sort((a, b) => new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0));
    if (filter === 'mine') arr = arr.filter(t => t.assigned_to && t.assigned_to === myRosterId);
    if (filter === 'unassigned') arr = arr.filter(t => !t.assigned_to);
    const needle = q.trim().toLowerCase();
    if (!needle) return arr;
    return arr.filter(t =>
      nameOf(t.phone).toLowerCase().includes(needle) ||
      fmtPhone(t.phone).toLowerCase().includes(needle) ||
      (t.assigned_to_name || '').toLowerCase().includes(needle) ||
      (t.last?.body || '').toLowerCase().includes(needle));
  }, [threads, q, byPhone, filter, myRosterId]);

  const unread = threads.filter(t => (t.unread || 0) > 0).length;

  return (
    <Screen>
      <HeaderBar title="Inbox" sub={`${unread} unread · ${BUSINESS_NUMBER}`}
        right={<IconButton icon="create-outline" dark label="New message" onPress={() => navigation.navigate('NewMessage')} />} />
      <View style={{ paddingHorizontal: 18, gap: 12 }}>
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'mine', label: 'Mine' }, { value: 'unassigned', label: 'Unassigned' }, { value: 'all', label: 'All' }]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: C.tile }}>
          <Ionicons name="search" size={18} color={C.slate} />
          <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 0 }} placeholder="Search conversations" placeholderTextColor={C.slate} value={q} onChangeText={setQ} />
          {q ? <TouchableOpacity onPress={() => setQ('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={C.slate} /></TouchableOpacity> : null}
        </View>
      </View>

      {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={list}
          keyExtractor={t => t.phone}
          contentContainerStyle={{ padding: 18, paddingBottom: DOCK_SPACE, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}
          ListEmptyComponent={<Empty icon="chatbubbles-outline" title={filter === 'mine' ? 'Nothing assigned to you' : 'No conversations yet'} sub={filter === 'all' ? 'Texts to the business number land here.' : null} />}
          renderItem={({ item: t }) => {
            const p = personOf(t.phone);
            const isUnread = (t.unread || 0) > 0;
            const temp = p?.temperature ? TEMP[p.temperature] : null;
            const kindColor = p?.kind ? KIND_COLOR[p.kind] : C.slate;
            return (
              <TouchableOpacity onPress={() => navigation.navigate('Conversation', { phone: t.phone })} activeOpacity={0.75}
                style={{ gap: 10, padding: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: isUnread ? C.tile : C.bg, borderWidth: isUnread ? 0 : 1, borderColor: C.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={nameOf(t.phone)} size={44} tone={isUnread ? 'white' : 'tile'} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text numberOfLines={1} style={[T.title, { flex: 1, fontFamily: isUnread ? F.displayBold : F.displayBold }]}>{nameOf(t.phone)}</Text>
                      <Text style={T.meta}>{fmtTime(t.last?.created_at)}</Text>
                    </View>
                    <Text numberOfLines={1} style={[T.body, { fontSize: 14, color: isUnread ? C.ink : C.slate }]}>
                      {t.last?.direction === 'out' ? 'You: ' : ''}{t.last?.body || ''}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {isUnread ? <Dot /> : null}
                  <Text style={[T.meta, { color: temp ? temp.color : kindColor }]}>
                    {p?.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : 'Unknown'}{temp ? ` · ${temp.label}` : ''}
                  </Text>
                  <View style={{ flex: 1 }} />
                  {t.assigned_to_name ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: isUnread ? '#FFFFFF' : C.tile }}>
                      <Dot size={14} color={colorForEmployee(t.assigned_to || t.assigned_to_name)} />
                      <Text style={T.meta}>{firstName(t.assigned_to_name)}</Text>
                    </View>
                  ) : (
                    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(11,11,16,0.3)', justifyContent: 'center' }}>
                      <Text style={T.meta}>Assign</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </Screen>
  );
}
