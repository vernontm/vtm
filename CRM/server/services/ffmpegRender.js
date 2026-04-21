// ffmpeg pipeline for stitching HeyGen clips into a final 1080x1920 video.
//
// Inputs:
//   - Array of clip MP4 paths (each clip already has ElevenLabs audio baked in by HeyGen)
//   - Optional logo PNG path + position + size%
//   - Optional music MP3 path + volume + fade-out seconds
//   - ASS subtitle file path
//
// Output: single 1080x1920 MP4.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';
const W = 1080, H = 1920;

function posCoords(pos, padPx = 32) {
  switch (pos) {
    case 'tl': return { x: `${padPx}`,           y: `${padPx}` };
    case 'tr': return { x: `W-w-${padPx}`,       y: `${padPx}` };
    case 'bl': return { x: `${padPx}`,           y: `H-h-${padPx}` };
    case 'br': return { x: `W-w-${padPx}`,       y: `H-h-${padPx}` };
    default:   return { x: `W-w-${padPx}`,       y: `${padPx}` };
  }
}

// Build and run ffmpeg. Returns the output path when done.
async function renderFinal({
  clipPaths,
  logoPath = null,
  logoPosition = 'tr',
  logoSizePct = 12,          // percent of video width
  musicPath = null,
  musicVolume = 0.15,
  musicFadeSecs = 1.5,
  captionsPath,
  totalDurationSecs,         // used for music fade-out start
  outPath,
}) {
  if (!clipPaths?.length) throw new Error('no clips to render');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const args = ['-y'];

  // Input clips
  clipPaths.forEach(p => args.push('-i', p));

  // Optional logo + music inputs
  let logoIdx = null, musicIdx = null;
  if (logoPath) { logoIdx = clipPaths.length; args.push('-i', logoPath); }
  if (musicPath) { musicIdx = clipPaths.length + (logoPath ? 1 : 0); args.push('-i', musicPath); }

  // Build filter graph
  const f = [];

  // Normalize every clip to 1080x1920 (pad/crop), then concat with their audio.
  for (let i = 0; i < clipPaths.length; i++) {
    f.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30[v${i}]`,
    );
  }
  const concatInputs = clipPaths.map((_, i) => `[v${i}][${i}:a]`).join('');
  f.push(`${concatInputs}concat=n=${clipPaths.length}:v=1:a=1[cv][ca]`);

  let vOut = '[cv]';

  // Logo overlay
  if (logoPath) {
    const logoWidth = Math.round(W * (logoSizePct / 100));
    f.push(`[${logoIdx}:v]scale=${logoWidth}:-1[lg]`);
    const { x, y } = posCoords(logoPosition);
    f.push(`${vOut}[lg]overlay=${x}:${y}[withlogo]`);
    vOut = '[withlogo]';
  }

  // Burn captions (escape the path for ffmpeg)
  if (captionsPath) {
    const esc = escapeForSubtitlesFilter(captionsPath);
    f.push(`${vOut}subtitles='${esc}':fontsdir=/System/Library/Fonts[vfinal]`);
    vOut = '[vfinal]';
  }

  // Audio: mix voice with optional music
  let aOut = '[ca]';
  if (musicPath && musicIdx != null) {
    const fadeStart = Math.max(0, (totalDurationSecs || 0) - (musicFadeSecs || 0));
    f.push(
      `[${musicIdx}:a]volume=${musicVolume},afade=t=out:st=${fadeStart.toFixed(2)}:d=${(musicFadeSecs || 0).toFixed(2)},apad[music]`,
      `[ca][music]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
    );
    aOut = '[aout]';
  }

  args.push('-filter_complex', f.join(';'));
  args.push('-map', vOut, '-map', aOut);
  args.push(
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    '-r', '30',
    outPath,
  );

  await runFfmpeg(args);
  return outPath;
}

function escapeForSubtitlesFilter(p) {
  // ffmpeg's subtitles= filter wants single-quoted paths with colons escaped.
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`));
    });
  });
}

module.exports = { renderFinal };
