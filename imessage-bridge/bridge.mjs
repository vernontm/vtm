#!/usr/bin/env node
// iMessage bridge for the VTM CRM.
//
// Runs on the Mac that is signed into the business Apple ID. It is the only
// piece of the CRM that can touch Messages.app, so it does two jobs on a loop:
//
//   1. Outbound: pull texts the CRM queued (POST /api/crm/imessage?action=pending),
//      send each through Messages via AppleScript, and report sent/failed.
//   2. Inbound: watch ~/Library/Messages/chat.db for new incoming messages and
//      forward the ones from known clients/leads to the CRM. Anything from a
//      number the CRM does not know is personal and never leaves this Mac.
//
// Requirements on this Mac: Messages signed in, Automation access to Messages
// (prompted on first send), and Full Disk Access for the terminal running this
// (needed to read chat.db). Keep the Mac awake and logged in.
//
// Config: imessage-bridge/config.json (gitignored) or env CRM_URL and
// IMESSAGE_BRIDGE_TOKEN. See README.md.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, 'config.json');
const STATE_PATH = join(HERE, 'state.json');
const CHAT_DB = join(homedir(), 'Library', 'Messages', 'chat.db');

const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// ── Config ──────────────────────────────────────────────────────────────────
function loadConfig() {
  let file = {};
  if (existsSync(CONFIG_PATH)) {
    try { file = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); }
    catch (e) { console.error(`config.json is not valid JSON: ${e.message}`); process.exit(1); }
  }
  const cfg = {
    crmUrl: 'https://vernontm.com',
    outboundPollMs: 3000,
    inboundPollMs: 5000,
    contactsRefreshMs: 120000,
    ...file,
  };
  if (process.env.CRM_URL) cfg.crmUrl = process.env.CRM_URL;
  if (process.env.IMESSAGE_BRIDGE_TOKEN) cfg.bridgeToken = process.env.IMESSAGE_BRIDGE_TOKEN;
  if (!cfg.bridgeToken) {
    console.error('Missing bridgeToken. Copy config.example.json to config.json and set it (same value as IMESSAGE_BRIDGE_TOKEN on Vercel).');
    process.exit(1);
  }
  cfg.crmUrl = String(cfg.crmUrl).replace(/\/+$/, '');
  return cfg;
}
const cfg = loadConfig();
const API = `${cfg.crmUrl}/api/crm/imessage`;

async function api(action, { method = 'POST', body } = {}) {
  const res = await fetch(`${API}?action=${action}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Bridge-Token': cfg.bridgeToken },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${action} -> ${res.status}: ${data.error || text.slice(0, 200)}`);
  return data;
}

// ── Sending (mirrors the proven Scalesolo watchdog sender) ──────────────────
// Normalize a US 10-digit number to +1XXXXXXXXXX. Leave +country and email
// handles untouched.
function normalizeHandle(raw) {
  const s = String(raw || '').trim();
  if (!s) return s;
  if (s.includes('@')) return s;
  const digits = s.replace(/[^\d]/g, '');
  if (s.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return s;
}

// Try iMessage first; if the handle is not on iMessage the first send errors,
// and the fallback lets Messages route it as SMS through the paired iPhone.
// Recipient and body travel as argv, never interpolated into the script.
const APPLESCRIPT = `on run {targetHandle, msg}
  tell application "Messages"
    try
      set svc to 1st account whose service type = iMessage
      set toRecipient to participant targetHandle of svc
      send msg to toRecipient
    on error
      send msg to participant targetHandle
    end try
  end tell
end run`;

function sendIMessage({ to, text }) {
  const handle = normalizeHandle(to);
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', APPLESCRIPT, handle, text], { timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`osascript failed: ${stderr || err.message}`));
      resolve({ to: handle });
    });
  });
}

// ── State (inbound high-water mark) ─────────────────────────────────────────
function loadState() {
  if (!existsSync(STATE_PATH)) return {};
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}
const saveState = (s) => writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
let state = loadState();

// ── chat.db (read-only through the macOS sqlite3 CLI) ───────────────────────
function sqliteJson(sql) {
  return new Promise((resolve, reject) => {
    execFile('sqlite3', ['-readonly', '-json', CHAT_DB, sql], { maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      const out = (stdout || '').trim();
      resolve(out ? JSON.parse(out) : []);
    });
  });
}

