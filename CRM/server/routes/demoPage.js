/**
 * demoPage.js
 * Generates a custom HTML landing page demo for a CRM lead via Claude,
 * screenshots it with Puppeteer, and creates a personalized Gmail draft
 * with the preview image attached.
 *
 * Routes:
 *   POST /api/demo-page/generate       – generate everything
 *   GET  /api/demo-page/:id            – check if demo exists for a lead
 *   GET  /api/demo-page/:id/preview    – serve the HTML file
 *   GET  /api/demo-page/:id/screenshot.jpg – serve the screenshot
 */

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const Anthropic = require('@anthropic-ai/sdk');
const { db, uuidv4, now } = require('../db');
const { createDraftWithAttachment, getSetting } = require('../services/gmailClient');

const DEMOS_DIR = path.join(__dirname, '..', 'client-demos');
fs.mkdirSync(DEMOS_DIR, { recursive: true });

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ── Prompt builders ────────────────────────────────────────────────────────────

function buildGenerationPrompt(lead) {
  const type     = lead.company || 'local business';
  const phone    = lead.phone   || 'N/A';
  const location = lead.location || lead.address || 'N/A';

  // Parse extra context from LeadScout-generated notes
  let extras = '';
  if (lead.notes) {
    const ratingMatch  = lead.notes.match(/Rating:\s*([\d.]+)/);
    const reviewsMatch = lead.notes.match(/\((\d+)\s*reviews?\)/);
    const yearsMatch   = lead.notes.match(/In business:\s*(\d+)/);
    const signalMatch  = lead.notes.match(/Signal:\s*\w+\s*—\s*(.+)/);
    if (ratingMatch)  extras += `\n- Google Rating: ${ratingMatch[1]} ★ (${reviewsMatch?.[1] || '?'} reviews)`;
    if (yearsMatch)   extras += `\n- Years in business: ${yearsMatch[1]}`;
    if (signalMatch)  extras += `\n- Key selling point: ${signalMatch[1]}`;
  }

  return `You are a professional web designer creating a stunning demo landing page to show a local business owner what their website could look like. Make it SO good they can't say no.

BUSINESS INFO:
- Name: ${lead.name}
- Type: ${type}
- Location: ${location}
- Phone: ${phone}${extras}
${lead.notes ? `- Additional context: ${lead.notes.slice(0, 200)}` : ''}

────────────────────────────────────────
TASK 1 — LANDING PAGE HTML
────────────────────────────────────────
Generate a complete, single-file HTML landing page. Strict requirements:

1. ALL CSS and JS embedded inline — zero external files except ONE Google Font
2. Mobile-responsive with a breakpoint at 768px
3. Color palette that matches the niche personality:
   - Auto detailing / ceramic coating → dark/metallic (charcoal, silver, electric blue)
   - Barber / grooming → bold/masculine (dark, gold accents)
   - Lash studio / beauty → elegant/soft (blush, ivory, rose gold)
   - Lawn care / landscaping → earthy/fresh (deep green, tan, white)
   - Food truck → vibrant/warm (bold color, appetizing photography feel)
   - Pressure washing → clean/professional (blue, white, power feel)
   - Default → modern dark with the business accent color
4. SECTIONS (in this exact order):
   a. HERO — Full-width, business name + punchy tagline + "Call Now: ${phone}" CTA button
   b. SERVICES — Grid of 3-4 specific services for a ${type} (use emoji icons, real service names)
   c. WHY US — 3 trust points (experience, quality, satisfaction), mention their rating if known
   d. TESTIMONIALS — 2-3 realistic 5-star reviews written as if from real local customers
   e. CONTACT — Form (name, email, message) + phone number prominently displayed
   f. FOOTER — Business name, phone, location, © 2025
5. Write REAL, specific copy — no lorem ipsum, no placeholder text
6. Smooth scroll navigation, hover effects on buttons/cards
7. Must look IMPRESSIVE at 1280×800 — this is a sales demo to win the client

────────────────────────────────────────
TASK 2 — EMAIL BODY
────────────────────────────────────────
After the HTML, add this EXACT line alone:
---EMAILBODY---

Then write a personalized cold outreach email body (plain text only, 130-160 words):
- Open by referencing their specific business niche and location
- Mention their strong reputation (rating/reviews if known)
- Say you noticed they don't have a website and you built a demo specifically for them
- Reference the attached preview screenshot
- 3-bullet list of quick benefits (Google visibility, easy booking, trust-building)
- Soft CTA: "Would you be open to a quick 15-minute call this week?"
- Sign off as Ray from Vernon Tech & Media

Return ONLY: the complete HTML document, then the separator line, then the email body. Zero other text.`;
}

function fallbackEmail(lead) {
  const type = lead.company || 'business';
  return `Hi ${lead.name} team,

I came across your ${type} while researching local businesses in your area, and I was genuinely impressed by the reputation you've built.

I noticed you don't have a website yet — and that's actually a real opportunity. I went ahead and built a demo specifically for your business. I've attached a preview screenshot so you can see exactly what it could look like.

A professional website can help you:
• Show up on Google when people search for ${type} services nearby
• Let customers find your number, hours, and services instantly
• Build trust before they even pick up the phone

I built this demo in a few hours just to show you the vision. Would you be open to a quick 15-minute call this week to walk through it together?

Ray
Vernon Tech & Media
vernontm.com`;
}

