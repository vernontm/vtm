const express = require('express');
const router  = express.Router();
const { db, uuidv4, now } = require('../db');

// GET /api/quick-notes
router.get('/', (req, res) => {
  const notes = db.get('quick_notes').orderBy(['pinned', 'updated_at'], ['desc', 'desc']).value();
  res.json(notes);
});

// POST /api/quick-notes
router.post('/', (req, res) => {
  const note = {
    id:         uuidv4(),
    title:      req.body.title   || '',
    content:    req.body.content || '',
    color:      req.body.color   || '#579bfc',
    pinned:     req.body.pinned  || false,
    created_at: now(),
    updated_at: now(),
  };
  db.get('quick_notes').push(note).write();
  res.status(201).json(note);
});

// PUT /api/quick-notes/:id
router.put('/:id', (req, res) => {
  const existing = db.get('quick_notes').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const update = { ...req.body, updated_at: now() };
  db.get('quick_notes').find({ id: req.params.id }).assign(update).write();
  res.json(db.get('quick_notes').find({ id: req.params.id }).value());
});

// DELETE /api/quick-notes/:id
router.delete('/:id', (req, res) => {
  db.get('quick_notes').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
