import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Sheet from '../components/Sheet';
import {
  getImsgThread, sendImsg, getImsgDirectory, getImsgEvents, getImsgNotes, addImsgNote,
  getImsgThreads, assignImsgThread, setImsgKind, setClientTemperature, getAssignees,
} from '../lib/api';
import { C } from '../lib/theme';
import { last10, firstName, fmtPhone, fmtDateTime, KIND, TEMPS, tempOf, colorForEmployee } from '../lib/imsg';

export default function ConversationScreen({ route, navigation }) {
  const phone = route.params?.phone;
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [person, setPerson] = useState(null);   // { id, kind, name, temperature }
  const [assignment, setAssignment] = useState(null); // { assigned_to, assigned_to_name }
  const [assignees, setAssignees] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const scrollRef = useRef(null);

  const loadPerson = useCallback(async () => {
    try {
      const dir = await getImsgDirectory().catch(() => []);
      setPerson((dir || []).find(p => last10(p.phone) === last10(phone)) || null);
    } catch (_) {}
  }, [phone]);
  const loadAssignment = useCallback(async () => {
    try {
      const th = await getImsgThreads().catch(() => []);
      const t = (th || []).find(x => last10(x.phone) === last10(phone));
      setAssignment(t ? { assigned_to: t.assigned_to, assigned_to_name: t.assigned_to_name } : null);
    } catch (_) {}
  }, [phone]);
  const loadMsgs = useCallback(async () => { try { setMessages(await getImsgThread(phone) || []); } catch (_) {} }, [phone]);
  const loadEvents = useCallback(async () => { try { setEvents(await getImsgEvents(phone) || []); } catch (_) {} }, [phone]);
  const loadNotes = useCallback(async () => { try { setNotes(await getImsgNotes(phone) || []); } catch (_) {} }, [phone]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadMsgs(), loadPerson(), loadAssignment(), loadEvents(), loadNotes()]);
      getAssignees().then(r => setAssignees(Array.isArray(r) ? r : (r?.employees || []))).catch(() => {});
      setLoading(false);
    })();
    const t = setInterval(() => { loadMsgs(); loadEvents(); }, 6000);
    return () => clearInterval(t);
  }, [phone]);

  useEffect(() => {
    navigation.setOptions({ title: person?.name || fmtPhone(phone) });
  }, [person, phone]);

  const timeline = useMemo(() => {
    const items = [
      ...messages.map(m => ({ t: 'msg', at: m.created_at, key: 'm' + m.id, m })),
      ...events.filter(e => e.type === 'handoff').map(e => ({ t: 'ho', at: e.created_at, key: 'e' + e.id, e })),
    ];
    items.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    return items;
  }, [messages, events]);

  const send = async () => {
    const body = input.trim();
    if (!body) return;
    setSending(true);
    try { await sendImsg(phone, body); setInput(''); await loadMsgs(); }
    catch (e) { Alert.alert('Could not send', e.message); }
    finally { setSending(false); }
  };

  const setTemp = async (key) => {
    if (!person?.id) return;
    setPerson(p => ({ ...p, temperature: key }));
    try { await setClientTemperature(person.id, key); } catch (e) { Alert.alert('Could not update', e.message); loadPerson(); }
  };
  const assign = async (emp) => {
    setAssignOpen(false);
    setAssignment({ assigned_to: emp?.id || null, assigned_to_name: emp?.name || null });
    try { await assignImsgThread(phone, emp?.id || null, emp?.name || null); loadEvents(); }
    catch (e) { Alert.alert('Could not assign', e.message); loadAssignment(); }
  };
  const changeKind = async (kind) => {
    setKindOpen(false);
    const cur = person?.kind || null;
    if (kind === cur) return;
    if (kind === 'contact' && (cur === 'lead' || cur === 'client')) {
      Alert.alert('Make this a contact?', 'This removes the lead/client record and its pipeline data. The conversation and notes stay.',
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Make contact', style: 'destructive', onPress: () => doKind(kind) }]);
      return;
    }
    doKind(kind);
  };
  const doKind = async (kind) => {
    try { await setImsgKind(phone, kind); await loadPerson(); } catch (e) { Alert.alert('Could not change type', e.message); }
  };
  const addNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    setNoteBusy(true);
    try { await addImsgNote(phone, body); setNoteText(''); await loadNotes(); }
    catch (e) { Alert.alert('Could not add note', e.message); }
    finally { setNoteBusy(false); }
  };

  const kind = person?.kind || null;
  const canTemp = !!person?.id && kind !== 'contact';

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: C.bg }}><ActivityIndicator color={C.blue} style={{ marginTop: 40 }} /></View>;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={92}>
      {/* Meta bar: type, assignee, notes, temperature */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomColor: C.border, borderBottomWidth: 1, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity onPress={() => setKindOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: kind ? `${KIND[kind].color}22` : C.surface2, borderWidth: 1, borderColor: kind ? `${KIND[kind].color}55` : C.border }}>
            <Text style={{ color: kind ? KIND[kind].color : C.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{kind ? KIND[kind].label : 'Set type'}</Text>
            <Ionicons name="chevron-down" size={11} color={kind ? KIND[kind].color : C.muted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setAssignOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: assignment?.assigned_to_name ? colorForEmployee(assignment.assigned_to || assignment.assigned_to_name) : C.surface2, borderWidth: assignment?.assigned_to_name ? 0 : 1, borderColor: C.border }}>
            <Ionicons name="person" size={11} color={assignment?.assigned_to_name ? '#fff' : C.muted} />
            <Text style={{ color: assignment?.assigned_to_name ? '#fff' : C.muted, fontSize: 11, fontWeight: '800' }}>{assignment?.assigned_to_name ? firstName(assignment.assigned_to_name) : 'Assign'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setNotesOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border }}>
            <Ionicons name="document-text" size={11} color={C.muted} />
            <Text style={{ color: C.muted, fontSize: 11, fontWeight: '800' }}>Notes{notes.length ? ` (${notes.length})` : ''}</Text>
          </TouchableOpacity>
        </View>
        {canTemp && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {TEMPS.map(t => {
              const on = person?.temperature === t.key;
              return (
                <TouchableOpacity key={t.key} onPress={() => setTemp(t.key)}
                  style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: on ? t.color : C.surface2, borderWidth: 1.5, borderColor: on ? t.color : C.border }}>
                  <Text style={{ color: on ? '#fff' : C.muted, fontSize: 12, fontWeight: '800' }}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Messages + handoffs */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
        {timeline.map(it => {
          if (it.t === 'ho') {
            const e = it.e;
            return (
              <View key={it.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 2 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ color: C.muted, fontSize: 11 }}>{e.from_name ? `${firstName(e.from_name)} →` : 'Assigned to'}</Text>
                  <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: colorForEmployee(e.to_id || e.to_name) }}>
                    <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '800' }}>{firstName(e.to_name)}</Text>
                  </View>
                </View>
                <View style={{ flex: 1, height: 1, backgroundColor: C.border }} />
              </View>
            );
          }
          const m = it.m;
          const out = m.direction === 'out';
          const failed = out && m.status === 'failed';
          return (
            <View key={it.key} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              <View style={{ paddingVertical: 9, paddingHorizontal: 13, borderRadius: 16, backgroundColor: out ? (failed ? C.red : C.blue) : C.surface2, borderWidth: out ? 0 : 1, borderColor: C.border }}>
                <Text style={{ color: out ? '#fff' : C.text, fontSize: 15, lineHeight: 20 }}>{m.body}</Text>
              </View>
              <Text style={{ color: failed ? C.red : C.muted, fontSize: 10.5, marginTop: 3, textAlign: out ? 'right' : 'left' }}>
                {fmtDateTime(m.created_at)}{out && m.status ? ` · ${m.status}` : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Input */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopColor: C.border, borderTopWidth: 1, backgroundColor: C.surface }}>
        <TextInput style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text, maxHeight: 120 }}
          placeholder="Message" placeholderTextColor={C.muted} value={input} onChangeText={setInput} multiline />
        <TouchableOpacity onPress={send} disabled={sending || !input.trim()}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', opacity: (sending || !input.trim()) ? 0.5 : 1 }}>
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Assign sheet */}
      <Sheet visible={assignOpen} title="Assign conversation" onClose={() => setAssignOpen(false)}>
        {assignment?.assigned_to_name ? (
          <TouchableOpacity onPress={() => assign(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
            <Ionicons name="close-circle" size={20} color={C.muted} /><Text style={{ color: C.muted, fontSize: 15 }}>Unassign</Text>
          </TouchableOpacity>
        ) : null}
        {assignees.length === 0 && <Text style={{ color: C.muted, paddingVertical: 12 }}>No employees on the roster yet.</Text>}
        {assignees.map(a => (
          <TouchableOpacity key={a.id} onPress={() => assign(a)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colorForEmployee(a.id) }} />
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '600' }}>{a.name}</Text>
            {assignment?.assigned_to === a.id && <Ionicons name="checkmark" size={18} color={C.blue} />}
          </TouchableOpacity>
        ))}
      </Sheet>

      {/* Type sheet */}
      <Sheet visible={kindOpen} title="Conversation type" onClose={() => setKindOpen(false)}>
        {['lead', 'client', 'contact'].map(k => (
          <TouchableOpacity key={k} onPress={() => changeKind(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: KIND[k].color }} />
            <Text style={{ flex: 1, color: C.text, fontSize: 15, fontWeight: '600', textTransform: 'capitalize' }}>{k}</Text>
            {kind === k && <Ionicons name="checkmark" size={18} color={C.blue} />}
          </TouchableOpacity>
        ))}
      </Sheet>

      {/* Notes sheet */}
      <Sheet visible={notesOpen} title="Internal notes" onClose={() => setNotesOpen(false)}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text }}
            placeholder="Note for the team…" placeholderTextColor={C.muted} value={noteText} onChangeText={setNoteText} multiline />
          <TouchableOpacity onPress={addNote} disabled={noteBusy || !noteText.trim()} style={{ backgroundColor: C.blue, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', opacity: (noteBusy || !noteText.trim()) ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{noteBusy ? '…' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ marginTop: 6 }}>
          {notes.length === 0 && <Text style={{ color: C.muted, paddingVertical: 10 }}>No notes yet.</Text>}
          {notes.map(n => (
            <View key={n.id} style={{ paddingVertical: 8, borderBottomColor: C.border, borderBottomWidth: 1 }}>
              <Text style={{ color: C.text, fontSize: 14, lineHeight: 19 }}>{n.body}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colorForEmployee(n.author_email || n.author_name) }} />
                <Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>{n.author_name || 'Someone'}</Text>
                <Text style={{ color: C.muted, fontSize: 11 }}>· {fmtDateTime(n.created_at)}</Text>
              </View>
            </View>
          ))}
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}
