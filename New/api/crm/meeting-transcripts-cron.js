const { setCors, supaFetch } = require('../_lib/supabase.js');
const { fetchTranscriptForMeeting } = require('../_lib/meet.js');
const { summarizeAndStore } = require('../_lib/meeting-summary.js');

// Poll recently-ended meetings for a ready Google Meet transcript, summarize it
// with Claude, and store it on the meeting + the matched client's file.
// Runs every 15 min (vercel.json). Transcripts lag several minutes after a call,
// so meetings stay 'pending' and retry until a transcript appears — or, after
// 24h with nothing, are marked 'none' so we stop polling.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Match the other crons' permissive auth (Vercel sends CRON_SECRET when set).
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.authorization !== `Bearer ${expected}`) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const nowISO = new Date(now).toISOString();
  const windowStart = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(); // look back 3 days
  const giveUpBefore = now - 24 * 60 * 60 * 1000; // stop polling after 24h

  const results = { checked: 0, summarized: 0, pending: 0, none: 0, failed: 0 };

  try {
    // Candidate meetings: ended in the last 3 days, have a Meet link, still pending.
    const candidates = await supaFetch(
      `crm_meetings?select=id,title,summary,meet_link,end_time,start_time,attendees,duration_minutes` +
      `&transcript_status=eq.pending&meet_link=not.is.null&end_time=lt.${nowISO}&end_time=gt.${windowStart}` +
      `&order=end_time.desc&limit=10`
    );

    // Skip any that already have a summary (belt & suspenders).
    const withSummary = new Set();
    if (candidates.length) {
      const ids = candidates.map(m => `"${m.id}"`).join(',');
      const existing = await supaFetch(`crm_meeting_summaries?select=meeting_id&meeting_id=in.(${ids})`).catch(() => []);
      (existing || []).forEach(s => withSummary.add(s.meeting_id));
    }

    for (const m of candidates) {
      if (withSummary.has(m.id)) {
        await supaFetch(`crm_meetings?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ transcript_status: 'ready' }) }).catch(() => {});
        continue;
      }
      results.checked++;
      const tooOld = m.end_time && new Date(m.end_time).getTime() < giveUpBefore;
      try {
        const r = await fetchTranscriptForMeeting({ meetLink: m.meet_link, endTime: m.end_time });
        if (r.status === 'ready') {
          const stored = await summarizeAndStore(m, r.text, { source: 'google_meet', transcriptDocId: r.transcriptDocId });
          await supaFetch(`crm_meetings?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ transcript_status: 'ready' }) });
          if (stored) results.summarized++; else results.none++;
        } else if (r.status === 'pending' && !tooOld) {
          results.pending++; // leave pending, retry next run
        } else {
          // 'none', or still pending past the 24h give-up window.
          await supaFetch(`crm_meetings?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ transcript_status: tooOld ? 'none' : 'pending' }) });
          tooOld ? results.none++ : results.pending++;
        }
      } catch (e) {
        results.failed++;
        console.error(`Transcript fetch failed for meeting ${m.id}:`, e.message);
        // A 403 usually means the Meet API isn't enabled or the scope hasn't been
        // granted yet — leave pending so it works once reconnected, unless it's
        // aged out.
        if (tooOld) await supaFetch(`crm_meetings?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify({ transcript_status: 'failed' }) }).catch(() => {});
      }
    }

    return res.json({ ok: true, ...results, timestamp: nowISO });
  } catch (err) {
    console.error('meeting-transcripts-cron error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
