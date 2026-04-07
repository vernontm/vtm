-- Subscription tracker table for CRM
-- Tracks recurring subscriptions, sourced manually or scanned from Gmail

CREATE TABLE crm_subscriptions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service         TEXT        NOT NULL,
  amount          DECIMAL,
  billing_cycle   TEXT,                          -- monthly, yearly, quarterly, etc.
  next_renewal    TIMESTAMPTZ,
  gmail_message_id TEXT,                         -- source email message ID
  status          TEXT        DEFAULT 'active',  -- active, cancelled, paused
  category        TEXT,                          -- software, hosting, marketing, etc.
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for common queries
CREATE INDEX idx_crm_subscriptions_status ON crm_subscriptions (status);
CREATE INDEX idx_crm_subscriptions_next_renewal ON crm_subscriptions (next_renewal);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_crm_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crm_subscriptions_updated_at
  BEFORE UPDATE ON crm_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_subscriptions_updated_at();

-- Enable RLS (service-key bypass, same pattern as other CRM tables)
ALTER TABLE crm_subscriptions ENABLE ROW LEVEL SECURITY;
