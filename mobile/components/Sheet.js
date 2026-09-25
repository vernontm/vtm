// Bottom sheet (Aura): white, rounded, stays above the keyboard. The inner
// ScrollView lets long forms scroll; keyboardShouldPersistTaps lets rows and
// buttons take the first tap instead of it only dismissing the keyboard.
import React from 'react';
import { Modal, View, Text, TouchableOpacity, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, T } from '../lib/theme';

export default function Sheet({ visible, title, children, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(11,11,16,0.45)', justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: Math.max(insets.bottom, 18) + 6, gap: 12 }}>
              <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(11,11,16,0.18)', alignSelf: 'center', marginTop: -6 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[T.h3, { flex: 1 }]}>{title}</Text>
                {onClose ? (
                  <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="close" size={18} color={C.ink} />
                  </TouchableOpacity>
                ) : null}
              </View>
              {children}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// A tappable row inside a sheet.
export function SheetRow({ label, sub, onPress, selected, color, left, destructive }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: 16, backgroundColor: selected ? C.ink : C.tile }}>
      {left ? left : color ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} /> : null}
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 10 }}>
        <Text style={[T.body, { fontFamily: 'Manrope_700Bold', color: selected ? '#FFFFFF' : destructive ? C.red : C.ink }]}>{label}</Text>
        {sub ? <Text style={[T.sub, { color: selected ? 'rgba(255,255,255,0.75)' : C.slate }]}>{sub}</Text> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
    </TouchableOpacity>
  );
}
