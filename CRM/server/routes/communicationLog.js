const express = require('express');
const router  = express.Router();
const { db, uuidv4, now } = require('../db');

// GET /api/communication-log?lead_id=xxx
router.get('/', (req, res) => {
  const { lead_id } = req.query;
  let q = db.get('communication_log');
  if (lead_id) q = q.filter({ lead_id });
  res.json(q.orderBy('sent_at', 'desc').value());
});

// POST /api/communication-log
router.post('/', (req, res) => {
  const entry = {
    id:               uuidv4(),
    lead_id:          req.body.lead_id || '',
    queue_item_id:    req.body.queue_item_id || null,
    direction:        req.body.direction || 'outbound',
    subject:          req.body.subject || '',
    body_preview:     (req.body.body_preview || '').slice(0, 200),
    gmail_message_id: req.body.gmail_message_id || null,
    sent_at:          req.body.sent_at || now(),
    reply_received:   false,
    reply_received_at: null,
    created_at:       now(),
  };
  db.get('communication_log').push(entry).write();
  res.status(201).json(entry);
});

// PUT /api/communication-log/:id/reply → mark reply received
router.put('/:id/reply', (req, res) => {
  const existing = db.get('communication_log').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.get('communication_log').find({ id: req.params.id }).assign({
    reply_received:    true,
    reply_received_at: now(),
  }).write();
  res.json(db.get('communication_log').find({ id: req.params.id }).value());
});

module.exports = router;
