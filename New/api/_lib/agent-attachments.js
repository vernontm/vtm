// Converts client-supplied attachments into Claude multimodal content blocks.
// Accepts an array of { name, kind: 'image'|'pdf'|'text', media_type, data_base64?, text? }.
// Returns an array of Anthropic content blocks ready to merge into a user message's content array.
//
// - Images become { type: 'image', source: { type: 'base64', media_type, data } }
// - PDFs become   { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
// - Text files    become { type: 'text', text: "[file: name]\n<contents>" } (truncated)
const MAX_TEXT_CHARS = 60000;
const MAX_IMAGE_B64 = 8 * 1024 * 1024; // ~6MB decoded
const MAX_PDF_B64 = 12 * 1024 * 1024;  // ~9MB decoded

function attachmentsToBlocks(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const blocks = [];
  for (const a of attachments) {
    if (!a || !a.kind) continue;
    if (a.kind === 'image' && a.data_base64 && a.data_base64.length < MAX_IMAGE_B64) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: a.media_type || 'image/png', data: a.data_base64 },
      });
    } else if (a.kind === 'pdf' && a.data_base64 && a.data_base64.length < MAX_PDF_B64) {
      blocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: a.data_base64 },
      });
    } else if (a.kind === 'text' && typeof a.text === 'string') {
      const snippet = a.text.slice(0, MAX_TEXT_CHARS);
      blocks.push({
        type: 'text',
        text: `[Reference file: ${a.name || 'attached.txt'}]\n${snippet}${a.text.length > MAX_TEXT_CHARS ? '\n...[truncated]' : ''}`,
      });
    }
  }
  return blocks;
}

// Builds the user-message content for a single prompt + its attachments.
// If there are no attachments, returns the plain string (cheaper). Otherwise
// returns a content array with attachments first, then the text prompt.
function buildUserContent(prompt, attachments) {
  const blocks = attachmentsToBlocks(attachments);
  if (blocks.length === 0) return prompt;
  return [...blocks, { type: 'text', text: prompt || '(see attached files)' }];
}

module.exports = { attachmentsToBlocks, buildUserContent };
