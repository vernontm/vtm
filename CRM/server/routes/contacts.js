const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.get('contacts').orderBy('created_at', 'desc').value());
});

router.get('/:id', (req, res) => {
  const contact = db.get('contacts').find({ id: req.params.id }).value();
  if (!contact) return res.status(404).json({ error: 'Not found' });
  res.json(contact);
});

router.post('/', (req, res) => {
  const { name, email, phone, company, title, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const contact = {
    id: uuidv4(), name, email: email || '', phone: phone || '',
    company: company || '', title: title || '', notes: notes || '',
    created_at: now(), updated_at: now(),
  };
  db.get('contacts').push(contact).write();
  res.status(201).json(contact);
});

router.put('/:id', (req, res) => {
  const existing = db.get('contacts').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.get('contacts').find({ id: req.params.id }).assign({ ...req.body, updated_at: now() }).write();
  res.json(db.get('contacts').find({ id: req.params.id }).value());
});

router.delete('/:id', (req, res) => {
  db.get('contacts').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
