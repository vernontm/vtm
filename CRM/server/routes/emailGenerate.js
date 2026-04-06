const express  = require('express');
const router   = express.Router();
const { db, uuidv4, now } = require('../db');
const { generateEmailForLead } = require('../services/emailGenerator');
const { scoreLead }            = require('../services/leadScorer');

// In-memory batch job store — survives for 24h then is cleaned up
const batchJobs = new Map();

// ── POST /api/email-generate/single ─────────────────────────────────────────
router.post('/single', async (req, res) => {
  const { lead_id, focus, extra_context } = req.body;
  if (!lead_id) return res.status(400).json({ error: 'lead_id required' });

  const lead = db.get('leads').find({ id: lead_id }).value();
  if (!lead)  return res.status(404).json({ error: 'Lead not found' });
  if (!lead.email) return res.status(400).json({ error: 'Lead has no email address' });

  try {
    const generated          = await generateEmailForLead(lead, { focus, extra_context });
    const { score, segment } = scoreLead(lead);

    // When focus is 'reply' or 'sent', attach the matching Gmail thread so the
    // email can be sent/drafted in-thread rather than as a new message.
    let threadInfo = {};
    if (focus === 'reply' && lead.last_reply_thread_id) {
      threadInfo = {
        reply_thread_id:      lead.last_reply_thread_id,
        reply_rfc_message_id: lead.last_reply_rfc_message_id || null,
      };
    } else if (focus === 'sent' && lead.last_sent_thread_id) {
      threadInfo = {
        reply_thread_id:      lead.last_sent_thread_id,
        reply_rfc_message_id: lead.last_sent_rfc_message_id || null,
      };
    }

    const item = buildQueueItem(lead, generated, segment, threadInfo);
    db.get('email_queue').push(item).write();

    // Update lead score
    db.get('leads').find({ id: lead.id }).assign({
      lead_score:   score,
      lead_segment: segment,
      updated_at:   now(),
    }).write();

    res.status(201).json(item);
  } catch (err) {
    console.error('Single generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/email-generate/batch ──────────────────────────────────────────
// Body: { mode: 'all'|'segment'|'individual', segment?: string, lead_ids?: string[] }
router.post('/batch', (req, res) => {
  const { mode, segment, lead_ids } = req.body;

  let leads = db.get('leads').filter(l => !l.archived && l.email).value();

  if (mode === 'segment' && segment) {
    leads = leads.filter(l => {
      const { segment: seg } = scoreLead(l);
      return seg === segment;
    });
  } else if (mode === 'individual' && Array.isArray(lead_ids)) {
    leads = leads.filter(l => lead_ids.includes(l.id));
  }
  // mode === 'all' uses all leads

  if (leads.length === 0) {
    return res.status(400).json({ error: 'No eligible leads found for this selection' });
  }

  const jobId = uuidv4();
  batchJobs.set(jobId, { total: leads.length, completed: 0, errors: 0, done: false });

  // Fire-and-forget background processing
  processBatch(jobId, leads);

  // Auto-cleanup after 24 hours
  setTimeout(() => batchJobs.delete(jobId), 24 * 60 * 60 * 1000);

  res.status(202).json({ jobId, total: leads.length });
});

// ── GET /api/email-generate/progress/:jobId ──────────────────────────────────
router.get('/progress/:jobId', (req, res) => {
  const job = batchJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or expired' });
  res.json({
    jobId:     req.params.jobId,
    total:     job.total,
    completed: job.completed,
    errors:    job.errors,
    done:      job.done,
    percent:   job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0,
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildQueueItem(lead, generated, segment, threadInfo = {}) {
  return {
    id:                       uuidv4(),
    lead_id:                  lead.id,
    lead_name:                lead.name,
    lead_email:               lead.email,
    lead_segment:             segment,
    email_type:               generated.email_type,
    subject_lines:            generated.subject_lines,
    selected_subject_index:   0,
    body:                     generated.body,
    reasoning:                generated.reasoning || '',
    confidence_score:         generated.confidence_score || 70,
    personalization_hooks_used: generated.personalization_hooks_used || [],
    suggested_next_action:    generated.suggested_next_action || '',
    status:                   'draft',
    gmail_draft_id:           null,
    gmail_message_id:         null,
    // Threading: set when this email is a follow-up to an existing Gmail thread
    reply_thread_id:          threadInfo.reply_thread_id      || null,
    reply_rfc_message_id:     threadInfo.reply_rfc_message_id || null,
    generated_at:             now(),
    approved_at:              null,
    sent_at:                  null,
    created_at:               now(),
    updated_at:               now(),
  };
}

async function processBatch(jobId, leads) {
  const BATCH_SIZE = 10;
  const DELAY_MS   = 1200; // slight buffer for rate limiting

  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const job = batchJobs.get(jobId);
    if (!job) break; // job was cleaned up

    const group = leads.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(group.map(async (lead) => {
      const j = batchJobs.get(jobId);
      try {
        const generated          = await generateEmailForLead(lead);
        const { score, segment } = scoreLead(lead);
        const item               = buildQueueItem(lead, generated, segment);

        db.get('email_queue').push(item).write();
        db.get('leads').find({ id: lead.id }).assign({
          lead_score:   score,
          lead_segment: segment,
          updated_at:   now(),
        }).write();

        if (j) j.completed++;
      } catch (err) {
        console.error(`Batch gen error for ${lead.name} (${lead.id}):`, err.message);
        if (j) { j.completed++; j.errors++; }
      }
    }));

    // Delay between groups (skip after last group)
    if (i + BATCH_SIZE < leads.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  const job = batchJobs.get(jobId);
  if (job) job.done = true;
  console.log(`[batch] Job ${jobId} complete — ${job?.completed ?? '?'} processed, ${job?.errors ?? 0} errors`);
}

module.exports = router;
