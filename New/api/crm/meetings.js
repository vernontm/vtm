import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
import { getGmailAuth, getSetting, setSetting } from '../_lib/gmail.js';
import { fetchTranscriptForMeeting } from '../_lib/meet.js';
import { summarizeAndStore } from '../_lib/meeting-summary.js';

// Pull events from Google Calendar (primary) into crm_meetings. Uses the stored
// Gmail/Calendar OAuth token. Upserts on the Google event id so re-syncs update
// in place. Returns the number of events synced.
async function syncCalendar() {
  const { accessToken } = await getGmailAuth();
  const timeMin = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '150' });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`Calendar fetch failed: ${await r.text()}`);
  const data = await r.json();
  const rows = (data.items || [])
    .filter(e => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date))
    .map(e => {
      const start = e.start.dateTime || e.start.date;
      const end = e.end?.dateTime || e.end?.date || start;
      const durMin = (e.start.dateTime && e.end?.dateTime) ? Math.round((new Date(end) - new Date(start)) / 60000) : null;
      const meet = (e.conferenceData?.entryPoints || []).find(p => p.entryPointType === 'video')?.uri || e.hangoutLink || null;
      return {
        id: e.id,
        summary: e.summary || '(no title)',
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        duration_minutes: durMin,
        location: e.location || null,
        description: e.description || null,
        meet_link: meet,
        attendees: e.attendees || [],
        html_link: e.htmlLink || null,
        status: e.status || 'confirmed',
        synced_at: new Date().toISOString(),
      };
    });
  if (rows.length) {
    await supaFetch('crm_meetings?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
  }
  await setSetting('meetings_last_sync', String(Date.now())).catch(() => {});
  return rows.length;
}

