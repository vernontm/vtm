-- Automated follow-up texts (the thank-you the morning after an in-person
-- meetup, 8:00 AM Central). Run once in the Supabase SQL editor.

create table if not exists crm_followups (
  id             uuid primary key default gen_random_uuid(),
  meeting_id     text,                    -- crm_meetings.id (Google event id)
  meeting_title  text,
  phone          text not null,           -- E.164, the customer's number
  client_id      uuid,                    -- crm_clients.id when known
  kind           text not null default 'thank_you',
  send_at        timestamptz not null,
  status         text not null default 'scheduled',   -- scheduled | sending | sent | cancelled
  body           text,                    -- filled when sent
  message_id     uuid,                    -- crm_sms_messages.id once queued
  sent_at        timestamptz,
  created_by     uuid,
  cancelled_by   uuid,
  created_at     timestamptz not null default now()
);

create index if not exists crm_followups_due_idx on crm_followups (status, send_at);
create index if not exists crm_followups_meeting_idx on crm_followups (meeting_id);

alter table crm_followups enable row level security;
