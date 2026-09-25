-- Reminders for the VTM app (Tasks space). Run once in the Supabase SQL editor.
-- A reminder is a push at a time, for one person, optionally linked to a task.

create table if not exists crm_reminders (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  remind_at       timestamptz not null,
  for_user        uuid not null,           -- auth user who gets the push
  for_user_name   text,
  created_by      uuid not null,           -- auth user who set it
  created_by_name text,
  task_type       text,                    -- 'todo' | 'routine' | null
  task_id         text,                    -- crm_team_todos.id, or "routineId:itemId"
  source          text default 'app',      -- 'app' | 'assistant'
  status          text not null default 'scheduled',   -- scheduled | sent | done | cancelled
  sent_at         timestamptz,
  done_at         timestamptz,
  done_by         uuid,
  created_at      timestamptz not null default now()
);

create index if not exists crm_reminders_due_idx on crm_reminders (status, remind_at);
create index if not exists crm_reminders_for_user_idx on crm_reminders (for_user, status);
create index if not exists crm_reminders_created_by_idx on crm_reminders (created_by);

-- The API uses the service key, so no RLS policies are needed for it; keep the
-- table closed to the anon key.
alter table crm_reminders enable row level security;
