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

async function sendExpoPush(tokens, { title, body, data }) {
  if (!tokens.length) return;
  const messages = tokens.map(to => ({ to, title, body, data: data || {}, sound: 'default' }));
  try {
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
        signal: AbortSignal.timeout(8000),
      });
    }
  } catch (e) { console.error('push send failed:', e.message); }
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
    await sendExpoPush(rows.map(r => r.token), payload);
  } catch (e) { console.error('pushAdmins failed:', e.message); }
}

// Push to one user's devices (e.g. Naqiya when a revision comes back).
async function pushUser(userId, payload) {
  try {
    const rows = await supaFetch(`crm_push_tokens?user_id=eq.${userId}&select=token`) || [];
    await sendExpoPush(rows.map(r => r.token), payload);
  } catch (e) { console.error('pushUser failed:', e.message); }
}

module.exports = { PUSH_EVENTS, pushEvent, pushAdmins, pushUser };
