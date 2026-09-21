-- Influencer shoot tracking and per-shoot invoicing.
--
-- Additive only. Every existing crm_time_entries row (667 at time of writing)
-- gets kind='work' and keeps behaving exactly as it does today: the new columns
-- are all nullable and only read when kind='shoot'.
--
-- Why billable_minutes and mileage_rate are stored rather than computed on read:
--   billable_minutes freezes what the contract's minimum and rounding rule
--   produced at the moment the shoot was logged, so a later change to the rule
--   cannot silently restate an invoice a contractor already submitted.
--   mileage_rate freezes the IRS standard rate in effect on the travel date,
--   which is what contract 3.5 requires, since that rate changes annually.

alter table crm_time_entries
  add column if not exists kind             text not null default 'work',
  add column if not exists location         text,
  add column if not exists miles            numeric,
  add column if not exists billable_minutes integer,
  add column if not exists mileage_rate     numeric,
  add column if not exists statement_id     uuid;

alter table crm_time_entries
  drop constraint if exists crm_time_entries_kind_check;
alter table crm_time_entries
  add constraint crm_time_entries_kind_check check (kind in ('work', 'shoot'));

create index if not exists crm_time_entries_statement_idx
  on crm_time_entries (statement_id);
create index if not exists crm_time_entries_user_kind_idx
  on crm_time_entries (user_id, kind, work_date desc);

-- An invoice. Groups one or more shoots, so per-shoot invoicing is one
-- statement per shoot and a monthly cadence is one statement per period.
-- Contract 3.7 permits either, so the cadence stays a choice rather than a
-- rewrite.
create table if not exists crm_time_statements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  kind           text not null default 'shoot',
  period_start   date,
  period_end     date,
  status         text not null default 'draft',
  submitted_at   timestamptz,
  approved_at    timestamptz,
  disputed_at    timestamptz,
  dispute_note   text,
  billable_minutes integer,
  miles          numeric,
  hours_amount   numeric,
  mileage_amount numeric,
  total_amount   numeric,
  payment_id     uuid,
  created_at     timestamptz default now(),
  constraint crm_time_statements_kind_check   check (kind in ('shoot', 'period')),
  constraint crm_time_statements_status_check check (status in ('draft','submitted','approved','disputed','paid'))
);

create index if not exists crm_time_statements_user_idx
  on crm_time_statements (user_id, created_at desc);
create index if not exists crm_time_statements_status_idx
  on crm_time_statements (status);

-- The IRS standard business mileage rate, editable from Settings rather than
-- hardcoded. Contract 3.5 pins reimbursement to the rate in effect on the date
-- of travel, so this is the CURRENT rate and each shoot stamps its own copy.
--
-- CONFIRM THIS NUMBER before Lucy logs a real shoot. 0.70 is seeded only so the
-- feature is not broken on first use. It is the published 2025 rate; the 2026
-- rate should be checked against irs.gov and corrected in Settings if different.
-- Getting it wrong under- or over-pays her on every mile she drives.
insert into crm_app_settings (key, value)
values ('irs_mileage_rate', '0.70')
on conflict (key) do nothing;