// ── POST /api/demo-page/generate ──────────────────────────────────────────────
router.post('/generate', async (req, res) => {
  const { lead } = req.body;
  if (!lead || !lead.id || !lead.name) {
    return res.status(400).json({ error: 'lead with id and name is required' });
  }

  const leadDir = path.join(DEMOS_DIR, lead.id);
  fs.mkdirSync(leadDir, { recursive: true });

  const result = {
    leadId:         lead.id,
    htmlUrl:        null,
    screenshotUrl:  null,
    draftCreated:   false,
    draftId:        null,
    warnings:       [],
  };

  // ── 1. Generate HTML + email body via Claude ────────────────────────────────
  let html = '', emailBody = '';
  try {
    const client   = getClient();
    const response = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 8000,
      messages:   [{ role: 'user', content: buildGenerationPrompt(lead) }],
    });

    let raw = response.content.map(b => b.text || '').join('').trim();

    // Strip markdown code fences if present
    if (raw.startsWith('```')) raw = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();

    const MARKER    = '---EMAILBODY---';
    const markerIdx = raw.indexOf(MARKER);

    if (markerIdx !== -1) {
      html      = raw.slice(0, markerIdx).trim();
      emailBody = raw.slice(markerIdx + MARKER.length).trim();
    } else {
      // Fallback: try to extract HTML block
      const start = raw.indexOf('<!DOCTYPE');
      const end   = raw.lastIndexOf('</html>');
      html = (start !== -1 && end !== -1) ? raw.slice(start, end + 7) : raw;
      emailBody = fallbackEmail(lead);
    }
  } catch (e) {
    console.error('[demo-page] generation error:', e.message);
    return res.status(500).json({ error: 'Page generation failed: ' + e.message });
  }

  // Save HTML
  const htmlFile = path.join(leadDir, 'index.html');
  fs.writeFileSync(htmlFile, html, 'utf-8');
  result.htmlUrl = `/api/demo-page/${lead.id}/preview`;

  // ── 2. Screenshot with Puppeteer ────────────────────────────────────────────
  try {
    const puppeteer = require('puppeteer');
    const browser   = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle0', timeout: 20000 });
    // Small pause for fonts/animations
    await new Promise(r => setTimeout(r, 1500));
    const screenshotFile = path.join(leadDir, 'screenshot.jpg');
    await page.screenshot({ path: screenshotFile, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1280, height: 800 } });
    await browser.close();
    result.screenshotUrl = `/api/demo-page/${lead.id}/screenshot.jpg`;
  } catch (e) {
    console.error('[demo-page] screenshot error:', e.message);
    result.warnings.push(`Screenshot failed: ${e.message}`);
  }

  // ── 3. Create Gmail draft with screenshot attached ──────────────────────────
  const recipientEmail = lead.email || '';
  if (recipientEmail) {
    try {
      const subject     = `I built a free website demo for ${lead.name}`;
      const attachments = [];

      const screenshotFile = path.join(leadDir, 'screenshot.jpg');
      if (fs.existsSync(screenshotFile)) {
        attachments.push({
          filename: 'website-preview.jpg',
          content:  fs.readFileSync(screenshotFile).toString('base64'),
          mimeType: 'image/jpeg',
        });
      }

      const draft = await createDraftWithAttachment({ to: recipientEmail, subject, body: emailBody, attachments });
      result.draftCreated = true;
      result.draftId      = draft.id;
    } catch (e) {
      console.error('[demo-page] draft error:', e.message);
      result.warnings.push(`Email draft failed: ${e.message}`);
    }
  } else {
    result.warnings.push('No email address on lead — draft skipped');
  }

  // ── 4. Persist record ──────────────────────────────────────────────────────
  // Remove any existing demo record for this lead first
  db.get('lead_demos').remove({ lead_id: lead.id }).write();
  db.get('lead_demos').push({
    id:           uuidv4(),
    lead_id:      lead.id,
    lead_name:    lead.name,
    html_file:    htmlFile,
    screenshot:   result.screenshotUrl ? path.join(leadDir, 'screenshot.jpg') : null,
    draft_id:     result.draftId,
    created_at:   now(),
  }).write();

  res.json(result);
});

// ── GET /api/demo-page/:id ──────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const demo        = db.get('lead_demos').find({ lead_id: req.params.id }).value();
  const htmlFile    = path.join(DEMOS_DIR, req.params.id, 'index.html');
  const shotFile    = path.join(DEMOS_DIR, req.params.id, 'screenshot.jpg');
  res.json({
    exists:        !!demo,
    hasHtml:       fs.existsSync(htmlFile),
    hasScreenshot: fs.existsSync(shotFile),
    htmlUrl:       fs.existsSync(htmlFile) ? `/api/demo-page/${req.params.id}/preview` : null,
    screenshotUrl: fs.existsSync(shotFile) ? `/api/demo-page/${req.params.id}/screenshot.jpg` : null,
    draftId:       demo?.draft_id || null,
    createdAt:     demo?.created_at || null,
  });
});

// ── GET /api/demo-page/:id/preview ─────────────────────────────────────────
router.get('/:id/preview', (req, res) => {
  const file = path.join(DEMOS_DIR, req.params.id, 'index.html');
  if (!fs.existsSync(file)) return res.status(404).send('<h1>Demo not found</h1>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(file);
});

// ── GET /api/demo-page/:id/screenshot.jpg ─────────────────────────────────
router.get('/:id/screenshot.jpg', (req, res) => {
  const file = path.join(DEMOS_DIR, req.params.id, 'screenshot.jpg');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Screenshot not found' });
  res.sendFile(file);
});

module.exports = router;
