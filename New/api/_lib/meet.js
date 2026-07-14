// Google Meet REST API (v2) helpers — read conference records + transcripts for
// a finished meeting so we can auto-summarize client calls. Reuses the same
// Google OAuth token as Gmail/Calendar (needs the meetings.space.readonly scope
// added in gmail.js getAuthUrl + the Google Meet API enabled in the Cloud
// project). Transcripts only exist if recording/transcription was on for the
// call and the connected account is on a qualifying paid Workspace tier.
const { getGmailAuth } = require('./gmail.js');

const MEET_API = 'https://meet.googleapis.com/v2';

async function meetFetch(path, accessToken) {
  const res = await fetch(`${MEET_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Meet API ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// meet_link -> meeting code, e.g. https://meet.google.com/abc-defg-hij -> abc-defg-hij
function meetingCodeFromLink(link) {
  if (!link) return null;
  const m = String(link).match(/meet\.google\.com\/([a-z0-9-]+)/i);
  return m ? m[1] : null;
}

// Resolve a space (spaces/{id}) from a meeting code. The Meet API accepts the
// meeting code directly as the {space} path segment.
async function getSpace(meetingCode, accessToken) {
  return meetFetch(`/spaces/${encodeURIComponent(meetingCode)}`, accessToken);
}

// All finished conferences for a space, most recent first.
async function listConferenceRecords(spaceName, accessToken) {
  const filter = encodeURIComponent(`space.name="${spaceName}"`);
  const data = await meetFetch(`/conferenceRecords?filter=${filter}`, accessToken);
  return data.conferenceRecords || [];
}

async function listTranscripts(conferenceRecordName, accessToken) {
  const data = await meetFetch(`/${conferenceRecordName}/transcripts`, accessToken);
  return data.transcripts || [];
}

// Concatenate all transcript entries into plain text. Entries don't carry a
// display name (only a participant resource name), so we keep it as flowing
// text — plenty for an LLM summary.
async function getTranscriptEntriesText(transcriptName, accessToken) {
  let out = [];
  let pageToken = null;
  let guard = 0;
  do {
    const qs = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}&pageSize=1000` : '?pageSize=1000';
    const data = await meetFetch(`/${transcriptName}/entries${qs}`, accessToken);
    (data.transcriptEntries || []).forEach(e => { if (e.text) out.push(e.text); });
    pageToken = data.nextPageToken || null;
  } while (pageToken && ++guard < 50);
  return out.join('\n');
}

// Best-effort participant emails for a conference (used to match a client).
async function listParticipantEmails(conferenceRecordName, accessToken) {
  try {
    const data = await meetFetch(`/${conferenceRecordName}/participants`, accessToken);
    return (data.participants || [])
      .map(p => p.signedinUser?.displayName || null) // emails aren't exposed here; names only
      .filter(Boolean);
  } catch { return []; }
}

// Top-level: given a meeting's meet_link and its scheduled end time, find the
// matching finished conference and return its transcript text (or a status).
// Returns { status: 'ready'|'none', text?, transcriptDocId?, conferenceRecord? }.
async function fetchTranscriptForMeeting({ meetLink, endTime }) {
  const code = meetingCodeFromLink(meetLink);
  if (!code) return { status: 'none', reason: 'no-meet-code' };

  const { accessToken } = await getGmailAuth();

  let space;
  try { space = await getSpace(code, accessToken); }
  catch (e) { if (e.status === 404) return { status: 'none', reason: 'space-not-found' }; throw e; }

  const records = await listConferenceRecords(space.name, accessToken);
  if (!records.length) return { status: 'none', reason: 'no-conference-records' };

  // Pick the conference record whose end time is closest to the scheduled end
  // (a recurring space can have many). Fall back to the most recent.
  let record = records[0];
  if (endTime) {
    const target = new Date(endTime).getTime();
    record = records.reduce((best, r) => {
      const rt = r.endTime ? new Date(r.endTime).getTime() : 0;
      const bt = best.endTime ? new Date(best.endTime).getTime() : 0;
      return Math.abs(rt - target) < Math.abs(bt - target) ? r : best;
    }, records[0]);
  }

  const transcripts = await listTranscripts(record.name, accessToken);
  const ended = transcripts.find(t => t.state === 'ENDED') || transcripts[0];
  if (!ended) return { status: 'none', reason: 'no-transcript' };
  if (ended.state && ended.state !== 'ENDED') return { status: 'pending', reason: 'transcript-processing' };

  const text = await getTranscriptEntriesText(ended.name, accessToken);
  if (!text.trim()) return { status: 'none', reason: 'empty-transcript' };

  return {
    status: 'ready',
    text,
    transcriptDocId: ended.docsDestination?.document || ended.docsDestination?.exportUri || null,
    conferenceRecord: record.name,
  };
}

module.exports = {
  meetFetch, meetingCodeFromLink, getSpace, listConferenceRecords,
  listTranscripts, getTranscriptEntriesText, listParticipantEmails,
  fetchTranscriptForMeeting,
};
