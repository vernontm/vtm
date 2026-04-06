const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

// ── Groups ────────────────────────────────────────────────────────────────────

router.get('/groups', (req, res) => {
  res.json(db.get('todo_groups').orderBy('sort_order', 'asc').value());
});

router.post('/groups', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const count = db.get('todo_groups').size().value();
  const group = { id: uuidv4(), name, color: color || '#c8f135', sort_order: count, created_at: now() };
  db.get('todo_groups').push(group).write();
  res.status(201).json(group);
});

router.put('/groups/:id', (req, res) => {
  const existing = db.get('todo_groups').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.get('todo_groups').find({ id: req.params.id }).assign(req.body).write();
  res.json(db.get('todo_groups').find({ id: req.params.id }).value());
});

router.delete('/groups/:id', (req, res) => {
  db.get('todos').remove({ group_id: req.params.id }).write();
  db.get('todo_groups').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── Todos ─────────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { group_id, deal_id } = req.query;
  let q = db.get('todos');
  if (group_id) q = q.filter({ group_id });
  if (deal_id)  q = q.filter({ deal_id });
  res.json(q.orderBy('sort_order', 'asc').value());
});

router.post('/', (req, res) => {
  const { group_id, deal_id, title, status, priority, due_date, owner, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  const count = db.get('todos').filter({ group_id: group_id || null }).size().value();
  const todo = {
    id: uuidv4(), group_id: group_id || null, deal_id: deal_id || null, title,
    status: status || 'Not Started',
    priority: priority || 'Medium',
    due_date: due_date || '',
    owner: owner || '',
    notes: notes || '',
    completed: false,
    sort_order: count,
    created_at: now(), updated_at: now(),
  };
  db.get('todos').push(todo).write();
  res.status(201).json(todo);
});

router.put('/:id', (req, res) => {
  const existing = db.get('todos').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.get('todos').find({ id: req.params.id }).assign({ ...req.body, updated_at: now() }).write();
  res.json(db.get('todos').find({ id: req.params.id }).value());
});

router.delete('/:id', (req, res) => {
  db.get('todos').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
