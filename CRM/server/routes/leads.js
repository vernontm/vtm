const express = require('express');
const { db, uuidv4, now } = require('../db');
const { syncLeadGmail } = require('../services/gmailThreadSync');
const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.get('leads').orderBy('created_at', 'desc').value());
});

router.get('/:id', (req, res) => {
  const lead = db.get('leads').find({ id: req.params.id }).value();
  if (!lead) return res.status(404).json({ error: 'Not found' });
  res.json(lead);
});

router.post('/', (req, res) => {
  const { name, status, company, title, email, phone, lead_source, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const lead = {
    id: uuidv4(), name, status: status || 'New Lead',
    company: company || '', title: title || '', email: email || '',
    phone: phone || '', lead_source: lead_source || '', notes: notes || '',
    created_at: now(), updated_at: now(),
  };
  db.get('leads').push(lead).write();
  res.status(201).json(lead);
});

router.put('/:id', (req, res) => {
  const existing = db.get('leads').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.get('leads').find({ id: req.params.id }).assign({ ...req.body, updated_at: now() }).write();
  res.json(db.get('leads').find({ id: req.params.id }).value());
});

router.delete('/:id', (req, res) => {
  db.get('leads').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── POST /api/leads/bulk  (bulk import with dedup + merge) ───────────────────
router.post('/bulk', (req, res) => {
  const { leads: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: 'No leads provided' });

  const VALID_STATUSES = ['New Lead', 'Contacted', 'Qualified', 'Unqualified', 'Converted'];
  const SURVEY_FIELDS = [
    'submission_date','budget','time_available','location','tiktok_handle',
    'has_business','website','social_media','current_situation','financial_goal',
    'why_now','skills_story','previous_attempts','biggest_fear','tech_comfort',
    'content_preference','work_style','biggest_wish',
  ];
  const ALL_FIELDS = ['name','email','phone','company','title','lead_source','notes',...SURVEY_FIELDS];

  const str = v => String(v || '').trim();
  let created = 0, updated = 0, skipped = 0;

  rows.forEach(row => {
    if (!row.name) return;

    const emailKey = str(row.email).toLowerCase();

    // Check if a lead with this email already exists in the DB
    const existing = emailKey
      ? db.get('leads').find(l => l.email && l.email.toLowerCase() === emailKey).value()
      : null;

    if (existing) {
      // Merge: fill in any fields that are blank on the existing lead
      const updates = {};
      ALL_FIELDS.forEach(f => {
        const newVal = str(row[f]);
        if (newVal && !existing[f]) updates[f] = newVal;
      });
      if (Object.keys(updates).length > 0) {
        db.get('leads').find({ id: existing.id }).assign({ ...updates, updated_at: now() }).write();
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Create new lead
      const lead = {
        id: uuidv4(),
        name:               str(row.name),
        status:             VALID_STATUSES.includes(row.status) ? row.status : 'New Lead',
        email:              str(row.email),
        phone:              str(row.phone),
        company:            str(row.company),
        title:              str(row.title),
        lead_source:        str(row.lead_source || row.source),
        notes:              str(row.notes),
        submission_date:    str(row.submission_date),
        budget:             str(row.budget),
        time_available:     str(row.time_available),
        location:           str(row.location),
        tiktok_handle:      str(row.tiktok_handle),
        has_business:       str(row.has_business),
        website:            str(row.website),
        social_media:       str(row.social_media),
        current_situation:  str(row.current_situation),
        financial_goal:     str(row.financial_goal),
        why_now:            str(row.why_now),
        skills_story:       str(row.skills_story),
        previous_attempts:  str(row.previous_attempts),
        biggest_fear:       str(row.biggest_fear),
        tech_comfort:       str(row.tech_comfort),
        content_preference: str(row.content_preference),
        work_style:         str(row.work_style),
        biggest_wish:       str(row.biggest_wish),
        created_at: now(), updated_at: now(),
      };
      db.get('leads').push(lead).write();
      created++;
    }
  });

  res.status(201).json({ created, updated, skipped, total: created + updated + skipped });
});

// ── POST /api/leads/:id/sync-gmail ───────────────────────────────────────────
router.post('/:id/sync-gmail', async (req, res) => {
  const lead = db.get('leads').find({ id: req.params.id }).value();
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  try {
    const result = await syncLeadGmail(lead);

    const updates = { updated_at: now() };

    if (result.hasReply) {
      updates.last_reply_at             = result.last_reply_at;
      updates.last_reply_subject        = result.last_reply_subject;
      updates.last_reply_summary        = result.last_reply_summary;
      updates.last_reply_thread_id      = result.last_reply_thread_id      || null;
      updates.last_reply_message_id     = result.last_reply_message_id     || null;
      updates.last_reply_rfc_message_id = result.last_reply_rfc_message_id || null;
    }

    if (result.hasSent) {
      updates.last_sent_at              = result.last_sent_at;
      updates.last_sent_subject         = result.last_sent_subject;
      updates.last_sent_preview         = result.last_sent_preview;
      updates.last_sent_thread_id       = result.last_sent_thread_id       || null;
      updates.last_sent_message_id      = result.last_sent_message_id      || null;
      updates.last_sent_rfc_message_id  = result.last_sent_rfc_message_id  || null;
    }

    if (result.hasReply || result.hasSent) {
      db.get('leads').find({ id: lead.id }).assign(updates).write();
    }

    res.json(result);
  } catch (err) {
    console.error('Gmail sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/convert', (req, res) => {
  const lead = db.get('leads').find({ id: req.params.id }).value();
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const contact = {
    id: uuidv4(), name: lead.name, email: lead.email, phone: lead.phone,
    company: lead.company, title: lead.title, notes: lead.notes,
    created_at: now(), updated_at: now(),
  };
  db.get('contacts').push(contact).write();
  db.get('leads').find({ id: lead.id }).assign({ status: 'Converted', updated_at: now() }).write();
  res.json({ contact, message: 'Converted to contact' });
});

module.exports = router;
