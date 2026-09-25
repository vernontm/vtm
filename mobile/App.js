import React, { useState, useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { supabase } from './lib/supabase';
import { registerForPush } from './lib/push';
import { navigationRef, goToConversation } from './lib/nav';
import { C } from './lib/theme';
import Dock from './components/Dock';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import CalendarScreen from './screens/CalendarScreen';
import TimeScreen from './screens/TimeScreen';
import ClientsScreen from './screens/ClientsScreen';
import ClientDetailScreen from './screens/ClientDetailScreen';
import MessagesScreen from './screens/MessagesScreen';
import ConversationScreen from './screens/ConversationScreen';
import NewMessageScreen from './screens/NewMessageScreen';
import SettingsScreen from './screens/SettingsScreen';
import AssistantScreen from './screens/AssistantScreen';
import TasksScreen from './screens/TasksScreen';
import AutomationsScreen from './screens/AutomationsScreen';
import NewTaskScreen from './screens/NewTaskScreen';
import { openSpace } from './lib/nav';

// Aura navigation: a root stack holds the tabs and the full-screen spaces
// that sit above them (the assistant). The tab navigator has two real tabs,
// Home and Inbox, and draws the dock (Home, orb, Inbox) instead of a tab bar.
// Everything else is a space pushed inside the Home stack.
const Root = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeNav = createNativeStackNavigator();
const InboxNav = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.bg, border: C.line, primary: C.ink, text: C.ink },
};
function HomeStack() {
  return (
    <HomeNav.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <HomeNav.Screen name="HomeMain" component={HomeScreen} />
      <HomeNav.Screen name="Calendar" component={CalendarScreen} />
      <HomeNav.Screen name="People" component={ClientsScreen} />
      <HomeNav.Screen name="ClientDetail" component={ClientDetailScreen} />
      <HomeNav.Screen name="Tasks" component={TasksScreen} />
      <HomeNav.Screen name="Time" component={TimeScreen} />
      <HomeNav.Screen name="Settings" component={SettingsScreen} />
      <HomeNav.Screen name="Automations" component={AutomationsScreen} />
    </HomeNav.Navigator>
  );
}

function InboxStack() {
  return (
    <InboxNav.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
      <InboxNav.Screen name="MessagesList" component={MessagesScreen} />
      <InboxNav.Screen name="Conversation" component={ConversationScreen} />
      <InboxNav.Screen name="NewMessage" component={NewMessageScreen} />
    </InboxNav.Navigator>
  );
}

function Tabs() {
  return (
    <Tab.Navigator tabBar={(props) => <Dock {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}>
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Inbox" component={InboxStack} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [fontsLoaded] = useFonts({ BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold });
  // A conversation to open once navigation is ready (from a cold-start tap).
  const pendingConvo = useRef(null);

  // Tapping a message push opens that conversation. Works foreground and from a
  // cold start; harmless in Expo Go / on web where notifications are a no-op.
  useEffect(() => {
    let sub;
    try {
      const Notifications = require('expo-notifications');
      sub = Notifications.addNotificationResponseReceivedListener(resp => {
        const d = resp?.notification?.request?.content?.data;
        if (d?.type === 'imessage' && d.phone) goToConversation(d.phone);
        else if (d?.type === 'task' || d?.type === 'reminder') openSpace('Tasks', { view: d.type === 'reminder' ? 'reminders' : 'tasks' });
      });
      Notifications.getLastNotificationResponseAsync?.().then(resp => {
        const d = resp?.notification?.request?.content?.data;
        if (d?.type === 'imessage' && d.phone) {
          if (navigationRef.isReady()) goToConversation(d.phone);
          else pendingConvo.current = d.phone;
        }
      }).catch(() => {});
    } catch (_) {}
    return () => { try { sub?.remove?.(); } catch (_) {} };
  }, []);

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

  if (booting || !fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.ink} /></View>;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navTheme} ref={navigationRef}
        onReady={() => { if (pendingConvo.current) { goToConversation(pendingConvo.current); pendingConvo.current = null; } }}>
        <StatusBar style="dark" />
        {!session ? (
          <LoginScreen />
        ) : (
          <Root.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            <Root.Screen name="Tabs" component={Tabs} />
            <Root.Screen name="Assistant" component={AssistantScreen} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Root.Screen name="NewTask" component={NewTaskScreen} options={{ presentation: 'modal' }} />
          </Root.Navigator>
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
