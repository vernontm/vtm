// DEPRECATED: In-CRM sequence enrollment is replaced by MailerLite automations.
// This module is kept as a no-op so existing imports don't break during the
// transition. New code should call syncContactToMailerlite from ./mailerlite.js
// instead.
//
// Old behavior: auto-enroll a contact into every active crm_email_sequences
// whose tag rules match. We no longer do this — MailerLite handles sequence
// delivery via group-triggered automations.

async function autoEnrollContact() {
  return { enrolled: [], skipped: [], errors: [], deprecated: true };
}

module.exports = { autoEnrollContact };
