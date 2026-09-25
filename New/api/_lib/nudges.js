const crypto = require('crypto');
const { supaFetch, SUPABASE_URL, SERVICE_KEY } = require('./supabase.js');
const { normalizePhone } = require('./followups.js');
const { getAutomations, fillTemplate } = require('./automations.js');
const { sendEmail } = require('./gmail.js');
const { wrapEmailHtml } = require('./email-html.js');

// Nudges: a one-off text and/or email about something a client is sitting on:
// a Stripe invoice, a manual invoice, an agreement installment, an unsigned
// agreement, or a client plan whose card did not go through.
// crm/nudges.js drafts and sends them, followups-cron.js sends the scheduled
// ones, and crm/home.js reads the log for "last nudged". Every send lands in
// crm_nudges (docs/sql/role-homes.sql); until that table exists the log
// helpers throw an error missingNudges() recognises.
const SITE = 'https://vernontm.com';
const SIGN_BASE = `${SITE}/sign?token=`;
const PAY_BASE = `${SITE}/api/crm/pay-deposit?token=`;
const CLIENT_HOME = `${SITE}/client`;
const CENTRAL = 'America/Chicago';
const DAY = 24 * 60 * 60 * 1000;
const KINDS = ['invoice', 'manual_invoice', 'payment', 'agreement', 'plan'];
const TEMPLATE_FOR = { invoice: 'invoice_reminder', manual_invoice: 'invoice_reminder', payment: 'invoice_reminder', agreement: 'agreement_reminder', plan: 'plan_past_due' };
const CLIENT_COLS = 'id,business_name,owner_name,contact_phone,contact_email';
const MIGRATION_MSG = 'Nudges need the crm_nudges table. Run docs/sql/role-homes.sql in Supabase.';

const errText = (e) => String((e && e.message) || e || '');
const missingNudges = (e) => /crm_nudges/i.test(errText(e)) && /schema cache|does not exist|could not find|relation/i.test(errText(e));
// Ids go straight into PostgREST filters, so only plain uuid-ish strings pass.
const safeId = (v) => (/^[\w-]{1,64}$/.test(String(v || '')) ? String(v) : null);
const num = (v) => Number(v) || 0;

