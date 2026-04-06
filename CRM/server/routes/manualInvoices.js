const express = require('express');
const { db, uuidv4, now } = require('../db');
const router = express.Router();

function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const all = db.get('manual_invoices').filter(i => (i.invoice_number || '').startsWith(`INV-${year}-`)).value();
  const num = all.length + 1;
  return `INV-${year}-${String(num).padStart(3, '0')}`;
}

router.get('/', (req, res) => {
  const { deal_id } = req.query;
  let q = db.get('manual_invoices');
  if (deal_id) q = q.filter({ deal_id });
  res.json(q.orderBy('created_at', 'desc').value());
});

router.get('/:id', (req, res) => {
  const inv = db.get('manual_invoices').find({ id: req.params.id }).value();
  if (!inv) return res.status(404).json({ error: 'Not found' });
  res.json(inv);
});

router.post('/', (req, res) => {
  const items = req.body.items || [];
  const total = items.reduce((s, i) => s + ((i.qty || 1) * (parseFloat(i.rate) || 0)), 0);
  const inv = {
    id:                   uuidv4(),
    deal_id:              req.body.deal_id              || '',
    invoice_number:       req.body.invoice_number       || nextInvoiceNumber(),
    invoice_date:         req.body.invoice_date         || now().slice(0, 10),
    due_date:             req.body.due_date             || '',
    bill_to_name:         req.body.bill_to_name         || '',
    bill_to_email:        req.body.bill_to_email        || '',
    bill_to_address:      req.body.bill_to_address      || '',
    from_name:            req.body.from_name            || 'Vernon Tech & Media',
    from_email:           req.body.from_email           || '',
    from_phone:           req.body.from_phone           || '',
    items,
    notes:                req.body.notes                || '',
    payment_instructions: req.body.payment_instructions || '',
    status:               'draft',
    total,
    created_at: now(),
    updated_at: now(),
  };
  db.get('manual_invoices').push(inv).write();
  res.status(201).json(inv);
});

router.put('/:id', (req, res) => {
  const existing = db.get('manual_invoices').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const update = { ...req.body, updated_at: now() };
  if (update.items) {
    update.total = update.items.reduce((s, i) => s + ((i.qty || 1) * (parseFloat(i.rate) || 0)), 0);
  }
  db.get('manual_invoices').find({ id: req.params.id }).assign(update).write();
  res.json(db.get('manual_invoices').find({ id: req.params.id }).value());
});

router.delete('/:id', (req, res) => {
  db.get('manual_invoices').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

module.exports = router;
