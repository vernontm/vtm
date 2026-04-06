/**
 * calendarClient.js
 * Google Calendar API wrapper.
 * Reuses the same OAuth2 tokens as gmailClient — no separate auth needed.
 */

const { google } = require('googleapis');
const { getAuthenticatedClient } = require('./gmailClient');
const { v4: uuidv4 } = require('uuid');

// ── Calendar client factory ───────────────────────────────────────────────────
async function getCalendar() {
  try {
    const auth = await getAuthenticatedClient();
    return google.calendar({ version: 'v3', auth });
  } catch (err) {
    throw new Error('Calendar access unavailable. Please reconnect your Google account in Settings.');
  }
}

// ── Normalize a Calendar API event to our shape ───────────────────────────────
function normalizeEvent(item) {
  const startRaw = item.start?.dateTime || (item.start?.date ? item.start.date + 'T00:00:00' : null);
  const endRaw   = item.end?.dateTime   || (item.end?.date   ? item.end.date   + 'T00:00:00' : null);
  const durationMinutes = startRaw && endRaw
    ? Math.round((new Date(endRaw) - new Date(startRaw)) / 60000)
    : null;

  const meetLink = item.conferenceData?.entryPoints?.find(
    e => e.entryPointType === 'video'
  )?.uri || null;

  return {
    google_event_id:  item.id,
    title:            item.summary || '(No Title)',
    description:      item.description || '',
    start_time:       startRaw,
    end_time:         endRaw,
    duration_minutes: durationMinutes,
    meet_link:        meetLink,
    participants:     (item.attendees || []).map(a => ({
      email: a.email,
      name:  a.displayName || a.email,
      responseStatus: a.responseStatus,
    })),
    status: item.status || 'confirmed',
    html_link: item.htmlLink || null,
  };
}

// ── Wrap Calendar API errors with friendly message ────────────────────────────
function wrapCalendarError(err) {
  const msg  = err.message || '';
  const code = err.code || err.response?.status;
  const errData = err.response?.data?.error;
  const reason  = errData?.errors?.[0]?.reason || errData?.status || '';

  console.error('[CalendarClient] error:', code, reason, msg.slice(0, 120));

  // API not enabled in Google Cloud Console
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED' ||
      msg.includes('has not been used') || msg.includes('is disabled')) {
    throw new Error('CALENDAR_API_DISABLED');
  }

  // OAuth scope / token issues → ask user to reconnect
  if (
    code === 401 ||
    (code === 403 && reason !== 'accessNotConfigured') ||
    msg.includes('invalid_grant') ||
    msg.includes('insufficientPermissions') ||
    msg.includes('Invalid Credentials')
  ) {
    throw new Error('CALENDAR_RECONNECT_NEEDED');
  }

  throw err;
}

// ── Get upcoming events ───────────────────────────────────────────────────────
async function getUpcomingEvents(days = 14) {
  try {
    const calendar = await getCalendar();
    const now = new Date();
    const future = new Date(now.getTime() + days * 86400000);

    const resp = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      now.toISOString(),
      timeMax:      future.toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   100,
    });

    return (resp.data.items || []).map(normalizeEvent);
  } catch (err) {
    wrapCalendarError(err);
  }
}

// ── Get past events ───────────────────────────────────────────────────────────
async function getPastEvents(days = 30) {
  try {
    const calendar = await getCalendar();
    const now  = new Date();
    const past = new Date(now.getTime() - days * 86400000);

    const resp = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      past.toISOString(),
      timeMax:      now.toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   100,
    });

    // Reverse so most recent past event is first
    return (resp.data.items || []).map(normalizeEvent).reverse();
  } catch (err) {
    wrapCalendarError(err);
  }
}

// ── Create a calendar event with optional Meet link ───────────────────────────
async function createCalendarEvent({ summary, start, end, attendees = [], description = '', addMeetLink = true, reminderMinutes = 10 }) {
  try {
    const calendar = await getCalendar();

    const eventBody = {
      summary,
      description,
      start: { dateTime: start, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' },
      end:   { dateTime: end,   timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York' },
      attendees: attendees.map(email => ({ email })),
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: reminderMinutes }],
      },
    };

    if (addMeetLink) {
      eventBody.conferenceData = {
        createRequest: {
          requestId: uuidv4(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const resp = await calendar.events.insert({
      calendarId:           'primary',
      conferenceDataVersion: addMeetLink ? 1 : 0,  // CRITICAL — required for Meet link generation
      sendUpdates:          'all',
      requestBody:          eventBody,
    });

    return normalizeEvent(resp.data);
  } catch (err) {
    wrapCalendarError(err);
  }
}

// ── Update a calendar event ───────────────────────────────────────────────────
async function updateCalendarEvent(eventId, updates) {
  try {
    const calendar = await getCalendar();
    const resp = await calendar.events.patch({
      calendarId:   'primary',
      eventId,
      sendUpdates:  'all',
      requestBody:  updates,
    });
    return normalizeEvent(resp.data);
  } catch (err) {
    wrapCalendarError(err);
  }
}

// ── Delete (cancel) a calendar event ─────────────────────────────────────────
async function deleteCalendarEvent(eventId) {
  try {
    const calendar = await getCalendar();
    await calendar.events.delete({
      calendarId:  'primary',
      eventId,
      sendUpdates: 'all',
    });
    return { cancelled: true };
  } catch (err) {
    wrapCalendarError(err);
  }
}

// ── Check availability via freebusy ──────────────────────────────────────────
async function checkAvailability(emails, startTime, endTime) {
  try {
    const calendar = await getCalendar();
    const resp = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime,
        timeMax: endTime,
        items:   emails.map(email => ({ id: email })),
      },
    });

    const busy = [];
    const calendars = resp.data.calendars || {};
    for (const email of emails) {
      const slots = calendars[email]?.busy || [];
      slots.forEach(slot => busy.push({ email, start: slot.start, end: slot.end }));
    }

    return { allFree: busy.length === 0, busy };
  } catch (err) {
    wrapCalendarError(err);
  }
}

module.exports = {
  getUpcomingEvents,
  getPastEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkAvailability,
};
