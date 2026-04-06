const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.get('accounts').orderBy('created_at', 'desc').value());
});

router.get('/:id', (req, res) => {
  const account = db.get('accounts').find({ id: req.params.id }).value();
  if (!account) return res.status(404).json({ error: 'Not found' });
  res.json(account);
});

router.post('/', (req, res) => {
  const { name, industry, email, phone, address, website, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const account = {
    id: uuidv4(), name, industry: industry || '', email: email || '',
    phone: phone || '', address: address || '', website: website || '', notes: notes || '',
    created_at: now(), updated_at: now(),
  };
  db.get('accounts').push(account).write();
  res.status(201).json(account);
});

router.put('/:id', (req, res) => {
  const existing = db.get('accounts').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.get('accounts').find({ id: req.params.id }).assign({ ...req.body, updated_at: now() }).write();
  res.json(db.get('accounts').find({ id: req.params.id }).value());
});

router.delete('/:id', (req, res) => {
  db.get('accounts').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
