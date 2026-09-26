const { setCors, requireAuth, supaFetch } = require('../_lib/supabase.js');
const { normalizePhone } = require('../_lib/followups.js');
const N = require('../_lib/nudges.js');

// Per-client activity feed: notes, calls, tasks, comments. One table, filtered
// by `type`. Backs the Activity tab on a client/lead in the web CRM.
//
// The iPhone app's client file reads one combined view instead
// (docs/engineer/role-homes-contracts.md):
//   GET ?client_id=&view=overview -> { client, files, activity, next_up, balance, plan }
// The plain GET keeps returning the raw rows the web CRM expects.
const DAY = 24 * 60 * 60 * 1000;
const q = encodeURIComponent;
const num = N.num;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
// A failing source is an empty part of the timeline, never a broken file.
const safe = (p) => Promise.resolve(p).then(r => r || []).catch(e => { console.error('client overview query failed:', e.message); return []; });

function fileKind(mime, name) {
  const m = String(mime || '').toLowerCase(), n = String(name || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
  if (/word|\.docx?$/.test(m + n)) return 'doc';
  if (/sheet|excel|csv|\.xlsx?$/.test(m + n)) return 'sheet';
  if (/presentation|powerpoint|\.pptx?$/.test(m + n)) return 'slides';
  if (/zip|compressed/.test(m)) return 'zip';
  return 'file';
}
const mediaLabel = (atts) => {
  const types = (Array.isArray(atts) ? atts : []).map(a => a && a.type);
  if (!types.length) return '';
  if (types.every(t => t === 'image')) return types.length === 1 ? 'Photo' : `${types.length} photos`;
  if (types.every(t => t === 'video')) return types.length === 1 ? 'Video' : `${types.length} videos`;
  if (types.every(t => t === 'audio')) return 'Voice memo';
  return 'Attachment';
};
const whenRange = (m) => {
  try {
    const opts = { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    const start = new Date(m.start_time).toLocaleString('en-US', opts);
    const end = m.end_time ? new Date(m.end_time).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }) : '';
    return end ? `${start} to ${end}` : start;
  } catch (_) { return ''; }
};
// The client's plan as the app shows it: a live Stripe plan on a deal wins,
// else the maintenance on the latest agreement.
function planFor(deals, ag) {
  const sub = deals.find(d => d.stripe_subscription_id);
  if (sub) return { label: sub.name || 'Plan', monthly: N.dealMonthly(sub), starts: null, status: sub.subscription_status || 'active' };
  if (!ag) return null;
  const t = ag.terms || {};
  const monthly = num(t.maintenance) || num(t.monthly && t.monthly[0] && t.monthly[0].amount);
  if (!monthly) return null;
  const status = ag.maintenance_subscription_id ? 'active' : ag.signed_at || ag.status === 'signed' ? 'signed' : ag.status === 'sent' ? 'unsigned' : 'draft';
  return { label: (t.monthly && t.monthly[0] && t.monthly[0].item) || N.planLabel(ag), monthly, starts: ag.maintenance_started_at ? N.toYmd(ag.maintenance_started_at) : null, status };
}

