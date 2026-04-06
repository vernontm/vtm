-- ============================================================================
-- CRM Tables Migration for VTM Supabase (etcobsnhkbmbxsnwknzn)
-- Run this in the Supabase SQL Editor
-- ============================================================================

-- ── Contacts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text DEFAULT '',
  phone text DEFAULT '',
  company text DEFAULT '',
  title text DEFAULT '',
  notes text DEFAULT '',
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Leads ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text DEFAULT 'New Lead',
  company text DEFAULT '',
  title text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  lead_source text DEFAULT '',
  notes text DEFAULT '',
  lead_score integer DEFAULT 0,
  lead_segment text DEFAULT 'cold',
  last_contact_date timestamptz,
  emails_sent_count integer DEFAULT 0,
  call_completed boolean DEFAULT false,
  interest text DEFAULT '',
  archived boolean DEFAULT false,
  -- Survey fields
  submission_date text DEFAULT '',
  budget text DEFAULT '',
  time_available text DEFAULT '',
  location text DEFAULT '',
  tiktok_handle text DEFAULT '',
  has_business text DEFAULT '',
  website text DEFAULT '',
  social_media text DEFAULT '',
  current_situation text DEFAULT '',
  financial_goal text DEFAULT '',
  why_now text DEFAULT '',
  skills_story text DEFAULT '',
  previous_attempts text DEFAULT '',
  biggest_fear text DEFAULT '',
  tech_comfort text DEFAULT '',
  content_preference text DEFAULT '',
  work_style text DEFAULT '',
  biggest_wish text DEFAULT '',
  -- Gmail sync fields
  last_reply_at timestamptz,
  last_reply_subject text DEFAULT '',
  last_reply_summary text DEFAULT '',
  last_reply_thread_id text DEFAULT '',
  last_reply_message_id text DEFAULT '',
  last_reply_rfc_message_id text DEFAULT '',
  last_sent_at timestamptz,
  last_sent_subject text DEFAULT '',
  last_sent_preview text DEFAULT '',
  last_sent_thread_id text DEFAULT '',
  last_sent_message_id text DEFAULT '',
  last_sent_rfc_message_id text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Deals ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  stage text DEFAULT 'New',
  value numeric DEFAULT 0,
  amount_paid numeric DEFAULT 0,
  payment_status text DEFAULT 'Pending',
  owner text DEFAULT 'Vernon',
  contact_id text DEFAULT '',
  company text DEFAULT '',
  notes text DEFAULT '',
  created_date text DEFAULT '',
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Accounts ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text DEFAULT '',
  email text DEFAULT '',
  phone text DEFAULT '',
  website text DEFAULT '',
  address text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Projects ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client text DEFAULT '',
  status text DEFAULT 'Active',
  value numeric DEFAULT 0,
  start_date text DEFAULT '',
  end_date text DEFAULT '',
  notes text DEFAULT '',
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Project Items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_project_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES crm_projects(id) ON DELETE CASCADE,
  name text DEFAULT '',
  status text DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Activities ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text DEFAULT '',
  description text DEFAULT '',
  entity_type text DEFAULT '',
  entity_id text DEFAULT '',
  lead_id text DEFAULT '',
  contact_id text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── Todo Groups ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_todo_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT '#c8f135',
  position integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── Todos ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES crm_todo_groups(id) ON DELETE CASCADE,
  text text DEFAULT '',
  completed boolean DEFAULT false,
  position integer DEFAULT 0,
  due_date text DEFAULT '',
  priority text DEFAULT 'medium',
  assigned_to text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Quick Notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_quick_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text DEFAULT '',
  content text DEFAULT '',
  type text DEFAULT 'note',
  pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── App Settings (key-value store) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_app_settings (
  key text PRIMARY KEY,
  value text DEFAULT ''
);

