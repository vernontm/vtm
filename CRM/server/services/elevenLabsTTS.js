// ElevenLabs TTS with character-level timestamps.
// https://elevenlabs.io/docs/api-reference/text-to-speech-with-timestamps

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const EL_BASE = 'https://api.elevenlabs.io/v1';
const EL_MODEL = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5';

// Generates speech for `text` with the given voice. Writes the MP3 to a temp
// file, returns { mp3Path, durationSecs, words: [{ text, start, end }] }.
async function synthesizeWithTimestamps({ text, voiceId, outDir }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');
  if (!voiceId) throw new Error('voiceId required');

  const res = await fetch(`${EL_BASE}/text-to-speech/${voiceId}/with-timestamps`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: EL_MODEL,
      output_format: 'mp3_44100_128',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs ${res.status}: ${body}`);
  }

  const data = await res.json();
  const audioB64 = data.audio_base64 || data.audio;
  if (!audioB64) throw new Error('ElevenLabs response missing audio_base64');

  fs.mkdirSync(outDir, { recursive: true });
  const mp3Path = path.join(outDir, `tts-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`);
  fs.writeFileSync(mp3Path, Buffer.from(audioB64, 'base64'));

  // Build word timing array from character timestamps
  const align = data.normalized_alignment || data.alignment;
  const words = groupCharsIntoWords(align, text);
  const durationSecs = words.length ? words[words.length - 1].end : estimateDuration(text);

  return { mp3Path, durationSecs, words };
}

// Walk the character stream and accumulate words (split on whitespace / punctuation).
function groupCharsIntoWords(align, fallbackText) {
  if (!align?.characters?.length) {
    // No alignment returned — fall back to a rough even split
    const tokens = (fallbackText || '').split(/\s+/).filter(Boolean);
    const each = tokens.length ? (tokens.length * 0.35) : 0;
    return tokens.map((t, i) => ({ text: t, start: i * each, end: (i + 1) * each }));
  }
  const chars = align.characters;
  const starts = align.character_start_times_seconds;
  const ends   = align.character_end_times_seconds;

  const words = [];
  let cur = '';
  let curStart = null;
  let curEnd = null;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const isBoundary = /\s/.test(c);
    if (isBoundary) {
      if (cur) {
        words.push({ text: cur, start: curStart, end: curEnd });
        cur = ''; curStart = null; curEnd = null;
      }
    } else {
      if (curStart == null) curStart = starts[i];
      curEnd = ends[i];
      cur += c;
    }
  }
  if (cur) words.push({ text: cur, start: curStart, end: curEnd });
  return words;
}

function estimateDuration(text) {
  const w = (text || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1.5, w * 0.35);
}

module.exports = { synthesizeWithTimestamps };
