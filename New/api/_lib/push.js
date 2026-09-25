// Expo push helper. Tokens are registered by the mobile app (crm_push_tokens);
// Expo's push API needs no key. All sends are best-effort fire-and-forget:
// a push must never break the flow that triggered it.
const { supaFetch } = require('./supabase.js');

// Event types that can be toggled per user on the Users & Access page.
// Defaults when a user has no saved pref: admins get everything, employees nothing.
const PUSH_EVENTS = {
  booking: 'New call booked',
  signed: 'Agreement signed',
  paid: 'Payment received',
};

// Optional: set EXPO_ACCESS_TOKEN in Vercel if push security is ever turned
// on for the Expo project. Without it Expo still accepts sends today.
const EXPO_TOKEN = process.env.EXPO_ACCESS_TOKEN || '';

// Returns how many pushes Expo accepted. Ticket errors go to the function
// logs, and a token Apple no longer knows (app deleted, reinstalled) is
// forgotten so it stops eating a send every time.
async function sendExpoPush(tokens, { title, body, data }) {
  if (!tokens.length) return 0;
  const messages = tokens.map(to => ({ to, title, body, data: data || {}, sound: 'default' }));
  let sent = 0;
  try {
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(EXPO_TOKEN ? { Authorization: `Bearer ${EXPO_TOKEN}` } : {}) },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(8000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { console.error('push send rejected:', res.status, JSON.stringify(json).slice(0, 300)); continue; }
      const tickets = Array.isArray(json.data) ? json.data : [];
      tickets.forEach((t, k) => {
        if (t.status === 'ok') { sent++; return; }
        const code = t.details?.error || '';
        console.error(`push ticket error (${code || 'unknown'}) for ${batch[k].to}: ${t.message || ''}`);
        if (code === 'DeviceNotRegistered') forgetToken(batch[k].to);
      });
    }
  } catch (e) { console.error('push send failed:', e.message); }
  return sent;
}

async function forgetToken(token) {
  try { await supaFetch(`crm_push_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' }); }
  catch (e) { console.error('forgetToken failed:', e.message); }
}

// Send one named event to every device whose owner is opted in. A saved pref
// (crm_notification_prefs.prefs[type] boolean) always wins; without one,
// is_admin decides.
async function pushEvent(type, payload) {
  try {
    const [tokens, prefRows] = await Promise.all([
      supaFetch('crm_push_tokens?select=token,user_id,is_admin'),
      supaFetch('crm_notification_prefs?select=user_id,prefs'),
    ]);
    const prefs = new Map((prefRows || []).map(r => [r.user_id, r.prefs || {}]));
    const allowed = (tokens || []).filter(t => {
      const p = prefs.get(t.user_id);
      if (p && typeof p[type] === 'boolean') return p[type];
      return !!t.is_admin;
    });
    await sendExpoPush(allowed.map(t => t.token), payload);
  } catch (e) { console.error('pushEvent failed:', e.message); }
}

// Push to every registered ADMIN device regardless of prefs (rarely right:
// prefer pushEvent so the Users & Access toggles are honored).
async function pushAdmins(payload) {
  try {
    const rows = await supaFetch('crm_push_tokens?is_admin=eq.true&select=token') || [];
    return await sendExpoPush(rows.map(r => r.token), payload);
  } catch (e) { console.error('pushAdmins failed:', e.message); return 0; }
}

// Push to one user's devices (e.g. Naqiya when a revision comes back).
// Resolves to the number of pushes accepted, so callers can fall back when
// the person has no device on the app yet.
async function pushUser(userId, payload) {
  try {
    const rows = await supaFetch(`crm_push_tokens?user_id=eq.${userId}&select=token`) || [];
    return await sendExpoPush(rows.map(r => r.token), payload);
  } catch (e) { console.error('pushUser failed:', e.message); return 0; }
}

module.exports = { PUSH_EVENTS, pushEvent, pushAdmins, pushUser };
