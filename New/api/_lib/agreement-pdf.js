// Deterministic server-side PDF for signed agreements, built with pdf-lib.
// No browser/html2canvas involved — layout is predictable and testable.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_W = 612, PAGE_H = 792, M = 56;
const NAVY = rgb(0.11, 0.25, 0.39);
const INK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.34, 0.34, 0.34);
const SIGCOL = rgb(0.09, 0.19, 0.29);

function parseBlocks(md) {
  const lines = (md || '').split('\n');
  const blocks = [];
  let firstH1 = true;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('# ')) {
      if (firstH1) { blocks.push({ type: 'title', text: line.slice(2) }); firstH1 = false; }
      else blocks.push({ type: 'heading', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('## ')) { blocks.push({ type: 'heading', text: line.slice(3) }); continue; }
    if (line.startsWith('- ')) { blocks.push({ type: 'bullet', text: line.slice(2) }); continue; }
    if (!firstH1 && /^\*\*.+\*\*$/.test(line) && blocks.length && blocks[blocks.length - 1].type === 'title') {
      blocks.push({ type: 'subtitle', text: line.replace(/\*\*/g, '') });
      continue;
    }
    blocks.push({ type: 'para', text: line });
  }
  return blocks;
}

// Split a line into runs by **bold** and _italic_ markers.
function tokenize(text) {
  const parts = [];
  const re = /(\*\*(.+?)\*\*)|(_(.+?)_)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), bold: false, ital: false });
    if (m[2] !== undefined) parts.push({ t: m[2], bold: true, ital: false });
    else parts.push({ t: m[4], bold: false, ital: true });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ t: text.slice(last), bold: false, ital: false });
  return parts.length ? parts : [{ t: text, bold: false, ital: false }];
}
// sanitize chars WinAnsi (StandardFonts) can't encode
function clean(s) {
  return String(s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/—/g, '-').replace(/–/g, '-').replace(/…/g, '...')
    .replace(/[•]/g, '-').replace(/[^\x00-\xFF]/g, '');
}

