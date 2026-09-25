import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabase';
import { registerForPush } from './lib/push';
import { C } from './lib/theme';
import LoginScreen from './screens/LoginScreen';
import CalendarScreen from './screens/CalendarScreen';
import TimeScreen from './screens/TimeScreen';
import ClientsScreen from './screens/ClientsScreen';
import ClientDetailScreen from './screens/ClientDetailScreen';
import MessagesScreen from './screens/MessagesScreen';
import ConversationScreen from './screens/ConversationScreen';
import NewMessageScreen from './screens/NewMessageScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.surface, border: C.border, primary: C.blue, text: C.text },
};

const icon = (name) => ({ color, size, focused }) => (
  <Ionicons name={focused ? name : `${name}-outline`} size={size ?? 22} color={color} />
);

function ClientsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: C.surface }, headerTintColor: C.text }}>
      <Stack.Screen name="ClientsList" component={ClientsScreen} options={{ title: 'Clients' }} />
      <Stack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: 'Client' }} />
    </Stack.Navigator>
  );
}

function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: C.surface }, headerTintColor: C.text }}>
      <Stack.Screen name="MessagesList" component={MessagesScreen} options={{ title: 'Inbox' }} />
      <Stack.Screen name="Conversation" component={ConversationScreen} options={{ title: '' }} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} options={{ title: 'New message' }} />
    </Stack.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);

  // Register this device for pushes whenever a session exists (no-op in the
  // web demo / Expo Go; real builds get the permission prompt + token).
  useEffect(() => { if (session) registerForPush(); }, [session?.user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setBooting(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      // Only react to real login/logout, not token refreshes (same guard as
      // the web CRM: prevents full-app remounts on tab focus / refresh).
      setSession(prev => (prev?.user?.id === s?.user?.id ? prev : s));
    });
    return () => subscription.unsubscribe();
  }, []);

  if (booting) {
    return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.blue} /></View>;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      {!session ? (
        <LoginScreen />
      ) : (
        <Tab.Navigator screenOptions={{
          headerStyle: { backgroundColor: C.surface }, headerTintColor: C.text,
          tabBarStyle: { backgroundColor: C.surface, borderTopColor: C.border },
          tabBarActiveTintColor: C.blue, tabBarInactiveTintColor: C.muted,
        }}>
          <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarIcon: icon('calendar') }} />
          <Tab.Screen name="Time" component={TimeScreen} options={{ tabBarIcon: icon('stopwatch') }} />
          <Tab.Screen name="Clients" component={ClientsStack} options={{ headerShown: false, tabBarIcon: icon('people') }} />
          <Tab.Screen name="Inbox" component={MessagesStack} options={{ headerShown: false, tabBarIcon: icon('chatbubbles') }} />
          <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: icon('settings') }} />
        </Tab.Navigator>
      )}
    </NavigationContainer>
  );
}
