-- 003_email_marketing_tables.sql
-- Email marketing tables for CRM
-- Run after 001_crm_tables.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. crm_email_config (per-client Resend keys + sender info)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_config (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE CASCADE,
  resend_api_key text NOT NULL,
  from_email text NOT NULL,
  from_name text DEFAULT '',
  daily_limit integer DEFAULT 100,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE crm_email_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_email_config"
  ON crm_email_config FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- 2. crm_email_contacts
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_contacts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text DEFAULT '',
  tags jsonb DEFAULT '[]',
  status text DEFAULT 'active'
    CHECK (status IN ('active', 'unsubscribed', 'bounced')),
  welcomed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, email)
);

ALTER TABLE crm_email_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_email_contacts"
  ON crm_email_contacts FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_email_contacts_client ON crm_email_contacts(client_id);
CREATE INDEX idx_email_contacts_tags ON crm_email_contacts USING gin(tags);

-- ============================================================
-- 3. crm_email_templates (welcome emails, reusable templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL DEFAULT '',
  template_type text DEFAULT 'blast'
    CHECK (template_type IN ('welcome', 'blast')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_email_templates"
  ON crm_email_templates FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- 4. crm_email_campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_campaigns (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id uuid REFERENCES crm_content_clients(id) ON DELETE CASCADE,
  subject text NOT NULL,
  html_body text NOT NULL DEFAULT '',
  tag_filter jsonb DEFAULT '[]',
  status text DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'partial')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  total_recipients integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE crm_email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_email_campaigns"
  ON crm_email_campaigns FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_email_campaigns_client ON crm_email_campaigns(client_id);
CREATE INDEX idx_email_campaigns_status ON crm_email_campaigns(status);

-- ============================================================
-- 5. crm_email_sends (individual send tracking + rollover)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_sends (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid REFERENCES crm_email_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES crm_email_contacts(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'scheduled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  resend_id text,
  error text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crm_email_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_email_sends"
  ON crm_email_sends FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_email_sends_campaign ON crm_email_sends(campaign_id);
CREATE INDEX idx_email_sends_status ON crm_email_sends(status);
CREATE INDEX idx_email_sends_scheduled ON crm_email_sends(scheduled_at) WHERE status = 'scheduled';

-- ============================================================
-- 6. crm_email_daily_usage (track sends per day per config for rollover)
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_email_daily_usage (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_id uuid REFERENCES crm_email_config(id) ON DELETE CASCADE,
  send_date date NOT NULL DEFAULT CURRENT_DATE,
  send_count integer DEFAULT 0,
  UNIQUE(config_id, send_date)
);

ALTER TABLE crm_email_daily_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_email_daily_usage"
  ON crm_email_daily_usage FOR ALL
  USING (true) WITH CHECK (true);
