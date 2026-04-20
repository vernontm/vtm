const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY;

// ── Claude call analysis ───────────────────────────────────────────────────
async function analyzeCall(transcript, leadName) {
  if (!ANTHROPIC_API_KEY || !transcript?.trim()) return null;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a sales CRM assistant. Analyze this call transcript and return a JSON object only — no markdown, no explanation, just raw JSON.

Lead name: ${leadName || 'Unknown'}

Transcript:
${transcript}

Return this exact JSON structure:
{
  "summary": "2-3 sentence plain-English summary of the call",
  "interest_level": "hot" | "warm" | "cold" | "not_interested",
  "interest_reason": "one sentence explaining why",
  "pain_points": ["array", "of", "key", "pain", "points", "mentioned"],
  "next_steps": ["array", "of", "recommended", "follow-up", "actions"],
  "sentiment": "positive" | "neutral" | "negative",
  "topics": ["array", "of", "main", "topics", "discussed"],
  "call_outcome": "one sentence on how the call ended"
}`,
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude analysis failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  try {
    // Strip any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    // Return raw text as summary if JSON parse fails
    return { summary: text, interest_level: 'warm', sentiment: 'neutral' };
  }
}

// ── Build multipart body (no external deps) ────────────────────────────────
function buildMultipart(fields, fileField) {
  const boundary = '----ELBoundary' + Date.now() + Math.random().toString(36).slice(2);
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fileField.name}"; filename="${fileField.filename}"\r\nContent-Type: ${fileField.mimeType}\r\n\r\n`
    ),
    fileField.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  );

  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ── Fetch with AbortController timeout ────────────────────────────────────
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ── ElevenLabs audio isolation (noise/echo removal) ────────────────────────
async function isolateAudio(fileBuffer) {
  const { body, contentType } = buildMultipart({}, {
    name: 'audio',
    filename: 'recording.webm',
    mimeType: 'audio/webm',
    buffer: fileBuffer,
  });

  const res = await fetchWithTimeout('https://api.elevenlabs.io/v1/audio-isolation', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': contentType,
    },
    body,
  }, 90_000); // 90s timeout

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Audio isolation failed: ${res.status} ${err}`);
  }

  // Returns raw audio bytes (mp3)
  return Buffer.from(await res.arrayBuffer());
}

// ── ElevenLabs speech-to-text with speaker diarization ────────────────────
async function transcribeAudio(fileBuffer, mimeType = 'audio/mpeg', filename = 'recording.mp3') {
  const { body, contentType } = buildMultipart(
    { model_id: 'scribe_v1', diarize: 'true' },
    { name: 'file', filename, mimeType, buffer: fileBuffer }
  );

  const res = await fetchWithTimeout('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': contentType,
    },
    body,
  }, 120_000); // 120s timeout

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transcription failed: ${res.status} ${err}`);
  }

  const data = await res.json();

  // If diarization returned word-level speaker data, format into labeled turns
  if (data.words && data.words.length > 0 && data.words.some(w => w.speaker_id != null)) {
    return formatDiarizedTranscript(data.words);
  }

  // Fallback: segments with speaker labels
  if (data.utterances && data.utterances.length > 0) {
    return data.utterances
      .map(u => `Speaker ${(u.speaker || 0) + 1}: ${u.text.trim()}`)
      .join('\n');
  }

  return data.text || '';
}

// ── Format word-level diarization into readable turns ─────────────────────
function formatDiarizedTranscript(words) {
  const lines = [];
  let currentSpeaker = null;
  let currentText = [];

  for (const w of words) {
    const speaker = w.speaker_id ?? w.speaker ?? null;
    const text = w.text || w.word || '';
    if (!text.trim()) continue;

    if (speaker !== currentSpeaker) {
      if (currentText.length > 0) {
        const label = currentSpeaker != null ? `Speaker ${currentSpeaker + 1}` : 'Speaker';
        lines.push(`${label}: ${currentText.join(' ').trim()}`);
      }
      currentSpeaker = speaker;
      currentText = [text];
    } else {
      currentText.push(text);
    }
  }

  // Flush last turn
  if (currentText.length > 0) {
    const label = currentSpeaker != null ? `Speaker ${currentSpeaker + 1}` : 'Speaker';
    lines.push(`${label}: ${currentText.join(' ').trim()}`);
  }

  return lines.join('\n');
}

