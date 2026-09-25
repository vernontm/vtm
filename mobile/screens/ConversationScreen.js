import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sheet, { SheetRow } from '../components/Sheet';
import { openAssistant } from '../lib/nav';
import {
  getImsgThread, sendImsg, getImsgDirectory, getImsgEvents, getImsgNotes, addImsgNote,
  getImsgThreads, assignImsgThread, setImsgKind, setClientTemperature, getAssignees, markImsgRead, getAvailability,
} from '../lib/api';
import { C, T, F } from '../lib/theme';
import { Screen, IconButton, Avatar, Chip, Dot, GradientChip, Orb, TEMP, KIND_COLOR } from '../components/ui';
import { last10, firstName, fmtPhone, fmtDateTime, KIND, TEMPS, colorForEmployee } from '../lib/imsg';

// Rough detector for "this conversation is about setting up a time".
const SCHED_RE = /\b(meet|meeting|meet ?up|schedule|scheduling|availab|appointment|calendar|what time|when (are|can|could|is|works?|would)|free|book|sit ?down|come in|stop by|get together|reschedul)\b/i;

export default function ConversationScreen({ route, navigation }) {
  const phone = route.params?.phone;
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [events, setEvents] = useState([]);
  const [notes, setNotes] = useState([]);
  const [person, setPerson] = useState(null);   // { id, kind, name, temperature }
  const [assignment, setAssignment] = useState(null); // { assigned_to, assigned_to_name }
  const [assignees, setAssignees] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [suggestSlots, setSuggestSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [kindOpen, setKindOpen] = useState(false);
  const [tempOpen, setTempOpen] = useState(false);
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
    markImsgRead(phone).catch(() => {});
    const t = setInterval(() => { loadMsgs(); loadEvents(); markImsgRead(phone).catch(() => {}); }, 6000);
    return () => clearInterval(t);
  }, [phone]);

  const timeline = useMemo(() => {
    const items = [
      ...messages.map(m => ({ t: 'msg', at: m.created_at, key: 'm' + m.id, m })),
      ...events.filter(e => e.type === 'handoff').map(e => ({ t: 'ho', at: e.created_at, key: 'e' + e.id, e })),
    ];
    items.sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
    return items;
  }, [messages, events]);

  // Scheduling suggestions when the conversation is about setting up a time.
  const lastMsgId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (!messages.length) { setSuggestSlots([]); return; }
    const recent = messages.slice(-8).map(m => m.body || '').join(' ');
    if (!SCHED_RE.test(recent)) { setSuggestSlots([]); return; }
    let cancelled = false;
    getAvailability({ duration: 60, days: 10, limit: 30 }).then(r => {
      if (cancelled) return;
      const tz = r?.tz || 'America/Chicago';
      const seen = new Set(); const pick = [];
      for (const s of (r?.slots || [])) {
        const day = new Date(s.start).toLocaleDateString('en-US', { timeZone: tz });
        if (seen.has(day)) continue;
        seen.add(day); pick.push(s);
        if (pick.length >= 3) break;
      }
      setSuggestSlots(pick);
    }).catch(() => setSuggestSlots([]));
    return () => { cancelled = true; };
  }, [lastMsgId]);

  const proposeTime = (s) => {
    setInput(prev => { const b = (prev || '').trim(); return b ? `${b} Or ${s.label}?` : `Would ${s.label} work for you?`; });
  };

  const send = async () => {
    const body = input.trim();
    if (!body) return;
    setSending(true);
    try { await sendImsg(phone, body); setInput(''); await loadMsgs(); }
    catch (e) { Alert.alert('Could not send', e.message); }
    finally { setSending(false); }
  };

  const setTemp = async (key) => {
    setTempOpen(false);
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
  const temp = person?.temperature ? TEMP[person.temperature] : null;
  const name = person?.name || fmtPhone(phone);
  const subLine = [person?.kind ? KIND[person.kind].label : null, fmtPhone(phone)].filter(Boolean).join(' · ');
  const draftWithAssistant = () => openAssistant({ prompt: `Draft a short, friendly text reply to ${name}${person?.kind ? ` (a ${person.kind})` : ''}. Recent messages: ${messages.slice(-6).map(m => `${m.direction === 'out' ? 'Us' : name}: ${m.body}`).join(' | ')}` });

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 10, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton icon="chevron-back" onPress={() => navigation.goBack()} label="Back to Inbox" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[T.h3, { fontSize: 22, lineHeight: 26 }]}>{name}</Text>
              <Text numberOfLines={1} style={T.sub}>{subLine}</Text>
            </View>
            <IconButton icon="call-outline" onPress={() => Linking.openURL(`tel:${phone}`)} label={`Call ${name}`} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            <Chip label={kind ? KIND[kind].label : 'Set type'} icon="chevron-down" color={kind ? KIND_COLOR[kind] : C.slate} onPress={() => setKindOpen(true)} />
            {canTemp ? (
              <TouchableOpacity onPress={() => setTempOpen(true)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.tile, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Dot color={temp ? temp.dot : C.slate} />
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: temp ? temp.color : C.slate }}>{temp ? temp.label : 'Temperature'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => setAssignOpen(true)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.tile, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot size={16} color={assignment?.assigned_to_name ? colorForEmployee(assignment.assigned_to || assignment.assigned_to_name) : C.slate} />
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.ink }}>{assignment?.assigned_to_name ? firstName(assignment.assigned_to_name) : 'Assign'}</Text>
              <Ionicons name="chevron-down" size={14} color={C.slate} />
            </TouchableOpacity>
            <Chip label={`Notes${notes.length ? ` · ${notes.length}` : ''}`} onPress={() => setNotesOpen(true)} />
          </ScrollView>
        </View>

        {/* Messages + handoffs */}
        {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 10, gap: 10 }}
            keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {timeline.map(it => {
              if (it.t === 'ho') {
                const e = it.e;
                return (
                  <View key={it.key} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: C.tile, marginVertical: 4 }}>
                    <Dot size={16} color={colorForEmployee(e.to_id || e.to_name)} />
                    <Text style={T.meta}>{e.from_name ? `${firstName(e.from_name)} handed this to ${firstName(e.to_name)}` : `Assigned to ${firstName(e.to_name)}`} · {fmtDateTime(e.created_at)}</Text>
                  </View>
                );
              }
              const m = it.m;
              const out = m.direction === 'out';
              const failed = out && m.status === 'failed';
              return (
                <View key={it.key} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 3 }}>
                  <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22, borderBottomRightRadius: out ? 6 : 22, borderBottomLeftRadius: out ? 22 : 6, backgroundColor: out ? (failed ? C.red : C.ink) : C.tile }}>
                    <Text style={[T.message, { color: out ? '#FFFFFF' : C.ink }]}>{m.body}</Text>
                  </View>
                  <Text style={[T.meta, { fontSize: 11, color: failed ? C.red : C.slate, textAlign: out ? 'right' : 'left' }]}>
                    {fmtDateTime(m.created_at)}{out && m.status ? ` · ${m.status}` : ''}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Suggestions + composer */}
        <View style={{ gap: 10, paddingHorizontal: 18, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 6, backgroundColor: C.bg }}>
          {suggestSlots.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
              <Text style={[T.meta, { color: C.violet }]}>Free times</Text>
              {suggestSlots.map(s => <GradientChip key={s.start} label={s.label} onPress={() => proposeTime(s)} />)}
            </ScrollView>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', minHeight: 50, borderRadius: 25, backgroundColor: C.tile, paddingLeft: 8, paddingRight: 14, paddingVertical: 8 }}>
              <Orb size={34} icon="sparkles" label="Ask the assistant to write" onPress={draftWithAssistant} style={{ shadowOpacity: 0 }} />
              <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, paddingHorizontal: 10, paddingVertical: 6, maxHeight: 120 }}
                placeholder="Message" placeholderTextColor={C.slate} value={input} onChangeText={setInput} multiline />
            </View>
            <TouchableOpacity onPress={send} disabled={sending || !input.trim()} accessibilityLabel="Send"
              style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (sending || !input.trim()) ? 0.5 : 1 }}>
              <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Assign sheet */}
        <Sheet visible={assignOpen} title="Assign conversation" onClose={() => setAssignOpen(false)}>
          {assignees.length === 0 && <Text style={T.sub}>No employees on the roster yet.</Text>}
          {assignees.map(a => (
            <SheetRow key={a.id} label={a.name} sub={a.kind || null} color={colorForEmployee(a.id)} selected={assignment?.assigned_to === a.id} onPress={() => assign(a)} />
          ))}
          {assignment?.assigned_to_name ? <SheetRow label="Unassign" destructive onPress={() => assign(null)} /> : null}
        </Sheet>

        {/* Type sheet */}
        <Sheet visible={kindOpen} title="Conversation type" onClose={() => setKindOpen(false)}>
          {['lead', 'client', 'contact'].map(k => (
            <SheetRow key={k} label={KIND[k].label} color={KIND_COLOR[k]} selected={kind === k} onPress={() => changeKind(k)}
              sub={k === 'lead' ? 'In the pipeline, with a temperature' : k === 'client' ? 'Signed, with agreements and payments' : 'Someone you talk to'} />
          ))}
        </Sheet>

        {/* Temperature sheet */}
        <Sheet visible={tempOpen} title="Lead temperature" onClose={() => setTempOpen(false)}>
          {TEMPS.map(t => (
            <SheetRow key={t.key} label={t.label} color={TEMP[t.key].dot} selected={person?.temperature === t.key} onPress={() => setTemp(t.key)} />
          ))}
        </Sheet>

        {/* Notes sheet */}
        <Sheet visible={notesOpen} title="Internal notes" onClose={() => setNotesOpen(false)}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <TextInput style={{ flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 14, paddingVertical: 12, fontFamily: F.body, fontSize: 15, color: C.ink }}
              placeholder="Note for the team" placeholderTextColor={C.slate} value={noteText} onChangeText={setNoteText} multiline />
            <TouchableOpacity onPress={addNote} disabled={noteBusy || !noteText.trim()} accessibilityLabel="Add note"
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (noteBusy || !noteText.trim()) ? 0.5 : 1 }}>
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {notes.length === 0 && <Text style={T.sub}>No notes yet.</Text>}
          {notes.map(n => (
            <View key={n.id} style={{ padding: 14, borderRadius: 16, backgroundColor: C.tile, gap: 6 }}>
              <Text style={T.body}>{n.body}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Dot size={8} color={colorForEmployee(n.author_email || n.author_name)} />
                <Text style={T.meta}>{n.author_name || 'Someone'} · {fmtDateTime(n.created_at)}</Text>
              </View>
            </View>
          ))}
        </Sheet>
      </KeyboardAvoidingView>
    </Screen>
  );
}
