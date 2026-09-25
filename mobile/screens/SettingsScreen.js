import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Alert, Linking, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { getPushStatus, enablePush } from '../lib/push';
import { getChatPeople, getHomeRoles, setHomeRoles } from '../lib/api';
import { C, T } from '../lib/theme';
import { Screen, HeaderBar, Tile, Label, Chip, Avatar, Button, DOCK_SPACE } from '../components/ui';

// Settings (Aura): who you are, notifications, a couple of links, the home
// layout picker for admins, sign out.
const nameOf = (user) => String(user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email || '').split('@')[0] || '');
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// The homes an admin can hand out. No pick means the roster title decides.
const ROLES = [
  { key: 'ceo', label: 'CEO' },
  { key: 'hr', label: 'HR' },
  { key: 'assistant', label: 'Assistant' },
  { key: 'sales', label: 'Sales' },
  { key: 'general', label: 'General' },
];

const PUSH_COPY = {
  granted: { sub: 'On for this phone', color: C.green },
  undetermined: { sub: 'Tap to allow pushes for texts, chats, and reminders', color: C.amber },
  denied: { sub: 'Off. Tap to switch them on in Settings', color: C.red },
  unsupported: { sub: 'Available in the iPhone app', color: C.slate },
};

export default function SettingsScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [push, setPush] = useState(null);
  const [people, setPeople] = useState(null);   // admins: everyone with a login
  const [roles, setRoles] = useState({});       // { auth user id: role }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const isAdmin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);

  // Home layout (admins): the team and the roles already picked.
  const loadRoles = useCallback(() => {
    Promise.all([getChatPeople().catch(() => null), getHomeRoles().catch(() => ({}))])
      .then(([p, r]) => { setPeople(p?.people || []); setRoles(r && typeof r === 'object' ? r : {}); })
      .catch(() => { setPeople([]); });
  }, []);
  useEffect(() => { if (isAdmin) loadRoles(); }, [isAdmin, loadRoles]);

  // Tap a role to set it, tap the same role again to clear it (back to the
  // roster title). Saved right away; put back if the save fails.
  const pickRole = async (personId, role) => {
    const prev = roles;
    const next = { ...roles };
    if (next[personId] === role) delete next[personId]; else next[personId] = role;
    setRoles(next);
    try { await setHomeRoles(next); }
    catch (e) { setRoles(prev); Alert.alert('Could not save', e.message); }
  };

  // Re-check notifications whenever this screen shows or the app comes back
  // from iOS Settings, so the row reflects a switch flipped there.
  const refreshPush = useCallback(() => { getPushStatus().then(setPush).catch(() => {}); }, []);
  useEffect(() => {
    refreshPush();
    const focus = navigation.addListener('focus', refreshPush);
    const app = AppState.addEventListener('change', st => { if (st === 'active') refreshPush(); });
    return () => { focus(); app.remove(); };
  }, [navigation, refreshPush]);

  const onPush = async () => {
    await enablePush();
    refreshPush();
  };

  const name = nameOf(user);

  const signOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const pushCopy = PUSH_COPY[push?.state] || { sub: 'Checking', color: C.slate };
  const rows = [
    { icon: push?.state === 'granted' ? 'notifications-outline' : 'notifications-off-outline', label: 'Notifications', sub: pushCopy.sub, subColor: pushCopy.color, onPress: onPush },
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
              {r.sub ? <Text style={[T.sub, r.subColor ? { color: r.subColor } : null]}>{r.sub}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.slate} />
          </Tile>
        ))}

        {/* Home layout (admins): which home each person opens to */}
        {isAdmin ? (
          <View style={{ gap: 8, marginTop: 6 }}>
            <Label right={people?.length ? `${people.length} ${people.length === 1 ? 'person' : 'people'}` : undefined}>Home layout</Label>
            <Text style={[T.sub, { paddingHorizontal: 4 }]}>Pick the home each person opens to. No pick means their roster title decides; tap a pick again to clear it.</Text>
            {people === null ? <Text style={[T.sub, { paddingHorizontal: 4 }]}>Loading the team</Text> : null}
            {people && people.length === 0 ? <Text style={[T.sub, { paddingHorizontal: 4 }]}>Nobody on the team has a login yet.</Text> : null}
            {(people || []).map(p => (
              <Tile key={p.id} style={{ gap: 10, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={p.name} size={36} tone="white" />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text numberOfLines={1} style={[T.title, { fontSize: 16 }]}>{p.name}</Text>
                    <Text numberOfLines={1} style={T.sub}>{p.on_app ? 'On the app' : 'Not on the app yet'} · {roles[p.id] ? `${ROLES.find(r => r.key === roles[p.id])?.label || roles[p.id]} home` : 'automatic'}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {ROLES.map(r => (
                    <Chip key={r.key} label={r.label} active={roles[p.id] === r.key} onPress={() => pickRole(p.id, r.key)}
                      style={{ height: 32, paddingHorizontal: 12, backgroundColor: roles[p.id] === r.key ? C.ink : '#FFFFFF' }} />
                  ))}
                </View>
              </Tile>
            ))}
          </View>
        ) : null}

        {/* Sign out */}
        <Button label="Sign out" kind="danger" icon="log-out-outline" onPress={signOut} style={{ marginTop: 4 }} />

        <Text style={[T.sub, { textAlign: 'center', marginTop: 'auto', paddingTop: 16 }]}>VTM CRM Mobile · v1.0</Text>
      </ScrollView>
    </Screen>
  );
}
