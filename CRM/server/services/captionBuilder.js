// Build caption chunks from per-clip word timings.
// Each clip contributes words at absolute time [word.start + clipOffset, word.end + clipOffset].
// Words are grouped into `words_per_chunk` cues (2-3 TikTok-style by default).
// Returns [{ text, start, end }] — ffmpegRender turns these into drawtext filters.

function chunkCaptions({ sentences, captionStyle }) {
  const s = captionStyle || {};
  const wordsPerChunk = Math.max(1, s.words_per_chunk || 2);

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

  const chunks = [];
  for (let i = 0; i < absWords.length; i += wordsPerChunk) {
    const grp = absWords.slice(i, i + wordsPerChunk);
    if (!grp.length) continue;
    const start = grp[0].start;
    const end   = grp[grp.length - 1].end;
    if (end <= start) continue;
    chunks.push({
      text: grp.map(w => w.text.toUpperCase()).join(' '),
      start,
      end,
    });
  }
  return chunks;
}

module.exports = { chunkCaptions };
