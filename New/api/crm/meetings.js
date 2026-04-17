import { setCors, requireAuth, supaFetch } from '../_lib/supabase.js';
import { getGmailAuth } from '../_lib/gmail.js';

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
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    // GET meetings
    if (req.method === 'GET') {
      if (action === 'upcoming') {
        const now = new Date().toISOString();
        const rows = await supaFetch(`crm_meetings?start_time=gte.${now}&order=start_time.asc`);
        return res.json((rows || []).map(normalize));
      }
      if (action === 'past') {
        const now = new Date().toISOString();
        const rows = await supaFetch(`crm_meetings?start_time=lt.${now}&order=start_time.desc&limit=50`);
        return res.json((rows || []).map(normalize));
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
        return res.json({ ...normalize(meeting), summary: summary || null, chatHistory, leadLinks });
      }
      // Default: all meetings
      const rows = await supaFetch('crm_meetings?order=start_time.desc');
      return res.json((rows || []).map(normalize));
    }

    // POST actions
    if (req.method === 'POST') {
      if (action === 'sync') {
        // Calendar sync placeholder - Phase 4
        return res.json({ message: 'Calendar sync will be available after Google OAuth setup', synced: 0 });
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
        // AI summary placeholder - Phase 4
        return res.json({ message: 'Meeting summarization will be available in Phase 4' });
      }
      if (action === 'ask' && id) {
        // AI sidekick placeholder - Phase 4
        return res.json({ message: 'Meeting AI assistant will be available in Phase 4' });
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
