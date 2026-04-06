const express  = require('express');
const router   = express.Router();
const { db, uuidv4, now } = require('../db');
const { sendEmail, createDraft, getSetting } = require('../services/gmailClient');

// ── GET /api/email-queue ──────────────────────────────────────────────────────
// Query params: segment, email_type, status, sort, search
router.get('/', (req, res) => {
  const { segment, email_type, status, sort = 'confidence', search } = req.query;

  let results = db.get('email_queue').value();

  // Build leadsMap FIRST so we can filter by live lead_status below
  const leadsMap = {};
  db.get('leads').value().forEach(l => { leadsMap[l.id] = l; });

  // Enrich each item with current lead_status + call_completed from the leads table
  results = results.map(item => ({
    ...item,
    lead_status:    leadsMap[item.lead_id]?.status        || item.lead_status    || '',
    call_completed: leadsMap[item.lead_id]?.call_completed ?? item.call_completed ?? false,
  }));

  // Filter by live lead_status (case-insensitive) instead of AI-computed lead_segment
  if (segment && segment !== 'all') {
    results = results.filter(i => (i.lead_status || '').toLowerCase() === segment.toLowerCase());
  }
  if (email_type && email_type !== 'all') results = results.filter(i => i.email_type === email_type);
  if (status    && status    !== 'all') results = results.filter(i => i.status === status);
  if (search) {
    const s = search.toLowerCase();
    results = results.filter(i =>
      (i.lead_name  || '').toLowerCase().includes(s) ||
      (i.lead_email || '').toLowerCase().includes(s)
    );
  }

  // Sort
  if (sort === 'confidence') {
    results.sort((a, b) => b.confidence_score - a.confidence_score);
  } else if (sort === 'date') {
    results.sort((a, b) => (b.generated_at || '').localeCompare(a.generated_at || ''));
  } else if (sort === 'alpha') {
    results.sort((a, b) => (a.lead_name || '').localeCompare(b.lead_name || ''));
  } else if (sort === 'submission') {
    results.sort((a, b) => {
      const la = leadsMap[a.lead_id] || {};
      const lb = leadsMap[b.lead_id] || {};
      const da = la.submission_date || la.created_at || '';
      const db_ = lb.submission_date || lb.created_at || '';
      return db_.localeCompare(da);
    });
  }

  res.json(results);
});

// ── POST /api/email-queue ─────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const item = {
    id:                       uuidv4(),
    lead_id:                  req.body.lead_id || '',
    lead_name:                req.body.lead_name || '',
    lead_email:               req.body.lead_email || '',
    lead_segment:             req.body.lead_segment || 'cold',
    email_type:               req.body.email_type || 'cold_outreach',
    subject_lines:            req.body.subject_lines || [],
    selected_subject_index:   req.body.selected_subject_index ?? 0,
    body:                     req.body.body || '',
    reasoning:                req.body.reasoning || '',
    confidence_score:         req.body.confidence_score || 0,
    personalization_hooks_used: req.body.personalization_hooks_used || [],
    suggested_next_action:    req.body.suggested_next_action || '',
    status:                   'draft',
    gmail_draft_id:           null,
    gmail_message_id:         null,
    reply_thread_id:          req.body.reply_thread_id      || null,
    reply_rfc_message_id:     req.body.reply_rfc_message_id || null,
    generated_at:             req.body.generated_at || now(),
    approved_at:              null,
    sent_at:                  null,
    created_at:               now(),
    updated_at:               now(),
  };
  db.get('email_queue').push(item).write();
  res.status(201).json(item);
});

// ── PUT /api/email-queue/:id ─────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const existing = db.get('email_queue').find({ id: req.params.id }).value();
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const updates = { ...req.body, updated_at: now() };

  // Stamp approved_at when first approved
  if (req.body.status === 'approved' && !existing.approved_at) {
    updates.approved_at = now();
  }

  db.get('email_queue').find({ id: req.params.id }).assign(updates).write();
  const updated = db.get('email_queue').find({ id: req.params.id }).value();

  // Auto-draft: when approved + setting is ON, push to Gmail Drafts in background
  if (req.body.status === 'approved' && getSetting('auto_draft_enabled') === 'true' && updated.lead_email) {
    const subject = updated.subject_lines[updated.selected_subject_index] || updated.subject_lines[0] || '';
    createDraft({
      to:         updated.lead_email,
      subject,
      body:       updated.body,
      threadId:   updated.reply_thread_id      || undefined,
      inReplyTo:  updated.reply_rfc_message_id || undefined,
      references: updated.reply_rfc_message_id || undefined,
    })
      .then(draft => {
        db.get('email_queue').find({ id: req.params.id }).assign({ gmail_draft_id: draft.id }).write();
        console.log(`📝 Auto-draft created for ${updated.lead_name}: ${draft.id}`);
      })
      .catch(err => console.error('Auto-draft failed:', err.message));
  }

  res.json(updated);
});

