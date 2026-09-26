import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Keyboard, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { askAssistant, getHome, getTeamTodos, getReminders } from '../lib/api';
import { firstName } from '../lib/imsg';
import { myTodos } from '../lib/tasks';
import { C, T, F, GRAD } from '../lib/theme';
import { Screen, IconButton, Orb, Chip } from '../components/ui';
import DictateButton from '../components/DictateButton';

// The assistant as a full-screen space: aurora, the orb, then the chat. Opened
// from the dock's orb, a conversation's header, or anywhere via openAssistant().
// The whole screen sits inside one KeyboardAvoidingView so the input rides the
// keyboard: a KAV that starts below a header measures its own frame, not the
// screen, and leaves exactly the header's height of the input covered.

const clip = (s, n = 26) => { const t = String(s || '').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}...` : t; };
const quote = (s) => `"${String(s || '').replace(/"/g, "'")}"`;

// The one prompt to fall back on when nothing at all is waiting. Both of its
// answers come from real tools (today's agenda and the availability finder),
// so it never sends Ray off to a dead end.
const GENERIC = { key: 'generic', label: "What's on today?", prompt: 'What is on my calendar today, and when am I free for a one hour meeting this week?' };

// Which kind of suggestion matters most to whom. The server already omits the
// sections a role does not use, so this only settles the order between the
// ones that came back.
const ORDER = {
  ceo: ['held', 'reminder', 'task', 'next', 'leads'],
  hr: ['review', 'onboarding', 'reminder', 'task', 'next'],
  assistant: ['reminder', 'route', 'outreach', 'task', 'next', 'leads'],
  sales: ['before', 'leads', 'outreach', 'reminder', 'next', 'task'],
  general: ['reminder', 'task', 'next', 'leads'],
};
const FALLBACK_ORDER = ['held', 'reminder', 'task', 'review', 'onboarding', 'route', 'outreach', 'before', 'next', 'leads'];

