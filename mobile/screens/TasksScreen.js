import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getRoutines, checkRoutineItem, getTeamTodos, updateTeamTodo } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, HeaderBar, IconButton, Tile, Label, Progress, Check, Dot, Avatar, Empty, FloatingSwitch, DOCK_SPACE } from '../components/ui';
import { routineRows, myTodos, CADENCE_LABEL } from '../lib/tasks';
import RemindersView from '../components/RemindersView';
import { firstName } from '../lib/imsg';

// Tasks: three groups on one page. The recurring lists (routines: the role's
// daily list, weekly and monthly ones), and the one-offs anyone adds (team
// to-dos, assignable). The switch above the dock flips to Reminders.
export default function TasksScreen({ navigation, route }) {
  const [view, setView] = useState(route.params?.view === 'reminders' ? 'reminders' : 'tasks');
  const [me, setMe] = useState(null);
  const [routines, setRoutines] = useState(null);
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => setMe(user)).catch(() => {}); }, []);
  useEffect(() => { if (route.params?.view) setView(route.params.view === 'reminders' ? 'reminders' : 'tasks'); }, [route.params?.view]);

  const load = useCallback(async (quiet) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    try {
      const [rt, td] = await Promise.all([getRoutines().catch(() => ({ routines: [], checks: [] })), getTeamTodos().catch(() => [])]);
      setRoutines(rt);
      setTodos(td || []);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const rows = useMemo(() => routineRows(routines), [routines]);
  const mine = useMemo(() => myTodos(todos, me?.id), [todos, me?.id]);
  const total = rows.length + mine.length;
  const done = rows.filter(r => r.done).length + mine.filter(t => t.done).length;

  // Group routine rows by routine, daily lists first.
  const groups = useMemo(() => {
    const order = { daily: 0, weekly: 1, monthly: 2 };
    const list = (routines?.routines || []).slice().sort((a, b) => (order[a.cadence] ?? 3) - (order[b.cadence] ?? 3) || (a.position || 0) - (b.position || 0));
    return list.map(r => ({ routine: r, rows: rows.filter(x => x.routineId === r.id) })).filter(g => g.rows.length);
  }, [routines, rows]);

  const toggleRoutine = async (row) => {
    const next = !row.done;
    setRoutines(prev => {
      const checks = (prev?.checks || []).filter(c => !(c.item_id === row.itemId && c.period_key === row.periodKey));
      if (next) checks.push({ item_id: row.itemId, period_key: row.periodKey, done_by_name: 'You', done_at: new Date().toISOString() });
      return { ...prev, checks };
    });
    try { await checkRoutineItem(row.routineId, row.itemId, row.periodKey, next); }
    catch (e) { Alert.alert('Could not update', e.message); load(true); }
  };
  const toggleTodo = async (t) => {
    const next = !t.done;
    setTodos(prev => prev.map(x => x.id === t.id ? { ...x, done: next, done_at: next ? new Date().toISOString() : null } : x));
    try { await updateTeamTodo(t.id, { done: next }); }
    catch (e) { Alert.alert('Could not update', e.message); load(true); }
  };

  const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const myFirst = firstName(me?.user_metadata?.name || me?.user_metadata?.full_name || (me?.email || '').split('@')[0]);

  return (
    <Screen>
      <HeaderBar title={view === 'tasks' ? 'Tasks' : 'Reminders'} sub={`${dateLine}${myFirst ? ` · ${myFirst}` : ''}`} onBack={() => navigation.goBack()}
        right={<IconButton icon="add" dark label={view === 'tasks' ? 'Add a task' : 'Add a reminder'} onPress={() => navigation.navigate('NewTask', { mode: view === 'tasks' ? 'task' : 'reminder' })} />} />

      {view === 'reminders' ? (
        <RemindersView me={me} onAdd={() => navigation.navigate('NewTask', { mode: 'reminder' })} />
      ) : loading && !routines ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, paddingBottom: DOCK_SPACE + 56, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.ink} />}>
          <Tile style={{ gap: 8, paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[T.h3, { fontSize: 22 }]}>{total ? `${done} of ${total} done` : 'Nothing on the list'}</Text>
              <Text style={T.meta}>Daily lists reset each morning</Text>
            </View>
            <Progress value={total ? done / total : 0} />
          </Tile>

          {groups.map(g => (
            <View key={g.routine.id} style={{ gap: 6 }}>
              <Label right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="repeat" size={12} color={C.slate} /><Text style={T.meta}>{CADENCE_LABEL[g.routine.cadence] || 'Repeats'}</Text></View>}>{g.routine.title}</Label>
              {g.rows.map(r => (
                <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: C.tile }}>
                  <Check done={r.done} onPress={() => toggleRoutine(r)} label={r.text} />
                  <Text style={[T.body, { flex: 1, fontFamily: F.semi, color: r.done ? C.slate : C.ink, textDecorationLine: r.done ? 'line-through' : 'none' }]}>{r.text}</Text>
                  {r.done && r.doneBy ? <Text style={[T.meta, { color: C.green }]}>{r.doneBy === 'You' ? 'Done' : firstName(r.doneBy)}</Text> : null}
                </View>
              ))}
            </View>
          ))}

          <View style={{ gap: 6 }}>
            <Label right="Added by anyone">One-off</Label>
            {mine.length === 0 ? <Text style={[T.sub, { paddingHorizontal: 4 }]}>Nothing added for today. Tap the plus to add one, or ask the assistant.</Text> : null}
            {mine.map(t => {
              const fromOther = t.created_by && t.created_by !== me?.id;
              return (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line }}>
                  <Check done={t.done} onPress={() => toggleTodo(t)} label={t.title} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[T.body, { fontFamily: F.semi, color: t.done ? C.slate : C.ink, textDecorationLine: t.done ? 'line-through' : 'none' }]}>{t.title}</Text>
                    {t.link_label ? <Text style={T.sub}>{t.link_label}</Text> : null}
                  </View>
                  {t.urgent && !t.done ? <Text style={[T.meta, { color: C.red }]}>Urgent</Text> : null}
                  {fromOther ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Avatar name={t.created_by_name} size={20} tone="ink" />
                      <Text style={T.meta}>from {firstName(t.created_by_name)}</Text>
                    </View>
                  ) : t.assigned_to_name && t.assigned_to !== me?.id ? (
                    <Text style={T.meta}>for {firstName(t.assigned_to_name)}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      <FloatingSwitch value={view} onChange={setView} options={[{ value: 'tasks', label: 'Tasks' }, { value: 'reminders', label: 'Reminders' }]} />
    </Screen>
  );
}
