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
};

// {first_name} {business} {meeting_title} {meeting_clause} {when} {service}
// {service_clause} {link} {location}: unknown ones render empty.
const PLACEHOLDERS = ['first_name', 'business', 'meeting_title', 'meeting_clause', 'when', 'service', 'service_clause', 'link', 'location'];

async function getAutomations() {
  try {
    const rows = await supaFetch('crm_app_settings?key=eq.automations&select=value&limit=1');
    const raw = rows?.[0]?.value;
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return {
      thank_you: { ...DEFAULTS.thank_you, ...(parsed.thank_you || {}) },
      meeting_confirmation: { ...DEFAULTS.meeting_confirmation, ...(parsed.meeting_confirmation || {}) },
    };
  } catch (e) {
    console.error('getAutomations failed, using defaults:', e.message);
    return { thank_you: { ...DEFAULTS.thank_you }, meeting_confirmation: { ...DEFAULTS.meeting_confirmation } };
  }
}

function fillTemplate(tpl, vars) {
  let out = String(tpl || '');
  for (const [k, v] of Object.entries(vars || {})) out = out.split(`{${k}}`).join(v == null ? '' : String(v));
  out = out.replace(/\{[a-z_]+\}/g, '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').replace(/\(\s*\)/g, '').trim();
}

module.exports = { DEFAULTS, PLACEHOLDERS, getAutomations, fillTemplate };