// ── Upload buffer back to Supabase storage ─────────────────────────────────
async function uploadToStorage(buffer, storagePath, mimeType) {
  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/lead-recordings/${storagePath}`,
    {
      method: 'PUT',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: buffer,
    }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`Storage upload failed: ${uploadRes.status} ${err}`);
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, lead_id } = req.query;

  try {
    // GET — list recordings for a lead, or counts for all leads
    if (req.method === 'GET') {
      // ?action=counts — return { lead_id: count } map for all leads
      if (req.query.action === 'counts') {
        const rows = await supaFetch(
          `crm_lead_recordings?select=lead_id&order=lead_id.asc`
        );
        const counts = {};
        for (const r of (rows || [])) {
          counts[r.lead_id] = (counts[r.lead_id] || 0) + 1;
        }
        return res.json(counts);
      }

      // ?action=processing — return recordings currently being processed
      if (req.query.action === 'processing') {
        const rows = await supaFetch(
          `crm_lead_recordings?transcript_status=eq.processing&select=id,lead_id,created_at&order=created_at.desc`
        );
        return res.json(rows || []);
      }

      // ?action=stats — return call counts per time window (distinct leads)
      if (req.query.action === 'stats') {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const rows = await supaFetch(
          `crm_lead_recordings?select=lead_id,created_at&created_at=gte.${since30d}&order=created_at.desc`
        );
        const now = Date.now();
        const seen24h = new Set(), seen7d = new Set(), seen30d = new Set();
        for (const r of (rows || [])) {
          const age = now - new Date(r.created_at).getTime();
          seen30d.add(r.lead_id);
          if (age <= 7  * 24 * 60 * 60 * 1000) seen7d.add(r.lead_id);
          if (age <= 1  * 24 * 60 * 60 * 1000) seen24h.add(r.lead_id);
        }
        return res.json({ calls_24h: seen24h.size, calls_7d: seen7d.size, calls_30d: seen30d.size });
      }

      if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
      const rows = await supaFetch(
        `crm_lead_recordings?lead_id=eq.${lead_id}&order=created_at.desc`
      );
      return res.json(rows || []);
    }

    // POST — save + clean + transcribe a recording
    if (req.method === 'POST') {

      // ── Manual re-analyze action ─────────────────────────────────────────────
      if (req.query.action === 'summarize') {
        const recId = req.query.id;
        const { lead_name } = req.body || {};
        if (!recId) return res.status(400).json({ error: 'id required' });

        const rows = await supaFetch(`crm_lead_recordings?id=eq.${recId}&select=id,lead_id,transcript,duration_seconds`);
        const rec = rows?.[0];
        if (!rec) return res.status(404).json({ error: 'Recording not found' });
        if (!rec.transcript?.trim()) return res.status(400).json({ error: 'No transcript to analyze' });

        const summary = await analyzeCall(rec.transcript, lead_name);
        if (!summary) return res.status(500).json({ error: 'AI analysis returned nothing' });

        // Save summary back to recording
        await supaFetch(`crm_lead_recordings?id=eq.${recId}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ summary }),
        });

        // Append to lead notes
        if (summary.summary && rec.lead_id) {
          try {
            const leadRows = await supaFetch(`crm_leads?id=eq.${rec.lead_id}&select=notes`);
            const existingNotes = leadRows?.[0]?.notes || '';
            const callDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const dur = rec.duration_seconds;
            const mins = Math.floor((dur || 0) / 60);
            const secs = (dur || 0) % 60;
            const durStr = dur ? ` (${mins}:${String(secs).padStart(2,'0')})` : '';
            const interestStr = summary.interest_level ? ` — ${summary.interest_level.replace('_',' ').toUpperCase()}` : '';
            const noteEntry = [
              `📞 Call ${callDate}${durStr}${interestStr} [re-analyzed]`,
              summary.summary,
              summary.next_steps?.length ? `Next steps: ${summary.next_steps.join('; ')}` : '',
              summary.pain_points?.length ? `Pain points: ${summary.pain_points.join('; ')}` : '',
            ].filter(Boolean).join('\n');
            const updatedNotes = existingNotes ? `${existingNotes}\n\n---\n${noteEntry}` : noteEntry;
            await supaFetch(`crm_leads?id=eq.${rec.lead_id}`, {
              method: 'PATCH',
              headers: { 'Prefer': 'return=minimal' },
              body: JSON.stringify({ notes: updatedNotes }),
            });
          } catch (notesErr) {
            console.warn('Failed to update lead notes:', notesErr.message);
          }
        }

        return res.json({ ok: true, summary });
      }

      const { lead_id: body_lead_id, storage_path, duration_seconds, lead_name } = req.body || {};
      const lid = body_lead_id;
      if (!lid || !storage_path) {
        return res.status(400).json({ error: 'lead_id and storage_path required' });
      }

      // Insert pending record
      const insertRes = await supaFetch('crm_lead_recordings', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify([{
          lead_id: lid,
          storage_path,
          duration_seconds: duration_seconds || null,
          transcript_status: 'processing',
        }]),
      });
      const recording = (insertRes || [])[0];
      if (!recording?.id) return res.status(500).json({ error: 'Failed to save recording' });

      // Auto-set lead status to "Called" (skip if already Won or Not Interested)
      try {
        const leadRows = await supaFetch(`crm_leads?id=eq.${lid}&select=status`);
        const currentStatus = leadRows?.[0]?.status;
        if (currentStatus !== 'Won' && currentStatus !== 'Not Interested') {
          await supaFetch(`crm_leads?id=eq.${lid}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({ status: 'Called' }),
          });
        }
      } catch (statusErr) {
        console.warn('Failed to update lead status to Called:', statusErr.message);
      }

      // Respond immediately — process async
      res.json({ ok: true, id: recording.id, transcript_status: 'processing' });

      // ── Async: clean → transcribe → save ──────────────────────────────────
      try {
        if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');

        // 1. Download raw recording from storage
        const downloadUrl = `${SUPABASE_URL}/storage/v1/object/lead-recordings/${storage_path}`;
        const fileRes = await fetch(downloadUrl, {
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
          },
        });
        if (!fileRes.ok) throw new Error(`Storage download failed: ${fileRes.status}`);
        const rawBuffer = Buffer.from(await fileRes.arrayBuffer());

        // 2. Audio isolation — remove echo & background noise
        let cleanBuffer = rawBuffer;
        let cleanMime = 'audio/webm';
        let cleanExt = 'webm';
        let audioIsolated = false;

        try {
          cleanBuffer = await isolateAudio(rawBuffer);
          cleanMime = 'audio/mpeg';
          cleanExt = 'mp3';
          audioIsolated = true;

          // Replace original with cleaned version in storage
          const cleanPath = storage_path.replace(/\.webm$/, '_clean.mp3');
          await uploadToStorage(cleanBuffer, cleanPath, cleanMime);

          // Update record with clean path
          await supaFetch(`crm_lead_recordings?id=eq.${recording.id}`, {
            method: 'PATCH',
            headers: { 'Prefer': 'return=minimal' },
            body: JSON.stringify({ storage_path: cleanPath }),
          });

        } catch (isolateErr) {
          // Non-fatal — fall back to raw audio for transcription
          console.warn('Audio isolation skipped:', isolateErr.message);
        }

        // 3. Transcribe the (cleaned or raw) audio
        const transcript = await transcribeAudio(
          cleanBuffer,
          cleanMime,
          `recording.${cleanExt}`
        );

        // 4. Analyze with Claude
        let summary = null;
        try {
          summary = await analyzeCall(transcript, lead_name);
        } catch (aiErr) {
          console.warn('Claude analysis skipped:', aiErr.message);
        }

        // 5. Save transcript + summary + mark done
        await supaFetch(`crm_lead_recordings?id=eq.${recording.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            transcript,
            transcript_status: 'done',
            summary,
            ...(audioIsolated ? { audio_cleaned: true } : {}),
          }),
        });

        // 5.5 Append summary to lead notes field
        if (summary?.summary) {
          try {
            // Fetch current notes
            const leadRows = await supaFetch(`crm_leads?id=eq.${lid}&select=notes`);
            const existingNotes = leadRows?.[0]?.notes || '';

            const callDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const mins = Math.floor((duration_seconds || 0) / 60);
            const secs = (duration_seconds || 0) % 60;
            const durStr = duration_seconds ? ` (${mins}:${String(secs).padStart(2,'0')})` : '';
            const interestStr = summary.interest_level ? ` — ${summary.interest_level.replace('_',' ').toUpperCase()}` : '';

            const noteEntry = [
              `📞 Call ${callDate}${durStr}${interestStr}`,
              summary.summary,
              summary.next_steps?.length ? `Next steps: ${summary.next_steps.join('; ')}` : '',
              summary.pain_points?.length ? `Pain points: ${summary.pain_points.join('; ')}` : '',
            ].filter(Boolean).join('\n');

            const updatedNotes = existingNotes
              ? `${existingNotes}\n\n---\n${noteEntry}`
              : noteEntry;

            await supaFetch(`crm_leads?id=eq.${lid}`, {
              method: 'PATCH',
              headers: { 'Prefer': 'return=minimal' },
              body: JSON.stringify({ notes: updatedNotes }),
            });
          } catch (notesErr) {
            console.warn('Failed to update lead notes:', notesErr.message);
          }
        }

        // 6. Log to communication log
        const mins = Math.floor((duration_seconds || 0) / 60);
        const secs = (duration_seconds || 0) % 60;
        const durStr = duration_seconds ? ` (${mins}:${String(secs).padStart(2, '0')})` : '';
        const interestLabel = summary?.interest_level
          ? ` · ${summary.interest_level.replace('_', ' ').toUpperCase()}`
          : '';
        await supaFetch('crm_communication_log', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify([{
            lead_id: lid,
            channel: 'call',
            subject: `Call recording${durStr}${interestLabel}`,
            body: summary?.summary
              ? `${summary.summary}\n\n${transcript}`
              : transcript || '(Transcription unavailable)',
            direction: 'outbound',
          }]),
        });

      } catch (err) {
        console.error('Recording processing failed:', err.message);
        await supaFetch(`crm_lead_recordings?id=eq.${recording.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ transcript_status: 'error' }),
        });
      }

      return; // already responded
    }

    // DELETE — removes the DB row AND the audio file from storage
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });

      // Fetch storage_path so we can delete the file too
      const rows = await supaFetch(`crm_lead_recordings?id=eq.${id}&select=storage_path`);
      const storagePath = rows?.[0]?.storage_path;

      // Delete the row first
      await supaFetch(`crm_lead_recordings?id=eq.${id}`, { method: 'DELETE' });

      // Best-effort storage cleanup — don't fail the request if this errors
      if (storagePath) {
        try {
          const delRes = await fetch(
            `${SUPABASE_URL}/storage/v1/object/lead-recordings/${storagePath}`,
            {
              method: 'DELETE',
              headers: {
                'apikey': SERVICE_KEY,
                'Authorization': `Bearer ${SERVICE_KEY}`,
              },
            }
          );
          if (!delRes.ok) {
            console.warn('Storage delete non-OK:', delRes.status, await delRes.text());
          }
        } catch (e) {
          console.warn('Storage delete failed:', e.message);
        }
      }

      return res.json({ ok: true, storage_deleted: !!storagePath });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('recordings error:', err);
    if (!res.headersSent) return res.status(500).json({ error: err.message });
  }
};
