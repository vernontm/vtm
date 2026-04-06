const express = require('express');
const router  = express.Router();
const { db }  = require('../db');

/**
 * GET /api/search?q=term
 * Searches across leads, contacts, deals, accounts, and projects.
 * Returns up to 5 results per category, ordered by relevance (name match first).
 */
router.get('/', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 1) return res.json({ leads: [], contacts: [], deals: [], accounts: [], projects: [] });

  function matches(val) {
    return val && String(val).toLowerCase().includes(q);
  }

  // ── Leads ────────────────────────────────────────────────────────────────────
  const leads = db.get('leads')
    .filter(l => !l.archived && (
      matches(l.name) || matches(l.email) || matches(l.company) ||
      matches(l.phone) || matches(l.location) || matches(l.title)
    ))
    .value()
    .sort((a, b) => {
      // Exact name-start match first
      const aStart = (a.name || '').toLowerCase().startsWith(q);
      const bStart = (b.name || '').toLowerCase().startsWith(q);
      if (aStart && !bStart) return -1;
      if (!aStart && bStart) return  1;
      return (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, 5)
    .map(l => ({
      id:      l.id,
      name:    l.name || '(no name)',
      email:   l.email || '',
      company: l.company || '',
      status:  l.status || '',
      type:    'lead',
    }));

  // ── Contacts ─────────────────────────────────────────────────────────────────
  const contacts = db.get('contacts')
    .filter(c => !c.archived && (
      matches(c.name) || matches(c.email) || matches(c.company) ||
      matches(c.phone) || matches(c.title)
    ))
    .value()
    .sort((a, b) => {
      const aStart = (a.name || '').toLowerCase().startsWith(q);
      const bStart = (b.name || '').toLowerCase().startsWith(q);
      if (aStart && !bStart) return -1;
      if (!aStart && bStart) return  1;
      return (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, 5)
    .map(c => ({
      id:      c.id,
      name:    c.name || '(no name)',
      email:   c.email || '',
      company: c.company || '',
      title:   c.title || '',
      type:    'contact',
    }));

  // ── Deals ─────────────────────────────────────────────────────────────────────
  const deals = db.get('deals')
    .filter(d => !d.archived && (
      matches(d.name) || matches(d.company) || matches(d.notes)
    ))
    .value()
    .sort((a, b) => {
      const aStart = (a.name || '').toLowerCase().startsWith(q);
      const bStart = (b.name || '').toLowerCase().startsWith(q);
      if (aStart && !bStart) return -1;
      if (!aStart && bStart) return  1;
      return (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, 5)
    .map(d => ({
      id:    d.id,
      name:  d.name || '(no name)',
      stage: d.stage || '',
      value: d.value || 0,
      type:  'deal',
    }));

  // ── Accounts ──────────────────────────────────────────────────────────────────
  const accounts = db.get('accounts')
    .filter(a => !a.archived && (
      matches(a.name) || matches(a.industry) || matches(a.website) || matches(a.notes)
    ))
    .value()
    .sort((a, b) => {
      const aStart = (a.name || '').toLowerCase().startsWith(q);
      const bStart = (b.name || '').toLowerCase().startsWith(q);
      if (aStart && !bStart) return -1;
      if (!aStart && bStart) return  1;
      return (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, 5)
    .map(a => ({
      id:       a.id,
      name:     a.name || '(no name)',
      industry: a.industry || '',
      website:  a.website || '',
      type:     'account',
    }));

  // ── Projects ──────────────────────────────────────────────────────────────────
  const projects = db.get('projects')
    .filter(p => !p.archived && (
      matches(p.name) || matches(p.client) || matches(p.notes)
    ))
    .value()
    .sort((a, b) => {
      const aStart = (a.name || '').toLowerCase().startsWith(q);
      const bStart = (b.name || '').toLowerCase().startsWith(q);
      if (aStart && !bStart) return -1;
      if (!aStart && bStart) return  1;
      return (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, 5)
    .map(p => ({
      id:     p.id,
      name:   p.name || '(no name)',
      client: p.client || '',
      status: p.status || '',
      type:   'project',
    }));

  const total = leads.length + contacts.length + deals.length + accounts.length + projects.length;
  res.json({ leads, contacts, deals, accounts, projects, total });
});

module.exports = router;
