const { setCors, supaFetch, SUPABASE_URL } = require('../_lib/supabase.js');

// Public (no-auth) lead magnet endpoint.
// POST { email, name?, sequence_id, tags? }
// - Upserts a contact in crm_email_contacts (client_id taken from the sequence)
// - Enrolls the contact in the given sequence if not already enrolled
// - Returns { ok: true, contact_id, enrolled, already_enrolled }

function nextSendAt(fromDate, step, sendDays) {
  const amount = step?.delay_amount || 0;
  const unit = step?.delay_unit || 'days';
  const mult = unit === 'hours' ? 3600_000 : unit === 'minutes' ? 60_000 : 86_400_000;
  let d = new Date(fromDate.getTime() + amount * mult);
  if (Array.isArray(sendDays) && sendDays.length > 0 && sendDays.length < 7) {
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let i = 0; i < 7; i++) {
      if (sendDays.includes(names[d.getDay()])) break;
      d = new Date(d.getTime() + 86_400_000);
    }
  }
  return d;
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = (body.email || '').trim().toLowerCase();
    const name = (body.name || '').trim();
    const sequence_id = body.sequence_id;
    const extraTags = Array.isArray(body.tags) ? body.tags : [];

    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
    if (!sequence_id) return res.status(400).json({ error: 'sequence_id required' });

    // Load sequence to get client_id + first step + send_days
    const seqRows = await supaFetch(`crm_email_sequences?id=eq.${sequence_id}&select=id,name,client_id,send_days,trigger_tag`);
    const seq = (seqRows || [])[0];
    if (!seq) return res.status(404).json({ error: 'Sequence not found' });
    const client_id = seq.client_id;

    // Tags — include the sequence trigger tag so contact matches any future re-enrollment
    const tagSet = new Set([...(extraTags || []), 'lead-magnet']);
    if (seq.trigger_tag) tagSet.add(seq.trigger_tag);
    const tags = Array.from(tagSet);

    // Upsert contact. on_conflict on (client_id,email) then merge to keep existing tags/status.
    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_email_contacts?on_conflict=client_id,email`,
      {
        method: 'POST',
        headers: {
          'apikey': process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.CRM_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify([{
          client_id,
          email,
          name: name || null,
          tags,
          status: 'active',
          signed_up_at: new Date().toISOString(),
        }]),
      }
    );
    if (!upsertRes.ok) {
      const t = await upsertRes.text();
      return res.status(500).json({ error: `Contact upsert failed: ${t}` });
    }
    const contactRows = await upsertRes.json();
    const contact = contactRows[0];
    if (!contact?.id) return res.status(500).json({ error: 'Contact upsert returned no id' });

    // Check existing enrollment
    const existing = await supaFetch(
      `crm_email_sequence_enrollments?sequence_id=eq.${sequence_id}&contact_id=eq.${contact.id}&select=id,status`
    );
    if (existing && existing.length > 0) {
      return res.json({ ok: true, contact_id: contact.id, enrolled: false, already_enrolled: true });
    }

    // Get first step
    const steps = await supaFetch(
      `crm_email_sequence_steps?sequence_id=eq.${sequence_id}&order=step_order.asc&limit=1&select=step_order,delay_amount,delay_unit`
    );
    const firstStep = (steps || [])[0] || { delay_amount: 0, delay_unit: 'minutes' };
    const sendAt = nextSendAt(new Date(), firstStep, seq.send_days);

    await supaFetch('crm_email_sequence_enrollments', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{
        sequence_id,
        contact_id: contact.id,
        current_step: 0,
        next_send_at: sendAt.toISOString(),
        status: 'active',
      }]),
    });

    return res.json({ ok: true, contact_id: contact.id, enrolled: true, already_enrolled: false });
  } catch (err) {
    console.error('lead-magnet error:', err);
    return res.status(500).json({ error: err.message });
  }
};
