const express = require('express');
const router  = express.Router();
const { db, uuidv4, now } = require('../db');
const { generateContentIdeas, BRAND_PROFILES, PLATFORMS, CONTENT_TYPES } = require('../services/contentGenerator');
const { generateImage } = require('../services/nanoBanana');

// ── Status flow ─────────────────────────────────────────────────────────────
const STATUSES = ['idea', 'scripted', 'approved', 'generating', 'completed', 'posted'];
const BRANDS   = ['kara', 'ray', 'vtm'];

// ── GET /api/content — list all content items ───────────────────────────────
router.get('/', (req, res) => {
  let items = db.get('content_items');

  // Filters
  if (req.query.brand)        items = items.filter({ brand: req.query.brand });
  if (req.query.status)       items = items.filter({ status: req.query.status });
  if (req.query.platform)     items = items.filter({ platform: req.query.platform });
  if (req.query.content_type) items = items.filter({ content_type: req.query.content_type });

  const result = items.orderBy('created_at', 'desc').value();
  res.json(result);
});

// ── GET /api/content/stats — pipeline counts per brand ──────────────────────
router.get('/stats', (req, res) => {
  const all = db.get('content_items').value();
  const stats = {};

  BRANDS.forEach(b => {
    const brandItems = all.filter(i => i.brand === b);
    stats[b] = {
      total: brandItems.length,
      byStatus: {},
      byPlatform: {},
    };
    STATUSES.forEach(s => { stats[b].byStatus[s] = brandItems.filter(i => i.status === s).length; });
    PLATFORMS.forEach(p => { stats[b].byPlatform[p] = brandItems.filter(i => i.platform === p).length; });
  });

  stats.overall = {
    total: all.length,
    byStatus: {},
  };
  STATUSES.forEach(s => { stats.overall.byStatus[s] = all.filter(i => i.status === s).length; });

  res.json(stats);
});

// ── GET /api/content/brands — brand metadata ────────────────────────────────
router.get('/brands', (req, res) => {
  res.json(BRAND_PROFILES);
});

// ── POST /api/content — create a single content item manually ───────────────
router.post('/', (req, res) => {
  const item = {
    id:                uuidv4(),
    brand:             req.body.brand || 'kara',
    platform:          req.body.platform || 'instagram',
    content_type:      req.body.content_type || 'static_post',
    status:            req.body.status || 'idea',
    title:             req.body.title || '',
    caption:           req.body.caption || '',
    hashtags:          req.body.hashtags || [],
    image_prompt:      req.body.image_prompt || '',
    video_prompt:      req.body.video_prompt || null,
    script_outline:    req.body.script_outline || null,
    cta:               req.body.cta || '',
    generated_asset_path: null,
    posted_at:         null,
    posted_url:        null,
    best_post_time:    req.body.best_post_time || null,
    notes:             req.body.notes || '',
    created_at:        now(),
    updated_at:        now(),
  };
  db.get('content_items').push(item).write();
  res.status(201).json(item);
});

// ── PUT /api/content/:id — update a content item ────────────────────────────
router.put('/:id', (req, res) => {
  const existing = db.get('content_items').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Content item not found' });

  const update = { ...req.body, updated_at: now() };
  db.get('content_items').find({ id: req.params.id }).assign(update).write();
  res.json(db.get('content_items').find({ id: req.params.id }).value());
});

