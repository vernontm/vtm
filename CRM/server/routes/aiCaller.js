const express = require('express');
const router  = express.Router();
const { db, uuidv4, now } = require('../db');
const Anthropic = require('@anthropic-ai/sdk');

const EL_BASE = 'https://api.elevenlabs.io/v1';

// ── Helper: fetch conversation detail from ElevenLabs ─────────────────────────
async function fetchElevenLabsConversation(conversationId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
  const resp = await fetch(`${EL_BASE}/convai/conversations/${conversationId}`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.detail || `ElevenLabs error ${resp.status}`);
  }
  return resp.json();
}

// ── Helper: update a call log entry with transcript data ──────────────────────
function enrichCallLog(logId, data) {
  const transcript    = data.transcript || [];
  const analysis      = data.analysis   || {};
  const meta          = data.metadata   || {};

  const outcome = analysis.call_successful === 'success'  ? 'success'
                : analysis.call_successful === 'failure'  ? 'failed'
                : 'unknown';

  db.get('ai_call_log').find({ id: logId }).assign({
    transcript,
    summary:           analysis.transcript_summary || '',
    outcome,
    call_duration_secs: meta.call_duration_secs || null,
    enriched_at:        now(),
  }).write();

  return db.get('ai_call_log').find({ id: logId }).value();
}

