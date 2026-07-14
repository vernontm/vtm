// Summarize a meeting transcript with Claude and store it on the meeting +,
// when we can match a client by attendee email, on that client's file
// (crm_client_activity) so the summary shows up under the client.
const { supaFetch } = require('./supabase.js');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function attendeeEmails(meeting) {
  let list = meeting.attendees;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { list = []; } }
  if (!Array.isArray(list)) list = [];
  return list.map(a => (a && a.email ? String(a.email).toLowerCase() : null)).filter(Boolean);
}

async function summarizeTranscript(transcript, title) {
  if (!ANTHROPIC_API_KEY || !transcript?.trim()) return null;
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 25) return { substantive: false, summary: null, key_points: [], action_items: [] };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are a CRM assistant for an agency (Vernon Tech & Media). Summarize this client meeting transcript. Return ONLY raw JSON — no markdown.

Meeting title: ${title || 'Client meeting'}

Transcript:
${transcript}

If the transcript has no substantive conversation (disconnected, test call, dead air, no real dialogue), set "substantive" to false and "summary" to null — do not invent content.

Return exactly:
{
  "substantive": true | false,
  "summary": "3-5 sentence plain-English summary of what was discussed and decided (or null)",
  "key_points": ["array of the most important points raised"],
  "action_items": ["array of concrete follow-up actions and who owns them if stated"]
}`,
      }],
    }),
  });
  if (!res.ok) throw new Error(`Claude summary failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  try { return JSON.parse(text.replace(/```json|```/g, '').trim()); }
  catch { return { substantive: true, summary: text, key_points: [], action_items: [] }; }
}

// meeting: a crm_meetings row (needs id, title/summary, attendees, transcript_doc_id?)
// Returns { summary, matchedClientId } or null when not substantive.
async function summarizeAndStore(meeting, transcriptText, { source = 'google_meet', transcriptDocId = null } = {}) {
  const title = meeting.title || meeting.summary || 'Client meeting';
  const analysis = await summarizeTranscript(transcriptText, title);
  if (!analysis || analysis.substantive === false || !analysis.summary) return null;

  const row = {
    meeting_id: meeting.id,
    summary: analysis.summary,
    key_points: analysis.key_points || [],
    action_items: analysis.action_items || [],
    transcript: transcriptText,
    transcript_doc_id: transcriptDocId,
    source,
  };

  // Upsert one summary per meeting (replace any prior one for this meeting).
  await supaFetch(`crm_meeting_summaries?meeting_id=eq.${meeting.id}`, { method: 'DELETE' }).catch(() => {});
  await supaFetch('crm_meeting_summaries', { method: 'POST', body: JSON.stringify(row) });

  // Try to attach it to a client's file by matching an attendee email.
  let matchedClientId = null;
  const emails = attendeeEmails(meeting);
  if (emails.length) {
    const inList = emails.map(e => `"${e}"`).join(',');
    const clients = await supaFetch(`crm_clients?select=id,contact_email&contact_email=in.(${inList})`).catch(() => []);
    if (clients && clients.length) {
      matchedClientId = clients[0].id;
      const bodyLines = [
        analysis.summary,
        (analysis.key_points || []).length ? `\nKey points:\n- ${analysis.key_points.join('\n- ')}` : '',
        (analysis.action_items || []).length ? `\nAction items:\n- ${analysis.action_items.join('\n- ')}` : '',
      ].filter(Boolean).join('\n');
      await supaFetch('crm_client_activity', {
        method: 'POST',
        body: JSON.stringify({
          client_id: matchedClientId,
          type: 'note',
          tag: 'Meeting',
          body: `📝 Meeting summary — ${title}\n\n${bodyLines}`,
        }),
      }).catch(() => {});
    }
  }

  return { summary: analysis, matchedClientId };
}

module.exports = { summarizeTranscript, summarizeAndStore, attendeeEmails };
