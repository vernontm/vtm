const express        = require('express');
const router         = express.Router();
const { google }     = require('googleapis');
const { db }         = require('../db');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/gmail/callback'
  );
}

function setSetting(key, value) {
  const existing = db.get('app_settings').find({ key }).value();
  if (!existing) {
    db.get('app_settings').push({ key, value }).write();
  } else {
    db.get('app_settings').find({ key }).assign({ value }).write();
  }
}

// GET /auth/gmail → redirect to Google OAuth consent screen
router.get('/', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(
      `${FRONTEND_URL}/settings?gmail_error=${encodeURIComponent('Google OAuth not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to server/.env')}`
    );
  }
  const oauth2Client = getOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',  // returns refresh_token
    prompt:      'consent',  // forces consent so refresh_token is always returned
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
  });
  res.redirect(authUrl);
});

// GET /auth/gmail/callback → exchange auth code for tokens
router.get('/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}/settings?gmail_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/settings?gmail_error=${encodeURIComponent('No auth code received from Google')}`);
  }

  try {
    const oauth2Client = getOAuth2Client();
    const { tokens }   = await oauth2Client.getToken(code);

    oauth2Client.setCredentials(tokens);
    const oauth2Api  = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data }   = await oauth2Api.userinfo.get();

    // Persist tokens to app_settings
    setSetting('gmail_access_token',    tokens.access_token || '');
    setSetting('gmail_refresh_token',   tokens.refresh_token || '');
    setSetting('gmail_token_expiry',    tokens.expiry_date ? String(tokens.expiry_date) : '');
    setSetting('gmail_connected_email', data.email || '');

    console.log(`✅ Gmail connected: ${data.email}`);
    res.redirect(`${FRONTEND_URL}/settings?gmail_connected=true`);
  } catch (err) {
    console.error('Gmail OAuth callback error:', err.message);
    res.redirect(`${FRONTEND_URL}/settings?gmail_error=${encodeURIComponent(err.message)}`);
  }
});

// DELETE /auth/gmail → disconnect (clear all tokens)
router.delete('/', (req, res) => {
  ['gmail_access_token', 'gmail_refresh_token', 'gmail_token_expiry', 'gmail_connected_email'].forEach(key => {
    setSetting(key, '');
  });
  console.log('Gmail disconnected');
  res.json({ disconnected: true });
});

module.exports = router;
