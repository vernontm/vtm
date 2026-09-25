-- Role homes, nudges, and count-to-target routine items for the VTM CRM
-- iPhone app (docs/engineer/role-homes-contracts.md). Run once in the
-- Supabase SQL editor. Until it runs, sending a nudge answers 503 with
-- needs_migration: true, the home shows no "last nudged" dates, and routine
-- items with a target fall back to plain ticks.

-- Every nudge that went out (or is waiting to): what it was about, who sent
-- it, and through which channels. target_id is the id of the invoice,
-- manual invoice, payment, agreement, or deal the nudge refers to.
create table if not exists crm_nudges (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                  -- invoice | manual_invoice | payment | agreement | plan
  target_id text not null,             -- id of the row the nudge is about
  client_id uuid,                      -- crm_clients.id when known
  channels text[] not null,            -- {text}, {email}, or both
  message text,
  email_subject text,
  sent_by uuid,                        -- auth user id of whoever sent it (null for the CRM itself)
  sent_by_name text,
  status text not null default 'sent', -- scheduled | sending | sent | failed | cancelled
  scheduled_at timestamptz,            -- when a scheduled nudge should go out (followups-cron.js)
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_nudges_target_idx on crm_nudges (kind, target_id, created_at desc);
create index if not exists crm_nudges_due_idx on crm_nudges (status, scheduled_at);
alter table crm_nudges enable row level security;

-- Count-to-target routine items ("Reach out to 50 leads"): how many so far
-- in the period. Null means the item was ticked the old way (fully done).
alter table crm_routine_checks add column if not exists count integer;
