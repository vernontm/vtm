import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { T } from '../lib/theme';
import { Screen, IconButton, Orb } from '../components/ui';
import AssistantChatView from '../components/AssistantChatView';

// The assistant as a full-screen space: aurora, the orb, then the chat. Opened
// from the dock's orb, a conversation's header, or anywhere via openAssistant().
export default function AssistantScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const n = user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email || '').split('@')[0];
      setName(String(n || '').split(/\s+/)[0]);
    }).catch(() => {});
  }, []);

  return (
    <Screen aurora>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 18, alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Text style={T.label}>{name ? `Signed in as ${name}` : 'Assistant'}</Text>
          <IconButton icon="close" white onPress={() => navigation.goBack()} label="Close" />
        </View>
        <Orb size={56} />
      </View>
      <View style={{ flex: 1 }}>
        <AssistantChatView keyboardOffset={0} initialPrompt={route?.params?.prompt} />
      </View>
    </Screen>
  );
}
