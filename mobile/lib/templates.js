// Automation templates as the app sees them. Mirrors New/api/_lib/automations.js:
// the same defaults, placeholders and fill rules, so the preview on the
// Automations page matches what the server sends.
export const DEFAULT_AUTOMATIONS = {
  thank_you: {
    enabled: true,
    send_hour: 8,
    mode: 'template',
    template: 'Hey {first_name}, thanks again for meeting up yesterday{meeting_clause}. Really enjoyed it. If any questions come up, just text me here.',
  },
  meeting_confirmation: {
    enabled: true,
    mode: 'template',
    template: "You're all set for {when}{service_clause}. {link}",
  },
  invoice_reminder: {
    enabled: true,
    mode: 'template',
    template: 'Hi {first_name}, quick reminder that {invoice} for {amount} was due {due}. You can pay here: {link} Thank you!',
  },
  agreement_reminder: {
    enabled: true,
    mode: 'template',
    template: 'Hi {first_name}, when you get a minute, the {title} agreement is ready for your signature: {link}',
  },
  plan_past_due: {
    enabled: true,
    mode: 'template',
    template: 'Hi {first_name}, the card on file for {plan} did not go through. You can update it here: {link}',
  },
};

export const PLACEHOLDERS = {
  thank_you: ['first_name', 'business', 'meeting_title', 'meeting_clause'],
  meeting_confirmation: ['first_name', 'when', 'service', 'service_clause', 'link', 'location'],
  invoice_reminder: ['first_name', 'business', 'invoice', 'amount', 'due', 'days_late', 'link'],
  agreement_reminder: ['first_name', 'business', 'title', 'link'],
  plan_past_due: ['first_name', 'business', 'plan', 'amount', 'link'],
};

export const AUTOMATION_TITLES = {
  thank_you: { title: 'Thank-you text', sub: 'The morning after an in-person meetup' },
  meeting_confirmation: { title: 'Meeting confirmation', sub: 'Sent when a meeting is booked from a text' },
  invoice_reminder: { title: 'Invoice nudge', sub: 'What a Nudge sends for an unpaid invoice' },
  agreement_reminder: { title: 'Agreement nudge', sub: 'What a Nudge sends for an unsigned agreement' },
  plan_past_due: { title: 'Plan past due', sub: 'What a Nudge sends when a card fails' },
};

export const SAMPLE_VARS = {
  first_name: 'Marcus',
  business: 'Bell Roofing',
  meeting_title: 'Content shoot at the shop',
  meeting_clause: ' about Content shoot at the shop',
  when: 'Mon, Sep 28, 2:30 PM',
  service: 'marketing services',
  service_clause: ' to go over marketing services',
  link: "Here's the Google Meet link: meet.google.com/abc-defg-hij",
  location: '23018 Undertaken Path, Katy',
  invoice: 'INV-0043',
  amount: '$2,400',
  due: 'Sep 23',
  days_late: '2',
  title: 'Website + SEO',
  plan: 'CRM care',
};

export function fillTemplate(tpl, vars) {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(v == null ? '' : String(v));
  out = out.replace(/\{[a-z_]+\}/g, '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').replace(/\(\s*\)/g, '').trim();
}

// The settings endpoint returns rows of { key, value }; find and merge ours.
export function parseAutomations(rows) {
  const list = Array.isArray(rows) ? rows : (rows?.settings || rows?.rows || []);
  const raw = list.find(r => r.key === 'automations')?.value;
  let parsed = {};
  try { parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {}; } catch (_) { parsed = {}; }
  const out = {};
  for (const k of Object.keys(DEFAULT_AUTOMATIONS)) out[k] = { ...DEFAULT_AUTOMATIONS[k], ...(parsed[k] || {}) };
  return out;
}
