import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { getReminders, updateReminder, deleteReminder } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Label, Check, Avatar, Empty, DOCK_SPACE } from './ui';
import { firstName } from '../lib/imsg';

// The Reminders page inside the Tasks space: today, coming up, the ones you
// sent to others (with delivered / done), and what got done today.
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtClock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtDay = (iso) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
const fmtDayLong = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function RemindersView({ me, onAdd }) {
  const [items, setItems] = useState([]);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const r = await getReminders();
      setItems(r?.reminders || []);
      setNeedsMigration(!!r?.needs_migration);
    } catch (e) { setItems([]); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const today = dayKey(new Date());
  const myId = me?.id;
  const forMe = items.filter(r => r.for_user === myId);
  const todayList = forMe.filter(r => r.status !== 'done' && dayKey(new Date(r.remind_at)) <= today);
  const upcoming = forMe.filter(r => r.status !== 'done' && dayKey(new Date(r.remind_at)) > today);
  const sent = items.filter(r => r.created_by === myId && r.for_user !== myId);
  const doneToday = forMe.filter(r => r.status === 'done');

  const toggle = async (r) => {
    const next = r.status !== 'done';
    setItems(prev => prev.map(x => x.id === r.id ? { ...x, status: next ? 'done' : 'scheduled', done_at: next ? new Date().toISOString() : null } : x));
    try { await updateReminder(r.id, { done: next }); }
    catch (e) { Alert.alert('Could not update', e.message); load(true); }
  };
  const remove = (r) => Alert.alert('Delete this reminder?', r.title, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteReminder(r.id); load(true); } catch (e) { Alert.alert('Could not delete', e.message); } } },
  ]);

  const Row = ({ r, mineToTick = true }) => {
    const fromOther = r.created_by && r.created_by !== myId;
    const past = new Date(r.remind_at).getTime() < Date.now();
    return (
      <TouchableOpacity onLongPress={() => remove(r)} activeOpacity={0.85}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: mineToTick ? C.tile : '#FFFFFF', borderWidth: mineToTick ? 0 : 1, borderColor: C.line }}>
        {mineToTick ? <Check done={r.status === 'done'} onPress={() => toggle(r)} label={r.title} /> : <Avatar name={r.for_user_name} size={24} tone="violet" />}
        {mineToTick && (fromOther ? <Avatar name={r.created_by_name} size={22} tone="violet" /> : r.source === 'assistant'
          ? <Ionicons name="sparkles" size={18} color={C.violet} /> : <Ionicons name="notifications-outline" size={18} color={C.slate} />)}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[T.body, { fontFamily: F.semi, color: r.status === 'done' ? C.slate : C.ink, textDecorationLine: r.status === 'done' ? 'line-through' : 'none' }]}>{r.title}</Text>
          <Text numberOfLines={1} style={T.sub}>
            {mineToTick
              ? (fromOther ? `From ${firstName(r.created_by_name)}` : r.source === 'assistant' ? 'Set by telling the assistant' : r.task_type ? 'On a task' : 'Reminder')
              : `To ${firstName(r.for_user_name)} · ${fmtDay(r.remind_at)} ${fmtClock(r.remind_at)}`}
          </Text>
        </View>
        {mineToTick ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[T.title, { fontSize: 14, color: past && r.status !== 'done' ? C.red : C.ink }]}>{fmtClock(r.remind_at)}</Text>
            {dayKey(new Date(r.remind_at)) !== today ? <Text style={T.meta}>{fmtDay(r.remind_at)} {fmtDayLong(r.remind_at)}</Text> : null}
          </View>
        ) : (
          <Text style={[T.meta, { color: r.status === 'done' ? C.green : r.status === 'sent' ? C.green : C.slate }]}>
            {r.status === 'done' ? `Done ${fmtClock(r.done_at)}` : r.status === 'sent' ? 'Delivered' : 'Scheduled'}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading && items.length === 0) return <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: DOCK_SPACE + 56, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>
      {needsMigration ? (
        <Empty icon="notifications-outline" title="Reminders are almost ready" sub="One database table still needs to be created (docs/sql/reminders.sql). Everything else is wired." />
      ) : items.length === 0 ? (
        <Empty icon="notifications-outline" title="No reminders yet" sub={'Tap the plus, or tell the assistant "remind me Tuesday at 7:30 to prep for the call".'} />
      ) : null}

      {todayList.length > 0 && (
        <View style={{ gap: 6 }}>
          <Label right="Push at the time shown">Today</Label>
          {todayList.map(r => <Row key={r.id} r={r} />)}
        </View>
      )}
      {upcoming.length > 0 && (
        <View style={{ gap: 6 }}>
          <Label>Coming up</Label>
          {upcoming.map(r => <Row key={r.id} r={r} />)}
        </View>
      )}
      {sent.length > 0 && (
        <View style={{ gap: 6 }}>
          <Label right="They get the push, you get the status">Sent to others</Label>
          {sent.map(r => <Row key={r.id} r={r} mineToTick={false} />)}
        </View>
      )}
      {doneToday.length > 0 && (
        <View style={{ gap: 6 }}>
          <Label>Done</Label>
          {doneToday.map(r => <Row key={r.id} r={r} />)}
        </View>
      )}
      {!needsMigration && items.length > 0 ? <Text style={[T.sub, { paddingHorizontal: 4 }]}>Hold a reminder to delete it. Any task can carry one, and the assistant can set them for you or a teammate.</Text> : null}
    </ScrollView>
  );
}