async function overview(clientId) {
  const [client] = await supaFetch(`crm_clients?id=eq.${clientId}&select=*`) || [];
  if (!client) return null;
  const phone = normalizePhone(client.contact_phone);
  const email = String(client.contact_email || '').trim().toLowerCase();
  // The part of the business name before any punctuation PostgREST treats as syntax.
  const name = String(client.business_name || '').split(/[,.:()"*%]/)[0].trim();
  const now = new Date();
  const [files, texts, agreements, payments, meetings, notes, quick, nudges, deals] = await Promise.all([
    safe(supaFetch(`crm_client_files?client_id=eq.${clientId}&is_folder=eq.false&select=id,name,url,mime,size,uploaded_by,created_at,storage_key&order=created_at.desc&limit=60`)),
    phone ? safe(supaFetch(`crm_sms_messages?phone=eq.${q(phone)}&select=id,direction,body,attachments,status,created_at&order=created_at.desc&limit=60`)) : [],
    safe(supaFetch(`crm_agreements?client_id=eq.${clientId}&select=id,title,status,total_amount,sent_at,opened_at,signed_at,created_at,sign_token,terms,maintenance_subscription_id,maintenance_started_at&order=created_at.desc`)),
    safe(supaFetch(`crm_payments?client_id=eq.${clientId}&select=*&order=created_at.asc`)),
    // Meetings carry no client id: match the client's email on the invite.
    email ? safe(supaFetch(`crm_meetings?start_time=gte.${q(new Date(now.getTime() - 180 * DAY).toISOString())}&or=(all_day.is.null,all_day.eq.false)&select=id,summary,title,start_time,end_time,location,meet_link,html_link,attendees&order=start_time.desc&limit=400`)) : [],
    safe(supaFetch(`crm_client_activity?client_id=eq.${clientId}&type=eq.note&select=id,tag,body,created_at&order=created_at.desc&limit=30`)),
    // Quick notes are not tied to a client: the ones that mention the business by name count.
    name.length >= 3 ? safe(supaFetch(`crm_quick_notes?or=(title.ilike.${q(`*${name}*`)},content.ilike.${q(`*${name}*`)})&select=id,title,content,created_at&order=created_at.desc&limit=20`)) : [],
    safe(supaFetch(`crm_nudges?client_id=eq.${clientId}&select=id,kind,channels,message,sent_by_name,status,sent_at,scheduled_at,created_at&order=created_at.desc&limit=30`)),
    safe(supaFetch(`crm_deals?client_id=eq.${clientId}&archived=eq.false&select=id,name,value,stripe_subscription_id,subscription_status,stripe_invoice_url,updated_at,projects:crm_projects(recurring_amount)&order=created_at.desc`)),
  ]);
  const invoices = deals.length ? await safe(supaFetch(`crm_invoices?deal_id=in.(${deals.map(d => d.id).join(',')})&select=*`)) : [];

  const attendees = (m) => {
    let list = m.attendees;
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch (_) { list = []; } }
    return (Array.isArray(list) ? list : []).map(x => String((x && x.email) || x || '').toLowerCase());
  };
  const clientMeetings = meetings.filter(m => attendees(m).includes(email));

  const activity = [];
  const push = (x) => { if (x.at) activity.push(x); };
  const who = client.owner_name || client.business_name || 'client';
  for (const t of texts) {
    const queued = t.status === 'queued' || t.status === 'sending';
    push({ kind: 'text', at: t.created_at, title: oneLine(t.body, 140) || mediaLabel(t.attachments), sub: t.direction === 'in' ? `Text from ${who}` : (queued ? 'Text queued' : 'Text sent'), direction: t.direction, severity: null, link: null });
  }
  for (const a of agreements) {
    const core = N.agreementCore(a.title);
    const link = a.sign_token ? N.SIGN_BASE + a.sign_token : null;
    // agreement_id travels on every row so a Nudge tapped there has a target.
    const ref = { agreement_id: a.id, signed: !!a.signed_at };
    const total = a.total_amount ? `Total ${N.fmtMoney(a.total_amount)}` : '';
    push({ ...ref, kind: 'agreement', at: a.created_at, title: `${core} drafted`, sub: total, direction: null, severity: null, link: null });
    if (a.sent_at) {
      const waiting = N.daysAgo(a.sent_at);
      push({ ...ref, kind: 'agreement', at: a.sent_at, title: `${core} sent for signature`, sub: a.signed_at ? `Signed ${N.fmtDate(a.signed_at)}` : `Waiting ${plural(waiting, 'day')}`, direction: 'out', severity: !a.signed_at && waiting >= 3 ? 'amber' : null, link });
    }
    if (a.opened_at) push({ ...ref, kind: 'agreement', at: a.opened_at, title: `${core} opened`, sub: 'The signing page was opened', direction: 'in', severity: null, link });
    if (a.signed_at) push({ ...ref, kind: 'agreement', at: a.signed_at, title: `${core} signed`, sub: total, direction: 'in', severity: 'green', link });
  }
  for (const p of payments) {
    if (p.status === 'paid' && p.paid_at) push({ kind: 'payment', at: p.paid_at, title: `Payment received: ${N.fmtMoney(p.amount)}`, sub: [p.label, p.source].filter(Boolean).join(' · '), direction: 'in', severity: 'green', link: p.stripe_invoice_url || null });
    else if (p.status === 'refunded' && p.paid_at) push({ kind: 'payment', at: p.paid_at, title: `Refund: ${N.fmtMoney(Math.abs(num(p.amount)))}`, sub: p.label || '', direction: 'out', severity: 'red', link: p.stripe_invoice_url || null });
  }
  for (const m of clientMeetings) push({ kind: 'meeting', at: m.start_time, title: m.title || m.summary || 'Meeting', sub: whenRange(m), direction: null, severity: null, link: m.meet_link || m.html_link || null });
  for (const n of notes) push({ kind: 'note', at: n.created_at, title: n.tag || 'Note', sub: oneLine(n.body, 160), direction: null, severity: null, link: null });
  for (const n of quick) push({ kind: 'note', at: n.created_at, title: n.title || 'Quick note', sub: oneLine(n.content, 160), direction: null, severity: null, link: null });
  for (const n of nudges) {
    const via = (Array.isArray(n.channels) ? n.channels : []).join(' + ') || 'nudge';
    const what = n.status === 'scheduled' ? 'scheduled' : n.status === 'sent' ? 'sent' : n.status;
    push({ kind: 'nudge', at: n.sent_at || n.scheduled_at || n.created_at, title: `Nudge ${what} (${via})`, sub: oneLine(n.message, 120), direction: 'out', severity: n.status === 'failed' ? 'red' : null, link: null });
  }
  activity.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // Balance: agreement installments plus Stripe invoices on the client's deals,
  // counting a Stripe payment once even though it lands in both tables.
  const logged = new Set(payments.map(p => p.stripe_invoice_id).filter(Boolean));
  const paidPayments = payments.filter(p => p.status === 'paid');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  const paidInvoices = invoices.filter(i => i.status === 'paid' && !(i.stripe_invoice_id && logged.has(i.stripe_invoice_id)));
  const openInvoices = invoices.filter(i => i.status === 'open' || i.status === 'payment_failed');
  const sum = (rows) => Math.round(rows.reduce((s, r) => s + num(r.amount), 0) * 100) / 100;
  const paid = sum(paidPayments) + sum(paidInvoices);
  const due = sum(pendingPayments) + sum(openInvoices);
  const signedAt = (p) => { const ag = agreements.find(a => a.id === p.agreement_id); return ag && ag.signed_at && /sign/i.test(p.due_condition || '') ? N.toYmd(ag.signed_at) : null; };
  const dueDates = [...pendingPayments.map(signedAt), ...openInvoices.map(i => N.toYmd(N.addDays(i.created_at, 7)))].filter(Boolean).sort();
  const upcoming = clientMeetings.filter(m => m.end_time && m.end_time >= now.toISOString()).sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))[0] || null;

  return {
    client: {
      id: client.id, name: client.business_name || client.owner_name || '', owner_name: client.owner_name || '', phone: client.contact_phone || null, email: client.contact_email || null,
      stage: client.stage || null, since: client.client_since || client.created_at || null, delivery_stage: client.delivery_stage || null,
    },
    files: files.map(f => ({ id: f.id, name: f.name, url: f.url || null, kind: fileKind(f.mime, f.name), by_name: f.uploaded_by || null, at: f.created_at, size: f.size || 0, needs_link: !f.url })),
    activity: activity.slice(0, 60),
    next_up: upcoming ? { id: upcoming.id, title: upcoming.title || upcoming.summary || '(no title)', start_time: upcoming.start_time, end_time: upcoming.end_time, location: upcoming.location || null, meet_link: upcoming.meet_link || null, attendees: attendees(upcoming).filter(e => e.includes('@')) } : null,
    balance: { due: Math.round(due * 100) / 100, due_on: dueDates[0] || null, paid: Math.round(paid * 100) / 100, total: Math.round((paid + due) * 100) / 100 },
    plan: planFor(deals, agreements[0] || null),
  };
}

