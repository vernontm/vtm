#!/usr/bin/env node
/**
 * One-time migration: LowDB (db.json) → Supabase
 *
 * Usage:
 *   SUPABASE_URL=https://etcobsnhkbmbxsnwknzn.supabase.co \
 *   SUPABASE_SERVICE_KEY=your_service_key \
 *   node migrate-lowdb-to-supabase.js
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
};

async function upsert(table, rows) {
  if (!rows || rows.length === 0) {
    console.log(`  ${table}: 0 rows (skipped)`);
    return;
  }

  // Batch in chunks of 50
  const chunks = [];
  for (let i = 0; i < rows.length; i += 50) {
    chunks.push(rows.slice(i, i + 50));
  }

  let total = 0;
  for (const chunk of chunks) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`  ${table}: ERROR ${res.status} - ${err}`);
      console.error(`  Sample row:`, JSON.stringify(chunk[0]).slice(0, 200));
      return;
    }
    total += chunk.length;
  }
  console.log(`  ${table}: ${total} rows migrated`);
}

async function main() {
  const dbPath = path.join(__dirname, '..', 'CRM', 'server', 'db.json');
  if (!fs.existsSync(dbPath)) {
    console.error(`db.json not found at ${dbPath}`);
    process.exit(1);
  }

  console.log('Reading db.json...');
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

  console.log('\nMigrating data to Supabase...\n');

  // Contacts
  await upsert('crm_contacts', (db.contacts || []).map(c => ({
    id: c.id, name: c.name || '', email: c.email || '', phone: c.phone || '',
    company: c.company || '', title: c.title || '', notes: c.notes || '',
    created_at: c.created_at, updated_at: c.updated_at,
  })));

  // Leads
  await upsert('crm_leads', (db.leads || []).map(l => ({
    id: l.id, name: l.name || '', status: l.status || 'New Lead',
    company: l.company || '', title: l.title || '', email: l.email || '',
    phone: l.phone || '', lead_source: l.lead_source || '', notes: l.notes || '',
    lead_score: l.lead_score || 0, lead_segment: l.lead_segment || 'cold',
    last_contact_date: l.last_contact_date || null,
    emails_sent_count: l.emails_sent_count || 0,
    call_completed: l.call_completed || false,
    interest: l.interest || '',
    submission_date: l.submission_date || '',
    budget: l.budget || '', time_available: l.time_available || '',
    location: l.location || '', tiktok_handle: l.tiktok_handle || '',
    has_business: l.has_business || '', website: l.website || '',
    social_media: l.social_media || '', current_situation: l.current_situation || '',
    financial_goal: l.financial_goal || '', why_now: l.why_now || '',
    skills_story: l.skills_story || '', previous_attempts: l.previous_attempts || '',
    biggest_fear: l.biggest_fear || '', tech_comfort: l.tech_comfort || '',
    content_preference: l.content_preference || '', work_style: l.work_style || '',
    biggest_wish: l.biggest_wish || '',
    last_reply_at: l.last_reply_at || null,
    last_reply_subject: l.last_reply_subject || '',
    last_reply_summary: l.last_reply_summary || '',
    last_reply_thread_id: l.last_reply_thread_id || '',
    last_reply_message_id: l.last_reply_message_id || '',
    last_reply_rfc_message_id: l.last_reply_rfc_message_id || '',
    last_sent_at: l.last_sent_at || null,
    last_sent_subject: l.last_sent_subject || '',
    last_sent_preview: l.last_sent_preview || '',
    last_sent_thread_id: l.last_sent_thread_id || '',
    last_sent_message_id: l.last_sent_message_id || '',
    last_sent_rfc_message_id: l.last_sent_rfc_message_id || '',
    created_at: l.created_at, updated_at: l.updated_at,
  })));

  // Deals
  await upsert('crm_deals', (db.deals || []).map(d => ({
    id: d.id, name: d.name || '', stage: d.stage || 'New',
    value: d.value || 0, amount_paid: d.amount_paid || 0,
    payment_status: d.payment_status || 'Pending',
    owner: d.owner || 'Vernon', contact_id: d.contact_id || '',
    company: d.company || '', notes: d.notes || '',
    created_date: d.created_date || '',
    created_at: d.created_at, updated_at: d.updated_at,
  })));

  // Accounts
  await upsert('crm_accounts', (db.accounts || []).map(a => ({
    id: a.id, name: a.name || '', industry: a.industry || '',
    email: a.email || '', phone: a.phone || '', website: a.website || '',
    address: a.address || '', notes: a.notes || '',
    created_at: a.created_at, updated_at: a.updated_at,
  })));

  // Projects
  await upsert('crm_projects', (db.projects || []).map(p => ({
    id: p.id, name: p.name || '', client: p.client || '',
    status: p.status || 'Active', value: p.value || 0,
    start_date: p.start_date || '', end_date: p.end_date || '',
    notes: p.notes || '',
    created_at: p.created_at, updated_at: p.updated_at,
  })));

  // Project Items
  await upsert('crm_project_items', (db.project_items || []).map(pi => ({
    id: pi.id, project_id: pi.project_id, name: pi.name || pi.title || '',
    status: pi.status || 'pending', notes: pi.notes || '',
    created_at: pi.created_at, updated_at: pi.updated_at,
  })));

  // Activities
  await upsert('crm_activities', (db.activities || []).map(a => ({
    id: a.id, type: a.type || '', description: a.description || '',
    entity_type: a.entity_type || '', entity_id: a.entity_id || '',
    lead_id: a.lead_id || '', contact_id: a.contact_id || '',
    notes: a.notes || '',
    created_at: a.created_at,
  })));

  // Todo Groups
  await upsert('crm_todo_groups', (db.todo_groups || []).map(g => ({
    id: g.id, name: g.name || '', color: g.color || '#c8f135',
    position: g.position || g.order || 0,
    created_at: g.created_at || new Date().toISOString(),
  })));

  // Todos
  await upsert('crm_todos', (db.todos || []).map(t => ({
    id: t.id, group_id: t.group_id, text: t.text || t.title || '',
    completed: t.completed || false, position: t.position || 0,
    due_date: t.due_date || '', priority: t.priority || 'medium',
    assigned_to: t.assigned_to || '',
    created_at: t.created_at, updated_at: t.updated_at,
  })));

  // Quick Notes
  await upsert('crm_quick_notes', (db.quick_notes || []).map(n => ({
    id: n.id, title: n.title || '', content: n.content || '',
    type: n.type || n.category || 'note', pinned: n.pinned || false,
    created_at: n.created_at, updated_at: n.updated_at,
  })));

  // App Settings
  await upsert('crm_app_settings', (db.app_settings || []).map(s => ({
    key: s.key, value: s.value || '',
  })));

  // Email Queue
  await upsert('crm_email_queue', (db.email_queue || []).map(e => ({
    id: e.id, lead_id: e.lead_id || '', lead_name: e.lead_name || '',
    lead_email: e.lead_email || '', lead_segment: e.lead_segment || '',
    email_type: e.email_type || '',
    subject_lines: JSON.stringify(e.subject_lines || []),
    selected_subject_index: e.selected_subject_index || 0,
    body: e.body || '', reasoning: e.reasoning || '',
    confidence_score: e.confidence_score || 0,
    personalization_hooks_used: JSON.stringify(e.personalization_hooks_used || []),
    suggested_next_action: e.suggested_next_action || '',
    status: e.status || 'draft',
    gmail_draft_id: e.gmail_draft_id || '',
    gmail_message_id: e.gmail_message_id || '',
    reply_thread_id: e.reply_thread_id || '',
    reply_rfc_message_id: e.reply_rfc_message_id || '',
    generated_at: e.generated_at || null,
    approved_at: e.approved_at || null,
    sent_at: e.sent_at || null,
    created_at: e.created_at, updated_at: e.updated_at,
  })));

  // Communication Log
  await upsert('crm_communication_log', (db.communication_log || []).map(c => ({
    id: c.id, lead_id: c.lead_id || '', queue_item_id: c.queue_item_id || '',
    direction: c.direction || '', subject: c.subject || '',
    body_preview: c.body_preview || '', gmail_message_id: c.gmail_message_id || '',
    sent_at: c.sent_at || null,
    reply_received: c.reply_received || false,
    reply_received_at: c.reply_received_at || null,
    created_at: c.created_at,
  })));

  // Invoices
  await upsert('crm_invoices', (db.invoices || []).map(i => ({
    id: i.id, deal_id: i.deal_id || '',
    stripe_invoice_id: i.stripe_invoice_id || '',
    stripe_invoice_url: i.stripe_invoice_url || '',
    email: i.email || '', customer_name: i.customer_name || '',
    amount: i.amount || 0, description: i.description || '',
    phase_number: i.phase_number || 1, total_phases: i.total_phases || 1,
    status: i.status || 'open', paid_at: i.paid_at || null,
    created_at: i.created_at, updated_at: i.updated_at,
  })));

  // Manual Invoices
  await upsert('crm_manual_invoices', (db.manual_invoices || []).map(i => ({
    id: i.id, deal_id: i.deal_id || '', description: i.description || '',
    amount: i.amount || 0, status: i.status || 'pending', notes: i.notes || '',
    created_at: i.created_at, updated_at: i.updated_at,
  })));

  // Meetings
  await upsert('crm_meetings', (db.meetings || []).map(m => ({
    id: m.id || m.google_event_id, summary: m.summary || m.title || '',
    start_time: m.start_time, end_time: m.end_time,
    duration_minutes: m.duration_minutes || 0,
    location: m.location || '', description: m.description || '',
    meet_link: m.meet_link || '',
    attendees: JSON.stringify(m.attendees || m.participants || []),
    html_link: m.html_link || '', status: m.status || '',
    notes: m.notes || '',
  })));

  // Meeting Lead Links
  await upsert('crm_meeting_lead_links', (db.meeting_lead_links || []).map(l => ({
    id: l.id, meeting_id: l.meeting_id, lead_id: l.lead_id,
    created_at: l.created_at,
  })));

  // Meeting Summaries
  await upsert('crm_meeting_summaries', (db.meeting_summaries || []).map(s => ({
    id: s.id, meeting_id: s.meeting_id, summary: s.summary || '',
    key_points: JSON.stringify(s.key_points || []),
    action_items: JSON.stringify(s.action_items || []),
    created_at: s.created_at || s.generated_at,
  })));

  // Meeting Chat History
  await upsert('crm_meeting_chat_history', (db.meeting_chat_history || []).map(c => ({
    id: c.id, meeting_id: c.meeting_id,
    role: c.role || (c.question ? 'user' : 'assistant'),
    content: c.content || c.question || c.answer || '',
    created_at: c.created_at || c.timestamp,
  })));

  // Dismissed Notifications
  if (db.dismissed_notifications && db.dismissed_notifications.length > 0) {
    await upsert('crm_dismissed_notifications', db.dismissed_notifications.map(id => ({
      id: typeof id === 'string' ? id : id.id,
    })));
  }

  console.log('\nMigration complete!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