// ── Helper: use Claude to detect if call resulted in an agreed meeting ─────────
async function detectMeetingAgreement(transcript, calledAt) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const lines = transcript
    .map(t => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.message}`)
    .join('\n');

  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Analyze this sales call transcript and determine if the customer agreed to schedule a demo/meeting call.

Call time: ${calledAt}
Transcript:
${lines}

Respond ONLY with valid JSON (no markdown):
{
  "agreed": true or false,
  "confidence": "high" | "medium" | "low",
  "suggested_date": "YYYY-MM-DD or null if not mentioned",
  "suggested_time": "HH:MM (24h) or null if not mentioned",
  "duration_mins": 15 or 30 or 60,
  "notes": "brief reason for your decision"
}`,
    }],
  });

  try {
    const raw = msg.content[0].text.trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Helper: auto-schedule meeting from call analysis ──────────────────────────
async function autoScheduleMeeting({ logEntry, analysis }) {
  if (!analysis?.agreed || !analysis.suggested_date || !analysis.suggested_time) return null;

  try {
    const { createCalendarEvent } = require('../services/calendarClient');
    const start = new Date(`${analysis.suggested_date}T${analysis.suggested_time}:00`);
    const end   = new Date(start.getTime() + (analysis.duration_mins || 30) * 60000);

    const lead = logEntry.lead_id
      ? db.get('leads').find({ id: logEntry.lead_id }).value()
      : null;

    const event = await createCalendarEvent({
      summary:     `Demo Call — ${logEntry.business_name || logEntry.lead_name}`,
      description: `Auto-scheduled from AI call on ${new Date(logEntry.called_at).toLocaleString()}.\n\nCall notes: ${analysis.notes || ''}`,
      start:       start.toISOString(),
      end:         end.toISOString(),
      attendees:   lead?.email ? [lead.email] : [],
      addMeetLink: true,
    });

    // Link to lead if available
    if (lead && event.google_event_id) {
      db.get('meeting_lead_links').push({
        id: uuidv4(),
        meeting_id:      event.google_event_id,
        google_event_id: event.google_event_id,
        lead_id:         lead.id,
        notes:           `Auto-scheduled from AI call (${logEntry.conversation_id})`,
        linked_at:       now(),
        created_at:      now(),
      }).write();
    }

    return event;
  } catch (err) {
    console.error('[AutoSchedule] Failed to create calendar event:', err.message);
    return null;
  }
}

// ── GET /api/ai-caller/config  — return non-secret config to frontend ─────────
router.get('/config', (req, res) => {
  res.json({
    configured: !!(
      process.env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY.startsWith('YOUR_') &&
      process.env.ELEVENLABS_AGENT_ID && !process.env.ELEVENLABS_AGENT_ID.startsWith('YOUR_') &&
      process.env.ELEVENLABS_PHONE_NUMBER_ID && !process.env.ELEVENLABS_PHONE_NUMBER_ID.startsWith('YOUR_')
    ),
    testNumber: process.env.ELEVENLABS_TEST_NUMBER || '',
  });
});

// ── POST /api/ai-caller/call  — initiate outbound call ───────────────────────
router.post('/call', async (req, res) => {
  const { lead_id, lead_name, phone, business_name, niche, customer_first_name } = req.body;

  const apiKey    = process.env.ELEVENLABS_API_KEY;
  const agentId   = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

  if (!apiKey || apiKey.startsWith('YOUR_')) {
    return res.status(400).json({ error: 'ELEVENLABS_API_KEY not configured in server/.env' });
  }
  if (!agentId || agentId.startsWith('YOUR_')) {
    return res.status(400).json({ error: 'ELEVENLABS_AGENT_ID not configured in server/.env' });
  }
  if (!phoneNumId || phoneNumId.startsWith('YOUR_')) {
    return res.status(400).json({ error: 'ELEVENLABS_PHONE_NUMBER_ID not configured in server/.env' });
  }
  if (!phone) {
    return res.status(400).json({ error: 'Lead has no phone number' });
  }

  const payload = {
    agent_id: agentId,
    agent_phone_number_id: phoneNumId,
    to_number: phone,
    conversation_initiation_client_data: {
      dynamic_variables: {
        customer_first_name: customer_first_name || business_name || lead_name || 'there',
        business_name: business_name || lead_name || 'there',
        niche: niche || 'local business',
      },
    },
  };

  let elResponse;
  try {
    const resp = await fetch(`${EL_BASE}/convai/twilio/outbound-call`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    elResponse = await resp.json();

    if (!resp.ok) {
      const msg = elResponse?.detail?.[0]?.msg || elResponse?.message || 'ElevenLabs API error';
      // Still log as failed
      const log = {
        id: uuidv4(),
        lead_id: lead_id || null,
        lead_name: lead_name || 'Unknown',
        phone,
        business_name: business_name || '',
        niche: niche || '',
        conversation_id: null,
        call_sid: null,
        status: 'failed',
        error: msg,
        called_at: now(),
      };
      db.get('ai_call_log').push(log).write();
      return res.status(resp.status).json({ error: msg, log });
    }
  } catch (err) {
    // Network-level failure
    const log = {
      id: uuidv4(),
      lead_id: lead_id || null,
      lead_name: lead_name || 'Unknown',
      phone,
      business_name: business_name || '',
      niche: niche || '',
      conversation_id: null,
      call_sid: null,
      status: 'failed',
      error: err.message,
      called_at: now(),
    };
    db.get('ai_call_log').push(log).write();
    return res.status(500).json({ error: err.message, log });
  }

  // Success
  const log = {
    id: uuidv4(),
    lead_id: lead_id || null,
    lead_name: lead_name || 'Unknown',
    phone,
    business_name: business_name || '',
    niche: niche || '',
    conversation_id: elResponse.conversation_id || null,
    call_sid: elResponse.callSid || null,
    status: 'initiated',
    error: null,
    called_at: now(),
  };
  db.get('ai_call_log').push(log).write();

  res.json({ success: true, log, elevenlabs: elResponse });
});

// ── POST /api/ai-caller/bulk-call  — fire calls up to concurrency limit ──────
router.post('/bulk-call', async (req, res) => {
  const { leads, concurrency = 10 } = req.body; // concurrency = plan limit, default 10

  const apiKey     = process.env.ELEVENLABS_API_KEY;
  const agentId    = process.env.ELEVENLABS_AGENT_ID;
  const phoneNumId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

  if (!apiKey || apiKey.startsWith('YOUR_'))     return res.status(400).json({ error: 'ELEVENLABS_API_KEY not configured' });
  if (!agentId || agentId.startsWith('YOUR_'))   return res.status(400).json({ error: 'ELEVENLABS_AGENT_ID not configured' });
  if (!phoneNumId || phoneNumId.startsWith('YOUR_')) return res.status(400).json({ error: 'ELEVENLABS_PHONE_NUMBER_ID not configured' });
  if (!Array.isArray(leads) || leads.length === 0) return res.status(400).json({ error: 'No leads provided' });

  const limit = Math.min(Math.max(1, parseInt(concurrency) || 10), 300); // clamp 1–300

  async function callOne(lead) {
    const { lead_id, lead_name, phone, business_name, niche, customer_first_name } = lead;
    const payload = {
      agent_id: agentId,
      agent_phone_number_id: phoneNumId,
      to_number: phone,
      conversation_initiation_client_data: {
        dynamic_variables: {
          customer_first_name: customer_first_name || business_name || lead_name || 'there',
          business_name: business_name || lead_name || 'there',
          niche: niche || 'local business',
        },
      },
    };

    try {
      const resp = await fetch(`${EL_BASE}/convai/twilio/outbound-call`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();

      const log = {
        id: uuidv4(),
        lead_id: lead_id || null,
        lead_name: lead_name || 'Unknown',
        phone,
        business_name: business_name || '',
        niche: niche || '',
        conversation_id: data.conversation_id || null,
        call_sid: data.callSid || null,
        status: resp.ok ? 'initiated' : 'failed',
        error: resp.ok ? null : (data?.detail?.[0]?.msg || data?.message || 'API error'),
        called_at: now(),
      };
      db.get('ai_call_log').push(log).write();
      return { ...log, ok: resp.ok };
    } catch (err) {
      const log = {
        id: uuidv4(), lead_id: lead_id || null, lead_name: lead_name || 'Unknown',
        phone, business_name: business_name || '', niche: niche || '',
        conversation_id: null, call_sid: null,
        status: 'failed', error: err.message, called_at: now(),
      };
      db.get('ai_call_log').push(log).write();
      return { ...log, ok: false };
    }
  }

  // Concurrency pool — keeps exactly `limit` calls active at a time
  const results = new Array(leads.length);
  let idx = 0;

  async function worker() {
    while (idx < leads.length) {
      const i = idx++;
      try {
        results[i] = await callOne(leads[i]);
      } catch (err) {
        results[i] = { ok: false, error: err.message };
      }
    }
  }

  const workers = Array(Math.min(limit, leads.length)).fill(null).map(() => worker());
  await Promise.all(workers);

  const succeeded = results.filter(l => l?.ok).length;
  const failed    = results.filter(l => !l?.ok).length;

  res.json({ success: true, total: leads.length, succeeded, failed, concurrency: limit, logs: results });
});

// ── GET /api/ai-caller/conversation/:id  — fetch + cache transcript ──────────
router.get('/conversation/:conversationId', async (req, res) => {
  const { conversationId } = req.params;

  // Find matching log entry
  const logEntry = db.get('ai_call_log').find({ conversation_id: conversationId }).value();
  if (!logEntry) return res.status(404).json({ error: 'Call log entry not found' });

  // Return cached version if already enriched
  if (logEntry.transcript && logEntry.enriched_at) {
    return res.json(logEntry);
  }

  try {
    const data    = await fetchElevenLabsConversation(conversationId);
    const updated = enrichCallLog(logEntry.id, data);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/ai-caller/webhook  — ElevenLabs post-call webhook ──────────────
// Configure in ElevenLabs: Agent → Post-call webhook → http://YOUR_SERVER/api/ai-caller/webhook
router.post('/webhook', async (req, res) => {
  // ElevenLabs sends: { type, event_timestamp, data: { conversation_id, agent_id, status, transcript, analysis, metadata } }
  const body = req.body;
  const data = body?.data || body; // some versions wrap in data, some don't
  const conversationId = data?.conversation_id;

  if (!conversationId) {
    return res.status(400).json({ error: 'No conversation_id in webhook payload' });
  }

  console.log(`[Webhook] Post-call event for conversation: ${conversationId}`);
  res.json({ received: true }); // respond fast — ElevenLabs expects quick reply

  // Process async (don't block the response)
  setImmediate(async () => {
    try {
      // Find log entry
      let logEntry = db.get('ai_call_log').find({ conversation_id: conversationId }).value();

      if (!logEntry) {
        // Call may have been initiated before this server instance — create a shell
        logEntry = {
          id: uuidv4(),
          lead_id: null, lead_name: 'Unknown (webhook)',
          phone: data.metadata?.phone || '',
          business_name: '', niche: '',
          conversation_id: conversationId,
          call_sid: null, status: 'initiated',
          error: null, called_at: data.metadata?.start_time_unix_secs
            ? new Date(data.metadata.start_time_unix_secs * 1000).toISOString()
            : now(),
        };
        db.get('ai_call_log').push(logEntry).write();
      }

      // Use transcript from webhook payload if present, else fetch from API
      const convData = (data.transcript || data.analysis)
        ? data
        : await fetchElevenLabsConversation(conversationId).catch(() => null);

      if (!convData) {
        console.error('[Webhook] Could not get conversation data for', conversationId);
        return;
      }

      const updated = enrichCallLog(logEntry.id, convData);
      console.log(`[Webhook] Enriched call log for ${conversationId} — outcome: ${updated.outcome}`);

      // ── Auto-schedule meeting if customer agreed ─────────────────────────────
      if (!updated.auto_meeting_google_event_id && updated.transcript?.length) {
        const analysis = await detectMeetingAgreement(updated.transcript, updated.called_at);
        console.log(`[Webhook] Meeting analysis for ${conversationId}:`, analysis);

        if (analysis?.agreed && analysis.confidence !== 'low') {
          const event = await autoScheduleMeeting({ logEntry: updated, analysis });
          if (event?.google_event_id) {
            db.get('ai_call_log').find({ id: updated.id }).assign({
              auto_meeting_google_event_id: event.google_event_id,
              auto_meeting_time:            event.start_time,
              auto_meeting_meet_link:       event.meet_link || null,
              meeting_analysis:             analysis,
            }).write();
            console.log(`[Webhook] ✅ Auto-scheduled meeting: ${event.google_event_id}`);
          }
        } else if (analysis) {
          // Store analysis even if no meeting agreed
          db.get('ai_call_log').find({ id: updated.id }).assign({
            meeting_analysis: analysis,
          }).write();
        }
      }
    } catch (err) {
      console.error('[Webhook] Processing error:', err.message);
    }
  });
});

// ── GET /api/ai-caller/lead-statuses  — latest call status per lead ──────────
router.get('/lead-statuses', (req, res) => {
  const logs = db.get('ai_call_log').value();

  // Group by lead_id, keep latest per lead
  const byLead = {};
  logs.forEach(log => {
    if (!log.lead_id) return;
    if (!byLead[log.lead_id] || log.called_at > byLead[log.lead_id].called_at) {
      byLead[log.lead_id] = log;
    }
  });

  // Map to a simple status string
  const result = {};
  Object.entries(byLead).forEach(([leadId, log]) => {
    let callStatus;
    if (log.status === 'failed') {
      callStatus = 'failed';
    } else if (log.meeting_analysis?.agreed) {
      callStatus = 'success';
    } else if (log.outcome === 'success') {
      callStatus = 'success';
    } else {
      callStatus = 'no_answer'; // initiated but no agreement detected
    }
    result[leadId] = {
      callStatus,
      called_at: log.called_at,
      conversation_id: log.conversation_id || null,
    };
  });

  res.json(result);
});

// ── POST /api/ai-caller/retroactive-qualify  — update leads based on call log ─
router.post('/retroactive-qualify', (req, res) => {
  const logs = db.get('ai_call_log').value();

  // Find latest call per lead
  const byLead = {};
  logs.forEach(log => {
    if (!log.lead_id) return;
    if (!byLead[log.lead_id] || log.called_at > byLead[log.lead_id].called_at) {
      byLead[log.lead_id] = log;
    }
  });

  let qualified = 0;
  Object.entries(byLead).forEach(([leadId, log]) => {
    // No answer = initiated but no agreement → Unqualified
    if (log.status === 'initiated' && !log.meeting_analysis?.agreed && log.outcome !== 'success') {
      const lead = db.get('leads').find({ id: leadId }).value();
      if (lead && lead.status !== 'Unqualified') {
        db.get('leads').find({ id: leadId }).assign({ status: 'Unqualified', updated_at: new Date().toISOString() }).write();
        qualified++;
      }
    }
  });

  res.json({ updated: qualified });
});

// ── GET /api/ai-caller/history  — all call logs newest first ─────────────────
router.get('/history', (req, res) => {
  const logs = db.get('ai_call_log').value();
  res.json([...logs].reverse());
});

// ── DELETE /api/ai-caller/history/:id  — delete a log entry ──────────────────
router.delete('/history/:id', (req, res) => {
  db.get('ai_call_log').remove({ id: req.params.id }).write();
  res.json({ success: true });
});

// ── DELETE /api/ai-caller/history  — clear all logs ──────────────────────────
router.delete('/history', (req, res) => {
  db.set('ai_call_log', []).write();
  res.json({ success: true });
});

module.exports = router;
