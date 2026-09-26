import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getImsgThreads, getImsgDirectory, getAssignees, getChatRooms, getChatPeople, createChat, getMe, starThread, archiveThread, deleteThread } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Segmented, Avatar, Dot, Empty, Chip, Button, Label, TEMP, KIND_COLOR, DOCK_SPACE } from '../components/ui';
import Sheet, { SheetRow } from '../components/Sheet';
import { setInboxUnread, unreadOf } from '../lib/inboxBadge';
import { last10, firstName, fmtPhone, fmtTime, colorForEmployee } from '../lib/imsg';

// The Inbox: Clients (iMessage conversations from the business number) and
// Team (internal direct messages and group chats). Same list, same unread
// dot on the dock, separate worlds. A conversation can be starred (sorts to
// the top), archived (out of the inbox, still there under Archived) or
// deleted (hidden for the whole team, never wiped off the customer's phone).
const BUSINESS_NUMBER = '(714) 713-3409';
// The filter chips above the client list. They scroll sideways so the row
// never squeezes on a small phone.
const CHIPS = [
  { v: 'mine', l: 'Mine' },
  { v: 'unassigned', l: 'Unassigned' },
  { v: 'starred', l: 'Starred', icon: 'star' },
  { v: 'all', l: 'All' },
  { v: 'archived', l: 'Archived', icon: 'archive-outline' },
];
// The thread list helper may hand back a bare array or { threads }.
const asThreads = (r) => (Array.isArray(r) ? r : (r?.threads || []));
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
  const [archivedThreads, setArchivedThreads] = useState([]);
  const [archLoading, setArchLoading] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [chatNeedsMigration, setChatNeedsMigration] = useState(false);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  // Row actions (long press): star, archive, delete.
  const [actionPhone, setActionPhone] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [undo, setUndo] = useState(null);   // { label, run }
  const undoTimer = useRef(null);
  const filterRef = useRef(filter);
  // New team chat
  const [newOpen, setNewOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [pick, setPick] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    // Admins land on All; everyone else on their own conversations. The admin
    // flag comes from the server (/me, the same check the web CRM makes) with
    // the auth metadata as a backup, so an admin never gets dropped to Mine.
    let metaAdmin = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      setMe(user);
      metaAdmin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);
      if (metaAdmin) setFilter('all');
    }).catch(() => {});
    getMe().then(r => {
      const admin = !!(r?.user?.is_admin || metaAdmin);
      setFilter(admin ? 'all' : 'mine');
    }).catch(() => {});
    getAssignees().then(r => setAssignees(Array.isArray(r) ? r : (r?.employees || []))).catch(() => {});
  }, []);
  useEffect(() => { if (route.params?.mode) setMode(route.params.mode === 'team' ? 'team' : 'clients'); }, [route.params?.mode]);
  useEffect(() => { filterRef.current = filter; }, [filter]);
  useEffect(() => () => { if (undoTimer.current) clearTimeout(undoTimer.current); }, []);

  const byPhone = useMemo(() => {
    const m = {};
    for (const p of directory) m[last10(p.phone)] = p;
    return m;
  }, [directory]);
  const personOf = (phone) => byPhone[last10(phone)];
  const nameOf = (phone) => personOf(phone)?.name || fmtPhone(phone);
  // My roster id (threads are assigned to roster ids, not auth ids).
  const myRosterId = useMemo(() => assignees.find(a => a.user_id === me?.id || (a.email && me?.email && a.email.toLowerCase() === me.email.toLowerCase()))?.id || null, [assignees, me]);

  // The archived shelf is its own fetch: the inbox list leaves archived
  // threads out entirely.
  const loadArchived = useCallback(async (how) => {
    if (how !== 'silent') setArchLoading(true);
    try { setArchivedThreads(asThreads(await getImsgThreads({ archived: true }))); }
    catch (_) {}
    finally { setArchLoading(false); }
  }, []);

  // how: undefined = first load (full spinner), 'pull' = pull-to-refresh
  // spinner, 'silent' = background refresh with no spinner at all.
  const load = useCallback(async (how) => {
    if (!how) setLoading(true); else if (how === 'pull') setRefreshing(true);
    try {
      const [th, dir, ch] = await Promise.all([getImsgThreads().catch(() => []), getImsgDirectory().catch(() => []), getChatRooms().catch(() => null)]);
      const rows = asThreads(th);
      setThreads(rows);
      setDirectory(dir || []);
      const rs = ch?.rooms || [];
      setRooms(rs);
      setChatNeedsMigration(!!ch?.needs_migration);
      setInboxUnread(unreadOf(rows) + rs.filter(r => (r.unread || 0) > 0).length);
      if (filterRef.current === 'archived') loadArchived('silent').catch(() => {});
    } finally { setLoading(false); setRefreshing(false); }
  }, [loadArchived]);
  useFocusEffect(useCallback(() => { load('pull'); }, [load]));
  useEffect(() => { if (filter === 'archived') loadArchived().catch(() => {}); }, [filter, loadArchived]);
  // New texts and unread counts show up on their own while the list is on
  // screen: a quiet reload every 10 seconds, no spinner. The conversation
  // screen already polls every 6 seconds.
  useEffect(() => {
    const t = setInterval(() => { if (navigation.isFocused()) load('silent').catch(() => {}); }, 10000);
    return () => clearInterval(t);
  }, [navigation, load]);
  // A push arriving while the app is open (new text, team chat) refreshes the
  // list right away, so the badge on the other tab lights up within a second.
  useEffect(() => {
    let sub;
    try {
      const N = require('expo-notifications');
      sub = N.addNotificationReceivedListener?.(() => { if (navigation.isFocused()) load('silent').catch(() => {}); });
    } catch (_) {}
    return () => { try { sub?.remove?.(); } catch (_) {} };
  }, [navigation, load]);

  const isArchivedView = filter === 'archived';
  const list = useMemo(() => {
    const source = isArchivedView ? archivedThreads : threads;
    // Starred first, then newest. Every filter keeps that order.
    let arr = (source || []).slice().sort((a, b) => {
      const s = (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
      return s || (new Date(b.last?.created_at || 0) - new Date(a.last?.created_at || 0));
    });
    if (filter === 'mine') arr = arr.filter(t => t.assigned_to && t.assigned_to === myRosterId);
    if (filter === 'unassigned') arr = arr.filter(t => !t.assigned_to);
    if (filter === 'starred') arr = arr.filter(t => t.starred);
    const needle = q.trim().toLowerCase();
    if (!needle) return arr;
    return arr.filter(t =>
      nameOf(t.phone).toLowerCase().includes(needle) ||
      fmtPhone(t.phone).toLowerCase().includes(needle) ||
      (t.assigned_to_name || '').toLowerCase().includes(needle) ||
      (t.last?.body || '').toLowerCase().includes(needle));
  }, [threads, archivedThreads, isArchivedView, q, byPhone, filter, myRosterId]);

  // ── Row actions ──────────────────────────────────────────────────────
  const same = (a, b) => last10(a) === last10(b);
  const patchThread = (phone, patch) => {
    const apply = (arr) => arr.map(t => (same(t.phone, phone) ? { ...t, ...patch } : t));
    setThreads(apply); setArchivedThreads(apply);
  };
  const dropFrom = (setter, phone) => setter(arr => arr.filter(t => !same(t.phone, phone)));
  const putBack = (setter, thread) => setter(arr => (arr.some(t => same(t.phone, thread.phone)) ? arr : [thread, ...arr]));

  const clearUndo = () => { if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null; } setUndo(null); };
  const showUndo = (label, run) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ label, run });
    undoTimer.current = setTimeout(() => { undoTimer.current = null; setUndo(null); }, 6000);
  };
  const runUndo = () => { const u = undo; clearUndo(); u?.run?.(); };

  // Star flips right away and flips back if the server says no.
  const toggleStar = async (t) => {
    const next = !t.starred;
    patchThread(t.phone, { starred: next });
    try { await starThread(t.phone, next); }
    catch (e) { patchThread(t.phone, { starred: !next }); Alert.alert(next ? 'Could not star it' : 'Could not unstar it', e.message); }
  };

  const doArchive = async (t) => {
    closeActions();
    dropFrom(setThreads, t.phone);
    putBack(setArchivedThreads, { ...t, archived: true });
    showUndo(`Archived ${nameOf(t.phone)}`, () => doUnarchive({ ...t, archived: true }, { silent: true }));
    try { await archiveThread(t.phone, true); }
    catch (e) {
      clearUndo();
      dropFrom(setArchivedThreads, t.phone);
      putBack(setThreads, t);
      Alert.alert('Could not archive it', e.message);
    }
  };
  const doUnarchive = async (t, opts) => {
    closeActions();
    dropFrom(setArchivedThreads, t.phone);
    putBack(setThreads, { ...t, archived: false });
    if (!opts?.silent) showUndo(`${nameOf(t.phone)} is back in the inbox`, () => doArchive({ ...t, archived: false }));
    try { await archiveThread(t.phone, false); load('silent').catch(() => {}); }
    catch (e) {
      clearUndo();
      dropFrom(setThreads, t.phone);
      putBack(setArchivedThreads, t);
      Alert.alert('Could not bring it back', e.message);
    }
  };
  // Delete is a soft delete on the server: the whole team stops seeing it.
  // It is confirmed in the sheet, so there is no undo bar after it.
  const doDelete = async () => {
    const t = actionThread;
    if (!t) return;
    setDelBusy(true); setDelErr('');
    try {
      await deleteThread(t.phone);
      dropFrom(setThreads, t.phone);
      dropFrom(setArchivedThreads, t.phone);
      closeActions();
    } catch (e) { setDelErr(e.message || 'The server would not delete it.'); }
    finally { setDelBusy(false); }
  };

  const openActions = (phone) => { setActionPhone(phone); setConfirmDel(false); setDelErr(''); };
  const closeActions = () => { setActionPhone(null); setConfirmDel(false); setDelErr(''); setDelBusy(false); };
  const actionThread = useMemo(() => {
    if (!actionPhone) return null;
    return threads.find(t => same(t.phone, actionPhone)) || archivedThreads.find(t => same(t.phone, actionPhone)) || null;
  }, [actionPhone, threads, archivedThreads]);
  const actionArchived = !!actionThread && (isArchivedView || !!actionThread.archived);
  useEffect(() => { if (actionPhone && !actionThread) { setActionPhone(null); setConfirmDel(false); } }, [actionPhone, actionThread]);

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

  // One conversation row. A plain function, not an inner component, so the
  // search field above it never loses focus on a re-render.
  const threadRow = (t) => {
    const p = personOf(t.phone);
    const isUnread = (t.unread || 0) > 0;
    const temp = p?.temperature ? TEMP[p.temperature] : null;
    const kindColor = p?.kind ? KIND_COLOR[p.kind] : C.slate;
    const starred = !!t.starred;
    const who = nameOf(t.phone);
    return (
      <TouchableOpacity onPress={() => navigation.navigate('Conversation', { phone: t.phone })}
        onLongPress={() => openActions(t.phone)} delayLongPress={260} activeOpacity={0.75}
        accessibilityHint="Press and hold for star, archive and delete"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, paddingHorizontal: 16, borderRadius: 22, backgroundColor: isUnread ? C.tile : C.bg, borderWidth: isUnread ? 0 : 1, borderColor: C.line }}>
        {/* Unread: a blue dot on the left edge of the row. The assignee is a
            solid colored pill, so the two never look alike. */}
        {isUnread ? <Dot size={10} color={C.blue} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar name={who} size={44} tone={isUnread ? 'white' : 'tile'} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text numberOfLines={1} style={[T.title, { flex: 1 }]}>{who}</Text>
                <Text style={[T.meta, isUnread ? { color: C.blue } : null]}>{fmtTime(t.last?.created_at)}</Text>
                {/* The star sits up on the time line: amber when it is on, a
                    quiet outline when it is off. Amber on the top row and blue
                    on the left edge never read as the same thing, and the
                    assignee pill lives a line below it. */}
                <TouchableOpacity onPress={() => toggleStar(t)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button" accessibilityState={{ selected: starred }}
                  accessibilityLabel={starred ? `Unstar ${who}` : `Star ${who}`}>
                  <Ionicons name={starred ? 'star' : 'star-outline'} size={19} color={starred ? C.amberDot : 'rgba(11,11,16,0.3)'} />
                </TouchableOpacity>
              </View>
              <Text numberOfLines={1} style={[T.body, { fontSize: 14, color: isUnread ? C.ink : C.slate }]}>
                {t.last?.direction === 'out' ? 'You: ' : ''}{t.last?.body || mediaLabel(t.last?.attachments)}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[T.meta, { color: temp ? temp.color : kindColor }]}>
              {p?.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : 'Unknown'}{temp ? ` · ${temp.label}` : ''}
            </Text>
            <View style={{ flex: 1 }} />
            {isArchivedView ? (
              <TouchableOpacity onPress={() => doUnarchive(t)} accessibilityLabel={`Bring ${who} back to the inbox`}
                style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: isUnread ? '#FFFFFF' : C.tile }}>
                <Ionicons name="arrow-undo-outline" size={13} color={C.ink} />
                <Text style={[T.meta, { color: C.ink }]}>Unarchive</Text>
              </TouchableOpacity>
            ) : t.assigned_to_name ? (
              <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colorForEmployee(t.assigned_to || t.assigned_to_name), justifyContent: 'center' }}>
                <Text style={[T.meta, { color: '#FFFFFF' }]}>{firstName(t.assigned_to_name)}</Text>
              </View>
            ) : (
              <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(11,11,16,0.3)', justifyContent: 'center' }}>
                <Text style={T.meta}>Assign</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const emptyForFilter = () => {
    if (isArchivedView) return archLoading
      ? <ActivityIndicator color={C.ink} style={{ marginTop: 30 }} />
      : <Empty icon="archive-outline" title="Nothing archived" sub="Archived conversations wait here until you bring them back." />;
    if (filter === 'starred') return <Empty icon="star-outline" title="No starred conversations" sub="Tap the star on a row to keep it at the top of the list." />;
    return <Empty icon="chatbubbles-outline" title={filter === 'mine' ? 'Nothing assigned to you' : 'No conversations yet'} sub={filter === 'all' ? 'Texts to the business number land here.' : null} />;
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}>
            {CHIPS.map(c => <Chip key={c.v} label={c.l} icon={c.icon} active={filter === c.v} onPress={() => setFilter(c.v)} />)}
          </ScrollView>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={C.ink} />}
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
                {/* Unread: a blue dot on the left edge of the row, nothing else uses a dot here. */}
                {isUnread ? <Dot size={10} color={C.blue} /> : null}
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
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <FlatList
          data={list}
          keyExtractor={t => t.phone}
          contentContainerStyle={{ padding: 18, paddingBottom: DOCK_SPACE, gap: 10 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('pull')} tintColor={C.ink} />}
          ListHeaderComponent={isArchivedView ? <Text style={[T.sub, { marginBottom: 4 }]}>Archived conversations stay out of the inbox. Tap Unarchive to bring one back.</Text> : null}
          ListEmptyComponent={emptyForFilter()}
          renderItem={({ item: t }) => threadRow(t)}
        />
      )}

      {/* Archive: a short window to take it back. */}
      {undo ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 18, right: 18, bottom: 104 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 50, paddingLeft: 16, paddingRight: 6, borderRadius: 25, backgroundColor: C.ink, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
            <Text numberOfLines={1} style={[T.body, { flex: 1, color: '#FFFFFF' }]}>{undo.label}</Text>
            <TouchableOpacity onPress={runUndo} accessibilityLabel="Undo"
              style={{ height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[T.button, { color: '#FFFFFF' }]}>Undo</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* Long press on a conversation */}
      <Sheet visible={!!actionThread} title={actionThread ? nameOf(actionThread.phone) : ''} onClose={closeActions}>
        {actionThread && confirmDel ? (
          <View style={{ gap: 12 }}>
            <Text style={T.sub}>
              Delete hides this conversation and every message in it for everyone on the team. It does not delete anything off {nameOf(actionThread.phone)}'s phone, and it does not tell them.
            </Text>
            {delErr ? <Text style={[T.sub, { color: C.red }]}>{delErr}</Text> : null}
            <Button label="Delete for the whole team" kind="danger" icon="trash-outline" busy={delBusy} onPress={doDelete} />
            <Button label="Keep it" kind="soft" onPress={() => { setConfirmDel(false); setDelErr(''); }} />
          </View>
        ) : actionThread ? (
          <View style={{ gap: 8 }}>
            <SheetRow label={actionThread.starred ? 'Unstar' : 'Star'}
              sub={actionThread.starred ? 'Stop pinning it to the top of the list.' : 'Keeps it at the top of every filter.'}
              left={<Ionicons name={actionThread.starred ? 'star' : 'star-outline'} size={20} color={actionThread.starred ? C.amberDot : C.ink} />}
              onPress={() => { toggleStar(actionThread); closeActions(); }} />
            <SheetRow label={actionArchived ? 'Unarchive' : 'Archive'}
              sub={actionArchived ? 'Put it back in the inbox.' : 'Out of the inbox, still under Archived.'}
              left={<Ionicons name={actionArchived ? 'arrow-undo-outline' : 'archive-outline'} size={20} color={C.ink} />}
              onPress={() => (actionArchived ? doUnarchive(actionThread) : doArchive(actionThread))} />
            <SheetRow label="Delete" sub="Hides it for everyone on the team." destructive
              left={<Ionicons name="trash-outline" size={20} color={C.red} />}
              onPress={() => { setConfirmDel(true); setDelErr(''); }} />
          </View>
        ) : null}
      </Sheet>

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
