// Public booking endpoint for vernontm.com/book-call.
//   GET  ?action=slots  -> open 30-min slots (next 14 days, weekdays 9am-6pm CT)
//        computed live from Ray's Google Calendar, so OOO days, the Tue/Thu
//        class, and existing meetings are automatically excluded.
//   POST action=book    -> re-verify the slot, create the Calendar event with a
//        Meet link + invite, and log the lead + their answers in the CRM.
// No auth (public page). Honeypot + validation + re-check guard abuse.
import { setCors, supaFetch } from './_lib/supabase.js';
import { getGmailAuth } from './_lib/gmail.js';
import { pushEvent } from './_lib/push.js';

const SLOT_MIN = 30;
const OPEN_HOUR = 9, CLOSE_HOUR = 18;      // CT business window
const LEAD_MS = 3 * 3600 * 1000;           // strangers can't book <3h out
const DAYS_AHEAD = 14;

// ── America/Chicago wall-time helpers (server runs in UTC) ───────────────────
function ctParts(utcMs) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, weekday: 'short' });
  return Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
}
function ctOffsetMs(utcMs) {
  const p = ctParts(utcMs);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000;
}
function ctWallToUtc(y, mo, d, h, mi) {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  guess = Date.UTC(y, mo - 1, d, h, mi) - ctOffsetMs(guess);
  return Date.UTC(y, mo - 1, d, h, mi) - ctOffsetMs(guess);   // 2nd pass for DST edges
}

// Busy intervals from the primary calendar (all-day rows block the whole CT day).
async function busyIntervals(accessToken, fromMs, toMs) {
  const params = new URLSearchParams({ timeMin: new Date(fromMs).toISOString(), timeMax: new Date(toMs).toISOString(), singleEvents: 'true', maxResults: '250' });
  const busy = [];
  let pageToken = null;
  do {
    if (pageToken) params.set('pageToken', pageToken);
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`calendar ${r.status}`);
    const data = await r.json();
    for (const e of data.items || []) {
      if (e.status === 'cancelled' || e.transparency === 'transparent') continue;
      if (e.start?.dateTime) {
        busy.push([new Date(e.start.dateTime).getTime(), new Date(e.end?.dateTime || e.start.dateTime).getTime()]);
      } else if (e.start?.date) {
        const [sy, sm, sd] = e.start.date.split('-').map(Number);
        const endExcl = e.end?.date || e.start.date;
        const [ey, em, ed] = endExcl.split('-').map(Number);
        busy.push([ctWallToUtc(sy, sm, sd, 0, 0), ctWallToUtc(ey, em, ed, 0, 0)]);
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return busy;
}

function computeSlots(busy) {
  const now = Date.now();
  const minStart = now + LEAD_MS;
  const slots = [];
  const today = ctParts(now);
  for (let d = 0; d < DAYS_AHEAD; d++) {
    // Day d in CT: anchor at CT noon to dodge DST boundary weirdness.
    const anchor = ctWallToUtc(+today.year, +today.month, +today.day, 12, 0) + d * 86400000;
    const p = ctParts(anchor);
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
    for (let mins = OPEN_HOUR * 60; mins + SLOT_MIN <= CLOSE_HOUR * 60; mins += SLOT_MIN) {
      const s = ctWallToUtc(+p.year, +p.month, +p.day, Math.floor(mins / 60), mins % 60);
      const e = s + SLOT_MIN * 60000;
      if (s < minStart) continue;
      if (busy.some(([bs, be]) => s < be && e > bs)) continue;
      slots.push(s);
    }
  }
  return slots.slice(0, 120);
}

const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });

