const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const adapter = new FileSync(path.join(__dirname, 'db.json'));
const db = low(adapter);

const now = () => new Date().toISOString();

// Sample data for first run
const seedLeads = [
  { id: uuidv4(), name: 'Web Dev Project', status: 'Qualified', company: '', title: 'Web Developer', email: '', phone: '', lead_source: 'Referral', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Prestige Mobile', status: 'Qualified', company: 'Prestige Mobile D.', title: 'Mobile App', email: 'info@pm.com', phone: '+112813875041', lead_source: 'Cold Outreach', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'TechStart Solutions', status: 'New Lead', company: 'TechStart Inc.', title: 'CEO', email: 'info@techstart.com', phone: '+15551234567', lead_source: 'Website', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Digital Marketing Co', status: 'Contacted', company: 'DMC Group', title: 'Marketing Director', email: 'dm@dmc.com', phone: '+15559876543', lead_source: 'LinkedIn', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Sunrise Branding', status: 'New Lead', company: 'Sunrise LLC', title: 'Brand Manager', email: 'sr@sunrise.com', phone: '+15552223333', lead_source: 'Website', notes: '', created_at: now(), updated_at: now() },
];

const seedContacts = [
  { id: uuidv4(), name: 'Shreda (RTI Agency)', email: 'shreda@rtiagency.com', phone: '+15551112222', company: 'RTI Agency', title: 'Director', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Mariam Ghaly', email: 'mariam@gmail.com', phone: '+15553334444', company: '', title: 'Freelancer', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Royal Movers', email: 'info@royalmovers.com', phone: '+15555556666', company: 'Royal Movers', title: 'Owner', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Benjamin (Prestige)', email: 'benjamin@pm.com', phone: '+15557778888', company: 'Prestige Mobile', title: 'CEO', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Jesse', email: 'jesse@music.com', phone: '+15559990000', company: '', title: 'Artist', notes: '', created_at: now(), updated_at: now() },
];

const seedDeals = (contacts) => [
  { id: uuidv4(), name: 'RTI Agency App', stage: 'Won', value: 2480, owner: 'Vernon', contact_id: contacts[0].id, company: 'RTI Agency', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Mariam Ghaly Website', stage: 'Won', value: 500, owner: 'Vernon', contact_id: contacts[1].id, company: '', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Royal Movers Branding', stage: 'Won', value: 200, owner: 'Vernon', contact_id: contacts[2].id, company: 'Royal Movers', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Prestige Mobile App', stage: 'Won', value: 350, owner: 'Vernon', contact_id: contacts[3].id, company: 'Prestige Mobile', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Music Video Production', stage: 'Won', value: 350, owner: 'Vernon', contact_id: contacts[4].id, company: '', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'New Website Package', stage: 'New', value: 1500, owner: 'Vernon', contact_id: '', company: 'TechStart Inc.', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Social Media Management', stage: 'Proposal', value: 800, owner: 'Vernon', contact_id: '', company: 'DMC Group', notes: '', created_at: now(), updated_at: now() },
];

const seedAccounts = [
  { id: uuidv4(), name: 'RTI Agency', industry: 'Marketing', email: 'info@rtiagency.com', phone: '+15551112222', website: 'rtiagency.com', address: '', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Prestige Mobile', industry: 'Technology', email: 'info@pm.com', phone: '+15557778888', website: 'pm.com', address: '', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Royal Movers', industry: 'Logistics', email: 'info@royalmovers.com', phone: '+15555556666', website: 'royalmovers.com', address: '', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'TechStart Inc.', industry: 'Technology', email: 'info@techstart.com', phone: '+15551234567', website: 'techstart.com', address: '', notes: '', created_at: now(), updated_at: now() },
];

const seedProjects = (contacts) => [
  { id: uuidv4(), name: 'RTI Agency Mobile App', client: 'RTI Agency', status: 'Completed', value: 2480, start_date: '2024-01-15', end_date: '2024-03-30', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Prestige Mobile App', client: 'Prestige Mobile', status: 'In Progress', value: 350, start_date: '2024-02-01', end_date: '2025-05-15', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Music Video Post-Production', client: 'Jesse', status: 'Active', value: 350, start_date: '2024-03-01', end_date: '2024-04-01', notes: '', created_at: now(), updated_at: now() },
  { id: uuidv4(), name: 'Royal Movers Brand Kit', client: 'Royal Movers', status: 'Completed', value: 200, start_date: '2024-01-01', end_date: '2024-02-01', notes: '', created_at: now(), updated_at: now() },
];

// Initialize with defaults (only seeds if db.json doesn't exist or is empty)
const contacts = seedContacts;
db.defaults({
  leads: seedLeads,
  contacts: contacts,
  deals: seedDeals(contacts),
  accounts: seedAccounts,
  projects: seedProjects(contacts),
  project_items: [],
  activities: [],
  invoices: [],
  manual_invoices: [],

  // ── Meetings Collections ─────────────────────────────────────────────────────
  meetings:              [],   // cached Google Calendar events
  meeting_lead_links:    [],   // links meetings to CRM leads
  meeting_summaries:     [],   // Claude-generated summaries per meeting
  meeting_chat_history:  [],   // Sidekick conversation history per meeting

  // ── Notifications ────────────────────────────────────────────────────────────
  dismissed_notifications: [],  // IDs of dismissed notification items

  // ── Quick Notes ──────────────────────────────────────────────────────────────
  quick_notes: [],              // Saved links, notes, and reusable info

  // ── Lead Scout ───────────────────────────────────────────────────────────────
  lead_scout_pushed: [],        // Tracks leads pushed to CRM to avoid duplicates

  // ── Demo Pages ───────────────────────────────────────────────────────────────
  lead_demos: [],               // Generated demo landing pages per lead

  // ── AI Caller ────────────────────────────────────────────────────────────────
  ai_call_log: [],              // ElevenLabs outbound call history

  // ── Todo Board ───────────────────────────────────────────────────────────────
  todo_groups: [],
  todos: [],

  // ── Content Pipeline ─────────────────────────────────────────────────────────
  content_items: [],        // Content ideas/posts: status idea|scripted|approved|generating|completed|posted

  // ── Email Campaign Collections ───────────────────────────────────────────────
  email_queue: [],          // AI-generated emails: status draft|approved|sent|skipped
  communication_log: [],    // Every sent/drafted email + reply tracking
  sequences: [],            // Phase 2 scaffold: drip campaign sequences
  sequence_steps: [],       // Phase 2 scaffold: steps within a sequence
  app_settings: [           // Key-value config store
    { key: 'company_name',          value: 'Vernon Tech & Media' },
    { key: 'services_offered',      value: '' },
    { key: 'target_client',         value: '' },
    { key: 'tone_preference',       value: 'professional' },
    { key: 'sender_name',           value: 'Vernon' },
    { key: 'email_signature',       value: '' },
    { key: 'gmail_access_token',    value: '' },
    { key: 'gmail_refresh_token',   value: '' },
    { key: 'gmail_token_expiry',    value: '' },
    { key: 'gmail_connected_email', value: '' },
    { key: 'auto_draft_enabled',    value: 'false' },
    { key: 'daily_send_cap',        value: '50' },
    { key: 'unsubscribe_enabled',   value: 'true' },
    { key: 'unsubscribe_text',      value: 'If you no longer wish to receive emails from us, reply UNSUBSCRIBE.' },
    { key: 'gmail_label_name',      value: 'VernonTM' },
    { key: 'calendar_link',         value: 'https://calendar.app.google/JTyfafRNYLr6pzSt5' },
  ],
}).write();

// ── Backfill new email-campaign fields onto existing lead records ─────────────
const leadsNeedingDefaults = db.get('leads').filter(l => l.lead_score === undefined).value();
if (leadsNeedingDefaults.length > 0) {
  leadsNeedingDefaults.forEach(l => {
    db.get('leads').find({ id: l.id }).assign({
      lead_score:        0,
      lead_segment:      'cold',
      last_contact_date: null,
      emails_sent_count: 0,
    }).write();
  });
  console.log(`[db] Backfilled email-campaign fields on ${leadsNeedingDefaults.length} leads`);
}

// ── Backfill new app_settings keys that weren't present when db was first created ─
const settingBackfills = [
  { key: 'gmail_label_name', value: 'VernonTM' },
  { key: 'calendar_link',    value: 'https://calendar.app.google/JTyfafRNYLr6pzSt5' },
  { key: 'nanobanana_api_key',     value: '' },
  { key: 'content_output_base',    value: '' },
];
settingBackfills.forEach(({ key, value }) => {
  if (!db.get('app_settings').find({ key }).value()) {
    db.get('app_settings').push({ key, value }).write();
    console.log(`[db] Added missing setting: ${key}`);
  }
});

// ── Backfill new deal fields (payment_status, created_date) ──────────────────
const dealsNeedingNewFields = db.get('deals').filter(d => d.payment_status === undefined).value();
if (dealsNeedingNewFields.length > 0) {
  dealsNeedingNewFields.forEach(d => {
    db.get('deals').find({ id: d.id }).assign({
      payment_status: 'Pending',
      created_date: d.created_at ? d.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    }).write();
  });
  console.log(`[db] Backfilled payment_status + created_date on ${dealsNeedingNewFields.length} deals`);
}

// ── Backfill amount_paid on existing deals ────────────────────────────────────
const dealsNeedingAmountPaid = db.get('deals').filter(d => d.amount_paid === undefined).value();
if (dealsNeedingAmountPaid.length > 0) {
  dealsNeedingAmountPaid.forEach(d => {
    db.get('deals').find({ id: d.id }).assign({ amount_paid: 0 }).write();
  });
  console.log(`[db] Backfilled amount_paid on ${dealsNeedingAmountPaid.length} deals`);
}

// ── Ensure manual_invoices collection exists on pre-existing db.json ──────────
if (!db.has('manual_invoices').value()) { db.set('manual_invoices', []).write(); }

// ── Ensure todo collections exist on pre-existing db.json files ──────────────
if (!db.has('todo_groups').value()) { db.set('todo_groups', []).write(); }
if (!db.has('todos').value())       { db.set('todos', []).write(); }

// ── Ensure meetings collections exist on pre-existing db.json files ──────────
if (!db.has('meetings').value())             { db.set('meetings', []).write(); }
if (!db.has('meeting_lead_links').value())   { db.set('meeting_lead_links', []).write(); }
if (!db.has('meeting_summaries').value())    { db.set('meeting_summaries', []).write(); }
if (!db.has('meeting_chat_history').value())    { db.set('meeting_chat_history', []).write(); }
if (!db.has('dismissed_notifications').value()) { db.set('dismissed_notifications', []).write(); }
if (!db.has('quick_notes').value())             { db.set('quick_notes', []).write(); }
if (!db.has('lead_scout_pushed').value())       { db.set('lead_scout_pushed', []).write(); }
if (!db.has('lead_demos').value())              { db.set('lead_demos', []).write(); }
if (!db.has('ai_call_log').value())             { db.set('ai_call_log', []).write(); }
if (!db.has('content_items').value())          { db.set('content_items', []).write(); }

// ── Backfill call_completed on existing leads ─────────────────────────────────
const leadsNeedingCallCompleted = db.get('leads').filter(l => l.call_completed === undefined).value();
if (leadsNeedingCallCompleted.length > 0) {
  leadsNeedingCallCompleted.forEach(l => {
    db.get('leads').find({ id: l.id }).assign({ call_completed: false }).write();
  });
  console.log(`[db] Backfilled call_completed on ${leadsNeedingCallCompleted.length} leads`);
}

module.exports = { db, uuidv4, now };
