-- Drop the half-built local email sequences feature.
-- Drip delivery is now handled exclusively by MailerLite Automations
-- (triggered by group/tag membership). The in-CRM sequence builder, its
-- background sender, and the supporting tables are no longer used.
--
-- Safe to re-run; CASCADE clears dependent policies and FKs.

DROP TABLE IF EXISTS crm_email_sequence_sends       CASCADE;
DROP TABLE IF EXISTS crm_email_sequence_enrollments CASCADE;
DROP TABLE IF EXISTS crm_email_sequence_steps       CASCADE;
DROP TABLE IF EXISTS crm_email_sequences            CASCADE;
