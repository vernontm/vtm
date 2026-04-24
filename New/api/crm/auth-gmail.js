import { setCors, requireAuth } from '../_lib/supabase.js';
import { getAuthUrl, exchangeCode, setSetting, disconnectGmail } from '../_lib/gmail.js';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://vernontm.com';

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { callback, code, error } = req.query;

  // ── OAuth callback from Google ───────────────────────────────────────────
  if (callback === 'true') {
    if (error) {
      return res.redirect(`${FRONTEND_URL}/admin/settings?gmail_error=${encodeURIComponent(error)}`);
    }
    if (!code) {
      return res.redirect(`${FRONTEND_URL}/admin/settings?gmail_error=${encodeURIComponent('No auth code received')}`);
    }

    try {
      const tokens = await exchangeCode(code);

      // Get user email from Google
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      });
      const userData = await userRes.json();

      // Save tokens to Supabase
      try {
        await setSetting('gmail_access_token', tokens.access_token || '');
        await setSetting('gmail_refresh_token', tokens.refresh_token || '');
        if (tokens.expires_in) {
          await setSetting('gmail_token_expiry', String(Date.now() + tokens.expires_in * 1000));
        }
        await setSetting('gmail_connected_email', userData.email || '');
      } catch (saveErr) {
        console.error('Failed to save Gmail tokens:', saveErr.message);
        return res.redirect(`${FRONTEND_URL}/admin/settings?gmail_error=${encodeURIComponent('OAuth succeeded but failed to save tokens. Make sure the crm_app_settings table exists.')}`);
      }

      return res.redirect(`${FRONTEND_URL}/admin/settings?gmail_connected=true`);
    } catch (err) {
      console.error('Gmail OAuth callback error:', err.message);
      return res.redirect(`${FRONTEND_URL}/admin/settings?gmail_error=${encodeURIComponent(err.message)}`);
    }
  }

  // ── Initiate OAuth flow (GET without callback) ───────────────────────────
  if (req.method === 'GET') {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.redirect(
        `${FRONTEND_URL}/admin/settings?gmail_error=${encodeURIComponent('Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars.')}`
      );
    }
    return res.redirect(getAuthUrl());
  }

  // ── Disconnect (POST with action=disconnect) ────────────────────────────
  if (req.method === 'POST') {
    if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });
    await disconnectGmail();
    return res.json({ disconnected: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
