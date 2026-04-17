const { setCors, requireAuth, supaFetch, SUPABASE_URL, SERVICE_KEY } = require('../_lib/supabase.js');

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, lead_id } = req.query;

  try {
    // GET /api/crm/recordings?lead_id=xxx — list recordings for a lead
    if (req.method === 'GET') {
      if (!lead_id) return res.status(400).json({ error: 'lead_id required' });
      const rows = await supaFetch(
        `crm_lead_recordings?lead_id=eq.${lead_id}&order=created_at.desc`
      );
      return res.json(rows || []);
    }

    // POST /api/crm/recordings — save + transcribe a recording
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

      // Transcribe async — respond fast then transcribe
      res.json({ ok: true, id: recording.id, transcript_status: 'processing' });

      // ── Transcribe with ElevenLabs ──────────────────────────────────────────
      try {
        if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');

        const downloadUrl = `${SUPABASE_URL}/storage/v1/object/lead-recordings/${storage_path}`;
        const fileRes = await fetch(downloadUrl, {
          headers: {
            'apikey': SERVICE_KEY,
            'Authorization': `Bearer ${SERVICE_KEY}`,
          },
        });
        if (!fileRes.ok) throw new Error(`Storage download failed: ${fileRes.status}`);
        const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

        const boundary = '----RecBoundary' + Date.now();
        const pre = Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="model_id"\r\n\r\nscribe_v1\r\n` +
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`
        );
        const post = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([pre, fileBuffer, post]);

        const sttRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
          },
          body,
        });

        const transcript = sttRes.ok ? ((await sttRes.json()).text || '') : '';
        const status = sttRes.ok ? 'done' : 'error';

        // Update recording with transcript
        await supaFetch(`crm_lead_recordings?id=eq.${recording.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ transcript, transcript_status: status }),
        });

        // Add to communication log
        const mins = Math.floor((duration_seconds || 0) / 60);
        const secs = (duration_seconds || 0) % 60;
        const durStr = duration_seconds ? ` (${mins}:${String(secs).padStart(2, '0')})` : '';
        await supaFetch('crm_communication_log', {
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify([{
            lead_id: lid,
            channel: 'call',
            subject: `Call recording${durStr}`,
            body: transcript || '(Transcription unavailable)',
            direction: 'outbound',
          }]),
        });

      } catch (transcribeErr) {
        console.error('Transcription failed:', transcribeErr.message);
        await supaFetch(`crm_lead_recordings?id=eq.${recording.id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          body: JSON.stringify({ transcript_status: 'error' }),
        });
      }

      return; // already responded
    }

    // DELETE /api/crm/recordings?id=xxx
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
