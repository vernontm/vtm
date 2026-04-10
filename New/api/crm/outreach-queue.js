const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');
const { sendEmail } = require('../_lib/gmail.js');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = await requireAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { id, client_id, action } = req.query;

  // GET — list queue for a client
  if (req.method === 'GET') {
    if (!client_id) return res.status(400).json({ error: 'client_id required' });
    const rows = await supaFetch(`crm_outreach_queue?client_id=eq.${client_id}&order=created_at.desc`);
    return res.json(rows);
  }

  // POST — approve and send emails
  if (req.method === 'POST' && action === 'send-approved') {
    if (!client_id) return res.status(400).json({ error: 'client_id required' });

    // Get all approved but not yet sent
    const queue = await supaFetch(
      `crm_outreach_queue?client_id=eq.${client_id}&status=eq.approved&sent_at=is.null&order=created_at.asc`
    );

    if (!queue || queue.length === 0) {
      return res.json({ sent: 0, message: 'No approved emails to send' });
    }

    let sent = 0;
    const errors = [];

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      // Randomized delay: 5-120 seconds between emails (skip delay for first)
      if (i > 0) {
        const delay = Math.floor(Math.random() * 115000) + 5000;
        await new Promise(r => setTimeout(r, delay));
      }

      try {
        await sendEmail({
          to: item.to_email,
          subject: item.subject,
          body: item.body,
        });

        // Mark as sent
        await supaFetch(`crm_outreach_queue?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
        });

        // Update lead status
        if (item.lead_id) {
          await supaFetch(`crm_client_leads?id=eq.${item.lead_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ email_status: 'sent', send_date: new Date().toISOString() }),
          });
        }

        sent++;
      } catch (err) {
        errors.push({ id: item.id, error: err.message });
        await supaFetch(`crm_outreach_queue?id=eq.${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'error', error: err.message }),
        });
      }
    }

    return res.json({ sent, total: queue.length, errors });
  }

  // PUT — update (approve, edit, etc.)
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'id required' });
    const data = req.body;
    if (data.status === 'approved' && !data.approved_at) {
      data.approved_at = new Date().toISOString();
    }
    const rows = await supaFetch(`crm_outreach_queue?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.json(rows[0]);
  }

  // DELETE
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'id required' });
    await supaFetch(`crm_outreach_queue?id=eq.${id}`, { method: 'DELETE' });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