async function buildAgreementPdf(opts) {
  const {
    agreementMarkdown, ndaMarkdown, ownerName, signerName,
    signatureMethod, signatureValue, ndaSignatureMethod, ndaSignatureValue,
    signedDateLabel,
  } = opts;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ital = await doc.embedFont(StandardFonts.TimesRomanItalic);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const wOf = (t, f, s) => f.widthOfTextAtSize(t, s);
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - M; };
  const ensure = (h) => { if (y - h < M) newPage(); };

  function drawCentered(text, size, f, color) {
    ensure(size + 4);
    const t = clean(text);
    const x = (PAGE_W - wOf(t, f, size)) / 2;
    page.drawText(t, { x, y: y - size, size, font: f, color });
    y -= size + 6;
  }

  const fontFor = (seg) => seg.bold ? bold : (seg.ital ? ital : font);
  function drawWrapped(text, size, { color = INK, indent = 0, gap = 4, heading = false } = {}) {
    const runs = tokenize(text);
    const words = [];
    runs.forEach(r => r.t.split(/(\s+)/).forEach(w => { if (w !== '') words.push({ w: clean(w), bold: r.bold || heading, ital: r.ital }); }));
    const maxW = PAGE_W - 2 * M - indent;
    let line = [], lineW = 0;
    const flush = () => {
      ensure(size + gap);
      let x = M + indent;
      // coalesce consecutive same-style tokens into one draw (clean spacing)
      let i = 0;
      while (i < line.length) {
        const b = line[i].bold, it = line[i].ital;
        let str = '', j = i;
        while (j < line.length && line[j].bold === b && line[j].ital === it) { str += line[j].w; j++; }
        const f = b ? bold : (it ? ital : font);
        page.drawText(str, { x, y: y - size, size, font: f, color });
        x += wOf(str, f, size);
        i = j;
      }
      y -= size + gap; line = []; lineW = 0;
    };
    for (const seg of words) {
      const w = wOf(seg.w, fontFor(seg), size);
      if (lineW + w > maxW && line.length) flush();
      if (line.length === 0 && /^\s+$/.test(seg.w)) continue; // no leading space
      line.push(seg); lineW += w;
    }
    if (line.length) flush();
  }

  async function drawDoc(md) {
    for (const b of parseBlocks(md)) {
      if (b.type === 'title') { y -= 6; drawCentered(b.text, 16, bold, INK); }
      else if (b.type === 'subtitle') { drawCentered(b.text, 10.5, ital, GREY); y -= 8; }
      else if (b.type === 'heading') { y -= 8; ensure(14); drawWrapped(b.text, 12, { color: NAVY, heading: true, gap: 5 }); y -= 2; }
      else if (b.type === 'bullet') {
        ensure(14);
        page.drawText('-', { x: M + 6, y: y - 10.5, size: 10.5, font, color: INK });
        drawWrapped(b.text, 10.5, { indent: 18, gap: 4 });
      }
      else { drawWrapped(b.text, 10.5, { gap: 4 }); y -= 5; }
    }
  }

  async function drawSignatureBlock(clientMethod, clientValue, audit) {
    y -= 26;
    ensure(120);
    const colW = (PAGE_W - 2 * M - 40) / 2;
    const leftX = M, rightX = M + colW + 40;
    const lineY = y - 40;

    async function party(x, sigMethod, sigVal, nameLabel, roleLabel, aud) {
      // signature above the line
      if (sigMethod === 'draw' && typeof sigVal === 'string' && sigVal.startsWith('data:image')) {
        try {
          const bytes = Buffer.from(sigVal.split(',')[1], 'base64');
          const img = await doc.embedPng(bytes);
          const h = 34, w = Math.min(img.width * (h / img.height), colW - 10);
          page.drawImage(img, { x, y: lineY + 3, width: w, height: h });
        } catch (_) {
          page.drawText(clean(nameLabel), { x, y: lineY + 8, size: 18, font: ital, color: SIGCOL });
        }
      } else {
        page.drawText(clean(sigVal || nameLabel), { x, y: lineY + 8, size: 18, font: ital, color: SIGCOL });
      }
      page.drawLine({ start: { x, y: lineY }, end: { x: x + colW, y: lineY }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(clean(nameLabel + '  -  ' + roleLabel), { x, y: lineY - 14, size: 9, font, color: GREY });
      page.drawText(clean('Date: ' + signedDateLabel), { x, y: lineY - 26, size: 9, font, color: GREY });
      if (aud) {
        page.drawText(clean('IP address: ' + (aud.ip || 'n/a')), { x, y: lineY - 38, size: 8, font, color: GREY });
        if (aud.time) page.drawText(clean('Signed: ' + aud.time), { x, y: lineY - 49, size: 8, font, color: GREY });
      }
    }

    await party(leftX, 'type', 'Rayvaughn Vernon', 'Rayvaughn Vernon', 'Vernon Tech & Media', null);
    await party(rightX, clientMethod, clientValue, ownerName || 'Client', 'Client', audit);
    y = lineY - 62;
  }

  function drawCertificate(audit, name) {
    ensure(78);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.82) });
    y -= 15;
    page.drawText('SIGNATURE CERTIFICATE', { x: M, y: y - 9, size: 9, font: bold, color: GREY });
    y -= 16;
    const lines = [
      'Signed by: ' + name,
      'Signed at: ' + (audit.time || signedDateLabel),
      'IP address: ' + (audit.ip || 'n/a'),
      'Signature method: ' + audit.method,
      'Document ID: ' + audit.docId,
    ];
    for (const l of lines) { page.drawText(clean(l), { x: M, y: y - 8, size: 8, font, color: GREY }); y -= 11.5; }
  }

  const audit = {
    ip: opts.signerIp,
    time: opts.signedTimeLabel || signedDateLabel,
    method: signatureMethod === 'draw' ? 'Drawn signature' : 'Typed signature',
    docId: opts.documentId || 'n/a',
  };

  // ── Agreement ──
  await drawDoc(agreementMarkdown);
  await drawSignatureBlock(signatureMethod, signatureValue, audit);

  // ── NDA (own page) ──
  if (ndaMarkdown) {
    newPage();
    await drawDoc(ndaMarkdown);
    await drawSignatureBlock(ndaSignatureMethod || signatureMethod, ndaSignatureValue || signatureValue, audit);
  }

  drawCertificate(audit, signerName || ownerName || 'Client');

  return await doc.save();
}

module.exports = { buildAgreementPdf };
