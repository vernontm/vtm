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

// Word-wrap that returns REAL newlines. Coefficient is tuned for bold/
// extra-bold weights (UPPERCASE captions especially) — Montserrat/Poppins
// ExtraBold at 64pt averages ~0.65-0.7x font size per char.
function softWrap(text, { fontSize, maxWidth = 880, charCoef = 0.65 }) {
  const avgCharWidth = fontSize * charCoef;
  const maxChars = Math.max(6, Math.floor(maxWidth / avgCharWidth));
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

// Escape a filesystem path for use as fontfile=<path> (no surrounding quotes).
function escDrawtextPath(p) {
  return String(p || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '\\\'');
}

// Title overlay. Rendered per-line (one drawtext per line) with a separate
// drawbox behind the text block — avoids drawtext's multi-line newline bug
// that renders the LF char itself as a tofu glyph in ffmpeg 8.1.
//
// bg_mode: 'fit' (background matches widest line + padding) or 'rectangle'
// (background spans full video width).
function buildTitleDrawtext({ title, style, workDir }) {
  if (!style?.enabled || !title) return '';

  const size    = Math.max(16, Math.round(style.size || 72));
  const rawText = style.uppercase ? String(title).toUpperCase() : String(title);
  // Title text is usually lowercase so the coef can be a bit smaller
  const wrapped = softWrap(rawText, { fontSize: size, maxWidth: 820, charCoef: 0.58 });
  const lines   = wrapped.split('\n').filter(Boolean);
  if (!lines.length) return '';

  const color   = style.color || '#FFFFFF';
  const bg      = style.bg_color || '#E91E63';
  const padding = Math.max(0, Math.round(style.padding ?? 28));
  const yFrac   = style.y_position ?? 0.12;
  const centerY = Math.round(yFrac * H);
  const fontKey = (style.font || DEFAULT_FONT).toLowerCase().replace(/\s+/g, '_');
  const font    = escDrawtextPath(resolveFontFile(fontKey));

  const lineHeight  = Math.round(size * 1.15);
  const totalTextH  = lines.length * lineHeight;
  const bgMode      = style.bg_mode === 'rectangle' ? 'rectangle' : 'fit';

  // Approximate widest line width for 'fit' mode. Uses the same coefficient
  // the wrap step used (0.58 for lowercase, 0.72 for UPPERCASE) plus a 6%
  // safety buffer so the bg always fully contains the text instead of the
  // text hanging off the edge.
  const charCoef     = style.uppercase ? 0.72 : 0.58;
  const avgCharWidth = size * charCoef;
  const widestChars  = Math.max(...lines.map(l => l.length));
  const approxWidth  = Math.min(
    Math.round(widestChars * avgCharWidth * 1.06),
    Math.round(W * 0.92),
  );

  const bgWidth  = bgMode === 'rectangle' ? W : approxWidth + padding * 2;
  const bgHeight = totalTextH + padding * 2;
  const bgX      = bgMode === 'rectangle' ? 0 : Math.round((W - bgWidth) / 2);
  const bgY      = centerY - Math.round(bgHeight / 2);

  const filters = [];
  // Solid background
  filters.push(`drawbox=x=${bgX}:y=${bgY}:w=${bgWidth}:h=${bgHeight}:color=${bg}@1.0:t=fill`);

  // One drawtext per line, stacked vertically inside the bg
  lines.forEach((line, i) => {
    const textPath = path.join(workDir, `title-${String(i).padStart(2, '0')}.txt`);
    fs.writeFileSync(textPath, line, 'utf8');
    const baselineY = bgY + padding + i * lineHeight + Math.round((lineHeight - size) / 2);
    const parts = [
      `fontfile=${font}`,
      `textfile=${path.basename(textPath)}`,
      `fontcolor=${color}`,
      `fontsize=${size}`,
      `x=(w-text_w)/2`,
      `y=${baselineY}`,
    ];
    filters.push(`drawtext=${parts.join(':')}`);
  });

  return filters.join(',');
}

// Captions — per-line rendering so each wrapped line is its own drawtext,
// individually centered. Same enable window per chunk's lines.
function buildDrawtextChain({ chunks, style, workDir }) {
  if (!chunks?.length) return '';
  const size    = Math.max(8, Math.round(style?.size || 64));
  const color   = style?.color || 'white';
  const border  = style?.stroke_width ?? 6;
  const borderC = style?.stroke || 'black';
  const yFrac   = style?.y_position ?? 0.75;
  const yPx     = Math.round(yFrac * H);
  const fontKey = (style?.font || DEFAULT_FONT).toLowerCase().replace(/\s+/g, '_');
  const font    = escDrawtextPath(resolveFontFile(fontKey));
  const lineHeight = Math.round(size * 1.15);

  const all = [];
  chunks.forEach((c, chunkIdx) => {
    // Captions are uppercase bold — use a tighter width + wider char coef
    const wrapped = softWrap(c.text, { fontSize: size, maxWidth: 880, charCoef: 0.7 });
    const lines   = wrapped.split('\n').filter(Boolean);
    if (!lines.length) return;
    const totalH = lines.length * lineHeight;
    const start  = Number(c.start || 0).toFixed(3);
    const end    = Number(c.end   || 0).toFixed(3);

    lines.forEach((line, lineIdx) => {
      const textPath = path.join(workDir, `cap-${String(chunkIdx).padStart(3, '0')}-${lineIdx}.txt`);
      fs.writeFileSync(textPath, line, 'utf8');
      const lineY = yPx - Math.round(totalH / 2) + lineIdx * lineHeight + Math.round((lineHeight - size) / 2);
      const parts = [
        `fontfile=${font}`,
        `textfile=${path.basename(textPath)}`,
        `fontcolor=${color}`,
        `fontsize=${size}`,
        `borderw=${border}`,
        `bordercolor=${borderC}`,
        `x=(w-text_w)/2`,
        `y=${lineY}`,
        `enable='between(t,${start},${end})'`,
      ];
      all.push(`drawtext=${parts.join(':')}`);
    });
  });
  return all.join(',');
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
  title = '',
  titleStyle = {},
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

  // Captions via drawtext (no libass needed) + optional title overlay.
  // Both read their rendered text from text files in workDir so
  // ffmpeg never has to parse escape sequences in a filter arg.
  const textDir = path.dirname(outPath);
  const drawChain = buildDrawtextChain({ chunks: captionChunks, style: captionStyle, workDir: textDir });
  const titleDraw = buildTitleDrawtext({ title, style: titleStyle, workDir: textDir });
  const combined = [drawChain, titleDraw].filter(Boolean).join(',');
  if (combined) {
    f.push(`${vOut}${combined}[vfinal]`);
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

  // cwd=workDir so drawtext textfile=<basename> resolves without path escaping
  await runFfmpeg(args, { cwd: path.dirname(outPath) });
  return outPath;
}

function runFfmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd });
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
