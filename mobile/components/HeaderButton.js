import React from 'react';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../lib/theme';

// Round action button for a screen header: the iOS spot for "new" / "compose",
// so the only thing floating over a page is the assistant.
export default function HeaderButton({ icon, onPress, label, size = 20 }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityLabel={label} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
      <Ionicons name={icon} size={size} color="#fff" />
    </TouchableOpacity>
  );
}
