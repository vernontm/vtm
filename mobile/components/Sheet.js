// Bottom sheet that stays above the keyboard. KeyboardAvoidingView lifts the
// card when the keyboard opens; the inner ScrollView lets long forms scroll.
// keyboardShouldPersistTaps lets suggestion rows / buttons take the first tap
// instead of it only dismissing the keyboard.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

export default function Sheet({ visible, title, children, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{title}</Text>
                {onClose ? (
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={22} color={C.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {children}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
