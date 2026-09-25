import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import Sheet, { SheetRow } from '../components/Sheet';
import { getChatRooms, getChatMessages, sendChat, renameChat, changeChatMembers, markChatRead, leaveChat, getChatPeople, askAssistant, proposeActions } from '../lib/api';
import { goToConversation } from '../lib/nav';
import { C, T, F } from '../lib/theme';
import { Screen, IconButton, Avatar, Chip, Button, Label, Orb, GradientChip } from '../components/ui';
import { firstName, fmtDateTime, fmtPhone } from '../lib/imsg';

// One team chat room: a direct message or a group. Mine on the right in ink,
// theirs on the left with the sender's name in a group. The people button
// opens members and the group name.
export default function TeamChatScreen({ route, navigation }) {
  const roomId = route.params?.room;
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState(null);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);
  // The assistant in this chat: drafts for the team, and actions it spots
  // in the conversation (text a customer to reschedule, confirm, follow up).
  const [draftOpen, setDraftOpen] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftInput, setDraftInput] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [actions, setActions] = useState([]);
  const [actionsBusy, setActionsBusy] = useState(false);
  const draftHistory = useRef([]);
  const scrollRef = useRef(null);
  const lastAt = useRef(null);

  const loadRoom = useCallback(async () => {
    try {
      const r = await getChatRooms();
      const found = (r?.rooms || []).find(x => x.id === roomId) || null;
      setRoom(found);
      if (found) setNameDraft(found.name || '');
    } catch (_) {}
  }, [roomId]);
  const loadMsgs = useCallback(async (incremental) => {
    try {
      const r = await getChatMessages(roomId, incremental ? lastAt.current : null);
      const rows = r?.messages || [];
      if (incremental) {
        if (rows.length) setMessages(prev => {
          const have = new Set(prev.map(m => m.id));
          return [...prev, ...rows.filter(m => !have.has(m.id))];
        });
      } else setMessages(rows);
      if (rows.length) lastAt.current = rows[rows.length - 1].created_at;
      if (rows.length) markChatRead(roomId).catch(() => {});
    } catch (_) {}
  }, [roomId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMe(user)).catch(() => {});
    (async () => { setLoading(true); await Promise.all([loadRoom(), loadMsgs(false)]); setLoading(false); })();
    markChatRead(roomId).catch(() => {});
    const t = setInterval(() => loadMsgs(true), 5000);
    return () => clearInterval(t);
  }, [roomId]);

  const others = useMemo(() => (room?.members || []).filter(m => m.user_id !== me?.id), [room, me?.id]);
  const isGroup = room?.kind === 'group' || (room?.members || []).length > 2;
  const title = isGroup ? (room?.name || 'Group chat') : (others[0]?.user_name || 'Chat');
  const subtitle = isGroup ? (room?.members || []).map(m => m.user_id === me?.id ? 'You' : firstName(m.user_name)).join(', ') : 'Direct message';
  const myRole = (room?.members || []).find(m => m.user_id === me?.id)?.role;
  const isAdmin = !!(me?.user_metadata?.is_admin || me?.app_metadata?.is_admin);
  const canManage = myRole === 'admin' || isAdmin;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try { await sendChat(roomId, text); setInput(''); await loadMsgs(true); }
    catch (e) { Alert.alert('Could not send', e.message); }
    finally { setSending(false); }
  };

  const openPeople = async () => {
    setPeopleOpen(true);
    if (!people.length) getChatPeople().then(r => setPeople(r?.people || [])).catch(() => {});
  };
  const saveName = async () => {
    const name = nameDraft.trim();
    if (!name || name === room?.name) return;
    setBusy(true);
    try { await renameChat(roomId, name); await loadRoom(); }
    catch (e) { Alert.alert('Could not rename', e.message); }
    finally { setBusy(false); }
  };
  const addPerson = async (p) => {
    setBusy(true);
    try { await changeChatMembers(roomId, [p.id], []); await loadRoom(); }
    catch (e) { Alert.alert('Could not add', e.message); }
    finally { setBusy(false); }
  };
  const removePerson = (m) => Alert.alert(`Remove ${firstName(m.user_name)}?`, 'They will stop seeing this chat.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await changeChatMembers(roomId, [], [m.user_id]); await loadRoom(); } catch (e) { Alert.alert('Could not remove', e.message); } } },
  ]);
  const leave = () => Alert.alert('Leave this chat?', 'You can be added back by whoever made it.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: async () => { try { await leaveChat(roomId); navigation.goBack(); } catch (e) { Alert.alert('Could not leave', e.message); } } },
  ]);

  const notIn = people.filter(p => !(room?.members || []).some(m => m.user_id === p.id));

  // What the assistant reads: who is in the room and the last 15 messages.
  const contextPrompt = () => {
    const who = (room?.members || []).map(m => m.user_name).join(', ');
    const recent = messages.slice(-15);
    const cut = Math.max(0, recent.length - 4);
    const thread = recent.map((m, i) => `${i === cut ? '[most recent from here]\n' : ''}${fmtDateTime(m.created_at)} ${m.sender_id === me?.id ? `${m.sender_name} (me)` : m.sender_name}: ${m.body}`).join('\n') || '(no messages yet)';
    return [
      `This is an INTERNAL team chat between employees of Vernon Tech & Media${title ? ` ("${title}")` : ''}, not a customer conversation. People in it: ${who || 'the team'}. I am ${firstName(me?.user_metadata?.name || me?.email) || 'a team member'}. Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`,
      `The chat, oldest to newest (the most recent messages matter most):\n${thread}`,
      'Customers mentioned here are in the CRM; look them up with search_people when you need their details. Never invent names, prices or dates.',
    ].join('\n\n');
  };
  const parseDrafts = (text) => String(text || '').split(/\n+/)
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)]|option\s*\d+:?)\s*/i, '').replace(/^["“]+|["”]+$/g, '').trim())
    .filter(l => l.length >= 4).slice(0, 4);
  const wantsDraft = (s) => /\b(draft|write|reply|respond|say|message|shorter|longer|warmer|friendlier|formal|casual|rewrite|summar|recap|answer)\b/i.test(s);
  const runDraft = async (instruction, initial = false) => {
    if (draftBusy) return;
    setDraftBusy(true); setDraftNote('');
    try {
      const prompt = initial
        ? `${contextPrompt()}\n\n${instruction}`
        : `${contextPrompt()}\n\nInstruction from me: ${instruction}\n${wantsDraft(instruction) ? 'Reply with ONLY the message text I should send in this team chat (or up to three options, one per line). No numbering, no quotes, no preamble.' : 'Answer briefly and plainly.'}`;
      const r = await askAssistant(prompt, draftHistory.current);
      const answer = String(r?.answer || '').trim();
      draftHistory.current = [...draftHistory.current, { role: 'user', content: instruction }, { role: 'assistant', content: answer }].slice(-10);
      if (initial || wantsDraft(instruction)) { const opts = parseDrafts(answer); if (opts.length) setDrafts(opts); else setDraftNote(answer || 'No draft came back.'); }
      else setDraftNote(answer || 'No answer.');
    } catch (e) { setDraftNote(`Could not reach the assistant: ${e.message}`); }
    finally { setDraftBusy(false); }
  };
  const detectActions = async () => {
    if (actionsBusy) return;
    setActionsBusy(true);
    try { const r = await proposeActions(contextPrompt()); setActions((r?.actions || []).filter(a => a.type === 'text_client')); }
    catch (_) {}
    finally { setActionsBusy(false); }
  };
  const openDrafts = () => {
    setDraftOpen(true);
    if (!actionsBusy) detectActions();
    if (!drafts.length && !draftBusy) runDraft('Write three short replies I could send next in this team chat: one that answers or moves the conversation forward, one that assigns or confirms a next step, and one short and casual. Each one to two sentences, natural, no sign-off. Reply with exactly three options, one per line, no numbering, no quotes, nothing else.', true);
  };
  const useDraft = (text) => { setInput(prev => (prev.trim() ? `${prev.trim()} ${text}` : text)); setDraftOpen(false); };
  const sendDraftInstruction = () => { const s = draftInput.trim(); if (!s) return; setDraftInput(''); runDraft(s); };
  const useAction = (a) => {
    setDraftOpen(false);
    if (a.phone) { goToConversation(a.phone, a.message); return; }
    Alert.alert(`No number on file for ${a.client_name || 'this customer'}`, `Add their phone to the record, then open their chat. The draft:\n\n${a.message}`);
  };
  const DRAFT_CHIPS = [
    ['Recap', 'Summarize what this chat decided, in three bullet points at most.'],
    ['Next steps', 'List the next steps this chat implies, who owns each, one line each.'],
    ['Shorter', 'Make it shorter.'],
    ['Warmer', 'Make it warmer and more personal.'],
  ];

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconButton icon="chevron-back" onPress={() => navigation.goBack()} label="Back to Inbox" />
          <TouchableOpacity onPress={openPeople} style={{ flex: 1, minWidth: 0 }} accessibilityLabel="Chat details">
            <Text numberOfLines={1} style={[T.h3, { fontSize: 22, lineHeight: 26 }]}>{title}</Text>
            <Text numberOfLines={1} style={T.sub}>{subtitle}</Text>
          </TouchableOpacity>
          <IconButton icon="people-outline" onPress={openPeople} label="Members" />
        </View>

        {loading ? <ActivityIndicator color={C.ink} style={{ marginTop: 40 }} /> : (
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 10, gap: 10 }}
            keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {messages.length === 0 ? <Text style={[T.sub, { textAlign: 'center', paddingVertical: 30 }]}>Say hello. Everyone in this chat gets a push.</Text> : null}
            {messages.map((m, i) => {
              const mine = m.sender_id === me?.id;
              const prev = messages[i - 1];
              const showName = isGroup && !mine && (!prev || prev.sender_id !== m.sender_id);
              return (
                <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 3 }}>
                  {showName ? <Text style={[T.meta, { marginLeft: 4 }]}>{firstName(m.sender_name)}</Text> : null}
                  <View style={{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22, borderBottomRightRadius: mine ? 6 : 22, borderBottomLeftRadius: mine ? 22 : 6, backgroundColor: mine ? C.ink : C.tile }}>
                    <Text style={[T.message, { color: mine ? '#FFFFFF' : C.ink }]}>{m.body}</Text>
                  </View>
                  <Text style={[T.meta, { fontSize: 11, textAlign: mine ? 'right' : 'left' }]}>{fmtDateTime(m.created_at)}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        <View style={{ gap: 10, paddingHorizontal: 18, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) + 6, backgroundColor: C.bg }}>
          {actions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
              {actions.map((a, i) => <GradientChip key={`a${i}`} label={`Text ${firstName(a.client_name) || 'the customer'}`} onPress={openDrafts} />)}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', minHeight: 50, borderRadius: 25, backgroundColor: C.tile, paddingLeft: 8, paddingRight: 14, paddingVertical: 8 }}>
            <Orb size={34} icon="sparkles" label="Assistant for this chat" onPress={openDrafts} style={{ shadowOpacity: 0 }} />
            <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, paddingHorizontal: 10, paddingVertical: 6, maxHeight: 120 }}
              placeholder="Message" placeholderTextColor={C.slate} value={input} onChangeText={setInput} multiline />
          </View>
          <TouchableOpacity onPress={send} disabled={sending || !input.trim()} accessibilityLabel="Send"
            style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (sending || !input.trim()) ? 0.5 : 1 }}>
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          </View>
        </View>

        {/* Assistant sheet */}
        <Sheet visible={draftOpen} title="Assistant" onClose={() => setDraftOpen(false)}>
          <Text style={T.sub}>Suggestions from this chat. Tap a draft to put it in your message; a customer action opens their chat with the text ready to send.</Text>
          {(actions.length > 0 || actionsBusy) && (
            <View style={{ gap: 8 }}>
              <Text style={T.label}>Smart actions</Text>
              {actionsBusy && actions.length === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line }}>
                  <ActivityIndicator color={C.violet} size="small" />
                  <Text style={T.sub}>Reading the chat for anything a customer needs</Text>
                </View>
              ) : null}
              {actions.map((a, i) => (
                <View key={`act${i}`} style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="chatbubble-outline" size={18} color={C.ink} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={T.title}>Text {a.client_name || 'the customer'}</Text>
                      <Text numberOfLines={2} style={T.sub}>{a.summary || a.reason || (a.phone ? fmtPhone(a.phone) : 'No number on file')}</Text>
                    </View>
                  </View>
                  <View style={{ padding: 12, borderRadius: 12, backgroundColor: C.tile }}>
                    <Text style={[T.body, { fontSize: 14 }]}>{a.message}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button label="Not now" kind="soft" small onPress={() => setActions(prev => prev.filter(x => x !== a))} />
                    <Button label={a.phone ? 'Open their chat with this draft' : 'See the draft'} small onPress={() => useAction(a)} style={{ flex: 1 }} />
                  </View>
                </View>
              ))}
            </View>
          )}
          {draftBusy && drafts.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: C.tile }}>
              <ActivityIndicator color={C.violet} size="small" />
              <Text style={T.sub}>Writing drafts for this chat</Text>
            </View>
          ) : null}
          {drafts.map((d, i) => (
            <TouchableOpacity key={`${i}-${d.slice(0, 12)}`} onPress={() => useDraft(d)} activeOpacity={0.8} accessibilityLabel={`Use draft ${i + 1}`}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.tile, opacity: draftBusy ? 0.6 : 1 }}>
              <Ionicons name="sparkles" size={16} color={C.violet} style={{ marginTop: 3 }} />
              <Text style={[T.body, { flex: 1 }]}>{d}</Text>
              <Text style={[T.meta, { color: C.violet, marginTop: 3 }]}>Use</Text>
            </TouchableOpacity>
          ))}
          {draftNote ? (
            <View style={{ padding: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, gap: 10 }}>
              <Text style={T.body}>{draftNote}</Text>
              <TouchableOpacity onPress={() => useDraft(draftNote)} accessibilityLabel="Use this text"><Text style={[T.meta, { color: C.violet }]}>Use as my message</Text></TouchableOpacity>
            </View>
          ) : null}
          {draftBusy && drafts.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <ActivityIndicator color={C.violet} size="small" />
              <Text style={T.sub}>Working on it</Text>
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {DRAFT_CHIPS.map(([label, instruction]) => <GradientChip key={label} label={label} onPress={() => runDraft(instruction)} />)}
          </ScrollView>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1, minHeight: 48, borderRadius: 24, backgroundColor: C.tile, paddingHorizontal: 16, paddingVertical: 6, justifyContent: 'center' }}>
              <TextInput style={{ fontFamily: F.body, fontSize: 16, color: C.ink, paddingVertical: 6, maxHeight: 100 }}
                placeholder="Tell it what to write or do" placeholderTextColor={C.slate} value={draftInput} onChangeText={setDraftInput} multiline
                onSubmitEditing={sendDraftInstruction} blurOnSubmit />
            </View>
            <TouchableOpacity onPress={sendDraftInstruction} disabled={draftBusy || !draftInput.trim()} accessibilityLabel="Ask the assistant"
              style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (draftBusy || !draftInput.trim()) ? 0.5 : 1 }}>
              <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </Sheet>

        <Sheet visible={peopleOpen} title={isGroup ? 'Group chat' : 'Direct message'} onClose={() => setPeopleOpen(false)}>
          {isGroup ? (
            <View style={{ gap: 8 }}>
              <Label>Name</Label>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <TextInput style={{ flex: 1, height: 48, borderRadius: 16, backgroundColor: C.tile, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink }}
                  value={nameDraft} onChangeText={setNameDraft} placeholder="Group name" placeholderTextColor={C.slate} onSubmitEditing={saveName} />
                <Button label="Save" small onPress={saveName} busy={busy} disabled={!nameDraft.trim() || nameDraft.trim() === room?.name} />
              </View>
              <Text style={T.sub}>Anyone in the chat can rename it.</Text>
            </View>
          ) : null}
          <View style={{ gap: 6 }}>
            <Label>{isGroup ? `In this chat · ${(room?.members || []).length}` : 'People'}</Label>
            {(room?.members || []).map(m => (
              <TouchableOpacity key={m.user_id} onLongPress={() => canManage && m.user_id !== me?.id && isGroup ? removePerson(m) : null} activeOpacity={0.85}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.tile }}>
                <Avatar name={m.user_name} size={32} tone={m.user_id === me?.id ? 'ink' : 'white'} />
                <Text style={[T.body, { fontFamily: F.semi, flex: 1 }]}>{m.user_id === me?.id ? `${m.user_name} (you)` : m.user_name}</Text>
                <Text style={T.meta}>{m.role === 'admin' ? 'Owner' : ''}</Text>
              </TouchableOpacity>
            ))}
            {canManage && isGroup ? <Text style={T.sub}>Hold a name to remove them.</Text> : null}
          </View>
          {canManage || !isGroup ? (
            <View style={{ gap: 8 }}>
              <Label>{isGroup ? 'Add people' : 'Turn into a group by adding someone'}</Label>
              {people.length === 0 ? <ActivityIndicator color={C.ink} /> : notIn.length === 0 ? <Text style={T.sub}>Everyone is already here.</Text> : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
                  {notIn.map(p => <Chip key={p.id} label={firstName(p.name)} icon="add" onPress={() => addPerson(p)} />)}
                </ScrollView>
              )}
            </View>
          ) : null}
          {isGroup ? <SheetRow label="Leave this chat" destructive onPress={leave} /> : null}
        </Sheet>
      </KeyboardAvoidingView>
    </Screen>
  );
}