// Normalize a crm_meetings row to the shape the frontend expects
function normalize(m) {
  if (!m) return m;
  const attendees = (() => {
    if (!m.attendees) return [];
    if (Array.isArray(m.attendees)) return m.attendees;
    try { return JSON.parse(m.attendees); } catch { return []; }
  })();
  return {
    ...m,
    google_event_id: m.google_event_id || m.id,
    title:           m.title || m.summary || '',
    participants:    m.participants || attendees,
  };
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    // GET meetings
    if (req.method === 'GET') {
      if (action === 'upcoming') {
        // Auto-sync from Google Calendar if the last sync is stale (throttled to
        // avoid hitting Google on every load).
        try {
          const last = parseInt((await getSetting('meetings_last_sync')) || '0', 10);
          if (Date.now() - last > 120000) await syncCalendar();
        } catch (e) { console.error('auto-sync failed:', e.message); }
        const now = new Date().toISOString();
        const rows = await supaFetch(`crm_meetings?start_time=gte.${now}&order=start_time.asc`);
        return res.json((rows || []).map(normalize));
      }
      if (action === 'past') {
        const now = new Date().toISOString();
        const rows = await supaFetch(`crm_meetings?start_time=lt.${now}&order=start_time.desc&limit=50`);
        return res.json((rows || []).map(normalize));
      }
      if (action === 'stats') {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const rows = await supaFetch(`crm_meetings?select=created_at&created_at=gte.${since30d}`);
        const now = Date.now();
        const meets7d  = (rows || []).filter(r => now - new Date(r.created_at).getTime() <= 7  * 24 * 60 * 60 * 1000).length;
        const meets30d = (rows || []).length;
        return res.json({ meets_7d: meets7d, meets_30d: meets30d });
      }
      if (action === 'lead-links') {
        return res.json(await supaFetch('crm_meeting_lead_links?order=created_at.desc'));
      }
      if (action === 'detail' && id) {
        const [meeting] = await supaFetch(`crm_meetings?id=eq.${id}`);
        if (!meeting) return res.status(404).json({ error: 'Not found' });
        const [summary] = await supaFetch(`crm_meeting_summaries?meeting_id=eq.${id}&order=created_at.desc&limit=1`).catch(() => [null]);
        const chatHistory = await supaFetch(`crm_meeting_chat_history?meeting_id=eq.${id}&order=created_at.asc`).catch(() => []);
        const leadLinks = await supaFetch(`crm_meeting_lead_links?meeting_id=eq.${id}`).catch(() => []);
        return res.json({ meeting: normalize(meeting), summary: summary || null, chat: chatHistory, linkedLeads: leadLinks });
      }
      // Default: all meetings
      const rows = await supaFetch('crm_meetings?order=start_time.desc');
      return res.json((rows || []).map(normalize));
    }

    // POST actions
    if (req.method === 'POST') {
      if (action === 'sync') {
        try {
          const synced = await syncCalendar();
          return res.json({ synced, message: `Synced ${synced} event${synced === 1 ? '' : 's'} from Google Calendar` });
        } catch (e) {
          return res.status(500).json({ error: e.message || 'Calendar sync failed' });
        }
      }
      if (action === 'create') {
        const { summary, start, end, attendees = [], description = '', addMeetLink = true, reminderMinutes = 10 } = req.body;
        if (!summary || !start || !end) return res.status(400).json({ error: 'summary, start, and end are required' });

        // ── Create Google Calendar event ───────────────────────────────────────
        let gcalEvent = null;
        try {
          const { accessToken } = await getGmailAuth();
          const eventBody = {
            summary,
            description,
            start: { dateTime: start, timeZone: 'UTC' },
            end:   { dateTime: end,   timeZone: 'UTC' },
            attendees: attendees.map(email => ({ email })),
            reminders: { useDefault: false, overrides: [{ method: 'email', minutes: reminderMinutes }, { method: 'popup', minutes: reminderMinutes }] },
          };
          if (addMeetLink) {
            eventBody.conferenceData = {
              createRequest: {
                requestId: `vtm-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            };
          }
          const calRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events${addMeetLink ? '?conferenceDataVersion=1' : ''}`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(eventBody),
            }
          );
          if (!calRes.ok) {
            const err = await calRes.text();
            throw new Error(`Google Calendar API error ${calRes.status}: ${err}`);
          }
          gcalEvent = await calRes.json();
        } catch (calErr) {
          console.warn('Google Calendar create failed:', calErr.message);
        }

        // ── Save to crm_meetings ───────────────────────────────────────────────
        const startMs  = new Date(start).getTime();
        const endMs    = new Date(end).getTime();
        const durationMins = Math.round((endMs - startMs) / 60000);
        const meetLink = gcalEvent?.hangoutLink || gcalEvent?.conferenceData?.entryPoints?.[0]?.uri || '';

        const row = {
          id:               gcalEvent?.id || `vtm-${Date.now()}`,
          summary,
          start_time:       start,
          end_time:         end,
          duration_minutes: durationMins,
          description,
          meet_link:        meetLink,
          attendees:        JSON.stringify(attendees.map(email => ({ email }))),
          html_link:        gcalEvent?.htmlLink || '',
          status:           gcalEvent?.status || 'confirmed',
        };

        const dbResult = await supaFetch('crm_meetings', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(row),
        });
        const saved = (dbResult || [])[0] || row;

        return res.status(201).json(normalize({
          ...saved,
          title:        summary,
          meet_link:    meetLink,
          participants: attendees.map(email => ({ email })),
        }));
      }
      if (action === 'lead-link') {
        const result = await supaFetch('crm_meeting_lead_links', { method: 'POST', body: JSON.stringify(req.body) });
        return res.status(201).json(result[0] || result);
      }
      if (action === 'summarize' && id) {
        // Manual "Summarize now": prefer the Google Meet transcript, but if
        // that isn't available (no Meet link, transcription off, or still
        // processing) fall back to the notes Ray typed on the meeting. Either
        // way we run the same Claude summary → store on meeting + matched
        // client flow, so the client file stays up to date.
        const [meeting] = await supaFetch(`crm_meetings?id=eq.${id}`);
        if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
        const notes = (meeting.notes || '').trim();
        try {
          let text = null, source = null, transcriptDocId = null;

          // 1) Try the Meet transcript when there's a Meet link.
          if (meeting.meet_link) {
            const r = await fetchTranscriptForMeeting({ meetLink: meeting.meet_link, endTime: meeting.end_time });
            if (r.status === 'ready' && r.text) {
              text = r.text; source = 'google_meet'; transcriptDocId = r.transcriptDocId;
            } else if (!notes) {
              // No transcript AND no notes to fall back on — report status.
              const msg = r.status === 'pending'
                ? 'Transcript is still processing on Google\'s side — try again in a few minutes, or add notes and Generate Summary to summarize from your notes.'
                : 'No transcript found (make sure transcription was on during the call). You can also type notes on the meeting and Generate Summary from those.';
              await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ transcript_status: r.status === 'pending' ? 'pending' : 'none' }) }).catch(() => {});
              return res.status(202).json({ ok: false, status: r.status, message: msg });
            }
          }

          // 2) Fall back to the manually-entered notes.
          if (!text && notes) { text = notes; source = 'manual_notes'; }

          if (!text) {
            return res.status(202).json({ ok: false, message: 'Nothing to summarize yet — add notes on this meeting (or turn on Meet transcription), then Generate Summary.' });
          }

          const stored = await summarizeAndStore(meeting, text, { source, transcriptDocId });
          await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ transcript_status: 'ready' }) });
          if (!stored) return res.json({ ok: false, message: 'There wasn\'t enough substance to summarize.' });
          return res.json({ ok: true, summary: stored.summary, matchedClientId: stored.matchedClientId, source });
        } catch (e) {
          console.error('Manual summarize failed:', e.message);
          const hint = /403|PERMISSION|not been used|disabled/i.test(e.message)
            ? 'Google Meet API access is not set up yet — enable the Google Meet API in the Cloud project and reconnect Gmail in Settings. (You can still summarize from typed notes in the meantime.)'
            : e.message;
          return res.status(500).json({ error: hint });
        }
      }
      if (action === 'ask' && id) {
        // Answer questions about this meeting using its stored transcript +
        // summary as context. Persists the Q&A to crm_meeting_chat_history.
        const { question, conversationHistory = [] } = req.body || {};
        if (!question) return res.status(400).json({ error: 'question required' });
        const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI is not configured.' });

        const [meeting] = await supaFetch(`crm_meetings?id=eq.${id}`);
        const [summary] = await supaFetch(`crm_meeting_summaries?meeting_id=eq.${id}&order=created_at.desc&limit=1`).catch(() => [null]);
        if (!summary || !(summary.transcript || summary.summary)) {
          return res.json({ answer: "I don't have a transcript or summary for this meeting yet. Generate the summary first (or wait for it to sync after the call)." });
        }

        const context = [
          `Meeting: ${meeting?.title || meeting?.summary || 'Client meeting'}`,
          summary.summary ? `Summary: ${summary.summary}` : '',
          (summary.action_items || []).length ? `Action items: ${summary.action_items.join('; ')}` : '',
          summary.transcript ? `Transcript:\n${summary.transcript}` : '',
        ].filter(Boolean).join('\n\n');

        const messages = [
          ...(Array.isArray(conversationHistory) ? conversationHistory.filter(m => m && m.role && m.content) : []),
          { role: 'user', content: `Using the meeting context below, answer concisely and specifically. If the answer isn't in the meeting, say so.\n\n${context}\n\nQuestion: ${question}` },
        ];

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 800, messages }),
        });
        if (!aiRes.ok) return res.status(500).json({ error: `AI failed: ${aiRes.status}` });
        const data = await aiRes.json();
        const answer = data.content?.[0]?.text || 'Sorry, I could not generate an answer.';

        // Persist both turns (best-effort).
        await supaFetch('crm_meeting_chat_history', { method: 'POST', body: JSON.stringify([
          { meeting_id: id, role: 'user', content: question },
          { meeting_id: id, role: 'assistant', content: answer },
        ]) }).catch(() => {});

        return res.json({ answer });
      }
    }

    // PATCH notes
    if (req.method === 'PATCH' && id && action === 'notes') {
      const { notes } = req.body;
      await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
      return res.json({ success: true });
    }

    // PUT meeting
    if (req.method === 'PUT' && id) {
      const { id: _, ...data } = req.body;
      const result = await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(data) });
      return res.json(result[0] || result);
    }

    // DELETE
    if (req.method === 'DELETE' && id) {
      if (action === 'lead-link') {
        await supaFetch(`crm_meeting_lead_links?id=eq.${id}`, { method: 'DELETE' });
      } else if (action === 'chat') {
        await supaFetch(`crm_meeting_chat_history?meeting_id=eq.${id}`, { method: 'DELETE' });
      } else {
        await supaFetch(`crm_meetings?id=eq.${id}`, { method: 'DELETE' });
      }
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('CRM meetings error:', err);
    return res.status(500).json({ error: err.message });
  }
}
