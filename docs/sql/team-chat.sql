-- Internal team chat: direct messages and group chats between employees.
-- Run once in the Supabase SQL editor.

create table if not exists crm_chat_rooms (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null default 'group',   -- 'dm' | 'group'
  name                 text,                            -- group name (null for a dm)
  created_by           uuid,
  created_by_name      text,
  last_message_at      timestamptz,
  last_message_preview text,
  last_sender_name     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists crm_chat_members (
  room_id      uuid not null references crm_chat_rooms(id) on delete cascade,
  user_id      uuid not null,
  user_name    text,
  role         text not null default 'member',            -- 'admin' | 'member'
  last_read_at timestamptz,
  joined_at    timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists crm_chat_messages (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references crm_chat_rooms(id) on delete cascade,
  sender_id   uuid not null,
  sender_name text,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists crm_chat_members_user_idx on crm_chat_members (user_id);
create index if not exists crm_chat_messages_room_idx on crm_chat_messages (room_id, created_at);
create index if not exists crm_chat_rooms_last_idx on crm_chat_rooms (last_message_at desc);

alter table crm_chat_rooms enable row level security;
alter table crm_chat_members enable row level security;
alter table crm_chat_messages enable row level security;
