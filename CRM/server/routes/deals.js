const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.get('deals').orderBy('created_at', 'desc').value());
});

router.get('/:id', (req, res) => {
  const deal = db.get('deals').find({ id: req.params.id }).value();
  if (!deal) return res.status(404).json({ error: 'Not found' });
  res.json(deal);
});

router.post('/', (req, res) => {
  const { name, stage, value, owner, contact_id, company, notes, created_date, payment_status, amount_paid } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const deal = {
    id: uuidv4(), name, stage: stage || 'New',
    value: parseFloat(value) || 0, owner: owner || '',
    contact_id: contact_id || '', company: company || '', notes: notes || '',
    created_date: created_date || now().slice(0, 10),
    payment_status: payment_status || 'Pending',
    amount_paid: parseFloat(amount_paid) || 0,
    created_at: now(), updated_at: now(),
  };
  db.get('deals').push(deal).write();
  res.status(201).json(deal);
});

router.put('/:id', (req, res) => {
  const existing = db.get('deals').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const update = { ...req.body, updated_at: now() };
  if (update.value !== undefined) update.value = parseFloat(update.value) || 0;
  if (update.amount_paid !== undefined) update.amount_paid = parseFloat(update.amount_paid) || 0;
  db.get('deals').find({ id: req.params.id }).assign(update).write();
  res.json(db.get('deals').find({ id: req.params.id }).value());
});

router.delete('/:id', (req, res) => {
  db.get('deals').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
