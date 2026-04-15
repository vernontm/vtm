const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');

// GET  /api/crm/email-sequences?client_id=..                  — list sequences w/ stats
// GET  /api/crm/email-sequences?action=detail&id=..           — one sequence + steps + enrollment count
// POST /api/crm/email-sequences                               — create sequence   { client_id, name, trigger_tag, send_days }
// POST /api/crm/email-sequences?action=update                 — update sequence   { id, ...fields }
// POST /api/crm/email-sequences?action=save-step              — upsert step       { sequence_id, id?, step_order, subject, html_body, preview_text, delay_amount, delay_unit }
// POST /api/crm/email-sequences?action=delete-step            — delete step       { id }
// POST /api/crm/email-sequences?action=enroll-matching        — enroll all contacts matching sequence.trigger_tag { sequence_id }
// DELETE /api/crm/email-sequences?id=..                       — delete sequence

function nextSendAt(fromDate, step, sendDays) {
  const amount = step.delay_amount || 0;
  const unit = step.delay_unit || 'days';
  const mult = unit === 'hours' ? 3600_000 : unit === 'minutes' ? 60_000 : 86_400_000; // default days
  let d = new Date(fromDate.getTime() + amount * mult);
  // Shift forward to an allowed day-of-week
  if (Array.isArray(sendDays) && sendDays.length > 0 && sendDays.length < 7) {
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let i = 0; i < 7; i++) {
      if (sendDays.includes(names[d.getDay()])) break;
      d = new Date(d.getTime() + 86_400_000);
    }
  }
  return d;
}

