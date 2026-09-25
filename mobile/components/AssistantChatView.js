import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { askAssistant } from '../lib/api';
import { C, T, F, GRAD } from '../lib/theme';
import { Chip } from './ui';

// The assistant chat (Aura): your asks in ink, its answers as plain text,
// suggestions as chips, a gradient-ringed input. Same read-only server tools
// as the web assistant; history rides along so it remembers the thread.
const STARTERS = [
  'Check availability next week for a 1 hour in-person meetup',
  'Which leads need to be followed up with?',
  "What's on my calendar in the next day?",
];
const QUICK = ['Who needs a follow-up?', "What's on today?", 'Draft a reply'];

export default function AssistantChatView({ keyboardOffset = 0, initialPrompt }) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);
  const sentInitial = useRef(false);

  const send = async (text) => {
    const prompt = (text ?? input).trim();
    if (!prompt || busy) return;
    const history = messages.slice();
    setMessages(m => [...m, { role: 'user', content: prompt }]);
    setInput('');
    setBusy(true);
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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={keyboardOffset}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 12 }}
        keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 ? (
          <View style={{ gap: 10, paddingTop: 4 }}>
            <Text style={[T.sub, { marginBottom: 2 }]}>Ask about availability, follow-ups, people and your calendar.</Text>
            {STARTERS.map(s => (
              <TouchableOpacity key={s} onPress={() => send(s)} activeOpacity={0.8}
                style={{ padding: 14, borderRadius: 18, backgroundColor: C.tile }}>
                <Text style={[T.body, { fontFamily: F.semi }]}>{s}</Text>
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
            <Text style={T.sub}>Thinking…</Text>
          </View>
        )}
      </ScrollView>

      <View style={{ gap: 10, paddingHorizontal: 18, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8, backgroundColor: C.bg }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {QUICK.map(q => <Chip key={q} label={q} onPress={() => send(q)} style={{ height: 34 }} />)}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 1.5, borderRadius: 26 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 49, borderRadius: 25, backgroundColor: '#FFFFFF', paddingLeft: 18, paddingRight: 6 }}>
              <TextInput style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: C.ink, paddingVertical: 10, maxHeight: 110 }}
                placeholder="Ask, or tell me what to do" placeholderTextColor={C.slate} value={input} onChangeText={setInput} multiline />
              <TouchableOpacity accessibilityLabel="Dictate" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mic-outline" size={20} color={C.slate} />
              </TouchableOpacity>
            </View>
          </LinearGradient>
          <TouchableOpacity onPress={() => send()} disabled={busy || !input.trim()} accessibilityLabel="Send"
            style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', opacity: (busy || !input.trim()) ? 0.5 : 1 }}>
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
