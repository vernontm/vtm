// Push registration. Works only in a real dev/production build on a physical
// device — in Expo Go and on web it degrades to a silent no-op, so the rest
// of the app never notices.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export async function registerForPush() {
  try {
    if (Platform.OS === 'web') return { ok: false, reason: 'web' };
    const Device = require('expo-device');
    if (!Device.isDevice) return { ok: false, reason: 'simulator' };

    const Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
    });

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const r = await Notifications.requestPermissionsAsync();
      status = r.status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
    if (!token) return { ok: false, reason: 'no token' };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, reason: 'no session' };
    await fetch('https://www.vernontm.com/api/crm/push?action=register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });
    return { ok: true, token };
  } catch (e) {
    // Never let push setup break login.
    return { ok: false, reason: e.message };
  }
}
