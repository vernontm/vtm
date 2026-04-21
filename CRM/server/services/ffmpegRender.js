// ffmpeg pipeline for stitching HeyGen clips into a final 1080x1920 video.
//
// Inputs:
//   - Array of clip MP4 paths (each clip already has ElevenLabs audio baked in by HeyGen)
//   - Optional logo PNG path + position + size%
//   - Optional music MP3 path + volume + fade-out seconds
//   - Caption chunks [{ text, start, end }] + caption_style
//
// Captions are burned via drawtext (no libass dependency). Uses Impact.ttf
// which ships with every macOS install. Output is 1080x1920 MP4.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FFMPEG = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';
const W = 1080, H = 1920;

// Fonts the caption picker can choose from. Bundled TTFs live in
// server/assets/fonts/ (checked into the repo). Mac-bundled fonts use
// their known /System/Library/Fonts paths — always present on macOS.
const FONTS_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const FONT_FILES = {
  impact:       '/System/Library/Fonts/Supplemental/Impact.ttf',
  arial_black:  '/System/Library/Fonts/Supplemental/Arial Black.ttf',
  poppins:      path.join(FONTS_DIR, 'Poppins-ExtraBold.ttf'),
  montserrat:   path.join(FONTS_DIR, 'Montserrat-ExtraBold.ttf'),
};
const DEFAULT_FONT = 'montserrat';

function resolveFontFile(key) {
  const f = FONT_FILES[key] || FONT_FILES[DEFAULT_FONT];
  // Fallback chain: bundled → Impact (system) if the bundled file is missing
  if (!fs.existsSync(f)) return FONT_FILES.impact;
  return f;
}

function posCoords(pos, padPx = 32) {
  switch (pos) {
    case 'tl': return { x: `${padPx}`,     y: `${padPx}` };
    case 'tr': return { x: `W-w-${padPx}`, y: `${padPx}` };
    case 'bl': return { x: `${padPx}`,     y: `H-h-${padPx}` };
    case 'br': return { x: `W-w-${padPx}`, y: `H-h-${padPx}` };
    default:   return { x: `W-w-${padPx}`, y: `${padPx}` };
  }
}

// Escape a string for use inside a drawtext `text='...'` value in
// filter_complex. Single quotes inside are replaced with a visually
// identical right-single-quotation-mark to sidestep quoting hell.
function escDrawtextText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/'/g, '\u2019');
}

// Escape a filesystem path for use as fontfile=<path> (no surrounding quotes).
function escDrawtextPath(p) {
  return String(p || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '\\\'');
}

function buildDrawtextChain({ chunks, style }) {
  if (!chunks?.length) return '';
  const size    = Math.max(8, Math.round(style?.size || 64));
  const color   = style?.color || 'white';
  const border  = style?.stroke_width ?? 6;
  const borderC = style?.stroke || 'black';
  const yFrac   = style?.y_position ?? 0.75;
  const yPx     = Math.round(yFrac * H);
  const fontKey = (style?.font || DEFAULT_FONT).toLowerCase().replace(/\s+/g, '_');
  const font    = escDrawtextPath(resolveFontFile(fontKey));

  return chunks.map(c => {
    const text = escDrawtextText(c.text);
    const start = Number(c.start || 0).toFixed(3);
    const end   = Number(c.end   || 0).toFixed(3);
    const parts = [
      `fontfile=${font}`,
      `text='${text}'`,
      `fontcolor=${color}`,
      `fontsize=${size}`,
      `borderw=${border}`,
      `bordercolor=${borderC}`,
      `x=(w-text_w)/2`,
      `y=${yPx}-text_h/2`,
      `enable='between(t,${start},${end})'`,
    ];
    return `drawtext=${parts.join(':')}`;
  }).join(',');
}

// Build and run ffmpeg. Returns the output path when done.
async function renderFinal({
  clipPaths,
  logoPath = null,
  logoPosition = 'tr',
  logoSizePct = 12,
  musicPath = null,
  musicVolume = 0.15,
  musicFadeSecs = 1.5,
  captionChunks = [],
  captionStyle = {},
  totalDurationSecs,
  outPath,
}) {
  if (!clipPaths?.length) throw new Error('no clips to render');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const args = ['-y'];
  clipPaths.forEach(p => args.push('-i', p));

  let logoIdx = null, musicIdx = null;
  if (logoPath)  { logoIdx  = clipPaths.length;                                args.push('-i', logoPath); }
  if (musicPath) { musicIdx = clipPaths.length + (logoPath ? 1 : 0);           args.push('-i', musicPath); }

  const f = [];

  // Normalize every clip to 1080x1920 (pad/crop), then concat with their audio.
  for (let i = 0; i < clipPaths.length; i++) {
    f.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30[v${i}]`);
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

  // Captions via drawtext (no libass needed)
  const drawChain = buildDrawtextChain({ chunks: captionChunks, style: captionStyle });
  if (drawChain) {
    f.push(`${vOut}${drawChain}[vfinal]`);
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
