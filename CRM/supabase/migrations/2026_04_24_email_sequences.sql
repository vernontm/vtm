-- Email sequences schema.
-- The API in api/crm/email-sequences.js and api/crm/email-cron.js references
-- these tables; they existed in the live DB but had no repo migration, so a
-- fresh environment could not stand up the app. This migration is written
-- idempotently (IF NOT EXISTS) so it can safely be re-applied.

-- ── crm_email_sequences ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_email_sequences (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          uuid NOT NULL REFERENCES crm_content_clients(id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text,
  -- Qualification rules. trigger_tag kept for back-compat; trigger_tags_all/none are
  -- the canonical arrays (AND-of-all, NONE-of-excluded).
  trigger_tag        text,
  trigger_tags_all   text[] NOT NULL DEFAULT '{}',
  trigger_tags_none  text[] NOT NULL DEFAULT '{}',
  active             boolean NOT NULL DEFAULT false,
  -- Send windowing.
  send_days          text[] NOT NULL DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
  send_window_start  time,
  send_window_end    time,
  send_timezone      text NOT NULL DEFAULT 'America/Chicago',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_email_sequences_client ON crm_email_sequences(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_sequences_active ON crm_email_sequences(active) WHERE active = true;

-- ── crm_email_sequence_steps ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_email_sequence_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id   uuid NOT NULL REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
  step_order    int  NOT NULL DEFAULT 1,
  subject       text NOT NULL DEFAULT '',
  preview_text  text,
  html_body     text NOT NULL DEFAULT '',
  delay_amount  int  NOT NULL DEFAULT 1,
  delay_unit    text NOT NULL DEFAULT 'days' CHECK (delay_unit IN ('minutes','hours','days')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_email_sequence_steps_sequence
  ON crm_email_sequence_steps(sequence_id, step_order);

-- ── crm_email_sequence_enrollments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_email_sequence_enrollments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id   uuid NOT NULL REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
  contact_id    uuid NOT NULL REFERENCES crm_email_contacts(id)   ON DELETE CASCADE,
  current_step  int  NOT NULL DEFAULT 0,
  next_send_at  timestamptz,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','paused','completed','unsubscribed','errored')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_enrollments_due
  ON crm_email_sequence_enrollments(next_send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_enrollments_sequence
  ON crm_email_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_enrollments_contact
  ON crm_email_sequence_enrollments(contact_id);

-- ── crm_email_sequence_sends (engagement log) ────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_email_sequence_sends (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    uuid NOT NULL REFERENCES crm_email_sequences(id) ON DELETE CASCADE,
  enrollment_id  uuid REFERENCES crm_email_sequence_enrollments(id) ON DELETE SET NULL,
  step_id        uuid REFERENCES crm_email_sequence_steps(id)       ON DELETE SET NULL,
  contact_id     uuid REFERENCES crm_email_contacts(id)             ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'sent'
                 CHECK (status IN ('queued','sent','failed','bounced')),
  subject        text,
  provider_id    text, -- Resend / upstream message id
  sent_at        timestamptz NOT NULL DEFAULT now(),
  opened_at      timestamptz,
  clicked_at     timestamptz,
  error          text
);
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_sends_sequence ON crm_email_sequence_sends(sequence_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_sends_contact  ON crm_email_sequence_sends(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_sends_opened   ON crm_email_sequence_sends(opened_at)  WHERE opened_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_email_seq_sends_clicked  ON crm_email_sequence_sends(clicked_at) WHERE clicked_at IS NOT NULL;

-- ── Row-Level Security (defense in depth) ────────────────────────────────────
-- API access uses the service key and bypasses RLS, but policies are here so
-- any future anon/user-keyed access is tenant-safe by default.
ALTER TABLE crm_email_sequences              ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_sequence_steps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_sequence_enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_email_sequence_sends         ENABLE ROW LEVEL SECURITY;

-- Assumes is_crm_admin() + has_crm_access(client_id) exist from an earlier
-- tenant-rls migration. If not, the rest of the CRM also breaks — so it's a
-- safe dependency.
DROP POLICY IF EXISTS p_seq_tenant_read  ON crm_email_sequences;
DROP POLICY IF EXISTS p_seq_tenant_write ON crm_email_sequences;
CREATE POLICY p_seq_tenant_read  ON crm_email_sequences FOR SELECT
  USING (is_crm_admin() OR has_crm_access(client_id));
CREATE POLICY p_seq_tenant_write ON crm_email_sequences FOR ALL
  USING (is_crm_admin() OR has_crm_access(client_id))
  WITH CHECK (is_crm_admin() OR has_crm_access(client_id));

-- Steps/enrollments/sends scope via their parent sequence's client_id.
DROP POLICY IF EXISTS p_seq_steps_tenant ON crm_email_sequence_steps;
CREATE POLICY p_seq_steps_tenant ON crm_email_sequence_steps FOR ALL
  USING (
    is_crm_admin() OR EXISTS (
      SELECT 1 FROM crm_email_sequences s
      WHERE s.id = crm_email_sequence_steps.sequence_id
        AND has_crm_access(s.client_id)
    )
  )
  WITH CHECK (
    is_crm_admin() OR EXISTS (
      SELECT 1 FROM crm_email_sequences s
      WHERE s.id = crm_email_sequence_steps.sequence_id
        AND has_crm_access(s.client_id)
    )
  );

DROP POLICY IF EXISTS p_seq_enroll_tenant ON crm_email_sequence_enrollments;
CREATE POLICY p_seq_enroll_tenant ON crm_email_sequence_enrollments FOR ALL
  USING (
    is_crm_admin() OR EXISTS (
      SELECT 1 FROM crm_email_sequences s
      WHERE s.id = crm_email_sequence_enrollments.sequence_id
        AND has_crm_access(s.client_id)
    )
  )
  WITH CHECK (
    is_crm_admin() OR EXISTS (
      SELECT 1 FROM crm_email_sequences s
      WHERE s.id = crm_email_sequence_enrollments.sequence_id
        AND has_crm_access(s.client_id)
    )
  );

DROP POLICY IF EXISTS p_seq_sends_tenant ON crm_email_sequence_sends;
CREATE POLICY p_seq_sends_tenant ON crm_email_sequence_sends FOR ALL
  USING (
    is_crm_admin() OR EXISTS (
      SELECT 1 FROM crm_email_sequences s
      WHERE s.id = crm_email_sequence_sends.sequence_id
        AND has_crm_access(s.client_id)
    )
  )
  WITH CHECK (
    is_crm_admin() OR EXISTS (
      SELECT 1 FROM crm_email_sequences s
      WHERE s.id = crm_email_sequence_sends.sequence_id
        AND has_crm_access(s.client_id)
    )
  );
