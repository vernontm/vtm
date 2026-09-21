// Period report for a project board: what got done, what is underway, what is
// next, and the commentary around it.
//
// Deliberately separate from agreement-pdf.js. That module renders legally
// signed contracts; sharing a drawing layer between a marketing report and an
// executed agreement means a cosmetic tweak to one can alter the other. The
// duplication here is intentional and cheap.
//
// clientFacing is the safety switch. When true this module refuses to render
// internal comments or steps flagged client_visible=false, regardless of what
// the caller passed in. It filters again rather than trusting the query.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_W = 612, PAGE_H = 792, M = 56;
const NAVY = rgb(0.11, 0.25, 0.39);
const INK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.44);
const GREEN = rgb(0.09, 0.55, 0.24);
const AMBER = rgb(0.70, 0.40, 0.05);

// StandardFonts are WinAnsi, so anything outside that set has to go.
function clean(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-').replace(/…/g, '...')
    .replace(/[•]/g, '-').replace(/[^\x00-\xFF]/g, '');
}

// A bare 'YYYY-MM-DD' parses as UTC midnight, which is the PREVIOUS day
// anywhere west of Greenwich, so a step completed on the 2nd would print as the
// 1st on a report going to a client. Pin date-only values to local midnight.
const fmtDate = (d) => {
  if (!d) return '';
  try {
    const v = typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00' : d;
    return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
};

async function buildProjectReportPdf(opts) {
  const {
    clientName = '', projectName = '', periodLabel = '',
    phases = [], comments = [], clientFacing = false,
    generatedAt = new Date(),
  } = opts || {};

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  const wOf = (t, f, s) => f.widthOfTextAtSize(t, s);
  const newPage = () => { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - M; };
  const ensure = (h) => { if (y - h < M) newPage(); };

  function text(str, { size = 10, f = font, color = INK, indent = 0, gap = 4 } = {}) {
    const maxW = PAGE_W - 2 * M - indent;
    const words = clean(str).split(/\s+/).filter(Boolean);
    let line = '';
    const flush = () => {
      if (!line) return;
      ensure(size + gap);
      page.drawText(line, { x: M + indent, y: y - size, size, font: f, color });
      y -= size + gap;
      line = '';
    };
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (wOf(next, f, size) > maxW && line) flush();
      else { line = next; continue; }
      line = w;
    }
    flush();
  }

  function centered(str, size, f, color) {
    ensure(size + 6);
    const t = clean(str);
    page.drawText(t, { x: (PAGE_W - wOf(t, f, size)) / 2, y: y - size, size, font: f, color });
    y -= size + 7;
  }

  function rule(color = rgb(0.85, 0.85, 0.87)) {
    ensure(10);
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.7, color });
    y -= 12;
  }

  function sectionHeading(str) {
    y -= 10;
    ensure(20);
    page.drawText(clean(str), { x: M, y: y - 12, size: 12, font: bold, color: NAVY });
    y -= 20;
  }

  // A step line: status mark, name, date.
  function stepLine(item, mark, markColor) {
    ensure(15);
    page.drawText(mark, { x: M + 8, y: y - 10, size: 10, font: bold, color: markColor });
    const dateStr = item.completed_at ? fmtDate(item.completed_at) : (item.due_date ? 'due ' + fmtDate(item.due_date) : '');
    const dateW = dateStr ? wOf(clean(dateStr), font, 8.5) : 0;
    const nameMax = PAGE_W - 2 * M - 26 - (dateW ? dateW + 12 : 0);
    let name = clean(item.name || '');
    while (name && wOf(name, font, 10) > nameMax) name = name.slice(0, -2);
    page.drawText(name, { x: M + 26, y: y - 10, size: 10, font, color: INK });
    if (dateStr) {
      page.drawText(clean(dateStr), { x: PAGE_W - M - dateW, y: y - 10, size: 8.5, font, color: GREY });
    }
    y -= 15;
  }

  // ── Cover block ──
  centered(clientName || 'Project report', 17, bold, INK);
  if (projectName) centered(projectName, 12, font, GREY);
  if (periodLabel) centered(periodLabel, 10, ital, GREY);
  y -= 6;
  rule();

  // clientFacing filters a SECOND time here, so a caller mistake cannot leak.
  const visiblePhases = phases
    .map(ph => ({
      ...ph,
      steps: (ph.steps || []).filter(s => !clientFacing || s.client_visible !== false),
    }))
    .filter(ph => ph.steps.length);

  const done = [];
  const doing = [];
  const todo = [];
  for (const ph of visiblePhases) {
    const d = ph.steps.filter(s => s.status === 'done');
    const g = ph.steps.filter(s => s.status === 'doing');
    const t = ph.steps.filter(s => s.status !== 'done' && s.status !== 'doing');
    if (d.length) done.push({ name: ph.name, steps: d });
    if (g.length) doing.push({ name: ph.name, steps: g });
    if (t.length) todo.push({ name: ph.name, steps: t });
  }

  const totalSteps = visiblePhases.reduce((n, ph) => n + ph.steps.length, 0);
  const totalDone = visiblePhases.reduce((n, ph) => n + ph.steps.filter(s => s.status === 'done').length, 0);
  const pct = totalSteps ? Math.round((totalDone / totalSteps) * 100) : 0;
  text(`${totalDone} of ${totalSteps} steps complete (${pct}%).`, { size: 10.5, f: bold });
  y -= 4;

  // ── Completed ──
  sectionHeading('Completed this period');
  if (!done.length) {
    text('Nothing was marked complete in this period.', { size: 10, f: ital, color: GREY });
  } else {
    for (const ph of done) {
      ensure(18);
      page.drawText(clean(ph.name), { x: M, y: y - 11, size: 10.5, font: bold, color: INK });
      y -= 17;
      ph.steps.forEach(s => stepLine(s, 'x', GREEN));
      y -= 4;
    }
  }

  // ── In progress ──
  if (doing.length) {
    sectionHeading('In progress');
    for (const ph of doing) {
      ensure(18);
      page.drawText(clean(ph.name), { x: M, y: y - 11, size: 10.5, font: bold, color: INK });
      y -= 17;
      ph.steps.forEach(s => stepLine(s, '>', AMBER));
      y -= 4;
    }
  }

  // ── Upcoming ──
  if (todo.length) {
    sectionHeading('Coming up next');
    for (const ph of todo) {
      ensure(18);
      page.drawText(clean(ph.name), { x: M, y: y - 11, size: 10.5, font: bold, color: INK });
      y -= 17;
      ph.steps.forEach(s => stepLine(s, '-', GREY));
      y -= 4;
    }
  }

  // ── Notes ──
  const shownComments = (comments || []).filter(c => !clientFacing || c.internal !== true);
  if (shownComments.length) {
    sectionHeading('Notes');
    for (const c of shownComments) {
      ensure(26);
      const who = [c.author || 'Team', fmtDate(c.created_at)].filter(Boolean).join(' · ');
      page.drawText(clean(who), { x: M, y: y - 9, size: 8.5, font: bold, color: GREY });
      y -= 13;
      if (!clientFacing && c.internal) {
        page.drawText('INTERNAL', { x: M, y: y - 8, size: 7.5, font: bold, color: rgb(0.7, 0.15, 0.15) });
        y -= 11;
      }
      text(c.body || '', { size: 9.5, indent: 8, gap: 3 });
      y -= 6;
    }
  }

  // ── Footer on every page ──
  const stamp = clean(`Vernon Tech & Media  ·  generated ${fmtDate(generatedAt)}`);
  doc.getPages().forEach((p, i, all) => {
    p.drawText(stamp, { x: M, y: 32, size: 8, font, color: GREY });
    const n = `${i + 1} of ${all.length}`;
    p.drawText(n, { x: PAGE_W - M - wOf(n, font, 8), y: 32, size: 8, font, color: GREY });
  });

  return await doc.save();
}

// Turn a range key into concrete dates plus a human label for the cover.
//
// Dates are formatted from LOCAL calendar parts, not toISOString(). Going
// through UTC shifts the day for anyone whose local midnight falls on the other
// side of it, which would silently report the wrong week.
//
// `to` is inclusive of the whole of that day. Callers querying a timestamp
// column should use `toExclusive` instead, otherwise work completed later today
// is dropped from today's report.
function resolveRange(range, from, to, now = new Date()) {
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let start, end, label;

  if (range === 'this-week') {
    const d = startOfDay(now);
    d.setDate(d.getDate() - d.getDay());
    start = d; end = startOfDay(now);
    label = `Week of ${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  } else if (range === 'last-month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
    label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else if (range === 'custom' && from && to) {
    start = new Date(from + 'T00:00:00'); end = new Date(to + 'T00:00:00');
    label = `${fmtDate(start)} to ${fmtDate(end)}`;
  } else {
    // this-month is the default
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = startOfDay(now);
    label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  const dayAfter = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return { from: iso(start), to: iso(end), toExclusive: iso(dayAfter), label };
}

module.exports = { buildProjectReportPdf, resolveRange };
