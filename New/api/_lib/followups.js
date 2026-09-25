const { supaFetch } = require('./supabase.js');
const { getAutomations } = require('./automations.js');

// Automated follow-up texts. Today: the thank-you the morning after an
// in-person meetup (content shoots, coffee, walk-throughs), 8:00 AM Central.
// Rows live in crm_followups (docs/sql/followups.sql); followups-cron.js
// drafts and queues them when their time comes. Everything here tolerates
// the table not existing yet, so meetings keep working before the SQL runs.
const CENTRAL = 'America/Chicago';
const THANK_YOU_HOUR = 8;

const missingTable = (e) => /crm_followups|does not exist|schema cache/i.test(String(e?.message || e || ''));

function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\+\d{8,15}$/.test(s)) return s;
  const d = s.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d[0] === '1') return `+${d}`;
  if (d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

// The Central-time calendar date of an instant, as parts.
function centralParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
  const get = (t) => +parts.find(p => p.type === t)?.value;
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') };
}

// The instant for a Central wall-clock time: start from the naive UTC guess
// and correct by whatever offset Chicago has on that date.
function centralToInstant(y, m, d, h, min) {
  const guess = new Date(Date.UTC(y, m - 1, d, h, min));
  const p = centralParts(guess);
  const asIfCentral = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
  return new Date(guess.getTime() - (asIfCentral - guess.getTime()));
}

// 8:00 AM Central on the day after the meeting ends.
function nextMorningCentral(after, hour = THANK_YOU_HOUR) {
  const p = centralParts(new Date(after));
  const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
  return centralToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), hour, 0);
}

async function scheduleThankYou({ meetingId, title, endTime, phone, clientId, createdBy }) {
  const to = normalizePhone(phone);
  if (!to || !endTime) return null;
  const auto = await getAutomations();
  if (auto.thank_you.enabled === false) return null;
  const hour = Math.min(20, Math.max(5, parseInt(auto.thank_you.send_hour, 10) || THANK_YOU_HOUR));
  try {
    // One per meeting: replace anything already scheduled for it.
    if (meetingId) await supaFetch(`crm_followups?meeting_id=eq.${encodeURIComponent(meetingId)}&status=eq.scheduled`, { method: 'DELETE' });
    const [row] = await supaFetch('crm_followups', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        meeting_id: meetingId || null,
        meeting_title: title || null,
        phone: to,
        client_id: clientId || null,
        kind: 'thank_you',
        send_at: nextMorningCentral(endTime, hour).toISOString(),
        status: 'scheduled',
        created_by: createdBy || null,
      }),
    });
    return row || null;
  } catch (e) {
    if (!missingTable(e)) console.error('scheduleThankYou failed:', e.message);
    return null;
  }
}

async function cancelForMeeting(meetingId) {
  if (!meetingId) return;
  try {
    await supaFetch(`crm_followups?meeting_id=eq.${encodeURIComponent(meetingId)}&status=eq.scheduled`, {
      method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }),
    });
  } catch (e) { if (!missingTable(e)) console.error('cancelForMeeting failed:', e.message); }
}

async function moveForMeeting(meetingId, newEndTime) {
  if (!meetingId || !newEndTime) return;
  try {
    await supaFetch(`crm_followups?meeting_id=eq.${encodeURIComponent(meetingId)}&status=eq.scheduled`, {
      method: 'PATCH', body: JSON.stringify({ send_at: nextMorningCentral(newEndTime).toISOString() }),
    });
  } catch (e) { if (!missingTable(e)) console.error('moveForMeeting failed:', e.message); }
}

// Find the phone for a meeting's invitee: a lead/client whose contact email
// is on the invite. Used when a meeting is booked from the calendar.
async function phoneForAttendees(emails) {
  const list = (emails || []).map(e => String(e || '').toLowerCase()).filter(Boolean);
  if (!list.length) return null;
  try {
    const rows = await supaFetch(`crm_clients?contact_email=in.(${list.map(e => `"${e}"`).join(',')})&select=id,contact_phone,contact_email&limit=5`) || [];
    const hit = rows.find(r => r.contact_phone);
    return hit ? { phone: hit.contact_phone, clientId: hit.id } : null;
  } catch { return null; }
}

module.exports = { normalizePhone, nextMorningCentral, centralToInstant, scheduleThankYou, cancelForMeeting, moveForMeeting, phoneForAttendees, missingTable };
