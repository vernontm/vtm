import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../lib/theme';
import AssistantChatView from './AssistantChatView';

// Floating assistant button, bottom-right on every screen, opening the
// assistant as an iOS sheet. It renders above the tab navigator (screen
// coordinates), so it clears the tab bar (49 + the bottom safe-area inset).
// Page actions (new appointment, compose, add client) live in each screen's
// header instead, so nothing else floats down here.
const TAB_BAR_BASE = 49;

// Screens that hide the button (it would cover their composer) open the sheet
// through this from a header button instead.
let opener = null;
export function openAssistant() { if (opener) opener(); }

export default function AssistantFab({ hidden = false }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    opener = () => setOpen(true);
    return () => { opener = null; };
  }, []);
  return (
    <>
      {!hidden && (
        <TouchableOpacity onPress={() => setOpen(true)} accessibilityLabel="Open the assistant"
          style={{ position: 'absolute', bottom: TAB_BAR_BASE + insets.bottom + 24, right: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 }}>
          <Ionicons name="sparkles" size={26} color="#fff" />
        </TouchableOpacity>
      )}

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