const FOCUS_LABELS = {
  marketing: 'Marketing and going viral',
  crm: 'A CRM or custom software',
  website: 'A website',
  ai: 'AI automations',
  other: 'Something else',
};

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = req.query?.action || (req.method === 'POST' ? 'book' : 'slots');

  try {
    const { accessToken } = await getGmailAuth();

    if (req.method === 'GET' && action === 'slots') {
      const from = Date.now();
      const to = from + (DAYS_AHEAD + 1) * 86400000;
      const busy = await busyIntervals(accessToken, from, to);
      const slots = computeSlots(busy).map(ms => ({ iso: new Date(ms).toISOString(), ms, day: fmtDay(ms), time: fmtTime(ms) }));
      return res.json({ ok: true, timezone: 'America/Chicago', duration_minutes: SLOT_MIN, slots });
    }

    if (req.method === 'POST' && action === 'book') {
      const b = req.body || {};
      if (b.website) return res.json({ ok: true });   // honeypot: pretend success
      const name = String(b.name || '').trim().slice(0, 80);
      const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
      const phone = String(b.phone || '').trim().slice(0, 40);
      const business = String(b.business || '').trim().slice(0, 120);
      // One or many reasons (multi-select). Unknown keys dropped; empty -> other.
      const focusesRaw = Array.isArray(b.focus) ? b.focus : [b.focus];
      const focuses = [...new Set(focusesRaw.filter(f => FOCUS_LABELS[f]))].slice(0, 5);
      if (!focuses.length) focuses.push('other');
      const notes = String(b.notes || '').trim().slice(0, 1500);
      const slotMs = new Date(b.slot || 0).getTime();
      if (!name) return res.status(400).json({ error: 'Please add your name.' });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please add a valid email.' });
      if (!slotMs || isNaN(slotMs) || slotMs < Date.now() + LEAD_MS - 60000) return res.status(400).json({ error: 'That time is no longer available. Pick another.' });

      // Re-verify the slot is still free (someone may have grabbed it).
      const busy = await busyIntervals(accessToken, slotMs - 3600000, slotMs + 3600000);
      const slotEnd = slotMs + SLOT_MIN * 60000;
      if (busy.some(([bs, be]) => slotMs < be && slotEnd > bs)) {
        return res.status(409).json({ error: 'That time was just taken. Please pick another slot.' });
      }

      const focusLabel = focuses.map(f => FOCUS_LABELS[f]).join(' + ');
      const description = [
        `Booked via vernontm.com/book-call`,
        ``,
        `Looking for: ${focusLabel}`,
        business ? `Business: ${business}` : '',
        notes ? `What they shared: ${notes}` : '',
        phone ? `Phone: ${phone}` : '',
      ].filter(Boolean).join('\n');

      const evRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `VTM Intro Call w/ ${name}`,
          description,
          start: { dateTime: new Date(slotMs).toISOString(), timeZone: 'UTC' },
          end: { dateTime: new Date(slotEnd).toISOString(), timeZone: 'UTC' },
          attendees: [{ email, displayName: name }],
          conferenceData: { createRequest: { requestId: `bc-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
          reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 10 }] },
        }),
      });
      if (!evRes.ok) {
        console.error('book-call event create failed:', await evRes.text());
        return res.status(502).json({ error: 'Could not book that time. Please try again.' });
      }
      const ev = await evRes.json();
      const meetLink = ev.hangoutLink || ev.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri || '';

      // ── CRM: attach to the existing client by email, or create a new lead ──
      let clientId = null;
      try {
        const existing = await supaFetch(`crm_clients?contact_email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
        if (existing && existing.length) clientId = existing[0].id;
        else {
          const rows = await supaFetch('crm_clients', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
              business_name: business || name, owner_name: name, contact_email: email, contact_phone: phone || null,
              stage: 'lead', lead_temperature: 'warm', source: 'book-call',
            }),
          });
          clientId = rows?.[0]?.id || null;
        }
        if (clientId) {
          await supaFetch('crm_client_activity', {
            method: 'POST',
            body: JSON.stringify({
              client_id: clientId, type: 'note', tag: 'Meeting',
              title: `Booked an intro call · ${focusLabel}`,
              body: `${fmtDay(slotMs)} at ${fmtTime(slotMs)} CT (30 min)\n\n${description}`,
              author: 'Booking page',
            }),
          });
          await supaFetch(`crm_clients?id=eq.${clientId}`, {
            method: 'PATCH',
            body: JSON.stringify({ last_contact_at: new Date().toISOString(), last_contact_channel: 'booking', last_contact_summary: `Booked intro call: ${focusLabel}`, updated_at: new Date().toISOString() }),
          });
        }
      } catch (e) { console.error('book-call CRM log failed:', e.message); }

      pushEvent('booking', { title: 'New call booked 📅', body: `${name}${business ? ` (${business})` : ''} · ${focusLabel} · ${fmtDay(slotMs)} ${fmtTime(slotMs)} CT`, data: { type: 'booking', client_id: clientId } }).catch(() => {});
      return res.json({ ok: true, when: `${fmtDay(slotMs)} at ${fmtTime(slotMs)} CT`, meet_link: meetLink });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('book-call error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please refresh and try again.' });
  }
}
