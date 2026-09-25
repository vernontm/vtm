import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getImsgThreads, getImsgDirectory, getAssignees, getChatRooms, getChatPeople, createChat } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Segmented, Avatar, Dot, Empty, Chip, Button, Label, TEMP, KIND_COLOR, DOCK_SPACE } from '../components/ui';
import Sheet from '../components/Sheet';
import { setInboxUnread, unreadOf } from '../lib/inboxBadge';
import { last10, firstName, fmtPhone, fmtTime, colorForEmployee } from '../lib/imsg';

// The Inbox: Clients (iMessage conversations from the business number) and
// Team (internal direct messages and group chats). Same list, same unread
// dot on the dock, separate worlds.
const BUSINESS_NUMBER = '(714) 713-3409';
// What a media-only text reads as in the list.
const mediaLabel = (atts) => {
  const types = (atts || []).map(a => a.type);
  if (!types.length) return '';
  if (types.every(t => t === 'image')) return types.length === 1 ? 'Photo' : `${types.length} photos`;
  if (types.every(t => t === 'video')) return types.length === 1 ? 'Video' : `${types.length} videos`;
  if (types.every(t => t === 'audio')) return 'Voice memo';
  return 'Attachment';
};

export default function MessagesScreen({ navigation, route }) {
  const [mode, setMode] = useState(route.params?.mode === 'team' ? 'team' : 'clients');
  const [threads, setThreads] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [chatNeedsMigration, setChatNeedsMigration] = useState(false);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  // New team chat
  const [newOpen, setNewOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [pick, setPick] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Admins land on All; everyone else on their own conversations.
    supabase.auth.getUser().then(({ data: { user } }) => {
      setMe(user);
      const admin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);
      setFilter(admin ? 'all' : 'mine');
    }).catch(() => {});
    getAssignees().then(r => setAssignees(Array.isArray(r) ? r : (r?.employees || []))).catch(() => {});
  }, []);
  useEffect(() => { if (route.params?.mode) setMode(route.params.mode === 'team' ? 'team' : 'clients'); }, [route.params?.mode]);

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
      const [th, dir, ch] = await Promise.all([getImsgThreads().catch(() => []), getImsgDirectory().catch(() => []), getChatRooms().catch(() => null)]);
      setThreads(th || []);
      setDirectory(dir || []);
      const rs = ch?.rooms || [];
      setRooms(rs);
      setChatNeedsMigration(!!ch?.needs_migration);
      setInboxUnread(unreadOf(th) + rs.filter(r => (r.unread || 0) > 0).length);
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

  const roomTitle = (r) => {
    const others = (r.members || []).filter(m => m.user_id !== me?.id);
    if (r.kind === 'group' || others.length > 1) return r.name || others.map(m => firstName(m.user_name)).join(', ') || 'Group chat';
    return others[0]?.user_name || r.name || 'Chat';
  };
  const roomList = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = rooms.slice().sort((a, b) => new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0));
    if (!needle) return arr;
    return arr.filter(r => roomTitle(r).toLowerCase().includes(needle) || (r.last_message_preview || '').toLowerCase().includes(needle));
  }, [rooms, q, me?.id]);

  const unread = threads.filter(t => (t.unread || 0) > 0).length;
  const teamUnread = rooms.filter(r => (r.unread || 0) > 0).length;

  const openNew = () => {
    setNewOpen(true); setPick([]); setGroupName('');
    if (!people.length) getChatPeople().then(r => setPeople(r?.people || [])).catch(() => {});
  };
  // Only teammates signed into the app: they are the ones who get the pushes.
  const others = people.filter(p => p.id !== me?.id && p.on_app);
  const notOnApp = people.filter(p => p.id !== me?.id && !p.on_app);
  const startChat = async () => {
    if (!pick.length) return;
    setStarting(true);
    try {
      const r = await createChat({ kind: pick.length > 1 ? 'group' : 'dm', name: groupName.trim(), member_ids: pick });
      setNewOpen(false);
      navigation.navigate('TeamChat', { room: r.room });
    } catch (e) { Alert.alert('Could not start the chat', e.message); }
    finally { setStarting(false); }
  };

  return (
    <Screen>
      <HeaderBar title="Inbox" sub={mode === 'team' ? `${teamUnread} unread · team chat` : `${unread} unread · ${BUSINESS_NUMBER}`}
        right={mode === 'team'
          ? <IconButton icon="add" dark label="New team chat" onPress={openNew} />
          : <IconButton icon="create-outline" dark label="New message" onPress={() => navigation.navigate('NewMessage')} />} />
      <View style={{ paddingHorizontal: 18, gap: 12 }}>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'clients', label: 'Clients', badge: unread, badgeColor: C.ink }, { value: 'team', label: 'Team', badge: teamUnread, badgeColor: C.violet }]} />
        {mode === 'clients' ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['mine', 'Mine'], ['unassigned', 'Unassigned'], ['all', 'All']].map(([v, l]) => <Chip key={v} label={l} active={filter === v} onPress={() => setFilter(v)} />)}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: C.tile }}>
          <Ionicons name="search" size={18} color={C.slate} />
          <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, paddingVertical: 0 }} placeholder={mode === 'team' ? 'Search team chats' : 'Search conversations'} placeholderTextColor={C.slate} value={q} onChangeText={setQ} />
          {q ? <TouchableOpacity onPress={() => setQ('')} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={C.slate} /></TouchableOpacity> : null}
        </View>
      </View>

      {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : mode === 'team' ? (
        <FlatList
          data={roomList}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 18, paddingBottom: DOCK_SPACE, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}
          ListEmptyComponent={chatNeedsMigration
            ? <Empty icon="people-outline" title="Team chat is almost ready" sub="One database file still needs to run (docs/sql/team-chat.sql)." />
            : <Empty icon="people-outline" title="No team chats yet" sub="Tap the plus to message a teammate or start a group." />}
          renderItem={({ item: r }) => {
            const isUnread = (r.unread || 0) > 0;
            const group = r.kind === 'group' || (r.members || []).length > 2;
            const title = roomTitle(r);
            return (
              <TouchableOpacity onPress={() => navigation.navigate('TeamChat', { room: r.id })} activeOpacity={0.75}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: isUnread ? C.tile : C.bg, borderWidth: isUnread ? 0 : 1, borderColor: C.line }}>
                {group ? (
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isUnread ? '#FFFFFF' : C.tile, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={20} color={C.ink} />
                  </View>
                ) : <Avatar name={title} size={44} tone={isUnread ? 'white' : 'tile'} />}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text numberOfLines={1} style={[T.title, { flex: 1 }]}>{title}</Text>
                    <Text style={T.meta}>{fmtTime(r.last_message_at)}</Text>
                  </View>
                  <Text numberOfLines={1} style={[T.body, { fontSize: 14, color: isUnread ? C.ink : C.slate }]}>
                    {r.last_message_preview ? `${r.last_sender_name ? `${firstName(r.last_sender_name)}: ` : ''}${r.last_message_preview}` : (group ? `${(r.members || []).length} people` : 'Say hello')}
                  </Text>
                </View>
                {isUnread ? <Dot /> : null}
              </TouchableOpacity>
            );
          }}
        />
      ) : (
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
                      <Text numberOfLines={1} style={[T.title, { flex: 1 }]}>{nameOf(t.phone)}</Text>
                      <Text style={T.meta}>{fmtTime(t.last?.created_at)}</Text>
                    </View>
                    <Text numberOfLines={1} style={[T.body, { fontSize: 14, color: isUnread ? C.ink : C.slate }]}>
                      {t.last?.direction === 'out' ? 'You: ' : ''}{t.last?.body || mediaLabel(t.last?.attachments)}
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

      {/* New team chat */}
      <Sheet visible={newOpen} title="New team chat" onClose={() => setNewOpen(false)}>
        <Text style={T.sub}>Teammates only. Pick one for a direct message, or several for a group. To reach a customer, use their conversation under Clients.</Text>
        <View style={{ gap: 8 }}>
          <Label>Team</Label>
          {people.length === 0 ? <ActivityIndicator color={C.ink} /> : others.length === 0 ? <Text style={T.sub}>No teammates on the app yet. Once they sign in on their phone they show up here.</Text> : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {others.map(p => <Chip key={p.id} label={firstName(p.name)} active={pick.includes(p.id)} onPress={() => setPick(s => s.includes(p.id) ? s.filter(x => x !== p.id) : [...s, p.id])} />)}
            </View>
          )}
          {notOnApp.length > 0 ? <Text style={T.sub}>Not on the app yet: {notOnApp.map(p => firstName(p.name)).join(', ')}. They can join once they sign in on their phone.</Text> : null}
        </View>
        {pick.length > 1 ? (
          <View style={{ gap: 8 }}>
            <Label>Group name</Label>
            <TextInput style={{ height: 48, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink }}
              value={groupName} onChangeText={setGroupName} placeholder="VTM team, Content crew" placeholderTextColor={C.slate} />
          </View>
        ) : null}
        <Button label={pick.length > 1 ? 'Start group chat' : 'Start chat'} onPress={startChat} busy={starting} disabled={!pick.length} />
      </Sheet>
    </Screen>
  );
}
