// Usage tracking: which screens get opened and which actions get taken, so
// the app can be tuned after a month of real use. Names only, never what
// was typed. Events queue in memory and post in batches; a lost batch is no
// big deal, so nothing here can throw into the UI.
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

const ENDPOINT = 'https://www.vernontm.com/api/crm/app-events';
const FLUSH_EVERY_MS = 20000;
const FLUSH_AT = 25;

const sessionId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const appVersion = Constants?.expoConfig?.version || '';
let queue = [];
let lastScreen = null;
let timer = null;
let sending = false;

// The web preview runs with Ray's session and would pollute the numbers.
const enabled = Platform.OS !== 'web';

function schedule() {
  if (timer || !enabled) return;
  timer = setTimeout(() => { timer = null; flushTrack(); }, FLUSH_EVERY_MS);
}

export function track(event, name, props) {
  if (!enabled || !name) return;
  queue.push({ event, name: String(name), props: props || undefined, at: new Date().toISOString(), session_id: sessionId });
  if (queue.length >= FLUSH_AT) flushTrack(); else schedule();
}

// One row per screen change; the same screen twice in a row is one visit.
export function trackScreen(name) {
  if (!name || name === lastScreen) return;
  lastScreen = name;
  track('screen', name);
}

export function trackAction(name, props) { track('action', name, props); }

export async function flushTrack() {
  if (!enabled || sending || !queue.length) return;
  const batch = queue.splice(0, 200);
  sending = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { queue = batch.concat(queue); return; }
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ events: batch, platform: Platform.OS, app_version: appVersion }),
    });
    // Keep the batch for the next try on a network hiccup; drop it if the
    // server rejected it (bad table, no access), so it never loops forever.
    if (!res.ok && res.status >= 500) queue = batch.concat(queue).slice(0, 500);
  } catch (_) {
    queue = batch.concat(queue).slice(0, 500);
  } finally {
    sending = false;
    if (queue.length) schedule();
  }
}