// ── Dates (Central calendar days) ───────────────────────────────────────────
// en-CA formats as YYYY-MM-DD, which is exactly the date string the app wants.
const centralYmdStr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: CENTRAL, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
// A date-only string stays as it is (a manual invoice due date is already a
// calendar day); anything else is an instant and becomes its Central day.
const toYmd = (v) => { if (!v) return null; const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : centralYmdStr(s); };
const daysBetween = (fromYmd, toYmdStr) => Math.round((Date.parse(toYmdStr) - Date.parse(fromYmd)) / DAY);
// Whole calendar days from a date (or instant) to today, never negative.
const daysAgo = (v) => { const y = toYmd(v); return y ? Math.max(0, daysBetween(y, centralYmdStr(new Date()))) : 0; };
const addDays = (iso, n) => (iso ? new Date(new Date(iso).getTime() + n * DAY).toISOString() : null);
function fmtDate(v) {
  const y = toYmd(v);
  if (!y) return '';
  return new Date(`${y}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
}

// ── Text bits ───────────────────────────────────────────────────────────────
function fmtMoney(n) {
  const v = num(n);
  const digits = Number.isInteger(v) ? 0 : 2;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const fmtUS = (p) => { const d = last10(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
function firstName(...names) {
  for (const n of names) { const f = String(n || '').trim().split(/\s+/)[0]; if (f) return f; }
  return 'there';
}
// Agreement titles carry a "Vernon Tech & Media" suffix (older rows with an em
// dash before it); the person only needs the part before it, dash free.
function agreementCore(title) {
  return String(title || 'Service Agreement')
    .replace(/\s*[\u2014\u2013:,-]\s*Vernon Tech & Media\s*$/i, '')
    .replace(/[\u2014\u2013]/g, '-')
    .trim() || 'Service Agreement';
}

// ── Money on plans ──────────────────────────────────────────────────────────
// A deal's plan is the sum of its recurring projects (deal-invoice.js builds the
// subscription from those); a deal without any falls back to its value.
function dealMonthly(deal) {
  const recurring = (Array.isArray(deal?.projects) ? deal.projects : []).reduce((s, p) => s + num(p.recurring_amount), 0);
  return recurring > 0 ? recurring : num(deal?.value);
}
// Maintenance lives on the agreement: terms.maintenance is what start-maintenance bills.
function agreementMonthly(ag) {
  const t = (ag && ag.terms) || {};
  return num(t.maintenance) || num(t.monthly && t.monthly[0] && t.monthly[0].amount) || num(ag && ag.total_amount);
}
function planLabel(ag) {
  const t = (ag && ag.terms) || {};
  return (t.monthly && t.monthly[0] && t.monthly[0].item) || `${agreementCore(ag && ag.title)} maintenance`;
}
function invoiceNumber(inv) {
  if (inv.invoice_number) return String(inv.invoice_number);
  const src = inv.stripe_invoice_id ? String(inv.stripe_invoice_id).slice(-8) : String(inv.id || '').slice(0, 8);
  return `#${src.toUpperCase()}`;
}

// ── People ──────────────────────────────────────────────────────────────────
async function clientById(id) {
  if (!safeId(id)) return null;
  const [c] = (await supaFetch(`crm_clients?id=eq.${id}&select=${CLIENT_COLS}`)) || [];
  return c || null;
}
async function clientByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!validEmail(e)) return null;
  const rows = (await supaFetch(`crm_clients?contact_email=ilike.${encodeURIComponent(e)}&or=(record_type.is.null,record_type.eq.client)&select=${CLIENT_COLS}&limit=1`)) || [];
  return rows[0] || null;
}
async function clientForDeal(dealId) {
  if (!safeId(dealId)) return null;
  const [d] = (await supaFetch(`crm_deals?id=eq.${dealId}&select=client_id`)) || [];
  return d ? clientById(d.client_id) : null;
}
// The contact block every target carries; fallback fills in for invoices that
// were never tied to a client record.
function person(client, fallback = {}) {
  return {
    client_id: (client && client.id) || null,
    client_name: (client && (client.business_name || client.owner_name)) || fallback.name || '',
    first_name: firstName(client && client.owner_name, fallback.name, client && client.business_name),
    phone: (client && client.contact_phone) || fallback.phone || null,
    email: (client && client.contact_email) || fallback.email || null,
  };
}
// Roster name for the signed-in user, else the name on their login, else the
// email's local part.
async function nameForUser(user) {
  const email = String((user && user.email) || '').toLowerCase();
  try {
    const rows = email ? await supaFetch(`crm_team_members?email=ilike.${encodeURIComponent(email)}&select=name&limit=1`) : [];
    if (rows && rows[0] && rows[0].name) return rows[0].name;
  } catch (_) { /* roster is optional here */ }
  try {
    if (user && user.id) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
      const u = r.ok ? await r.json() : null;
      const meta = (u && u.user_metadata) || {};
      if (meta.name || meta.full_name) return meta.name || meta.full_name;
    }
  } catch (_) { /* fall through */ }
  return email.split('@')[0] || 'Someone';
}

