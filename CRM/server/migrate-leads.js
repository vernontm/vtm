/**
 * migrate-leads.js
 * One-time fix: remap shifted leads where CSV columns were misaligned on import.
 * Detection: if `email` field doesn't contain "@", the row is shifted.
 * Run: node server/migrate-leads.js
 */

const path = require('path');
const low  = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

const leads = db.get('leads').value();
let fixed = 0;

leads.forEach(lead => {
  // Only fix shifted leads: email field contains a location, not an email address
  if (!lead.email || lead.email.includes('@')) return;

  // Snapshot current values
  const cur = { ...lead };

  // Apply the correct mapping
  const remapped = {
    full_name:         cur.time_available     || '',  // actual full name
    name:              cur.time_available     || cur.name || '',  // display name
    email:             cur.budget             || '',  // email address
    location:          cur.email              || '',  // city / country
    website:           cur.location           || '',  // website URL or "No"
    has_business:      cur.tiktok_handle      || '',  // yes/no business
    tiktok_handle:     cur.has_business       || '',  // social media handles
    current_situation: cur.website            || '',  // what they do now
    financial_goal:    cur.social_media       || '',  // $$ goal
    why_now:           cur.current_situation  || '',  // motivation
    skills_story:      cur.financial_goal     || '',  // background / skills
    time_available:    cur.skills_story       || '',  // hours per week
    budget:            cur.previous_attempts  || '',  // $ budget
    previous_attempts: cur.why_now            || '',  // what they've tried
    // These fields were already correct — no change needed:
    // biggest_fear, biggest_wish, tech_comfort, content_preference, work_style
  };

  db.get('leads')
    .find({ id: lead.id })
    .assign(remapped)
    .write();

  console.log(`✓ Fixed: ${remapped.name} (${remapped.email}) — was: ${cur.name} / ${cur.email}`);
  fixed++;
});

console.log(`\nDone. Fixed ${fixed} leads.`);
