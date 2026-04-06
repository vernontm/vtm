const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

// GET all items for a project
router.get('/', (req, res) => {
  const { project_id } = req.query;
  let items = db.get('project_items');
  if (project_id) items = items.filter({ project_id });
  res.json(items.orderBy('created_at', 'asc').value());
});

// POST create item
router.post('/', (req, res) => {
  const { project_id, name, owner, status, date, text, link } = req.body;
  if (!project_id) return res.status(400).json({ error: 'project_id required' });
  const item = {
    id: uuidv4(), project_id,
    name: name || 'New subitem',
    owner: owner || '',
    status: status || 'Not Started',
    date: date || '',
    text: text || '',
    link: link || '',
    created_at: now(), updated_at: now(),
  };
  db.get('project_items').push(item).write();
  res.status(201).json(item);
});

// PUT update item
router.put('/:id', (req, res) => {
  const existing = db.get('project_items').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.get('project_items').find({ id: req.params.id }).assign({ ...req.body, updated_at: now() }).write();
  res.json(db.get('project_items').find({ id: req.params.id }).value());
});

// DELETE item
router.delete('/:id', (req, res) => {
  db.get('project_items').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
