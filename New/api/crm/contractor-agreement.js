const crypto = require('crypto');
const { setCors, requireStaff, supaFetch } = require('../_lib/supabase.js');
const { sendEmail } = require('../_lib/gmail.js');

// Team contractor agreements (influencer, appointment setter, editor, and so on).
//
// These reuse crm_agreements but carry no client_id. The signer lives in
// terms.signer = { kind: 'contractor', name, email }, which is what
// api/crm/sign.js keys off to skip the whole client pipeline: no client record,
// no portal account, no payment rows, no deposit reminders, no Stripe.
// Because client_id stays null, every client-scoped query in the CRM
// (portal-auth, agreement-ai, the Clients screen) ignores these rows.
//
//   POST ?action=create   { title, signer_name, signer_email, agreement_markdown,
//                           requires_ai_consent }  -> { id, link }
//   POST ?id=&action=send                          -> emails the signer the link
//   GET                                            -> list contractor agreements
//
// create does NOT email anyone. It hands back the link so it can be sent by
// whatever channel suits, which is usually a text message.
const SITE = 'https://vernontm.com';

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireStaff(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, action } = req.query;

  try {
    if (req.method === 'GET') {
      const rows = await supaFetch(
        'crm_agreements?client_id=is.null&order=created_at.desc&select=id,title,status,sign_token,sent_at,opened_at,signed_at,signer_name,file_url,terms'
      );
      const list = (rows || [])
        .filter(r => r.terms && r.terms.signer && r.terms.signer.kind === 'contractor')
        .map(r => ({
          id: r.id,
          title: r.title,
          status: r.status,
          signer_name: r.terms.signer.name || r.signer_name || '',
          signer_email: r.terms.signer.email || '',
          sent_at: r.sent_at,
          opened_at: r.opened_at,
          signed_at: r.signed_at,
          link: r.sign_token ? `${SITE}/sign?token=${r.sign_token}` : null,
          has_pdf: !!r.file_url,
        }));
      return res.json({ agreements: list });
    }

    if (req.method === 'POST' && action === 'create') {
      const b = req.body || {};
      const name = (b.signer_name || '').trim();
      const email = (b.signer_email || '').trim();
      const md = b.agreement_markdown || '';
      if (!name) return res.status(400).json({ error: 'signer_name required' });
      if (!md.trim()) return res.status(400).json({ error: 'agreement_markdown required' });

      const token = crypto.randomUUID();
      const payload = {
        client_id: null,
        title: (b.title || 'Independent Contractor Agreement').trim(),
        status: 'sent',
        sign_token: token,
        sent_at: new Date().toISOString(),
        terms: {
          signer: { kind: 'contractor', name, email },
          agreement_markdown: md,
          nda_markdown: b.nda_markdown || '',
          requires_ai_consent: !!b.requires_ai_consent,
        },
      };
      const rows = await supaFetch('crm_agreements', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
      const row = rows && rows[0];
      if (!row) return res.status(500).json({ error: 'Could not create the agreement' });
      return res.json({ id: row.id, link: `${SITE}/sign?token=${token}` });
    }

    if (req.method === 'POST' && action === 'send') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const [ag] = await supaFetch(`crm_agreements?id=eq.${id}&select=id,title,sign_token,status,client_id,terms`);
      if (!ag) return res.status(404).json({ error: 'Agreement not found' });
      const signer = (ag.terms && ag.terms.signer) || {};
      if (ag.client_id || signer.kind !== 'contractor') {
        return res.status(400).json({ error: 'Not a contractor agreement. Use /api/crm/agreements for client agreements.' });
      }
      if (!signer.email) return res.status(400).json({ error: 'This contractor has no email on the agreement.' });

      let token = ag.sign_token;
      if (!token) token = crypto.randomUUID();
      await supaFetch(`crm_agreements?id=eq.${id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ sign_token: token, status: 'sent', sent_at: new Date().toISOString() }),
      });

      const link = `${SITE}/sign?token=${token}`;
      const first = (signer.name || 'there').split(' ')[0];
      const title = ag.title || 'your agreement';
      try {
        await sendEmail({
          to: signer.email,
          subject: 'Your Vernon Tech & Media agreement, ready to sign',
          body: `Hi ${first},\n\n${title} is ready for your signature. You can review and sign it here, no account needed:\n${link}\n\nIf anything in it looks off, reply to this email before you sign.\n\nThank you,\nRay\nVernon Tech & Media`,
        });
      } catch (e) {
        console.error('contractor send email failed:', e.message);
        return res.status(502).json({ error: 'The link was created but the email failed to send.', link });
      }
      return res.json({ ok: true, link });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('contractor-agreement error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
