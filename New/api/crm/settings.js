import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { key, action } = req.query;

  try {
    // GET /api/crm/settings - list all
    if (req.method === 'GET' && !key) {
      const rows = await supaFetch('crm_app_settings?order=key.asc');
      return res.json(rows);
    }

    // GET /api/crm/settings?action=gmail-status
    if (req.method === 'GET' && action === 'gmail-status') {
      const rows = await supaFetch('crm_app_settings?key=in.(gmail_access_token,gmail_connected_email,gmail_token_expiry)');
      const map = {};
      rows.forEach(r => { map[r.key] = r.value; });
      return res.json({
        connected: !!(map.gmail_access_token && map.gmail_connected_email),
        email: map.gmail_connected_email || '',
        tokenExpiry: map.gmail_token_expiry || '',
      });
    }

    // PUT /api/crm/settings?key=xxx - update single setting
    if (req.method === 'PUT' && key) {
      const { value } = req.body;
      await supaFetch(`crm_app_settings?key=eq.${encodeURIComponent(key)}`, {
        method: 'PATCH', body: JSON.stringify({ value: value || '' }),
      });
      return res.json({ success: true });
    }

    // POST /api/crm/settings?action=bulk - bulk update
    if (req.method === 'POST' && action === 'bulk') {
      const { settings } = req.body;
      if (!Array.isArray(settings)) return res.status(400).json({ error: 'settings array required' });
      for (const { key: k, value: v } of settings) {
        // Upsert: try update, if no rows affected, insert
        const existing = await supaFetch(`crm_app_settings?key=eq.${encodeURIComponent(k)}`);
        if (existing.length > 0) {
          await supaFetch(`crm_app_settings?key=eq.${encodeURIComponent(k)}`, {
            method: 'PATCH', body: JSON.stringify({ value: v || '' }),
          });
        } else {
          await supaFetch('crm_app_settings', {
            method: 'POST', body: JSON.stringify({ key: k, value: v || '' }),
          });
        }
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM settings error:', err);
    return res.status(500).json({ error: err.message });
  }
}
