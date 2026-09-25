import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getChatPeople, getRoutines, createRoutine, updateRoutine, addTeamTodo, addReminder } from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, IconButton, Label, Chip, Segmented, Button, Check, Avatar } from '../components/ui';
import DateField from '../components/DateField';
import { firstName } from '../lib/imsg';

// New task (or reminder) sheet. One-off tasks are team to-dos: assign them to
// a teammate and they get the push. Repeating tasks go on a routine list
// (admins). Any of them can carry a push reminder at a time.
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nextHour = () => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export default function NewTaskScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const mode = route.params?.mode === 'reminder' ? 'reminder' : 'task';
  const [me, setMe] = useState(null);
  const [members, setMembers] = useState([]);
  const [routines, setRoutines] = useState([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('oneoff');          // oneoff | repeating
  const [cadence, setCadence] = useState('daily');
  const [listId, setListId] = useState('new');        // routine id or 'new'
  const [listTitle, setListTitle] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [assignee, setAssignee] = useState('me');
  const [remind, setRemind] = useState(mode === 'reminder');
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState(nextHour());
  const [busy, setBusy] = useState(false);

  const isAdmin = !!(me?.user_metadata?.is_admin || me?.app_metadata?.is_admin);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMe(user)).catch(() => {});
    // Teammates only (admins, CRM access, roster), never client portal logins.
    getChatPeople().then(r => setMembers(r?.people || [])).catch(() => {});
    getRoutines().then(r => setRoutines(r?.routines || [])).catch(() => {});
  }, []);

  const others = useMemo(() => members.filter(m => m.id !== me?.id), [members, me?.id]);
  const target = assignee === 'me' ? { id: me?.id, name: 'You' } : members.find(m => m.id === assignee);
  const remindAt = () => { const [h, mi] = String(time).split(':'); const d = new Date(`${date}T${pad(parseInt(h, 10) || 0)}:${pad(parseInt(mi, 10) || 0)}:00`); return d; };
  const field = { minHeight: 48, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 16, paddingVertical: 12, fontFamily: F.body, fontSize: 16, color: C.ink };

  const save = async () => {
    const text = title.trim();
    if (!text) return Alert.alert('Give it a name');
    if (remind && isNaN(remindAt())) return Alert.alert('Check the date and time');
    if (remind && remindAt().getTime() < Date.now() - 60000) return Alert.alert('That time has already passed');
    setBusy(true);
    try {
      if (mode === 'reminder') {
        await addReminder({ title: text, remind_at: remindAt().toISOString(), for_user: target?.id, for_user_name: target?.name === 'You' ? null : target?.name });
      } else if (kind === 'repeating') {
        const item = { id: newId(), text };
        if (listId === 'new') {
          if (!listTitle.trim()) return Alert.alert('Name the list', 'For example "Sales daily".');
          await createRoutine({ title: listTitle.trim(), cadence, items: [item] });
        } else {
          const r = routines.find(x => x.id === listId);
          await updateRoutine(listId, { items: [...(r?.items || []), item] });
        }
      } else {
        const row = await addTeamTodo({ title: text, urgent, assigned_to: assignee === 'me' ? null : assignee, assigned_to_name: assignee === 'me' ? null : target?.name });
        if (remind) {
          await addReminder({ title: text, remind_at: remindAt().toISOString(), for_user: target?.id, for_user_name: target?.name === 'You' ? null : target?.name, task_type: 'todo', task_id: row?.id });
        }
      }
      navigation.goBack();
    } catch (e) { Alert.alert('Could not save', e.message); }
    finally { setBusy(false); }
  };

  const heading = mode === 'reminder' ? 'New reminder' : 'New task';
  const cta = mode === 'reminder'
    ? (assignee === 'me' ? 'Set reminder' : `Remind ${firstName(target?.name)}`)
    : kind === 'repeating' ? 'Add to the list' : (assignee === 'me' ? 'Add task' : `Assign to ${firstName(target?.name)}`);

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: Platform.OS === 'ios' ? 14 : insets.top + 14, paddingBottom: Math.max(insets.bottom, 18) + 10, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(11,11,16,0.18)', alignSelf: 'center' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={T.h3}>{heading}</Text>
            <IconButton icon="close" onPress={() => navigation.goBack()} label="Close" size={40} />
          </View>

          <View style={{ gap: 8 }}>
            <Label>{mode === 'reminder' ? 'Remind about' : 'Task'}</Label>
            <TextInput autoFocus style={field} placeholder={mode === 'reminder' ? 'Prep for the Marcus call' : 'Reach out to 50 leads'} placeholderTextColor={C.slate} value={title} onChangeText={setTitle} />
          </View>

          {mode === 'task' && isAdmin && (
            <View style={{ gap: 8 }}>
              <Label>Kind</Label>
              <Segmented value={kind} onChange={setKind} options={[{ value: 'oneoff', label: 'One-off' }, { value: 'repeating', label: 'Repeating' }]} />
              {kind === 'repeating' && (
                <View style={{ gap: 10 }}>
                  <Text style={T.sub}>Repeating tasks live on a list that resets every day, week or month. Everyone with the app sees the list.</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                    <Chip label="New list" active={listId === 'new'} onPress={() => setListId('new')} />
                    {routines.map(r => <Chip key={r.id} label={r.title} active={listId === r.id} onPress={() => setListId(r.id)} />)}
                  </ScrollView>
                  {listId === 'new' && (
                    <>
                      <TextInput style={field} placeholder="List name, for example Sales daily" placeholderTextColor={C.slate} value={listTitle} onChangeText={setListTitle} />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[['daily', 'Every day'], ['weekly', 'Every week'], ['monthly', 'Every month']].map(([v, l]) => <Chip key={v} label={l} active={cadence === v} onPress={() => setCadence(v)} />)}
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {(mode === 'reminder' || kind === 'oneoff') && (
            <View style={{ gap: 8 }}>
              <Label>{mode === 'reminder' ? 'For' : 'Assign to'}</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                <Chip label="Me" active={assignee === 'me'} onPress={() => setAssignee('me')} />
                {others.map(m => <Chip key={m.id} label={firstName(m.name)} active={assignee === m.id} onPress={() => setAssignee(m.id)} />)}
              </ScrollView>
              {assignee !== 'me' && target ? (
                <Text style={T.sub}>{firstName(target.name)} gets a push now{remind ? ` and again at ${time}` : ''}. It lands in {mode === 'reminder' ? 'their reminders' : 'their list'}; you get a notice when it is checked off.</Text>
              ) : null}
            </View>
          )}

          {mode === 'task' && kind === 'oneoff' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.tile }}>
              <Check done={urgent} onPress={() => setUrgent(u => !u)} label="Urgent" />
              <Text style={[T.body, { fontFamily: F.semi, flex: 1 }]}>Urgent</Text>
            </View>
          )}

          {kind !== 'repeating' && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.tile }}>
                {mode === 'reminder' ? <Ionicons name="notifications-outline" size={20} color={C.slate} /> : <Check done={remind} onPress={() => setRemind(r => !r)} label="Push reminder" />}
                <Text style={[T.body, { fontFamily: F.semi, flex: 1 }]}>{mode === 'reminder' ? 'Push at' : 'Push reminder at'}</Text>
              </View>
              {remind && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, minWidth: 0 }}><DateField value={date} onChange={setDate} /></View>
                  <View style={{ width: 120 }}><DateField mode="time" value={time} onChange={setTime} /></View>
                </View>
              )}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button label="Cancel" kind="soft" onPress={() => navigation.goBack()} />
            <Button label={cta} onPress={save} busy={busy} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