-- Seed default settings
INSERT INTO crm_app_settings (key, value) VALUES
  ('company_name', 'Vernon Tech & Media'),
  ('services_offered', ''),
  ('target_client', ''),
  ('tone_preference', 'professional'),
  ('sender_name', 'Vernon'),
  ('email_signature', ''),
  ('gmail_access_token', ''),
  ('gmail_refresh_token', ''),
  ('gmail_token_expiry', ''),
  ('gmail_connected_email', ''),
  ('auto_draft_enabled', 'false'),
  ('daily_send_cap', '50'),
  ('unsubscribe_enabled', 'true'),
  ('unsubscribe_text', 'If you no longer wish to receive emails from us, reply UNSUBSCRIBE.'),
  ('gmail_label_name', 'VernonTM'),
  ('calendar_link', 'https://calendar.app.google/JTyfafRNYLr6pzSt5')
ON CONFLICT (key) DO NOTHING;

-- ── Email Queue (Phase 2 prep) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text DEFAULT '',
  lead_name text DEFAULT '',
  lead_email text DEFAULT '',
  lead_segment text DEFAULT '',
  email_type text DEFAULT '',
  subject_lines jsonb DEFAULT '[]',
  selected_subject_index integer DEFAULT 0,
  body text DEFAULT '',
  reasoning text DEFAULT '',
  confidence_score numeric DEFAULT 0,
  personalization_hooks_used jsonb DEFAULT '[]',
  suggested_next_action text DEFAULT '',
  status text DEFAULT 'draft',
  gmail_draft_id text DEFAULT '',
  gmail_message_id text DEFAULT '',
  reply_thread_id text DEFAULT '',
  reply_rfc_message_id text DEFAULT '',
  generated_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Communication Log (Phase 2 prep) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_communication_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text DEFAULT '',
  queue_item_id text DEFAULT '',
  direction text DEFAULT '',
  subject text DEFAULT '',
  body_preview text DEFAULT '',
  gmail_message_id text DEFAULT '',
  sent_at timestamptz,
  reply_received boolean DEFAULT false,
  reply_received_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ── Invoices (Phase 3 prep) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text DEFAULT '',
  stripe_invoice_id text DEFAULT '',
  stripe_invoice_url text DEFAULT '',
  email text DEFAULT '',
  customer_name text DEFAULT '',
  amount numeric DEFAULT 0,
  description text DEFAULT '',
  phase_number integer DEFAULT 1,
  total_phases integer DEFAULT 1,
  status text DEFAULT 'open',
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Manual Invoices (Phase 3 prep) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_manual_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id text DEFAULT '',
  description text DEFAULT '',
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Meetings (Phase 4 prep) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_meetings (
  id text PRIMARY KEY,
  summary text DEFAULT '',
  start_time timestamptz,
  end_time timestamptz,
  duration_minutes integer DEFAULT 0,
  location text DEFAULT '',
  description text DEFAULT '',
  meet_link text DEFAULT '',
  attendees jsonb DEFAULT '[]',
  html_link text DEFAULT '',
  status text DEFAULT '',
  notes text DEFAULT '',
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_meeting_lead_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id text REFERENCES crm_meetings(id) ON DELETE CASCADE,
  lead_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_meeting_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id text REFERENCES crm_meetings(id) ON DELETE CASCADE,
  summary text DEFAULT '',
  key_points jsonb DEFAULT '[]',
  action_items jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_meeting_chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id text REFERENCES crm_meetings(id) ON DELETE CASCADE,
  role text DEFAULT '',
  content text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- ── Dismissed Notifications (Phase 5 prep) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_dismissed_notifications (
  id text PRIMARY KEY,
  dismissed_at timestamptz DEFAULT now()
);

-- ── Enable RLS on all CRM tables ────────────────────────────────────────────
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_project_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_todo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_quick_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_manual_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_meeting_lead_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_meeting_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_meeting_chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_dismissed_notifications ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: Allow authenticated users full access ─────────────────────
-- (Single admin user - simple policy)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'crm_contacts','crm_leads','crm_deals','crm_accounts','crm_projects',
    'crm_project_items','crm_activities','crm_todo_groups','crm_todos',
    'crm_quick_notes','crm_app_settings','crm_email_queue','crm_communication_log',
    'crm_invoices','crm_manual_invoices','crm_meetings','crm_meeting_lead_links',
    'crm_meeting_summaries','crm_meeting_chat_history','crm_dismissed_notifications'
  ] LOOP
    EXECUTE format('CREATE POLICY "auth_all_%s" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- Also allow service_role full access (for serverless functions using service key)
-- service_role bypasses RLS by default, so no additional policies needed.