// ── DELETE /api/email-queue/:id ───────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  db.get('email_queue').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── POST /api/email-queue/:id/send → send via Gmail API ──────────────────────
router.post('/:id/send', async (req, res) => {
  const item = db.get('email_queue').find({ id: req.params.id }).value();
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!item.lead_email) return res.status(400).json({ error: 'Lead has no email address' });

  // Daily send cap check
  const cap      = parseInt(getSetting('daily_send_cap') || '50');
  const todayStr = new Date().toISOString().slice(0, 10);
  const sentToday = db.get('communication_log')
    .filter(e => e.direction === 'outbound' && (e.sent_at || '').startsWith(todayStr))
    .value().length;

  if (sentToday >= cap) {
    return res.status(429).json({
      error: `Daily send cap of ${cap} reached (${sentToday} sent today). Cap resets at midnight.`
    });
  }

  try {
    const subject = item.subject_lines[item.selected_subject_index] || item.subject_lines[0] || '(no subject)';
    const result  = await sendEmail({
      to:         item.lead_email,
      subject,
      body:       item.body,
      threadId:   item.reply_thread_id      || undefined,
      inReplyTo:  item.reply_rfc_message_id || undefined,
      references: item.reply_rfc_message_id || undefined,
    });
    const sentAt  = now();

    // Update queue item
    db.get('email_queue').find({ id: req.params.id }).assign({
      status:          'sent',
      sent_at:         sentAt,
      gmail_message_id: result.id,
      updated_at:      now(),
    }).write();

    // Log to communication_log
    db.get('communication_log').push({
      id:               uuidv4(),
      lead_id:          item.lead_id,
      queue_item_id:    item.id,
      direction:        'outbound',
      subject,
      body_preview:     (item.body || '').slice(0, 200),
      gmail_message_id: result.id,
      sent_at:          sentAt,
      reply_received:   false,
      reply_received_at: null,
      created_at:       now(),
    }).write();

    // Update lead's last_contact_date + emails_sent_count
    const lead = db.get('leads').find({ id: item.lead_id }).value();
    if (lead) {
      db.get('leads').find({ id: item.lead_id }).assign({
        last_contact_date: sentAt,
        emails_sent_count: (parseInt(lead.emails_sent_count) || 0) + 1,
        updated_at:        now(),
      }).write();
    }

    console.log(`📬 Email sent to ${item.lead_email} (Gmail msg: ${result.id})`);
    res.json({ success: true, message_id: result.id });
  } catch (err) {
    console.error('Send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/email-queue/:id/draft → save to Gmail Drafts ───────────────────
router.post('/:id/draft', async (req, res) => {
  const item = db.get('email_queue').find({ id: req.params.id }).value();
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!item.lead_email) return res.status(400).json({ error: 'Lead has no email address' });

  try {
    const subject = item.subject_lines[item.selected_subject_index] || item.subject_lines[0] || '(no subject)';
    const draft   = await createDraft({
      to:         item.lead_email,
      subject,
      body:       item.body,
      threadId:   item.reply_thread_id      || undefined,
      inReplyTo:  item.reply_rfc_message_id || undefined,
      references: item.reply_rfc_message_id || undefined,
    });

    db.get('email_queue').find({ id: req.params.id }).assign({
      gmail_draft_id: draft.id,
      status:         'approved',
      approved_at:    now(),
      updated_at:     now(),
    }).write();

    console.log(`📝 Draft saved for ${item.lead_email}: ${draft.id}`);
    res.json({ success: true, draft_id: draft.id });
  } catch (err) {
    console.error('Draft error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
