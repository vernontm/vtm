import React, { useContext } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarHeightCallbackContext } from '@react-navigation/bottom-tabs';
import { C } from '../lib/theme';
import { Orb, Dot } from './ui';
import { useInboxUnread } from '../lib/inboxBadge';

// The dock: the only navigation chrome. Home, the assistant orb, Inbox. It
// floats over the page; screens keep DOCK_SPACE of bottom padding so their
// last row scrolls clear of it. Screens with their own bottom composer (a
// conversation, a new message, a sheet) hide it.
const HIDE_ON = new Set(['Conversation', 'NewMessage', 'ClientDetail', 'NewTask']);

const focusedLeaf = (route) => {
  let r = route;
  while (r?.state && r.state.routes) r = r.state.routes[r.state.index ?? r.state.routes.length - 1];
  return r?.name;
};

export default function Dock({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const onHeight = useContext(BottomTabBarHeightCallbackContext);
  const unread = useInboxUnread();
  const current = state.routes[state.index];
  if (HIDE_ON.has(focusedLeaf(current))) return null;

  const go = (name) => {
    const target = state.routes.find(r => r.name === name);
    const event = navigation.emit({ type: 'tabPress', target: target?.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(name);
  };
  const isHome = current.name === 'Home';
  const isInbox = current.name === 'Inbox';

  return (
    <View pointerEvents="box-none" onLayout={(e) => onHeight?.(e.nativeEvent.layout.height)}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingBottom: Math.max(insets.bottom, 22) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 68, paddingHorizontal: 14, borderRadius: 34, backgroundColor: '#FFFFFF', shadowColor: '#0B0B10', shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 10, borderWidth: 1, borderColor: 'rgba(11,11,16,0.05)' }}>
        <TouchableOpacity onPress={() => go('Home')} accessibilityLabel="Home" accessibilityState={{ selected: isHome }}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isHome ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="grid-outline" size={22} color={isHome ? '#FFFFFF' : C.slate} />
        </TouchableOpacity>
        <Orb onPress={() => navigation.getParent()?.navigate('Assistant') || navigation.navigate('Assistant')} />
        <TouchableOpacity onPress={() => go('Inbox')} accessibilityLabel="Inbox" accessibilityState={{ selected: isInbox }}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isInbox ? C.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chatbubbles-outline" size={22} color={isInbox ? '#FFFFFF' : C.slate} />
          {unread > 0 && !isInbox ? <Dot size={8} style={{ position: 'absolute', top: 9, right: 9, borderWidth: 2, borderColor: '#FFFFFF', width: 12, height: 12, borderRadius: 6 }} /> : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}
