const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

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

// ── ElevenLabs audio isolation (noise/echo removal) ────────────────────────
async function isolateAudio(fileBuffer) {
  const { body, contentType } = buildMultipart({}, {
    name: 'audio',
    filename: 'recording.webm',
    mimeType: 'audio/webm',
    buffer: fileBuffer,
  });

  const res = await fetch('https://api.elevenlabs.io/v1/audio-isolation', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': contentType,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Audio isolation failed: ${res.status} ${err}`);
  }

  // Returns raw audio bytes (mp3)
  return Buffer.from(await res.arrayBuffer());
}

// ── ElevenLabs speech-to-text ──────────────────────────────────────────────
async function transcribeAudio(fileBuffer, mimeType = 'audio/mpeg', filename = 'recording.mp3') {
  const { body, contentType } = buildMultipart(
    { model_id: 'scribe_v1' },
    { name: 'file', filename, mimeType, buffer: fileBuffer }
  );

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': contentType,
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transcription failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.text || '';
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
    // GET — list recordings for a lead
    if (req.method === 'GET') {
      if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
      const rows = await supaFetch(
        `crm_lead_recordings?lead_id=eq.${lead_id}&order=created_at.desc`
      );
      return res.json(rows || []);
    }

    // POST — save + clean + transcribe a recording
    if (req.method === 'POST') {
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

        // 4. Save transcript + mark done
        await supaFetch(`crm_lead_recordings?id=eq.${recording.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            transcript,
            transcript_status: 'done',
            ...(audioIsolated ? { audio_cleaned: true } : {}),
          }),
        });

        // 5. Log to communication log
        const mins = Math.floor((duration_seconds || 0) / 60);
        const secs = (duration_seconds || 0) % 60;
        const durStr = duration_seconds ? ` (${mins}:${String(secs).padStart(2, '0')})` : '';
        await supaFetch('crm_communication_log', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify([{
            lead_id: lid,
            channel: 'call',
            subject: `Call recording${durStr}${audioIsolated ? ' 🎙 cleaned' : ''}`,
            body: transcript || '(Transcription unavailable)',
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

    // DELETE
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_lead_recordings?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('recordings error:', err);
    if (!res.headersSent) return res.status(500).json({ error: err.message });
  }
};
