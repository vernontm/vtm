import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { C, card } from '../lib/theme';

export default function SettingsScreen() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  const isAdmin = !!(user?.user_metadata?.is_admin || user?.app_metadata?.is_admin);

  const signOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: 16, gap: 14 }}>
      {/* Account */}
      <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.blueSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.blue, fontWeight: '800', fontSize: 18 }}>
            {(user?.email || '?')[0].toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.text, fontWeight: '800', fontSize: 16 }}>{user?.email || '…'}</Text>
          <Text style={{ color: isAdmin ? C.blue : C.muted, fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>
            {isAdmin ? 'Admin' : 'Team member'}
          </Text>
        </View>
      </View>

      {/* Links */}
      <View style={[card, { padding: 0, overflow: 'hidden' }]}>
        <TouchableOpacity onPress={() => Linking.openURL('https://www.vernontm.com/admin')}
          style={{ paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="globe-outline" size={18} color={C.blue} /><Text style={{ color: C.text, fontWeight: '600', fontSize: 15 }}>Open the web CRM</Text></View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL('mailto:ray@vernontm.com')}
          style={{ paddingVertical: 15, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="chatbubble-outline" size={18} color={C.blue} /><Text style={{ color: C.text, fontWeight: '600', fontSize: 15 }}>Report a problem</Text></View>
        </TouchableOpacity>
      </View>

      {/* Sign out */}
      <TouchableOpacity onPress={signOut}
        style={{ backgroundColor: 'rgba(220,38,38,0.12)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.4)', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
        <Text style={{ color: C.red, fontWeight: '800', fontSize: 15 }}>Sign out</Text>
      </TouchableOpacity>

      <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 'auto', marginBottom: 8 }}>
        VTM CRM Mobile · v1.0
      </Text>
    </View>
  );
}