// Newer macOS keeps the body in attributedBody (a typedstream blob) and leaves
// text NULL. Pull the NSString payload out of the hex dump. Best effort: returns
// '' when the layout is not recognized, so we skip rather than post garbage.
function decodeAttributedBody(hex) {
  if (!hex) return '';
  let buf;
  try { buf = Buffer.from(hex, 'hex'); } catch { return ''; }
  const marker = buf.indexOf(Buffer.from('NSString', 'ascii'));
  if (marker === -1) return '';
  const plus = buf.indexOf(0x2b, marker + 8);
  if (plus === -1) return '';
  let i = plus + 1;
  let len = buf[i]; i += 1;
  if (len === 0x81) { if (i + 2 > buf.length) return ''; len = buf.readUInt16LE(i); i += 2; }
  else if (len === 0x82) { if (i + 4 > buf.length) return ''; len = buf.readUInt32LE(i); i += 4; }
  if (!len || i + len > buf.length) return '';
  return buf.subarray(i, i + len).toString('utf8').replace(/\u0000/g, '').trim();
}

// Only forward inbound from numbers the CRM knows (clients + leads).
let allowed = new Set();
let allowedAt = 0;
async function refreshContacts() {
  if (Date.now() - allowedAt < cfg.contactsRefreshMs && allowed.size) return;
  const { numbers } = await api('contacts', { method: 'GET' });
  allowed = new Set(numbers || []);
  allowedAt = Date.now();
}
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// ── Outbound loop ───────────────────────────────────────────────────────────
let outboundBusy = false;
async function pumpOutbound() {
  if (outboundBusy) return;
  outboundBusy = true;
  try {
    const { messages } = await api('pending');
    for (const m of messages || []) {
      try {
        await sendIMessage({ to: m.phone, text: m.body });
        await api('mark', { body: { id: m.id, status: 'sent' } });
        log(`sent -> ${m.phone}`);
      } catch (e) {
        await api('mark', { body: { id: m.id, status: 'failed', error: e.message } }).catch(() => {});
        log(`FAILED -> ${m.phone}: ${e.message}`);
      }
    }
  } catch (e) {
    log(`outbound poll error: ${e.message}`);
  } finally {
    outboundBusy = false;
  }
}

// ── Inbound loop ────────────────────────────────────────────────────────────
let inboundBusy = false;
let warnedDiskAccess = false;
async function pumpInbound() {
  if (inboundBusy) return;
  inboundBusy = true;
  try {
    await refreshContacts();

    if (state.lastRowid == null) {
      // First run: start from now so years of history are not replayed into the CRM.
      const [{ max }] = await sqliteJson('SELECT MAX(ROWID) AS max FROM message;');
      state.lastRowid = max || 0;
      saveState(state);
      log(`inbound watching from message ROWID ${state.lastRowid} onward`);
      return;
    }

    // Apple stores date as nanoseconds since 2001 on current macOS (seconds on
    // very old installs); convert either to unix seconds.
    const rows = await sqliteJson(
      `SELECT m.ROWID AS rowid, m.guid AS guid, m.text AS text, hex(m.attributedBody) AS abhex, h.id AS handle,
              (CASE WHEN m.date > 1000000000000 THEN m.date / 1000000000 ELSE m.date END) + 978307200 AS ts
         FROM message m JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.is_from_me = 0 AND m.ROWID > ${Number(state.lastRowid) || 0}
        ORDER BY m.ROWID ASC LIMIT 50;`
    );

    for (const r of rows) {
      state.lastRowid = r.rowid;
      const from = r.handle;
      if (!allowed.has(last10(from))) continue; // personal: stays on this Mac
      const body = (r.text && r.text.trim()) || decodeAttributedBody(r.abhex);
      if (!body) { log(`inbound from ${from} had no readable text, skipped`); continue; }
      try {
        await api('inbound', { body: { from, body, guid: r.guid, ts: r.ts ? Math.round(r.ts * 1000) : Date.now() } });
        log(`inbound <- ${from}`);
      } catch (e) {
        log(`inbound post failed (${from}): ${e.message}`);
      }
    }
    if (rows.length) saveState(state);
  } catch (e) {
    if (/authorization denied|unable to open database/i.test(e.message)) {
      if (!warnedDiskAccess) {
        warnedDiskAccess = true;
        log('Cannot read Messages history: grant Full Disk Access to this terminal app (System Settings > Privacy & Security > Full Disk Access), then restart the bridge. Outbound still works.');
      }
    } else {
      log(`inbound poll error: ${e.message}`);
    }
  } finally {
    inboundBusy = false;
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────
log(`VTM iMessage bridge -> ${cfg.crmUrl}`);
pumpOutbound();
pumpInbound();
setInterval(pumpOutbound, cfg.outboundPollMs);
setInterval(pumpInbound, cfg.inboundPollMs);
