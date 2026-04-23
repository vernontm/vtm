const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');
const { syncContactToMailerlite } = require('../_lib/mailerlite.js');

// POST /api/crm/mailerlite-backfill
// Body: { client_id, only_unsynced?: boolean (default true), limit?: number (default 500) }
//
// One-time migration: push every existing crm_email_contacts row for a client
// into MailerLite. Adds them to "VTM - General List" + a group per tag + Source
// group if source field is set. Writes subscriber_id back on success.
//
// Runs sequentially and swallows per-contact errors so one bad row doesn't
// halt the batch. Returns summary counts + first 20 errors for debugging.

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { client_id } = body;
    const only_unsynced = body.only_unsynced !== false;
    const limit = Math.min(Math.max(parseInt(body.limit) || 500, 1), 2000);
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    // Verify key is set before grinding through hundreds of rows
    const cfg = await supaFetch(
      `crm_email_config?client_id=eq.${client_id}&select=mailerlite_api_key`
    );
    if (!cfg?.[0]?.mailerlite_api_key) {
      return res.status(400).json({ error: 'No MailerLite API key set for this client' });
    }

    // Pull contacts to sync
    let q = `crm_email_contacts?client_id=eq.${client_id}&status=eq.active&order=created_at.asc&limit=${limit}`;
    if (only_unsynced) q += '&mailerlite_subscriber_id=is.null';
    const contacts = await supaFetch(q);

    const summary = { total: contacts?.length || 0, synced: 0, failed: 0, errors: [] };
    for (const c of (contacts || [])) {
      try {
        const r = await syncContactToMailerlite({
          client_id,
          contact_id: c.id,
          email: c.email,
          name: c.name,
          tags: c.tags || [],
          source: c.source || null,
        });
        if (r?.ok) summary.synced++;
        else {
          summary.failed++;
          if (summary.errors.length < 20) summary.errors.push(`${c.email}: ${(r?.errors || []).join('; ') || 'unknown'}`);
        }
      } catch (e) {
        summary.failed++;
        if (summary.errors.length < 20) summary.errors.push(`${c.email}: ${e.message}`);
      }
    }

    return res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('mailerlite-backfill error:', err);
    return res.status(500).json({ error: err.message });
  }
};
