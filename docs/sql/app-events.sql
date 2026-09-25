-- App usage tracking for the VTM CRM iPhone app. Run once in the Supabase
-- SQL editor. The app logs screen views and key actions (who, what, where,
-- when), never what was typed. Reviewed after a month to decide what to add.

create table if not exists crm_app_events (
  id bigserial primary key,
  user_id uuid not null,
  user_name text,
  event text not null,             -- 'screen' | 'action'
  name text not null,              -- screen name (Home, Inbox, Conversation) or action (text_sent, meeting_created)
  props jsonb,                     -- small context, no message bodies (e.g. { "kind": "client" })
  session_id text,                 -- one per app launch, to see flows
  platform text,                   -- ios | android
  app_version text,
  at timestamptz not null default now()
);

create index if not exists crm_app_events_at_idx on crm_app_events (at desc);
create index if not exists crm_app_events_user_at_idx on crm_app_events (user_id, at desc);

-- Daily rollup the API reads for the summary (per person, per screen or action).
create or replace view crm_app_events_daily as
  select user_id, max(user_name) as user_name, event, name, (at at time zone 'America/Chicago')::date as day, count(*) as n
    from crm_app_events
   group by user_id, event, name, (at at time zone 'America/Chicago')::date;
