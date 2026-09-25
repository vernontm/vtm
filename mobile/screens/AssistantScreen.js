import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { askAssistant } from '../lib/api';
import { C } from '../lib/theme';

// The CRM assistant on mobile: ask about availability, follow-ups, people, and
// the calendar. Same server tools as the web assistant; read-only.
const STARTERS = [
  'Check availability next week for a 1 hour in-person meetup',
  'Which leads need to be followed up with?',
  "What's on my calendar in the next day?",
];

export default function AssistantScreen() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

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

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={92}>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {messages.length === 0 ? (
          <View style={{ gap: 10, paddingTop: 8 }}>
            <Text style={{ color: C.muted, fontSize: 13, marginBottom: 2 }}>Ask about availability, follow-ups, people, and your calendar.</Text>
            {STARTERS.map(s => (
              <TouchableOpacity key={s} onPress={() => send(s)}
                style={{ padding: 13, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '600', lineHeight: 19 }}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : messages.map((m, i) => (
          <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
            <View style={{ paddingVertical: 10, paddingHorizontal: 13, borderRadius: 16, backgroundColor: m.role === 'user' ? C.blue : C.surface2, borderWidth: m.role === 'user' ? 0 : 1, borderColor: C.border }}>
              <Text style={{ color: m.role === 'user' ? '#fff' : C.text, fontSize: 15, lineHeight: 21 }}>{m.content}</Text>
            </View>
          </View>
        ))}
        {busy && (
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 13, borderRadius: 16, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.border }}>
            <ActivityIndicator color={C.muted} size="small" />
            <Text style={{ color: C.muted, fontSize: 14 }}>Thinking…</Text>
          </View>
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopColor: C.border, borderTopWidth: 1, backgroundColor: C.surface }}>
        <TextInput style={{ flex: 1, backgroundColor: C.surface2, borderColor: C.border, borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: C.text, maxHeight: 120 }}
          placeholder="Ask the assistant…" placeholderTextColor={C.muted} value={input} onChangeText={setInput} multiline />
        <TouchableOpacity onPress={() => send()} disabled={busy || !input.trim()}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', opacity: (busy || !input.trim()) ? 0.5 : 1 }}>
          <Ionicons name="arrow-up" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