// ── What a nudge is about ───────────────────────────────────────────────────
// Returns the contract's target block plus `settled` (already paid / signed /
// current), so a scheduled nudge can stand down when it is no longer needed.
async function resolveTarget(kind, rawId) {
  const id = safeId(rawId);
  if (!KINDS.includes(kind) || !id) return null;
  const one = async (path) => ((await supaFetch(path)) || [])[0] || null;

  if (kind === 'invoice') {
    const inv = await one(`crm_invoices?id=eq.${id}&select=*`);
    if (!inv) return null;
    const client = (await clientForDeal(inv.deal_id)) || (await clientByEmail(inv.email || inv.bill_to_email));
    const due = toYmd(addDays(inv.created_at, 7));   // Stripe invoices go out net 7 (deal-invoice.js)
    return {
      kind, id, label: invoiceNumber(inv), amount: num(inv.amount), due, days_late: daysAgo(due),
      link: inv.stripe_invoice_url || null, settled: ['paid', 'void', 'refunded', 'uncollectible'].includes(inv.status),
      ...person(client, { name: inv.customer_name || inv.bill_to_name, email: inv.email || inv.bill_to_email }),
    };
  }
  if (kind === 'manual_invoice') {
    const m = await one(`crm_manual_invoices?id=eq.${id}&select=*`);
    if (!m) return null;
    const client = (await clientForDeal(m.deal_id)) || (await clientByEmail(m.bill_to_email));
    const due = toYmd(m.due_date || addDays(m.created_at, 14));
    return {
      kind, id, label: m.invoice_number || `#${id.slice(0, 8)}`, amount: num(m.total != null ? m.total : m.amount), due, days_late: daysAgo(due),
      link: null, settled: ['paid', 'void', 'cancelled'].includes(m.status),
      ...person(client, { name: m.bill_to_name, email: m.bill_to_email }),
    };
  }
  if (kind === 'payment') {
    const p = await one(`crm_payments?id=eq.${id}&select=*`);
    if (!p) return null;
    const [client, ag] = await Promise.all([
      clientById(p.client_id),
      safeId(p.agreement_id) ? one(`crm_agreements?id=eq.${p.agreement_id}&select=id,status,signed_at,sign_token`) : null,
    ]);
    const signed = !!(ag && (ag.signed_at || ag.status === 'signed'));
    const due = signed ? toYmd(ag.signed_at) : null;
    return {
      kind, id, label: p.label || 'Payment', amount: num(p.amount), due, days_late: daysAgo(due),
      link: p.stripe_invoice_url || (ag && ag.sign_token ? PAY_BASE + ag.sign_token : null), settled: p.status === 'paid',
      ...person(client),
    };
  }
  if (kind === 'agreement') {
    const ag = await one(`crm_agreements?id=eq.${id}&select=id,client_id,title,status,sign_token,sent_at,signed_at,total_amount`);
    if (!ag) return null;
    const client = await clientById(ag.client_id);
    // Same token the send action would mint, so the link keeps working after a real send.
    let token = ag.sign_token;
    if (!token) {
      token = crypto.randomUUID();
      await supaFetch(`crm_agreements?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ sign_token: token }) });
    }
    const due = toYmd(ag.sent_at);
    return {
      kind, id, label: agreementCore(ag.title).replace(/\s*agreement\s*$/i, '') || 'Service', amount: num(ag.total_amount), due, days_late: daysAgo(due),
      link: SIGN_BASE + token, settled: !!(ag.signed_at || ag.status === 'signed'),
      ...person(client),
    };
  }
  if (kind === 'plan') {
    const deal = await one(`crm_deals?id=eq.${id}&select=id,name,value,client_id,subscription_status,updated_at,stripe_invoice_url,projects:crm_projects(recurring_amount)`);
    if (deal) {
      const client = await clientById(deal.client_id);
      const pastDue = deal.subscription_status === 'past_due';
      const due = toYmd(deal.updated_at);
      return {
        kind, id, label: deal.name || 'Plan', amount: dealMonthly(deal), due, days_late: pastDue ? daysAgo(due) : 0,
        link: deal.stripe_invoice_url || CLIENT_HOME, settled: !pastDue,
        ...person(client),
      };
    }
    // A maintenance plan lives on the agreement (maintenance_subscription_id).
    const ag = await one(`crm_agreements?id=eq.${id}&select=id,client_id,title,terms,total_amount,maintenance_subscription_id`);
    if (!ag) return null;
    const client = await clientById(ag.client_id);
    return { kind, id, label: planLabel(ag), amount: agreementMonthly(ag), due: null, days_late: 0, link: CLIENT_HOME, settled: false, ...person(client) };
  }
  return null;
}

// ── Drafting ────────────────────────────────────────────────────────────────
// No link to give (a manual invoice): drop the clause that would carry it
// ("You can pay here: {link}") rather than sending it followed by nothing.
function dropLinkSentence(tpl) {
  return String(tpl || '').replace(/[^.!?]*\{link\}[.,!?]*/g, ' ');
}
function defaultSubject(t) {
  if (t.kind === 'agreement') return `Your ${t.label} agreement is ready to sign`;
  if (t.kind === 'plan') return `Payment update needed for ${t.label}`;
  const inv = t.kind === 'payment' ? `${t.label} payment` : (/^inv/i.test(t.label) ? t.label : `Invoice ${t.label}`);
  return `${inv} from Vernon Tech & Media`;
}
// Fills the template from the Automations page (edits there win over the
// defaults) with this target's details.
async function buildDraft(target) {
  const key = TEMPLATE_FOR[target.kind];
  const auto = await getAutomations();
  let tpl = (auto[key] && auto[key].template) || '';
  if (!target.link) tpl = dropLinkSentence(tpl);
  const label = String(target.label || '');
  const invoiceWord = target.kind === 'payment'
    ? (/deposit|payment|installment/i.test(label) ? `the ${label.toLowerCase()}` : `the ${label} payment`)
    : (/^inv/i.test(label) ? label : `invoice ${label}`);
  const vars = {
    first_name: target.first_name, business: target.client_name,
    invoice: invoiceWord, amount: fmtMoney(target.amount), due: fmtDate(target.due), days_late: String(target.days_late || 0),
    link: target.link || '', title: target.kind === 'agreement' ? label : '', plan: target.kind === 'plan' ? label : '',
  };
  return { template_key: key, message: fillTemplate(tpl, vars), email_subject: defaultSubject(target) };
}
function channelsFor(target) {
  const phone = normalizePhone(target.phone);
  return {
    text: { available: !!phone, to: phone ? fmtUS(phone) : null },
    email: { available: validEmail(target.email), to: validEmail(target.email) ? target.email : null },
  };
}

// ── Sending ─────────────────────────────────────────────────────────────────
// Text = a queued crm_sms_messages row the Mac bridge delivers (the same way
// follow-ups go out). Email = Gmail, plain body plus a simple HTML version.
async function deliver({ target, channels, message, subject }) {
  const sent = [], skipped = [];
  if (channels.includes('text')) {
    const to = normalizePhone(target.phone);
    if (!to) skipped.push('text');
    else {
      await supaFetch('crm_sms_messages', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ client_id: target.client_id || null, direction: 'out', channel: 'imessage', phone: to, body: String(message).slice(0, 2000), status: 'queued' }),
      });
      sent.push('text');
    }
  }
  if (channels.includes('email')) {
    if (!validEmail(target.email)) skipped.push('email');
    else {
      try {
        await sendEmail({ to: target.email, subject, body: message, html: wrapEmailHtml(message, { subject, fromName: 'Vernon Tech & Media' }) });
        sent.push('email');
      } catch (e) { console.error('nudge email failed:', e.message); skipped.push('email'); }
    }
  }
  return { sent, skipped };
}

// ── The log ─────────────────────────────────────────────────────────────────
async function logNudge(row) {
  const [saved] = (await supaFetch('crm_nudges', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })) || [];
  return saved || null;
}
async function updateNudge(id, patch) {
  await supaFetch(`crm_nudges?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
}
async function history(kind, id) {
  const rows = (await supaFetch(`crm_nudges?kind=eq.${encodeURIComponent(kind)}&target_id=eq.${encodeURIComponent(String(id))}&order=created_at.desc&limit=20&select=id,channels,message,email_subject,sent_by_name,status,scheduled_at,sent_at,created_at`)) || [];
  return rows.map(r => ({ id: r.id, sent_at: r.sent_at || null, scheduled_at: r.scheduled_at || null, channels: r.channels || [], by_name: r.sent_by_name || null, status: r.status, message: r.message || '' }));
}
// "kind:target_id" -> when it was last nudged. Empty until the table exists.
async function lastNudgedMap() {
  try {
    const rows = (await supaFetch('crm_nudges?status=eq.sent&select=kind,target_id,sent_at&order=sent_at.desc&limit=500')) || [];
    const map = new Map();
    for (const r of rows) { const k = `${r.kind}:${r.target_id}`; if (!map.has(k)) map.set(k, r.sent_at); }
    return map;
  } catch (e) {
    if (missingNudges(e)) return new Map();
    throw e;
  }
}

// ── Cron pass (followups-cron.js) ───────────────────────────────────────────
// Sends every scheduled nudge whose time has come. Each row is claimed first
// so two overlapping runs never send it twice, and one that is no longer
// needed (paid or signed since it was scheduled) is cancelled quietly.
async function sendDueNudges(limit = 25) {
  const now = new Date().toISOString();
  let due;
  try {
    due = (await supaFetch(`crm_nudges?status=eq.scheduled&scheduled_at=lte.${encodeURIComponent(now)}&order=scheduled_at.asc&limit=${limit}`)) || [];
  } catch (e) {
    if (missingNudges(e)) return { skipped: 'crm_nudges not created yet' };
    throw e;
  }
  let sent = 0;
  for (const n of due) {
    const claimed = await supaFetch(`crm_nudges?id=eq.${n.id}&status=eq.scheduled`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'sending' }),
    });
    if (!claimed || !claimed.length) continue;
    let target = null;
    try { target = await resolveTarget(n.kind, n.target_id); } catch (e) { console.error('nudge target failed:', e.message); }
    if (!target) { await updateNudge(n.id, { status: 'failed' }); continue; }
    if (target.settled) { await updateNudge(n.id, { status: 'cancelled' }); continue; }
    const channels = Array.isArray(n.channels) ? n.channels : [];
    const r = await deliver({ target, channels, message: n.message || '', subject: n.email_subject || defaultSubject(target) });
    await updateNudge(n.id, { status: r.sent.length ? 'sent' : 'failed', channels: r.sent.length ? r.sent : channels, sent_at: new Date().toISOString() });
    if (r.sent.length) sent++;
  }
  return { due: due.length, sent };
}

module.exports = {
  KINDS, TEMPLATE_FOR, SIGN_BASE, PAY_BASE, CLIENT_HOME, CLIENT_COLS, MIGRATION_MSG,
  missingNudges, safeId, num,
  resolveTarget, buildDraft, defaultSubject, channelsFor, deliver,
  logNudge, updateNudge, history, lastNudgedMap, sendDueNudges, nameForUser,
  fmtMoney, fmtDate, fmtUS, toYmd, centralYmdStr, daysAgo, daysBetween, addDays,
  agreementCore, dealMonthly, agreementMonthly, planLabel, invoiceNumber, firstName, validEmail,
};
