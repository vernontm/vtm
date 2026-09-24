const { setCors, supaFetch, requireClientScope } = require('../_lib/supabase.js');
const { normalizePhone, sendSms } = require('../_lib/twilio.js');

// CRM SMS: list conversation threads / a single thread, and send a text to a
// client from the VTM number. Authed via requireClientScope. Outbound messages
// are logged to crm_sms_messages and sent through the approved A2P messaging
// service. Every message is prefixed "VTM:" with an opt-out line so it stays
// consistent with the registered campaign.
module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const scope = await requireClientScope(req);
  if (!scope.ok) return res.status(scope.status).json({ error: scope.error });
  const scopeFilter = scope.all ? '' : `&client_id=eq.${scope.clientId}`;

  try {
    if (req.method === 'GET') {
      // ?phone= returns one thread (chronological); otherwise thread summaries.
      const phone = req.query.phone ? normalizePhone(req.query.phone) : null;
      if (phone) {
        const rows = await supaFetch(
          `crm_sms_messages?phone=eq.${encodeURIComponent(phone)}${scopeFilter}&order=created_at.asc`
        );
        return res.json(rows || []);
      }
      const rows = await supaFetch(`crm_sms_messages?${scope.all ? '' : `client_id=eq.${scope.clientId}&`}order=created_at.desc&limit=1000`);
      // Collapse to one thread per phone: latest message + count.
      const threads = {};
      for (const m of rows || []) {
        if (!threads[m.phone]) threads[m.phone] = { phone: m.phone, last: m, count: 0, client_id: m.client_id };
        threads[m.phone].count++;
      }
      return res.json(Object.values(threads));
    }

    if (req.method === 'POST' && req.query.action === 'send') {
      const to = normalizePhone((req.body || {}).phone);
      const raw = String((req.body || {}).body || '').trim().slice(0, 600);
      if (!to) return res.status(400).json({ error: 'Valid phone required.' });
      if (!raw) return res.status(400).json({ error: 'Message body required.' });

      const outBody = `VTM: ${raw}\nReply STOP to opt out.`;
      const sent = await sendSms(to, outBody);
      const row = {
        client_id: (req.body || {}).client_id || (scope.all ? null : scope.clientId) || null,
        direction: 'out',
        phone: to,
        body: outBody,
        twilio_sid: sent.sid || null,
        status: sent.ok ? (sent.status || 'queued') : 'failed',
        error: sent.ok ? null : String(sent.error || 'send failed').slice(0, 300),
      };
      const saved = await supaFetch('crm_sms_messages', { method: 'POST', body: JSON.stringify(row) });
      const savedRow = Array.isArray(saved) ? saved[0] : saved;
      if (!sent.ok) return res.status(502).json({ error: sent.error || 'Send failed.', saved: savedRow });
      return res.status(201).json(savedRow || row);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
