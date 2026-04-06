const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.get('projects').orderBy('created_at', 'desc').value());
});

router.get('/:id', (req, res) => {
  const project = db.get('projects').find({ id: req.params.id }).value();
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

router.post('/', (req, res) => {
  const { name, client, status, value, start_date, end_date, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const project = {
    id: uuidv4(), name, client: client || '', status: status || 'Active',
    value: parseFloat(value) || 0, start_date: start_date || '', end_date: end_date || '',
    notes: notes || '', created_at: now(), updated_at: now(),
  };
  db.get('projects').push(project).write();
  res.status(201).json(project);
});

router.put('/:id', (req, res) => {
  const existing = db.get('projects').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const update = { ...req.body, updated_at: now() };
  if (update.value !== undefined) update.value = parseFloat(update.value) || 0;
  db.get('projects').find({ id: req.params.id }).assign(update).write();
  res.json(db.get('projects').find({ id: req.params.id }).value());
});

router.delete('/:id', (req, res) => {
  db.get('projects').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
