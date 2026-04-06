const express  = require('express');
const router   = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { db, uuidv4, now } = require('../db');

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

const SEARCH_SYSTEM = `You are a lead generation assistant for a web design agency targeting solopreneur-run small businesses.
When given a business type and city, generate as many realistic fictional business leads as possible. Aim for 25 to 30 distinct leads. Vary names, neighborhoods, ratings, and details so they feel like real distinct businesses.
Return ONLY a valid JSON array. No markdown, no explanation, no preamble, no trailing text. Just the raw JSON array starting with [ and ending with ].
Each object must have exactly these fields:
{
  "name": "Business Name",
  "type": "business category",
  "address": "Street, City, State",
  "phone": "(XXX) XXX-XXXX",
  "rating": 4.2,
  "reviews": 47,
  "hasWebsite": false,
  "websiteUrl": "",
  "yearsInBusiness": 3,
  "signal": "hot",
  "signalReason": "Short compelling reason under 15 words"
}
Signal rules:
- "hot" = no website, rating 4.5+, reviews 40+
- "warm" = no website and lower presence, OR weak/basic website
- "cold" = has a solid website
hasWebsite is false for hot and most warm. True for cold.
websiteUrl is empty string if no site. A plausible URL if they have one.
Aim for ~55% hot, ~25% warm, ~20% cold.
Use real neighborhood names from the city if you know them. Make names feel authentic.
Keep signalReason punchy and specific.`;

// ── POST /api/lead-scout/search ──────────────────────────────────────────────
router.post('/search', async (req, res) => {
  const { bizType, city } = req.body;
  if (!bizType || !city) return res.status(400).json({ error: 'bizType and city are required' });

  // Build exclusion set from already-pushed leads
  const pushed    = db.get('lead_scout_pushed').value();
  const pushedSet = new Set(pushed.map(p => p.fingerprint));

  try {
    const client   = getClient();
    const response = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 8000,
      system:     SEARCH_SYSTEM,
      messages:   [{ role: 'user', content: `Generate 25 to 30 leads for: ${bizType} businesses in ${city}. Return only the JSON array, nothing else.` }],
    });

    let raw = response.content.map(b => b.text || '').join('').trim();
    if (raw.startsWith('```')) raw = raw.replace(/```json?/g, '').replace(/```/g, '').trim();
    const start = raw.indexOf('['), end = raw.lastIndexOf(']');
    if (start !== -1 && end !== -1) raw = raw.slice(start, end + 1);

    let leads = JSON.parse(raw);

    // Filter out already-pushed leads
    leads = leads.filter(l => !pushedSet.has(l.name.toLowerCase()));

    res.json({ leads });
  } catch (e) {
    console.error('[lead-scout] search error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/lead-scout/push ────────────────────────────────────────────────
router.post('/push', (req, res) => {
  const { lead, city } = req.body;
  if (!lead || !lead.name) return res.status(400).json({ error: 'lead.name is required' });

  const fingerprint = lead.name.toLowerCase();
  if (db.get('lead_scout_pushed').find({ fingerprint }).value()) {
    return res.status(409).json({ error: 'Lead already pushed to CRM' });
  }

  const signalToStatus = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
  const crmLead = {
    id:          uuidv4(),
    name:        lead.name,
    status:      signalToStatus[lead.signal] || 'Warm',
    company:     lead.type || '',
    title:       '',
    email:       '',
    phone:       lead.phone || '',
    location:    lead.address || '',
    lead_source: 'Lead Scout',
    notes:       [
      `Type: ${lead.type}`,
      `Address: ${lead.address}`,
      lead.hasWebsite ? `Website: ${lead.websiteUrl || 'yes'}` : 'No website',
      `Rating: ${lead.rating} ★ (${lead.reviews} reviews)`,
      `In business: ${lead.yearsInBusiness} yr`,
      `Signal: ${(lead.signal || '').toUpperCase()} — ${lead.signalReason}`,
    ].join('\n'),
    created_at:  now(),
    updated_at:  now(),
  };

  db.get('leads').push(crmLead).write();
  db.get('lead_scout_pushed').push({
    id:          uuidv4(),
    fingerprint,
    name:        lead.name,
    city:        city || '',
    crm_lead_id: crmLead.id,
    pushed_at:   now(),
  }).write();

  res.status(201).json({ lead: crmLead });
});

// ── POST /api/lead-scout/push-bulk ───────────────────────────────────────────
router.post('/push-bulk', (req, res) => {
  const { leads = [], city } = req.body;
  const signalToStatus = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
  const results = [];

  leads.forEach(lead => {
    const fingerprint = lead.name.toLowerCase();
    if (db.get('lead_scout_pushed').find({ fingerprint }).value()) return;

    const crmLead = {
      id:          uuidv4(),
      name:        lead.name,
      status:      signalToStatus[lead.signal] || 'Warm',
      company:     lead.type || '',
      title:       '',
      email:       '',
      phone:       lead.phone || '',
      location:    lead.address || '',
      lead_source: 'Lead Scout',
      notes:       [
        `Type: ${lead.type}`,
        `Address: ${lead.address}`,
        lead.hasWebsite ? `Website: ${lead.websiteUrl || 'yes'}` : 'No website',
        `Rating: ${lead.rating} ★ (${lead.reviews} reviews)`,
        `In business: ${lead.yearsInBusiness} yr`,
        `Signal: ${(lead.signal || '').toUpperCase()} — ${lead.signalReason}`,
      ].join('\n'),
      created_at:  now(),
      updated_at:  now(),
    };

    db.get('leads').push(crmLead).write();
    db.get('lead_scout_pushed').push({
      id:          uuidv4(),
      fingerprint,
      name:        lead.name,
      city:        city || '',
      crm_lead_id: crmLead.id,
      pushed_at:   now(),
    }).write();

    results.push(crmLead);
  });

  res.status(201).json({ leads: results, count: results.length });
});

// ── GET /api/lead-scout/pushed-names ────────────────────────────────────────
router.get('/pushed-names', (req, res) => {
  const names = db.get('lead_scout_pushed').map('fingerprint').value();
  res.json(names);
});

// ── POST /api/lead-scout/pitch ───────────────────────────────────────────────
router.post('/pitch', async (req, res) => {
  const { lead } = req.body;
  if (!lead) return res.status(400).json({ error: 'lead is required' });

  try {
    const client   = getClient();
    const response = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 400,
      messages:   [{
        role:    'user',
        content: `Write a short cold outreach DM for a web designer reaching out to this business.\n\nBusiness: ${lead.name}\nType: ${lead.type}\nCity: ${lead.address}\nRating: ${lead.rating} stars, ${lead.reviews} reviews. No website.\nHook: ${lead.signalReason}\n\nUnder 80 words. Sound human, specific, low-pressure CTA. No em dashes.`,
      }],
    });

    const text = response.content.map(b => b.text || '').join('').trim();
    res.json({ pitch: text });
  } catch (e) {
    console.error('[lead-scout] pitch error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
