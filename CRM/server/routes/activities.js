const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const { entity_type, entity_id } = req.query;
  let activities = db.get('activities');
  if (entity_type && entity_id) activities = activities.filter({ entity_type, entity_id });
  else if (entity_type) activities = activities.filter({ entity_type });
  res.json(activities.orderBy('date', 'desc').value());
});

router.post('/', (req, res) => {
  const { entity_type, entity_id, type, notes, date } = req.body;
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type and entity_id required' });
  const activity = {
    id: uuidv4(), entity_type, entity_id, type: type || 'Note',
    notes: notes || '', date: date || now(), created_at: now(),
  };
  db.get('activities').push(activity).write();
  res.status(201).json(activity);
});

router.delete('/:id', (req, res) => {
  db.get('activities').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
