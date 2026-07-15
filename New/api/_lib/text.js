// Remove em/en dashes from generated text (an "AI tell" VTM avoids everywhere).
// Em dash -> ", " (clause break); en dash -> "-" (ranges). Collapse doubled commas.
function stripDashes(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, '-').replace(/,\s*,/g, ',');
}
module.exports = { stripDashes };