module.exports = async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!(await requireAuth(req))) return res.status(401).json({ error: 'Unauthorized' });

  const { id, client_id, type, view, action } = req.query;

  try {
    if (req.method === 'GET') {
      if (!client_id) return res.status(400).json({ error: 'client_id required' });
      if (view === 'overview' || action === 'overview') {
        if (!/^[\w-]{1,64}$/.test(String(client_id))) return res.status(400).json({ error: 'bad client_id' });
        const data = await overview(client_id);
        if (!data) return res.status(404).json({ error: 'Client not found' });
        return res.json(data);
      }
      let path = `crm_client_activity?client_id=eq.${client_id}&order=created_at.desc`;
      if (type) path += `&type=eq.${encodeURIComponent(type)}`;
      const rows = await supaFetch(path);
      return res.json(rows || []);
    }

    if (req.method === 'POST') {
      const d = req.body || {};
      if (!d.client_id) return res.status(400).json({ error: 'client_id required' });
      if (!d.type) d.type = 'note';
      const rows = await supaFetch('crm_client_activity', { method: 'POST', body: JSON.stringify(d) });
      return res.status(201).json(rows[0]);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'id required' });
      const d = { ...req.body, updated_at: new Date().toISOString() };
      delete d.id; delete d.created_at;
      if (Object.prototype.hasOwnProperty.call(d, 'status')) {
        d.completed_at = d.status === 'done' ? new Date().toISOString() : null;
      }
      const rows = await supaFetch(`crm_client_activity?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(d) });
      return res.json(rows[0]);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'id required' });
      await supaFetch(`crm_client_activity?id=eq.${id}`, { method: 'DELETE' });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('client-activity error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