// The two smart options: built from what is actually waiting on this person
// right now, never a fixed list. Every prompt either carries its own facts or
// lands on a tool the assistant really has (availability, follow-ups, people
// search, today's agenda), so tapping one always gets a real answer.
function buildSuggestions({ home, todos, reminders, myId }) {
  const c = {};

  const held = Array.isArray(home?.held_up) ? home.held_up : [];
  const worst = held.find(h => h.severity === 'red') || held[0];
  if (worst) {
    const who = worst.client_name || 'this client';
    c.held = {
      key: 'held',
      label: `Nudge ${clip(firstName(worst.client_name) || 'the client', 14)}`,
      prompt: `Write a short, friendly text I can send ${who} about this: ${worst.title}. Two sentences at most, no sign-off.`,
    };
  }

  const dueSoon = (reminders || [])
    .filter(r => r.status !== 'done' && r.remind_at && (!r.for_user || !myId || r.for_user === myId))
    .filter(r => new Date(r.remind_at).getTime() <= Date.now() + 2 * 3600000)
    .sort((a, b) => new Date(a.remind_at) - new Date(b.remind_at))[0];
  if (dueSoon) {
    c.reminder = {
      key: 'reminder',
      label: `Reminder: ${clip(dueSoon.title, 20)}`,
      prompt: `My reminder says ${quote(dueSoon.title)}. Tell me the first step to handle it now, and draft anything I need to send.`,
    };
  }

  const open = myTodos(todos, myId).filter(t => !t.done);
  const task = open.find(t => t.urgent) || open[0];
  if (task) {
    c.task = {
      key: 'task',
      label: `Task: ${clip(task.title, 20)}`,
      prompt: `My open task is ${quote(task.title)}. Tell me the first step and draft anything it needs.`,
    };
  }

  const review = (home?.review_queue || [])[0];
  if (review) {
    c.review = {
      key: 'review',
      label: clip(review.title, 24),
      prompt: `${review.from_name || 'A teammate'} is waiting on me for this: ${quote(review.title)}. What should I check, and draft the reply I send back.`,
    };
  }

  const onboarding = (home?.onboarding || []).find(p => p.next_step);
  if (onboarding) {
    c.onboarding = {
      key: 'onboarding',
      label: `Onboard ${clip(firstName(onboarding.name) || 'the new hire', 14)}`,
      prompt: `${onboarding.name} is part way through onboarding and the next step is ${quote(onboarding.next_step)}. Draft the message asking them to do it.`,
    };
  }

  const stops = Array.isArray(home?.route) ? home.route.filter(r => r.location) : [];
  if (stops.length > 1) {
    c.route = {
      key: 'route',
      label: `Plan ${stops.length} stops`,
      prompt: `Today I am going to: ${stops.map(s => `${s.title} at ${s.location}`).join('; ')}. Put them in the best driving order and tell me when to leave for each one.`,
    };
  }

  const behind = (home?.outreach?.items || []).find(i => Number(i.target) > 0 && (Number(i.count) || 0) < Number(i.target));
  if (behind) {
    const left = Number(behind.target) - (Number(behind.count) || 0);
    c.outreach = {
      key: 'outreach',
      label: `${left} more to reach`,
      prompt: `I still have ${left} to go on ${quote(behind.text)} today. Which leads need a follow-up, and what should I send each one?`,
    };
  }

  const call = home?.before_call;
  if (call?.name) {
    c.before = {
      key: 'before',
      label: `Prep for ${clip(firstName(call.name), 14)}`,
      prompt: `I have a call with ${call.name}${call.business ? ` of ${call.business}` : ''}. Give me a two line refresher on them and three questions worth asking.`,
    };
  }

  const next = home?.next_up;
  const untilNext = next?.start_time ? new Date(next.start_time).getTime() - Date.now() : null;
  if (untilNext !== null && untilNext > 0 && untilNext < 14 * 3600000) {
    c.next = {
      key: 'next',
      label: `Prep for ${clip(next.title || 'the meeting', 18)}`,
      prompt: `My next meeting is ${quote(next.title || 'untitled')}${(next.attendees || []).length ? ` with ${next.attendees.join(', ')}` : ''}. Look them up and give me a short prep: what it is about and three questions to ask.`,
    };
  }

  const leads = home?.leads || {};
  const hot = Number(leads.hot) || 0;
  if (hot > 0 || Number(leads.open) > 0) {
    c.leads = {
      key: 'leads',
      label: hot > 0 ? `${hot} hot ${hot === 1 ? 'lead' : 'leads'}` : 'Leads to follow up',
      prompt: 'Which leads need a follow-up right now, and what should I text each one?',
    };
  }

  const seen = new Set();
  const pool = [...(ORDER[home?.role] || ORDER.general), ...FALLBACK_ORDER].filter(k => (seen.has(k) ? false : (seen.add(k), true)));
  const picked = pool.map(k => c[k]).filter(Boolean).slice(0, 2);
  // Nothing real to offer is worth one honest prompt, not two invented ones.
  if (!picked.length) return [GENERIC];
  if (picked.length === 1) picked.push(GENERIC);
  return picked;
}

