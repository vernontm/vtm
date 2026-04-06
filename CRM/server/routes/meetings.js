const express = require('express');
const router  = express.Router();
const { db, uuidv4, now } = require('../db');
const {
  getUpcomingEvents,
  getPastEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkAvailability,
} = require('../services/calendarClient');
const { findRecordingForMeeting } = require('../services/driveClient');
const { generateMeetingSummary, askAboutMeeting } = require('../services/meetingAI');

// ── Helper: map calendar error codes to HTTP status + payload ─────────────────
function calendarErrResponse(err) {
  const msg = err.message || '';
  if (msg === 'CALENDAR_API_DISABLED') {
    return { status: 503, body: { error: 'CALENDAR_API_DISABLED', message: 'Google Calendar API is not enabled in your Google Cloud project.' } };
  }
  if (msg === 'CALENDAR_RECONNECT_NEEDED') {
    return { status: 503, body: { error: 'CALENDAR_RECONNECT_NEEDED', message: 'Calendar access unavailable. Please reconnect your Google account in Settings.' } };
  }
  return { status: 500, body: { error: 'CALENDAR_ERROR', message: msg } };
}

// ── GET /api/meetings/upcoming ────────────────────────────────────────────────
router.get('/upcoming', async (req, res) => {
  try {
    const days   = parseInt(req.query.days) || 14;
    const events = await getUpcomingEvents(days);
    res.json(events);
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── GET /api/meetings/past ────────────────────────────────────────────────────
router.get('/past', async (req, res) => {
  try {
    const days   = parseInt(req.query.days) || 30;
    const events = await getPastEvents(days);
    res.json(events);
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── POST /api/meetings/sync ───────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const [upcoming, past] = await Promise.all([
      getUpcomingEvents(14),
      getPastEvents(90),
    ]);

    const all = [...upcoming, ...past];
    let synced = 0;

    all.forEach(event => {
      const existing = db.get('meetings').find({ google_event_id: event.google_event_id }).value();
      if (existing) {
        db.get('meetings').find({ google_event_id: event.google_event_id }).assign({
          ...event,
          updated_at: now(),
        }).write();
      } else {
        db.get('meetings').push({
          id: uuidv4(),
          ...event,
          created_at: now(),
          updated_at: now(),
        }).write();
        synced++;
      }
    });

    res.json({ synced, total: all.length });
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── GET /api/meetings/free-slots  — available 30-min slots for a date ─────────
router.get('/free-slots', async (req, res) => {
  try {
    const { date, duration } = req.query;
    if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

    const durationMins = parseInt(duration) || 30;
    const workStart = 9;  // 9 AM
    const workEnd   = 18; // 6 PM

    // Build day boundaries
    const dayStart = new Date(`${date}T${String(workStart).padStart(2,'0')}:00:00`);
    const dayEnd   = new Date(`${date}T${String(workEnd).padStart(2,'0')}:00:00`);

    const { checkAvailability } = require('../services/calendarClient');
    const avail = await checkAvailability(['primary'], dayStart.toISOString(), dayEnd.toISOString());
    const busy  = avail.busy;

    const slots = [];
    const now   = new Date();
    let cursor  = new Date(dayStart);

    while (cursor < dayEnd) {
      const slotEnd = new Date(cursor.getTime() + durationMins * 60000);
      if (slotEnd > dayEnd) break;

      if (cursor > now) {
        const conflict = busy.some(b => {
          const bStart = new Date(b.start);
          const bEnd   = new Date(b.end);
          return cursor < bEnd && slotEnd > bStart;
        });

        slots.push({
          start:    cursor.toISOString(),
          end:      slotEnd.toISOString(),
          label:    cursor.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
          available: !conflict,
        });
      }

      cursor = new Date(cursor.getTime() + 30 * 60000);
    }

    res.json({ date, slots });
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── GET /api/meetings/check-availability ──────────────────────────────────────
router.get('/check-availability', async (req, res) => {
  try {
    const { emails, start, end } = req.query;
    if (!emails || !start || !end) {
      return res.status(400).json({ error: 'emails, start, and end are required' });
    }
    const emailList = decodeURIComponent(emails).split(',').map(e => e.trim()).filter(Boolean);
    const result = await checkAvailability(emailList, decodeURIComponent(start), decodeURIComponent(end));
    res.json(result);
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── GET /api/meetings/lead-links ──────────────────────────────────────────────
router.get('/lead-links', (req, res) => {
  const links = db.get('meeting_lead_links').value();
  res.json(links);
});

// ── POST /api/meetings/lead-links ─────────────────────────────────────────────
router.post('/lead-links', (req, res) => {
  const { meeting_id, google_event_id, lead_id, notes } = req.body;
  if (!lead_id || (!meeting_id && !google_event_id)) {
    return res.status(400).json({ error: 'lead_id and meeting_id (or google_event_id) are required' });
  }
  const link = {
    id: uuidv4(),
    meeting_id:      meeting_id || google_event_id,
    google_event_id: google_event_id || meeting_id,
    lead_id,
    notes:      notes || '',
    linked_at:  now(),
    created_at: now(),
  };
  db.get('meeting_lead_links').push(link).write();
  res.status(201).json(link);
});

// ── DELETE /api/meetings/lead-links/:id ───────────────────────────────────────
router.delete('/lead-links/:id', (req, res) => {
  db.get('meeting_lead_links').remove({ id: req.params.id }).write();
  res.json({ deleted: true });
});

// ── POST /api/meetings/create ─────────────────────────────────────────────────
router.post('/create', async (req, res) => {
  const { summary, start, end, attendees, description, addMeetLink, reminderMinutes } = req.body;
  if (!summary || !start || !end) {
    return res.status(400).json({ error: 'summary, start, and end are required' });
  }

  try {
    const event = await createCalendarEvent({
      summary,
      start,
      end,
      attendees:       attendees || [],
      description:     description || '',
      addMeetLink:     addMeetLink !== false,
      reminderMinutes: reminderMinutes || 10,
    });

    // Cache in local DB
    db.get('meetings').push({
      id: uuidv4(),
      ...event,
      created_at: now(),
      updated_at: now(),
    }).write();

    res.status(201).json(event);
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── PUT /api/meetings/:eventId ────────────────────────────────────────────────
router.put('/:eventId', async (req, res) => {
  try {
    const event = await updateCalendarEvent(req.params.eventId, req.body);

    // Update local DB cache
    db.get('meetings').find({ google_event_id: req.params.eventId }).assign({
      ...event,
      updated_at: now(),
    }).write();

    res.json(event);
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── DELETE /api/meetings/:eventId ─────────────────────────────────────────────
router.delete('/:eventId', async (req, res) => {
  try {
    await deleteCalendarEvent(req.params.eventId);

    // Remove from local DB cache
    db.get('meetings').remove({ google_event_id: req.params.eventId }).write();

    res.json({ cancelled: true });
  } catch (err) {
    const { status, body } = calendarErrResponse(err);
    res.status(status).json(body);
  }
});

// ── GET /api/meetings/:eventId/detail ─────────────────────────────────────────
// Returns meeting + its summary + chat history + recording info from local DB
router.get('/:eventId/detail', (req, res) => {
  const { eventId } = req.params;
  const meeting  = db.get('meetings').find({ google_event_id: eventId }).value();
  if (!meeting) return res.status(404).json({ error: 'Meeting not found in local cache. Sync first.' });

  const summary  = db.get('meeting_summaries').find({ meeting_id: meeting.id }).value() || null;
  const chat     = db.get('meeting_chat_history').filter({ meeting_id: meeting.id }).orderBy('created_at', 'asc').value();
  const links    = db.get('meeting_lead_links').filter({ google_event_id: eventId }).value();
  const leadIds  = links.map(l => l.lead_id);
  const leads    = leadIds.map(id => db.get('leads').find({ id }).value()).filter(Boolean);

  res.json({ meeting, summary, chat, linkedLeads: leads });
});

// ── PATCH /api/meetings/:eventId/notes ────────────────────────────────────────
// Save manual notes to a cached meeting record
router.patch('/:eventId/notes', (req, res) => {
  const { eventId } = req.params;
  const { notes }   = req.body;
  const meeting = db.get('meetings').find({ google_event_id: eventId }).value();
  if (!meeting) return res.status(404).json({ error: 'Meeting not found. Sync first.' });

  db.get('meetings').find({ google_event_id: eventId }).assign({ notes: notes || '', updated_at: now() }).write();
  res.json({ saved: true });
});

// ── POST /api/meetings/:eventId/find-recording ────────────────────────────────
// Search Drive for a recording matching this meeting
router.post('/:eventId/find-recording', async (req, res) => {
  const { eventId } = req.params;
  const meeting = db.get('meetings').find({ google_event_id: eventId }).value();
  if (!meeting) return res.status(404).json({ error: 'Meeting not found. Sync first.' });

  try {
    const recording = await findRecordingForMeeting(meeting.title, meeting.start_time);
    if (recording) {
      // Save to meeting record
      db.get('meetings').find({ google_event_id: eventId }).assign({
        drive_recording_id:  recording.fileId,
        drive_recording_url: recording.previewUrl,
        drive_web_view_url:  recording.webViewLink,
        recording_duration_seconds: recording.durationSeconds,
        status:              'recorded',
        updated_at:          now(),
      }).write();
      res.json({ found: true, recording });
    } else {
      db.get('meetings').find({ google_event_id: eventId }).assign({ status: 'no_recording', updated_at: now() }).write();
      res.json({ found: false });
    }
  } catch (err) {
    if (err.message === 'DRIVE_RECONNECT_NEEDED') {
      return res.status(503).json({ error: 'DRIVE_RECONNECT_NEEDED', message: 'Drive access unavailable. Reconnect Google account in Settings.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/meetings/:eventId/summarize ─────────────────────────────────────
// Generate or regenerate an AI summary for this meeting
router.post('/:eventId/summarize', async (req, res) => {
  const { eventId } = req.params;
  const meeting = db.get('meetings').find({ google_event_id: eventId }).value();
  if (!meeting) return res.status(404).json({ error: 'Meeting not found. Sync first.' });

  // Get linked leads for context
  const links    = db.get('meeting_lead_links').filter({ google_event_id: eventId }).value();
  const leads    = links.map(l => db.get('leads').find({ id: l.lead_id }).value()).filter(Boolean);

  // Mark as processing
  db.get('meetings').find({ google_event_id: eventId }).assign({ status: 'processing', updated_at: now() }).write();

  try {
    const summaryData = await generateMeetingSummary(meeting, leads);

    // Upsert summary
    const existing = db.get('meeting_summaries').find({ meeting_id: meeting.id }).value();
    if (existing) {
      db.get('meeting_summaries').find({ meeting_id: meeting.id }).assign({
        ...summaryData,
        generated_at: now(),
        model_used:   'claude-opus-4-5',
      }).write();
    } else {
      db.get('meeting_summaries').push({
        id:           uuidv4(),
        meeting_id:   meeting.id,
        ...summaryData,
        generated_at: now(),
        model_used:   'claude-opus-4-5',
      }).write();
    }

    // Mark as summarized
    db.get('meetings').find({ google_event_id: eventId }).assign({ status: 'summarized', updated_at: now() }).write();

    const summary = db.get('meeting_summaries').find({ meeting_id: meeting.id }).value();
    res.json(summary);
  } catch (err) {
    db.get('meetings').find({ google_event_id: eventId }).assign({ status: 'no_recording', updated_at: now() }).write();
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/meetings/:eventId/ask ───────────────────────────────────────────
// Sidekick chat: ask a question about this meeting
router.post('/:eventId/ask', async (req, res) => {
  const { eventId } = req.params;
  const { question, conversationHistory = [] } = req.body;
  if (!question?.trim()) return res.status(400).json({ error: 'question is required' });

  const meeting = db.get('meetings').find({ google_event_id: eventId }).value();
  if (!meeting) return res.status(404).json({ error: 'Meeting not found. Sync first.' });

  const summary   = db.get('meeting_summaries').find({ meeting_id: meeting.id }).value() || null;
  const links     = db.get('meeting_lead_links').filter({ google_event_id: eventId }).value();
  const leads     = links.map(l => db.get('leads').find({ id: l.lead_id }).value()).filter(Boolean);

  try {
    const answer = await askAboutMeeting(meeting, leads, question, conversationHistory, summary);

    // Save to chat history
    const chatBase = { meeting_id: meeting.id, created_at: now() };
    db.get('meeting_chat_history').push({ id: uuidv4(), ...chatBase, role: 'user',      content: question }).write();
    db.get('meeting_chat_history').push({ id: uuidv4(), ...chatBase, role: 'assistant', content: answer   }).write();

    res.json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/meetings/:eventId/chat ────────────────────────────────────────
// Clear Sidekick chat history for a meeting
router.delete('/:eventId/chat', (req, res) => {
  const meeting = db.get('meetings').find({ google_event_id: req.params.eventId }).value();
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  db.get('meeting_chat_history').remove({ meeting_id: meeting.id }).write();
  res.json({ cleared: true });
});

module.exports = router;
