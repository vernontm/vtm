const { supaFetch } = require('./supabase.js');

/**
 * Auto-enroll a contact into every active email sequence whose tag rules
 * match. Mirrors the batch-enrollment logic in email-cron.js so adding a
 * new contact (or re-tagging an existing one) doesn't need to wait up to
 * 15 minutes for the next cron tick.
 *
 * Safe to call on every contact write — duplicates are blocked by
 * `Prefer: resolution=ignore-duplicates` and a same-sequence pre-check,
 * and the function swallows all errors so it never breaks the caller.
 *
 * @param {object} opts
 * @param {string} opts.client_id - the contact's client
 * @param {string} opts.contact_id - the contact row id
 * @param {string[]} [opts.tags] - current tag set on the contact
 * @returns {Promise<{ enrolled: string[], skipped: string[], errors: string[] }>}
 */
async function autoEnrollContact({ client_id, contact_id, tags }) {
  const result = { enrolled: [], skipped: [], errors: [] };
  if (!client_id || !contact_id) return result;
  const contactTags = Array.isArray(tags) ? tags : [];

  try {
    const seqs = await supaFetch(
      `crm_email_sequences?client_id=eq.${client_id}&active=eq.true`
    );
    if (!seqs?.length) return result;

    for (const seq of seqs) {
      try {
        const tagsAll = Array.isArray(seq.trigger_tags_all) && seq.trigger_tags_all.length
          ? seq.trigger_tags_all
          : (seq.trigger_tag ? [seq.trigger_tag] : []);
        const tagsNone = Array.isArray(seq.trigger_tags_none) ? seq.trigger_tags_none : [];

        // Skip sequences with no tag gates — they must be enrolled explicitly.
        if (!tagsAll.length && !tagsNone.length) { result.skipped.push(seq.id); continue; }

        const matchesAll = tagsAll.every(t => contactTags.includes(t));
        const matchesNone = tagsNone.every(t => !contactTags.includes(t));
        if (!matchesAll || !matchesNone) { result.skipped.push(seq.id); continue; }

        // Skip if already enrolled in this sequence
        const existing = await supaFetch(
          `crm_email_sequence_enrollments?sequence_id=eq.${seq.id}&contact_id=eq.${contact_id}&limit=1`
        );
        if (existing?.length) { result.skipped.push(seq.id); continue; }

        // Compute first-send time from step 1's delay
        const steps = await supaFetch(
          `crm_email_sequence_steps?sequence_id=eq.${seq.id}&order=step_order.asc&limit=1`
        );
        const firstStep = steps?.[0];
        if (!firstStep) { result.skipped.push(seq.id); continue; }

        const unitMs = firstStep.delay_unit === 'hours' ? 3_600_000
          : firstStep.delay_unit === 'minutes' ? 60_000
          : 86_400_000;
        const firstSend = new Date(Date.now() + unitMs * (firstStep.delay_amount || 0)).toISOString();

        await supaFetch('crm_email_sequence_enrollments', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=ignore-duplicates' },
          body: JSON.stringify([{
            sequence_id: seq.id,
            contact_id,
            current_step: 0,
            next_send_at: firstSend,
            status: 'active',
          }]),
        });
        result.enrolled.push(seq.id);
      } catch (e) {
        result.errors.push(`seq ${seq.id}: ${e.message}`);
      }
    }
  } catch (e) {
    result.errors.push(`load sequences: ${e.message}`);
  }
  return result;
}

module.exports = { autoEnrollContact };
