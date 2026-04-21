// Avatar render worker — polls Supabase for `pending` render jobs and drives
// them through: ElevenLabs TTS → HeyGen Photo Avatar v3 → ffmpeg stitch →
// Supabase Storage upload → mark `done`.
//
// Started from server/index.js when the relevant env vars are present.
// Runs as a simple setInterval loop — one job at a time on the user's Mac.

const fs    = require('fs');
const path  = require('path');
const os    = require('os');

const supa = require('../services/supabaseClient');
const { synthesizeWithTimestamps } = require('../services/elevenLabsTTS');
const { submitVideo, waitForVideo, downloadTo } = require('../services/heygenVideo');
const { buildAssCaptions } = require('../services/captionBuilder');
const { renderFinal } = require('../services/ffmpegRender');

const POLL_INTERVAL_MS = 10_000;
const TMP_ROOT = path.join(os.tmpdir(), 'avatar-renders');

let running = false;

async function tick() {
  if (running) return;
  try {
    const render = await supa.claimNextPendingRender();
    if (!render) return;
    running = true;
    console.log(`[render-worker] picked render ${render.id}`);
    try {
      await processRender(render);
      console.log(`[render-worker] render ${render.id} → done`);
    } catch (err) {
      console.error(`[render-worker] render ${render.id} failed:`, err.message);
      await supa.updateRender(render.id, {
        status: 'failed',
        error: String(err.message || err).slice(0, 2000),
      });
    }
  } catch (err) {
    console.error('[render-worker] tick error:', err.message);
  } finally {
    running = false;
  }
}

async function processRender(render) {
  const avatar = await supa.getAvatar(render.avatar_id);
  if (!avatar) throw new Error(`avatar ${render.avatar_id} not found`);

  const workDir = path.join(TMP_ROOT, render.id);
  fs.mkdirSync(workDir, { recursive: true });

  const sentences = Array.isArray(render.sentences) ? render.sentences : [];
  if (!sentences.length) throw new Error('render has no sentences');
  for (const s of sentences) {
    if (!s.text || !s.look_id) throw new Error('every sentence needs text + look_id');
  }

  // ─── Step 1: ElevenLabs TTS per sentence, upload each MP3 ─────────────────
  await supa.updateRender(render.id, { status: 'generating_audio' });

  const voiceId = avatar.elevenlabs_voice_id;
  if (!voiceId) throw new Error('avatar has no elevenlabs_voice_id');

  const ttsDir = path.join(workDir, 'tts');
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    console.log(`[render-worker]   TTS ${i + 1}/${sentences.length}`);
    const { mp3Path, durationSecs, words } = await synthesizeWithTimestamps({
      text: s.text, voiceId, outDir: ttsDir,
    });
    const publicUrl = await supa.uploadFile(mp3Path, { keyPrefix: `avatars/audio/${render.id}` });
    s.audio_url = publicUrl;
    s.audio_duration = durationSecs;
    s.words = words;
    s.status = 'audio_ready';
    await supa.updateRender(render.id, { sentences });
  }

  // ─── Step 2: HeyGen lip-sync for each (look, audio_url) pair ──────────────
  await supa.updateRender(render.id, { status: 'generating_clips' });

  // Submit all jobs up front, then poll
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const look = await supa.getLook(s.look_id);
    if (!look) throw new Error(`look ${s.look_id} not found`);
    if (!look.heygen_look_id) throw new Error(`look ${s.look_id} has no heygen_look_id`);
    const { videoId } = await submitVideo({
      photoAvatarId: look.heygen_look_id,
      audioUrl: s.audio_url,
      title: `${avatar.name} — ${render.title || render.id.slice(0, 6)}`,
    });
    s.heygen_video_id = videoId;
    s.status = 'heygen_submitted';
    console.log(`[render-worker]   HeyGen submit ${i + 1}/${sentences.length} → ${videoId}`);
  }
  await supa.updateRender(render.id, { sentences });

  // Poll each job to completion
  const clipsDir = path.join(workDir, 'clips');
  fs.mkdirSync(clipsDir, { recursive: true });
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    console.log(`[render-worker]   waiting on clip ${i + 1}/${sentences.length} (${s.heygen_video_id})`);
    const result = await waitForVideo(s.heygen_video_id);
    if (result.status !== 'completed') {
      throw new Error(`HeyGen clip ${i + 1} failed: ${result.error || 'unknown'}`);
    }
    const clipPath = path.join(clipsDir, `clip-${String(i).padStart(3, '0')}.mp4`);
    await downloadTo(result.video_url, clipPath);
    s.clip_url = result.video_url;
    s.clip_local = clipPath;
    s.status = 'clip_ready';
    await supa.updateRender(render.id, { sentences });
    console.log(`[render-worker]   clip ${i + 1}/${sentences.length} ready`);
  }

  // ─── Step 3: ffmpeg stitch ────────────────────────────────────────────────
  console.log(`[render-worker]   stitching`);
  await supa.updateRender(render.id, { status: 'stitching' });

  const captionStyle = render.caption_style || avatar.caption_style || {};
  const captionsPath = path.join(workDir, 'captions.ass');
  buildAssCaptions({ sentences, captionStyle, outPath: captionsPath });

  // If logo/music weren't explicitly set on the render, inherit from the avatar
  const logoUrl    = render.logo_url    ?? avatar.logo_url;
  const logoPos    = render.logo_position ?? avatar.logo_position ?? 'tr';
  const logoSize   = avatar.logo_size_pct ?? 12;
  const musicUrl   = render.music_url   ?? avatar.default_music_url;
  const musicVol   = render.music_volume ?? avatar.default_volume ?? 0.15;
  const fadeSecs   = render.music_fade_secs ?? avatar.default_fade_secs ?? 1.5;

  let logoPath = null;
  if (logoUrl) {
    logoPath = path.join(workDir, `logo${path.extname(new URL(logoUrl).pathname) || '.png'}`);
    await downloadTo(logoUrl, logoPath);
  }
  let musicPath = null;
  if (musicUrl) {
    musicPath = path.join(workDir, `music${path.extname(new URL(musicUrl).pathname) || '.mp3'}`);
    await downloadTo(musicUrl, musicPath);
  }

  const totalDuration = sentences.reduce((sum, s) => sum + (s.audio_duration || 0), 0);
  const outPath = path.join(workDir, 'final.mp4');
  await renderFinal({
    clipPaths: sentences.map(s => s.clip_local),
    logoPath,
    logoPosition: logoPos,
    logoSizePct: logoSize,
    musicPath,
    musicVolume: musicVol,
    musicFadeSecs: fadeSecs,
    captionsPath,
    totalDurationSecs: totalDuration,
    outPath,
  });

  // ─── Step 4: Upload final MP4 and mark done ───────────────────────────────
  const finalUrl = await supa.uploadFile(outPath, { keyPrefix: `avatars/renders/${render.id}` });
  await supa.updateRender(render.id, {
    status: 'done',
    final_video_url: finalUrl,
    duration_secs: totalDuration,
  });
}

function start() {
  if (!process.env.HEYGEN_API_KEY || !process.env.ELEVENLABS_API_KEY || !supa.SUPABASE_URL) {
    console.log('[render-worker] disabled — need HEYGEN_API_KEY, ELEVENLABS_API_KEY, SUPABASE_URL');
    return;
  }
  console.log('[render-worker] started, polling every 10s');
  setInterval(tick, POLL_INTERVAL_MS);
  // Run one immediately so a freshly-queued render doesn't wait 10s
  setTimeout(tick, 1000);
}

module.exports = { start, tick };
