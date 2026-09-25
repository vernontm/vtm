import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';
import AssistantChatView from './AssistantChatView';

// Floating assistant button (bottom-right on every screen) that opens the
// assistant as an iOS sheet. Sits at bottom 92 so it stacks above the pages
// that keep their own action button at bottom 24 (Inbox compose, Clients +).
export default function AssistantFab({ bottom = 92, right = 18 }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityLabel="Open the assistant"
        style={{ position: 'absolute', bottom, right, width: 52, height: 52, borderRadius: 26, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 }}>
        <Ionicons name="sparkles" size={24} color="#fff" />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderBottomColor: C.border, borderBottomWidth: 1, backgroundColor: C.surface }}>
            <Ionicons name="sparkles" size={18} color={C.blue} />
            <Text style={{ flex: 1, color: C.text, fontSize: 16, fontWeight: '800' }}>Assistant</Text>
            <TouchableOpacity onPress={() => setOpen(false)} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={C.muted} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <AssistantChatView keyboardOffset={0} />
          </View>
        </View>
      </Modal>
    </>
  );
}