export default function AssistantScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [kbUp, setKbUp] = useState(false);
  const scrollRef = useRef(null);
  const sentInitial = useRef(false);
  const initialPrompt = route?.params?.prompt;

  const toEnd = (animated = true) => { requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated })); };

  // Who is signed in, and what is actually waiting on them. Every call is
  // optional: no answer just means fewer suggestions, never a broken screen.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser().catch(() => ({ data: null }));
      const user = data?.user || null;
      if (!alive) return;
      setName(String(user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email || '').split('@')[0] || '').split(/\s+/)[0]);
      const [hm, td, rm] = await Promise.allSettled([getHome(), getTeamTodos(), getReminders()]);
      if (!alive) return;
      const ok = (r) => (r.status === 'fulfilled' ? r.value : null);
      const home = ok(hm);
      const rawTodos = ok(td);
      setSuggestions(buildSuggestions({
        home: home && typeof home === 'object' ? home : null,
        todos: Array.isArray(rawTodos) ? rawTodos : (rawTodos?.todos || []),
        reminders: ok(rm)?.reminders || [],
        myId: user?.id || home?.me?.id || null,
      }));
    })();
    return () => { alive = false; };
  }, []);

  // The keyboard: the orb steps out of the way while typing, and the thread
  // scrolls so the last message and the input stay in view.
  useEffect(() => {
    const subs = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKbUp(true)),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKbUp(false)),
      Keyboard.addListener('keyboardDidShow', () => toEnd()),
    ];
    return () => subs.forEach(s => s.remove());
  }, []);

  const send = async (text) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    const history = messages.slice();
    setMessages(m => [...m, { role: 'user', content: prompt }]);
    setInput('');
    setBusy(true);
    toEnd();
    try {
      const r = await askAssistant(prompt, history);
      setMessages(m => [...m, { role: 'assistant', content: r?.answer || 'No answer.' }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `Sorry, something went wrong: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (initialPrompt && !sentInitial.current) { sentInitial.current = true; send(initialPrompt); }
  }, [initialPrompt]);

  const started = messages.length > 0;
  const canSend = !busy && !!input.trim();
  const hint = useMemo(() => (suggestions.length ? 'Ask about availability, follow-ups, people and your calendar, or pick one of these.' : 'Ask about availability, follow-ups, people and your calendar.'), [suggestions.length]);

  return (
    <Screen aurora>
      {/* One KAV around the whole screen, header included, so its frame is the
          screen's frame and the keyboard's height is the padding it adds. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, alignItems: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Text style={T.label}>{name ? `Signed in as ${name}` : 'Assistant'}</Text>
            <IconButton icon="close" white onPress={() => navigation.goBack()} label="Close" />
          </View>
          {kbUp ? null : <Orb size={56} />}
        </View>

        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 12 }}
          keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => toEnd(false)}>
          {!started ? (
            <View style={{ gap: 10, paddingTop: 4 }}>
              <Text style={[T.sub, { marginBottom: 2 }]}>{hint}</Text>
              {suggestions.map(s => (
                <TouchableOpacity key={s.key} onPress={() => send(s.prompt)} activeOpacity={0.8}
                  style={{ padding: 14, borderRadius: 18, backgroundColor: C.tile }}>
                  <Text style={[T.body, { fontFamily: F.semi }]}>{s.prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : messages.map((m, i) => (
            m.role === 'user' ? (
              <View key={i} style={{ alignSelf: 'flex-end', maxWidth: '82%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22, borderBottomRightRadius: 6, backgroundColor: C.ink }}>
                <Text style={[T.message, { color: '#FFFFFF' }]}>{m.content}</Text>
              </View>
            ) : (
              <View key={i} style={{ alignSelf: 'flex-start', maxWidth: '96%', paddingVertical: 2 }}>
                <Text style={T.message}>{m.content}</Text>
              </View>
            )
          ))}
          {busy && (
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
              <ActivityIndicator color={C.slate} size="small" />
              <Text style={T.sub}>Thinking...</Text>
            </View>
          )}
        </ScrollView>

        <View style={{ gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8, backgroundColor: C.bg }}>
          {started && suggestions.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
              {suggestions.map(s => <Chip key={s.key} label={s.label} onPress={() => send(s.prompt)} style={{ height: 34 }} />)}
            </ScrollView>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 1.5, borderRadius: 26 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 49, borderRadius: 25, backgroundColor: '#FFFFFF', paddingLeft: 18, paddingRight: 18 }}>
                <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, paddingVertical: 10, maxHeight: 110 }}
                  placeholder="Ask, or tell me what to do" placeholderTextColor={C.slate} value={input} onChangeText={setInput}
                  onFocus={() => toEnd()} multiline />
                <DictateButton onText={(t) => setInput(prev => (prev.trim() ? `${prev.trim()} ${t}` : t))} />
              </View>
            </LinearGradient>
            <TouchableOpacity onPress={() => send()} disabled={!canSend} accessibilityLabel="Send"
              style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: canSend ? 1 : 0.5 }}>
              <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
