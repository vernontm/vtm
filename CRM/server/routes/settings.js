const express = require('express');
const router  = express.Router();
const { db }  = require('../db');

function getSetting(key) {
  return db.get('app_settings').find({ key }).value()?.value || '';
}

function setSetting(key, value) {
  const existing = db.get('app_settings').find({ key }).value();
  if (!existing) {
    db.get('app_settings').push({ key, value }).write();
  } else {
    db.get('app_settings').find({ key }).assign({ value }).write();
  }
}

// GET /api/settings → all settings as flat { key: value } object
router.get('/', (req, res) => {
  const rows = db.get('app_settings').value();
  const obj  = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  res.json(obj);
});

// GET /api/settings/gmail/status → Gmail connection status
router.get('/gmail/status', (req, res) => {
  const connectedEmail = getSetting('gmail_connected_email');
  const accessToken    = getSetting('gmail_access_token');
  const expiry         = getSetting('gmail_token_expiry');
  const isConnected    = !!(accessToken && connectedEmail);
  const isExpired      = expiry ? Date.now() > parseInt(expiry) : false;
  res.json({ connected: isConnected, email: connectedEmail, expired: isExpired });
});

// PUT /api/settings/:key → update one setting
router.put('/:key', (req, res) => {
  const { key }   = req.params;
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ error: 'value required' });
  setSetting(key, String(value));
  res.json({ key, value: String(value) });
});

// POST /api/settings/bulk → set multiple settings at once
// Body: { settings: { key: value, ... } }
router.post('/bulk', (req, res) => {
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings object required' });
  }
  Object.entries(settings).forEach(([key, value]) => setSetting(key, String(value)));
  res.json({ updated: Object.keys(settings).length });
});

module.exports = router;