// ── DELETE /api/content/:id ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.get('content_items').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── POST /api/content/:id/approve — approve and optionally trigger generation
router.post('/:id/approve', async (req, res) => {
  const item = db.get('content_items').find({ id: req.params.id }).value();
  if (!item) return res.status(404).json({ error: 'Content item not found' });

  const triggerGeneration = req.body.trigger_generation !== false;

  // Move to approved
  db.get('content_items').find({ id: req.params.id }).assign({
    status: triggerGeneration ? 'generating' : 'approved',
    updated_at: now(),
  }).write();

  if (triggerGeneration && item.image_prompt) {
    // Fire off image generation in the background
    generateImage(item.image_prompt, item.brand, item.id, item.content_type)
      .then(result => {
        if (result.success) {
          db.get('content_items').find({ id: req.params.id }).assign({
            status: 'completed',
            generated_asset_path: result.asset_path,
            updated_at: now(),
          }).write();
          console.log(`[Content] Generated asset for ${item.id}: ${result.asset_path}`);
        } else {
          // Revert to approved on failure so user can retry
          db.get('content_items').find({ id: req.params.id }).assign({
            status: 'approved',
            notes: (item.notes || '') + `\n[Generation failed: ${result.error}]`,
            updated_at: now(),
          }).write();
          console.error(`[Content] Generation failed for ${item.id}: ${result.error}`);
        }
      })
      .catch(err => {
        db.get('content_items').find({ id: req.params.id }).assign({
          status: 'approved',
          notes: (item.notes || '') + `\n[Generation error: ${err.message}]`,
          updated_at: now(),
        }).write();
      });
  }

  res.json(db.get('content_items').find({ id: req.params.id }).value());
});

// ── POST /api/content/:id/mark-posted — mark as posted ─────────────────────
router.post('/:id/mark-posted', (req, res) => {
  const item = db.get('content_items').find({ id: req.params.id }).value();
  if (!item) return res.status(404).json({ error: 'Content item not found' });

  db.get('content_items').find({ id: req.params.id }).assign({
    status: 'posted',
    posted_at: req.body.posted_at || now(),
    posted_url: req.body.posted_url || null,
    updated_at: now(),
  }).write();

  res.json(db.get('content_items').find({ id: req.params.id }).value());
});

// ── POST /api/content/generate-ideas — AI-powered idea generation ───────────
router.post('/generate-ideas', async (req, res) => {
  const { brand, count, platform, theme } = req.body;

  if (!brand || !BRANDS.includes(brand)) {
    return res.status(400).json({ error: `brand must be one of: ${BRANDS.join(', ')}` });
  }

  try {
    const ideas = await generateContentIdeas(brand, count || 5, platform || null, theme || null);

    // Save each idea to the database as status: "idea"
    const savedItems = ideas.map(idea => {
      const item = {
        id:                uuidv4(),
        brand,
        platform:          idea.platform || 'instagram',
        content_type:      idea.content_type || 'static_post',
        status:            'idea',
        title:             idea.title || '',
        caption:           idea.caption || '',
        hashtags:          idea.hashtags || [],
        image_prompt:      idea.image_prompt || '',
        video_prompt:      idea.video_prompt || null,
        script_outline:    idea.script_outline || null,
        cta:               idea.cta || '',
        best_post_time:    idea.best_post_time || null,
        estimated_engagement: idea.estimated_engagement || 'medium',
        generated_asset_path: null,
        posted_at:         null,
        posted_url:        null,
        notes:             '',
        created_at:        now(),
        updated_at:        now(),
      };
      db.get('content_items').push(item).write();
      return item;
    });

    res.json({ generated: savedItems.length, items: savedItems });
  } catch (err) {
    console.error('[Content] Idea generation failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/content/bulk-action — bulk status change ──────────────────────
router.post('/bulk-action', (req, res) => {
  const { ids, action, data } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

  let updated = 0;
  ids.forEach(id => {
    const item = db.get('content_items').find({ id }).value();
    if (!item) return;

    if (action === 'delete') {
      db.get('content_items').remove({ id }).write();
    } else if (action === 'update_status' && data?.status) {
      db.get('content_items').find({ id }).assign({ status: data.status, updated_at: now() }).write();
    } else if (action === 'update' && data) {
      db.get('content_items').find({ id }).assign({ ...data, updated_at: now() }).write();
    }
    updated++;
  });

  res.json({ updated });
});

module.exports = router;
