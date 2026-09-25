import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { C, T } from '../lib/theme';
import { Screen, HeaderBar, Tile, Avatar, Button, DOCK_SPACE } from '../components/ui';

// Settings (Aura): who you are, a couple of links, sign out.
const nameOf = (user) => String(user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email || '').split('@')[0] || '');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export default function SettingsScreen({ navigation }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const isAdmin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);
  const name = nameOf(user);

  const signOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const rows = [
    ...(isAdmin ? [{ icon: 'flash-outline', label: 'Automations', sub: 'Thank-you texts and meeting confirmations', onPress: () => navigation.navigate('Automations') }] : []),
    { icon: 'globe-outline', label: 'Open the web CRM', sub: 'vernontm.com/admin', onPress: () => Linking.openURL('https://www.vernontm.com/admin') },
    { icon: 'chatbubble-outline', label: 'Report a problem', sub: 'Email Ray', onPress: () => Linking.openURL('mailto:ray@vernontm.com') },
  ];

  return (
    <Screen>
      <HeaderBar title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 18, paddingTop: 4, paddingBottom: DOCK_SPACE, gap: 12 }}>
        {/* Account */}
        <Tile style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar name={name || user?.email} size={56} tone="ink" />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={1} style={T.title}>{cap(name) || 'Signed in'}</Text>
            {user?.email ? <Text numberOfLines={1} style={T.sub}>{user.email}</Text> : null}
            <Text style={[T.meta, { color: isAdmin ? C.ink : C.slate }]}>{isAdmin ? 'Admin' : 'Team member'}</Text>
          </View>
        </Tile>

        {/* Links */}
        {rows.map(r => (
          <Tile key={r.label} onPress={r.onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={r.icon} size={20} color={C.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Text style={T.title}>{r.label}</Text>
              {r.sub ? <Text style={T.sub}>{r.sub}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.slate} />
          </Tile>
        ))}

        {/* Sign out */}
        <Button label="Sign out" kind="danger" icon="log-out-outline" onPress={signOut} style={{ marginTop: 4 }} />

        <Text style={[T.sub, { textAlign: 'center', marginTop: 'auto', paddingTop: 16 }]}>VTM CRM Mobile · v1.0</Text>
      </ScrollView>
    </Screen>
  );
}
