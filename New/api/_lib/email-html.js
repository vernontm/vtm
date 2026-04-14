// Shared HTML email wrapper — styles plain-text bodies and wraps bare HTML
// in a minimal responsive email shell.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrapEmailHtml(body, opts = {}) {
  const subject = opts.subject || '';
  const fromName = opts.fromName || '';
  const raw = (body || '').trim();

  // Already a full HTML document — send as-is
  if (/<!DOCTYPE|<html[\s>]/i.test(raw)) return raw;

  // Detect block-level HTML tags (user wrote HTML fragments)
  const hasBlockTags = /<(p|div|h[1-6]|ul|ol|li|br|a|strong|em|b|i|img|table)\b/i.test(raw);

  let inner;
  if (hasBlockTags) {
    inner = raw;
  } else {
    // Plain text — escape, then convert paragraphs + line breaks
    const escaped = escapeHtml(raw);
    const paragraphs = escaped.split(/\n{2,}/).map(p => `<p style="margin:0 0 16px 0;">${p.replace(/\n/g, '<br>')}</p>`);
    inner = paragraphs.join('\n');
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:30px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;box-shadow:0 2px 8px rgba(10,20,40,0.06);overflow:hidden;">
          <tr>
            <td style="padding:36px 32px;font-size:15px;line-height:1.65;color:#1a1a2e;">
              ${inner}
            </td>
          </tr>
        </table>
        <div style="font-size:11px;color:#8e8ea0;padding:16px 10px 0;text-align:center;">
          ${escapeHtml(fromName)}
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { wrapEmailHtml };
