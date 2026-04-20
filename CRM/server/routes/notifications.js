const express = require('express');
const router  = express.Router();
const { db }  = require('../db');

// ── Helpers ───────────────────────────────────────────────────────────────────
const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
const daysAgo     = (iso)  => iso ? daysBetween(new Date(iso), new Date()) : 0;
const daysUntil   = (iso)  => iso ? daysBetween(new Date(), new Date(iso)) : 999;

// GET /api/notifications
router.get('/', (req, res) => {
  const now      = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const results  = [];

  const deals    = db.get('deals').filter(d => !d.archived).value();
  const projects = db.get('projects').filter(p => !p.archived).value();
  const leads    = db.get('leads').filter(l => !l.archived).value();
  const invoices = db.get('invoices').value();
  const dismissed = db.get('dismissed_notifications').value() || [];

  // ── Rule 1: Won/Completed deal — never paid ───────────────────────────────
  deals
    .filter(d => ['Won', 'Completed'].includes(d.stage) && d.payment_status === 'Pending')
    .forEach(d => {
      const age = daysAgo(d.updated_at || d.created_at);
      if (age < 3) return;
      results.push({
        id:          `unpaid_${d.id}`,
        type:        'payment_overdue',
        priority:    'high',
        title:       `Payment never received — ${d.name}`,
        message:     `$${(d.value || 0).toLocaleString()} deal closed ${age}d ago. No payment recorded yet.`,
        link:        '/deals',
        entity_id:   d.id,
        entity_name: d.name,
        entity_type: 'deal',
        days:        age,
      });
    });

  // ── Rule 2: Partial payment stalled ──────────────────────────────────────
  deals
    .filter(d => d.payment_status === 'Partial Paid')
    .forEach(d => {
      const age = daysAgo(d.updated_at || d.created_at);
      if (age < 7) return;
      const remaining = (d.value || 0) - (d.amount_paid || 0);
      results.push({
        id:          `partial_${d.id}`,
        type:        'payment_partial',
        priority:    'medium',
        title:       `Balance still owed — ${d.name}`,
        message:     `$${(d.amount_paid || 0).toLocaleString()} of $${(d.value || 0).toLocaleString()} received. $${remaining.toLocaleString()} outstanding for ${age}d.`,
        link:        '/deals',
        entity_id:   d.id,
        entity_name: d.name,
        entity_type: 'deal',
        days:        age,
      });
    });

  // ── Rule 3: Project overdue ───────────────────────────────────────────────
  projects
    .filter(p => !['Completed', 'Cancelled'].includes(p.status) && p.end_date && p.end_date < todayISO)
    .forEach(p => {
      const age = daysUntil(p.end_date) * -1; // negative → past
      const overdue = Math.abs(daysUntil(p.end_date));
      results.push({
        id:          `proj_overdue_${p.id}`,
        type:        'project_overdue',
        priority:    'high',
        title:       `Project past due — ${p.name}`,
        message:     `Was due ${p.end_date}. Status: ${p.status}. ${overdue}d overdue.`,
        link:        '/projects',
        entity_id:   p.id,
        entity_name: p.name,
        entity_type: 'project',
        days:        overdue,
      });
    });

  // ── Rule 4: Project due within 7 days ────────────────────────────────────
  projects
    .filter(p => !['Completed', 'Cancelled'].includes(p.status) && p.end_date && p.end_date >= todayISO)
    .forEach(p => {
      const remaining = daysUntil(p.end_date);
      if (remaining > 7) return;
      results.push({
        id:          `proj_soon_${p.id}`,
        type:        'project_due_soon',
        priority:    remaining <= 2 ? 'high' : 'medium',
        title:       `Project due ${remaining === 0 ? 'today' : `in ${remaining}d`} — ${p.name}`,
        message:     `Deadline: ${p.end_date}. Status: ${p.status}.`,
        link:        '/projects',
        entity_id:   p.id,
        entity_name: p.name,
        entity_type: 'project',
        days:        remaining,
      });
    });

  // ── Rule 5: Stale leads (New Lead, no activity) ───────────────────────────
  leads
    .filter(l => l.status === 'New Lead')
    .forEach(l => {
      const age = daysAgo(l.updated_at || l.created_at);
      if (age < 3) return;
      results.push({
        id:          `stale_lead_${l.id}`,
        type:        'stale_lead',
        priority:    age >= 14 ? 'high' : age >= 7 ? 'medium' : 'low',
        title:       `Lead needs follow-up — ${l.name}`,
        message:     `Still "New Lead" with no activity for ${age}d.${l.company ? ` (${l.company})` : ''}`,
        link:        '/leads',
        entity_id:   l.id,
        entity_name: l.name,
        entity_type: 'lead',
        days:        age,
      });
    });

  // ── Rule 6: Unpaid Stripe invoices ───────────────────────────────────────
  invoices
    .filter(i => i.status === 'open')
    .forEach(i => {
      const age = daysAgo(i.created_at);
      if (age < 5) return;
      const deal = deals.find(d => d.id === i.deal_id);
      results.push({
        id:          `invoice_${i.id}`,
        type:        'invoice_unpaid',
        priority:    age >= 21 ? 'high' : 'medium',
        title:       `Invoice unpaid — ${deal?.name || 'Unknown deal'}`,
        message:     `$${(i.amount || 0).toLocaleString()} Stripe invoice sent ${age}d ago, still unpaid.`,
        link:        '/deals',
        entity_id:   i.id,
        entity_name: deal?.name || '',
        entity_type: 'invoice',
        days:        age,
      });
    });

  // ── Rule 7a: Follow-up due (13 days since last call, status = Follow Up) ──
  leads
    .filter(l => l.status === 'Follow Up' && l.last_call_date)
    .forEach(l => {
      const age = daysAgo(l.last_call_date);
      if (age < 13) return;
      results.push({
        id:          `followup_${l.id}_${l.last_call_date}`,
        type:        'followup_due',
        priority:    age >= 20 ? 'high' : 'medium',
        title:       `Follow up with ${l.name}`,
        message:     `Marked as "Follow Up" — ${age} days since last call. Reach out today.${l.company ? ` (${l.company})` : ''}`,
        link:        '/leads',
        entity_id:   l.id,
        entity_name: l.name,
        entity_type: 'lead',
        days:        age,
      });
    });

  // ── Rule 7b: No-answer retry (call went unanswered, circle back) ──────────
  leads
    .filter(l => l.last_call_outcome === 'no_answer' && l.last_call_date)
    .filter(l => !['Won', 'Not Interested', 'Converted'].includes(l.status))
    .forEach(l => {
      const age = daysAgo(l.last_call_date);
      if (age < 3) return; // let 3 days pass before nagging
      if (age >= 13 && l.status === 'Follow Up') return; // avoid duplicate w/ Rule 7a
      results.push({
        id:          `no_answer_${l.id}_${l.last_call_date}`,
        type:        'no_answer_retry',
        priority:    age >= 7 ? 'high' : 'medium',
        title:       `No answer — retry ${l.name}`,
        message:     `${l.name}${l.company ? ` (${l.company})` : ''} didn't answer ${age}d ago. Try calling again.`,
        link:        '/leads',
        entity_id:   l.id,
        entity_name: l.name,
        entity_type: 'lead',
        days:        age,
      });
    });

  // ── Rule 8: Active pipeline deal going cold ───────────────────────────────
  deals
    .filter(d => ['Discovery', 'Proposal', 'Negotiation'].includes(d.stage))
    .forEach(d => {
      const age = daysAgo(d.updated_at || d.created_at);
      if (age < 14) return;
      results.push({
        id:          `cold_deal_${d.id}`,
        type:        'deal_cold',
        priority:    age >= 30 ? 'high' : 'medium',
        title:       `Deal going cold — ${d.name}`,
        message:     `In "${d.stage}" for ${age}d with no updates. $${(d.value || 0).toLocaleString()} at risk.`,
        link:        '/deals',
        entity_id:   d.id,
        entity_name: d.name,
        entity_type: 'deal',
        days:        age,
      });
    });

  // Filter out dismissed
  const active = results.filter(n => !dismissed.includes(n.id));

  // Sort: high → medium → low, then by days desc
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  active.sort((a, b) => {
    const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
    return pd !== 0 ? pd : b.days - a.days;
  });

  res.json({ notifications: active, total: active.length });
});

// POST /api/notifications/dismiss — dismiss one or all
router.post('/dismiss', (req, res) => {
  const { id, dismissAll } = req.body;

  if (!db.has('dismissed_notifications').value()) {
    db.set('dismissed_notifications', []).write();
  }

  if (dismissAll) {
    // re-compute all current IDs and mark dismissed
    const current = req.body.ids || [];
    const existing = db.get('dismissed_notifications').value();
    const merged = [...new Set([...existing, ...current])];
    db.set('dismissed_notifications', merged).write();
  } else if (id) {
    db.get('dismissed_notifications').push(id).write();
  }

  res.json({ success: true });
});

// DELETE /api/notifications/dismissed — clear all dismissals (reset)
router.delete('/dismissed', (req, res) => {
  db.set('dismissed_notifications', []).write();
  res.json({ success: true });
});

module.exports = router;
