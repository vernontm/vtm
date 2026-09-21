// Push-token registry + per-user notification preferences.
//   POST ?action=register  {token, platform} — upsert this device's Expo token.
//   POST ?action=test      — send a test push to the caller's own devices.
//   GET  ?action=prefs     — (admin) all saved prefs + device counts per user.
//   POST ?action=set-prefs {user_id, prefs} — (admin) save who gets what.
import { setCors, requireCrmUser, supaFetch } from '../_lib/supabase.js';
import { pushUser, PUSH_EVENTS } from '../_lib/push.js';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = await requireCrmUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { action } = req.query;

  try {
    if (req.method === 'POST' && action === 'register') {
      const { token, platform } = req.body || {};
      if (!token || !/^ExponentPushToken\[.+\]$/.test(token)) return res.status(400).json({ error: 'Valid Expo push token required' });
      await supaFetch('crm_push_tokens?on_conflict=token', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ token, user_id: user.id, is_admin: !!user.is_admin, platform: platform || null, updated_at: new Date().toISOString() }),
      });
      return res.json({ ok: true });
    }
    if (req.method === 'POST' && action === 'test') {
      await pushUser(user.id, { title: 'VTM CRM', body: 'Push notifications are working on this device.' });
      return res.json({ ok: true });
    }

    if (req.method === 'GET' && action === 'prefs') {
      if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
      const [prefRows, tokenRows] = await Promise.all([
        supaFetch('crm_notification_prefs?select=user_id,prefs'),
        supaFetch('crm_push_tokens?select=user_id'),
      ]);
      const devices = {};
      for (const t of tokenRows || []) devices[t.user_id] = (devices[t.user_id] || 0) + 1;
      return res.json({ ok: true, events: PUSH_EVENTS, prefs: prefRows || [], devices });
    }

    if (req.method === 'POST' && action === 'set-prefs') {
      if (!user.is_admin) return res.status(403).json({ error: 'Admin only' });
      const { user_id, prefs } = req.body || {};
      if (!user_id || !/^[0-9a-f-]{36}$/i.test(user_id)) return res.status(400).json({ error: 'user_id required' });
      // Only known event keys, only booleans — everything else dropped.
      const clean = {};
      for (const key of Object.keys(PUSH_EVENTS)) {
        if (typeof prefs?.[key] === 'boolean') clean[key] = prefs[key];
      }
      await supaFetch('crm_notification_prefs?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id, prefs: clean, updated_at: new Date().toISOString() }),
      });
      return res.json({ ok: true, prefs: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('push endpoint error:', err);
    return res.status(500).json({ error: 'Push request failed' });
  }
}
