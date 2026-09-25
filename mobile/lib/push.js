// Push registration. Works only in a real dev/production build on a physical
// device; in Expo Go and on web it degrades to a silent no-op, so the rest
// of the app never notices.
//
// iOS shows the system "Allow Notifications" dialog once per install. After
// a "Don't Allow" tap it never shows again, so the app has to send people to
// its own page in Settings instead (Linking.openSettings). getPushStatus()
// tells the UI which case it is in; enablePush() does the right thing for it.
import { Platform, Linking, Alert } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const NUDGE_KEY = 'vtm.push.nudged_at';
const NUDGE_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

let mod = null;
function notifications() {
  if (Platform.OS === 'web') return null;
  try {
    const Device = require('expo-device');
    if (!Device.isDevice) return null;
    if (!mod) {
      mod = require('expo-notifications');
      mod.setNotificationHandler({
        handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
      });
    }
    return mod;
  } catch (_) {
    return null;
  }
}

// { state: 'unsupported' | 'granted' | 'undetermined' | 'denied', canAskAgain }
export async function getPushStatus() {
  const N = notifications();
  if (!N) return { state: 'unsupported', canAskAgain: false };
  try {
    const p = await N.getPermissionsAsync();
    if (p.granted || p.status === 'granted') return { state: 'granted', canAskAgain: false };
    // "undetermined" means the system dialog has never been answered, so
    // asking again really shows it.
    const notDetermined = p.status === 'undetermined' || p.ios?.status === N.IosAuthorizationStatus?.NOT_DETERMINED;
    if (notDetermined) return { state: 'undetermined', canAskAgain: true };
    return { state: 'denied', canAskAgain: !!p.canAskAgain };
  } catch (e) {
    return { state: 'unsupported', canAskAgain: false, reason: e.message };
  }
}

async function uploadToken(N) {
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId;
  const { data: token } = await N.getExpoPushTokenAsync(projectId ? { projectId } : {});
  if (!token) return { ok: false, reason: 'no token' };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, reason: 'no session' };
  await fetch('https://www.vernontm.com/api/crm/push?action=register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });
  return { ok: true, token };
}

// Register this phone. With ask:true (the default) the system dialog shows
// while permission is still undetermined; it is a silent no-op once the
// person has answered it, so calling this on every foreground is safe.
export async function registerForPush({ ask = true } = {}) {
  try {
    const N = notifications();
    if (!N) return { ok: false, reason: Platform.OS === 'web' ? 'web' : 'simulator' };
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted' && ask) {
      const r = await N.requestPermissionsAsync();
      status = r.status;
    }
    if (status !== 'granted') return { ok: false, reason: 'denied' };
    return await uploadToken(N);
  } catch (e) {
    // Never let push setup break login.
    return { ok: false, reason: e.message };
  }
}

// Sends people to the app's page in iOS Settings, where the Allow
// Notifications switch lives once the one-time dialog has been declined.
export function openAppSettings() {
  return Linking.openSettings().catch(() => Linking.openURL('app-settings:').catch(() => {}));
}

// Turn notifications on from anywhere in the app. Re-asks when iOS still
// allows it, otherwise explains and opens Settings. Resolves to the status
// after the attempt.
export async function enablePush() {
  const s = await getPushStatus();
  if (s.state === 'granted') { await registerForPush({ ask: false }); return s; }
  if (s.state === 'unsupported') {
    Alert.alert('Notifications need the iPhone app', 'Install VTM from TestFlight on your phone to get pushes for texts, team chats, tasks, and reminders.');
    return s;
  }
  if (s.canAskAgain) {
    const r = await registerForPush({ ask: true });
    if (r.ok) return { state: 'granted', canAskAgain: false };
  }
  Alert.alert(
    'Turn on notifications',
    'iOS only shows the Allow prompt once. Open Settings, tap Notifications, and switch Allow Notifications on. VTM picks it up the moment you come back.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ],
  );
  return getPushStatus();
}

// After login: if pushes were declined, remind (at most every 3 days) that
// they can be switched on in Settings. Silent everywhere else.
export async function nudgeIfPushDenied() {
  try {
    const s = await getPushStatus();
    if (s.state !== 'denied') return false;
    const last = Number(await AsyncStorage.getItem(NUDGE_KEY)) || 0;
    if (Date.now() - last < NUDGE_EVERY_MS) return false;
    await AsyncStorage.setItem(NUDGE_KEY, String(Date.now()));
    Alert.alert(
      'Notifications are off',
      'You will miss new texts, team chats, and reminders until they are on. Want to turn them on now?',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Turn on', onPress: () => { enablePush(); } },
      ],
    );
    return true;
  } catch (_) {
    return false;
  }
}
