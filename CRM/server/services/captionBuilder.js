// Build an ASS subtitle file from per-clip word timings.
// Each clip contributes words at times [word.start + clipOffset, word.end + clipOffset].
// Words are chunked into `wordsPerChunk` groups per the avatar's caption_style.

const fs = require('fs');
const path = require('path');

// Convert seconds to ASS time (H:MM:SS.cc)
function secToAss(s) {
  const clamped = Math.max(0, s);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const sec = clamped - h * 3600 - m * 60;
  const whole = Math.floor(sec);
  const cs = Math.round((sec - whole) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ASS uses &HBBGGRR& (alpha + BGR). Converts #RRGGBB → &H00BBGGRR.
function hexToAssColor(hex) {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return '&H00FFFFFF';
  const h = hex.replace('#', '');
  const r = h.slice(0, 2);
  const g = h.slice(2, 4);
  const b = h.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function buildAssCaptions({ sentences, captionStyle, width = 1080, height = 1920, outPath }) {
  const s = captionStyle || {};
  const font = s.font || 'Montserrat';
  const size = s.size || 64;
  const primaryColor = hexToAssColor(s.color || '#FFFFFF');
  const outlineColor = hexToAssColor(s.stroke || '#000000');
  const outlineWidth = s.stroke_width ?? 6;
  const yPct = s.y_position ?? 0.75;
  const wordsPerChunk = Math.max(1, s.words_per_chunk || 2);

  // ASS alignment 2 = bottom-center; we control Y with \pos tags below.
  const marginV = Math.round(height * (1 - yPct));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${font},${size},${primaryColor},&H000000FF,${outlineColor},&H00000000,1,0,0,0,100,100,0,0,1,${outlineWidth},0,2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Flatten all words across sentences into an absolute-timed list.
  let offset = 0;
  const absWords = [];
  for (const sent of sentences) {
    const dur = sent.audio_duration || 0;
    for (const w of (sent.words || [])) {
      absWords.push({
        text: (w.text || '').trim(),
        start: (w.start || 0) + offset,
        end:   (w.end   || w.start || 0) + offset,
      });
    }
    offset += dur;
  }

  // Chunk words
  const lines = [];
  for (let i = 0; i < absWords.length; i += wordsPerChunk) {
    const chunk = absWords.slice(i, i + wordsPerChunk);
    if (!chunk.length) continue;
    const chunkStart = chunk[0].start;
    const chunkEnd   = chunk[chunk.length - 1].end;
    if (chunkEnd <= chunkStart) continue;
    const text = chunk.map(w => escapeAss(w.text.toUpperCase())).join(' ');
    lines.push(`Dialogue: 0,${secToAss(chunkStart)},${secToAss(chunkEnd)},Default,,0,0,0,,${text}`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + lines.join('\n'));
  return outPath;
}

function escapeAss(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

module.exports = { buildAssCaptions, secToAss, hexToAssColor };