async function statsForSequence(sequenceId) {
  const enrollments = await supaFetch(`crm_email_sequence_enrollments?sequence_id=eq.${sequenceId}&select=id,status`);
  const sends = await supaFetch(`crm_email_sequence_sends?sequence_id=eq.${sequenceId}&select=id,status,opened_at,clicked_at`);
  const subscribers = (enrollments || []).filter(e => e.status !== 'unsubscribed').length;
  const unsubscribers = (enrollments || []).filter(e => e.status === 'unsubscribed').length;
  const total = (sends || []).length;
  const opened = (sends || []).filter(s => s.opened_at).length;
  const clicked = (sends || []).filter(s => s.clicked_at).length;
  return {
    subscribers,
    unsubscribers,
    open_rate: total > 0 ? (opened / total) * 100 : 0,
    click_rate: total > 0 ? (clicked / total) * 100 : 0,
    total_sent: total,
  };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { action, id, client_id } = req.query;

  try {
    // ── GET list ──
    if (req.method === 'GET' && !action) {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      const rows = await supaFetch(`crm_email_sequences?client_id=eq.${client_id}&order=created_at.desc`);
      const out = [];
      for (const seq of rows || []) {
        const steps = await supaFetch(`crm_email_sequence_steps?sequence_id=eq.${seq.id}&order=step_order.asc`);
        const stats = await statsForSequence(seq.id);
        const totalDays = (steps || []).reduce((acc, s) => acc + ((s.delay_unit === 'days' ? (s.delay_amount || 0) : 0)), 0);
        out.push({ ...seq, steps_count: (steps || []).length, total_days: totalDays, ...stats });
      }
      return res.json(out);
    }

    // ── GET detail ──
    if (req.method === 'GET' && action === 'detail') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const rows = await supaFetch(`crm_email_sequences?id=eq.${id}`);
      const seq = rows?.[0];
      if (!seq) return res.status(404).json({ error: 'Not found' });
      const steps = await supaFetch(`crm_email_sequence_steps?sequence_id=eq.${id}&order=step_order.asc`);
      const stats = await statsForSequence(id);
      return res.json({ ...seq, steps: steps || [], ...stats });
    }

    // ── POST create sequence ──
    if (req.method === 'POST' && !action) {
      const { client_id, name, description, trigger_tag, trigger_tags_all, trigger_tags_none, active, send_days } = req.body;
      if (!client_id || !name) return res.status(400).json({ error: 'client_id and name required' });
      const tagsAll = Array.isArray(trigger_tags_all) ? trigger_tags_all : (trigger_tag ? [trigger_tag] : []);
      const rows = await supaFetch('crm_email_sequences', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify([{
          client_id, name,
          description: description || null,
          trigger_tag: tagsAll[0] || null,
          trigger_tags_all: tagsAll,
          trigger_tags_none: Array.isArray(trigger_tags_none) ? trigger_tags_none : [],
          active: !!active,
          send_days: send_days || ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
        }]),
      });
      return res.json(rows?.[0] || {});
    }

    // ── POST update sequence ──
    if (req.method === 'POST' && action === 'update') {
      const { id, name, description, trigger_tag, trigger_tags_all, trigger_tags_none, active, send_days } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const update = { updated_at: new Date().toISOString() };
      if (name !== undefined) update.name = name;
      if (description !== undefined) update.description = description;
      if (trigger_tags_all !== undefined) {
        update.trigger_tags_all = Array.isArray(trigger_tags_all) ? trigger_tags_all : [];
        update.trigger_tag = update.trigger_tags_all[0] || null;
      } else if (trigger_tag !== undefined) {
        update.trigger_tag = trigger_tag || null;
        update.trigger_tags_all = trigger_tag ? [trigger_tag] : [];
      }
      if (trigger_tags_none !== undefined) update.trigger_tags_none = Array.isArray(trigger_tags_none) ? trigger_tags_none : [];
      if (active !== undefined) update.active = !!active;
      if (send_days !== undefined) update.send_days = send_days;
      const rows = await supaFetch(`crm_email_sequences?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(update),
      });
      return res.json(rows?.[0] || { updated: true });
    }

    // ── POST save step (upsert) ──
    if (req.method === 'POST' && action === 'save-step') {
      const { id, sequence_id, step_order, subject, preview_text, html_body, delay_amount, delay_unit } = req.body;
      if (!sequence_id) return res.status(400).json({ error: 'sequence_id required' });
      const payload = {
        sequence_id,
        step_order: step_order ?? 1,
        subject: subject || '',
        preview_text: preview_text || null,
        html_body: html_body || '',
        delay_amount: delay_amount ?? 1,
        delay_unit: delay_unit || 'days',
        updated_at: new Date().toISOString(),
      };
      if (id) {
        const rows = await supaFetch(`crm_email_sequence_steps?id=eq.${id}`, {
          method: 'PATCH',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(payload),
        });
        return res.json(rows?.[0] || { updated: true });
      }
      const rows = await supaFetch('crm_email_sequence_steps', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify([payload]),
      });
      return res.json(rows?.[0] || {});
    }

    // ── POST delete step ──
    if (req.method === 'POST' && action === 'delete-step') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_email_sequence_steps?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    }

    // ── POST enroll-matching: find contacts matching all/none tag rules, enroll them ──
    if (req.method === 'POST' && action === 'enroll-matching') {
      const { sequence_id } = req.body;
      if (!sequence_id) return res.status(400).json({ error: 'sequence_id required' });
      const seqs = await supaFetch(`crm_email_sequences?id=eq.${sequence_id}`);
      const seq = seqs?.[0];
      if (!seq) return res.status(404).json({ error: 'Sequence not found' });

      const tagsAll = Array.isArray(seq.trigger_tags_all) ? seq.trigger_tags_all : (seq.trigger_tag ? [seq.trigger_tag] : []);
      const tagsNone = Array.isArray(seq.trigger_tags_none) ? seq.trigger_tags_none : [];
      if (!tagsAll.length && !tagsNone.length) return res.status(400).json({ error: 'Sequence has no qualification tags' });

      const steps = await supaFetch(`crm_email_sequence_steps?sequence_id=eq.${sequence_id}&order=step_order.asc&limit=1`);
      const firstStep = steps?.[0];
      if (!firstStep) return res.status(400).json({ error: 'Sequence has no steps' });

      // Fetch all active contacts for client, then filter in JS (PostgREST can't do multi-tag AND easily across jsonb)
      const contacts = await supaFetch(
        `crm_email_contacts?client_id=eq.${seq.client_id}&status=eq.active`
      );
      const matching = (contacts || []).filter(c => {
        const tags = c.tags || [];
        const hasAll = tagsAll.every(t => tags.includes(t));
        const hasNoneOfExcluded = tagsNone.every(t => !tags.includes(t));
        return hasAll && hasNoneOfExcluded;
      });
      const existing = await supaFetch(`crm_email_sequence_enrollments?sequence_id=eq.${sequence_id}&select=contact_id`);
      const already = new Set((existing || []).map(e => e.contact_id));
      const newOnes = matching.filter(c => !already.has(c.id));

      if (!newOnes.length) return res.json({ enrolled: 0 });

      const now = new Date();
      const firstSendAt = nextSendAt(now, firstStep, seq.send_days);
      const rows = newOnes.map(c => ({
        sequence_id,
        contact_id: c.id,
        current_step: 0,
        next_send_at: firstSendAt.toISOString(),
        status: 'active',
      }));
      await supaFetch('crm_email_sequence_enrollments', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=ignore-duplicates' },
        body: JSON.stringify(rows),
      });
      return res.json({ enrolled: rows.length });
    }

    // ── DELETE sequence ──
    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_email_sequences?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ deleted: true });
    }

    return res.status(400).json({ error: 'Invalid method or action' });
  } catch (err) {
    console.error('email-sequences error:', err);
    return res.status(500).json({ error: err.message });
  }
};
