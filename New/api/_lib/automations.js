const { supaFetch } = require('./supabase.js');

// Automation templates, edited on the app's Automations page and stored as
// one JSON value in crm_app_settings (key "automations"). Each automated text
// either fills its template with the placeholders below, or, in assistant
// mode, lets the model write it using the template as the style guide.
const DEFAULTS = {
  thank_you: {
    enabled: true,
    send_hour: 8,                      // Central, the morning after the meetup
    mode: 'template',                  // 'template' | 'assistant'
    template: 'Hey {first_name}, thanks again for meeting up yesterday{meeting_clause}. Really enjoyed it. If any questions come up, just text me here.',
  },
  meeting_confirmation: {
    enabled: true,
    mode: 'template',
    template: "You're all set for {when}{service_clause}. {link}",
  },
  // Nudges (crm/nudges.js): sent by hand from the Money screen or a client's file.
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

// {first_name} {business} {meeting_title} {meeting_clause} {when} {service}
// {service_clause} {link} {location} {invoice} {amount} {due} {days_late}
// {title} {plan}: unknown ones render empty.
const PLACEHOLDERS = ['first_name', 'business', 'meeting_title', 'meeting_clause', 'when', 'service', 'service_clause', 'link', 'location', 'invoice', 'amount', 'due', 'days_late', 'title', 'plan'];

// Every key in DEFAULTS is merged with what was saved, and any extra saved
// key comes through as is, so a new template never needs a change here.
async function getAutomations() {
  let parsed = {};
  try {
    const rows = await supaFetch('crm_app_settings?key=eq.automations&select=value&limit=1');
    const raw = rows?.[0]?.value;
    parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    if (!parsed || typeof parsed !== 'object') parsed = {};
  } catch (e) {
    console.error('getAutomations failed, using defaults:', e.message);
    parsed = {};
  }
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    const saved = parsed[key] && typeof parsed[key] === 'object' ? parsed[key] : {};
    out[key] = { ...DEFAULTS[key], ...saved };
  }
  for (const key of Object.keys(parsed)) {
    if (!out[key] && parsed[key] && typeof parsed[key] === 'object') out[key] = { ...parsed[key] };
  }
  return out;
}

function fillTemplate(tpl, vars) {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(v == null ? '' : String(v));
  out = out.replace(/\{[a-z_]+\}/g, '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').replace(/\(\s*\)/g, '').trim();
}

module.exports = { DEFAULTS, PLACEHOLDERS, getAutomations, fillTemplate };
