-- App batch 2: organizing iMessage conversations (star, archive, delete) and
-- voice notes. Run once in the Supabase SQL editor. Safe to run again: every
-- statement is "if not exists". Until it is run the inbox still works, the
-- app simply cannot star, archive or delete (those answer 503 needs_migration).
--
-- Depends on the iMessage tables from imessage-bridge/README.md and on
-- docs/sql/media.sql (crm_sms_messages.attachments).

-- One row per conversation, keyed by phone. Already created by the iMessage
-- migration; repeated here so this file can run on its own.
create table if not exists crm_imessage_threads (
  phone            text primary key,
  assigned_to      text,
  assigned_to_name text,
  updated_at       timestamptz default now()
);

-- Star pins a conversation; archived_at puts it away. The thread list returns
-- both as "starred" and "archived", leaves archived threads out of the inbox,
-- and answers ?archived=1 with the archived ones only. An inbound reply clears
-- archived_at, so a conversation comes back when that person writes again.
alter table crm_imessage_threads add column if not exists starred boolean default false;
alter table crm_imessage_threads add column if not exists archived_at timestamptz;

-- Deleting a conversation is a soft delete: the messages are stamped and every
-- read of the inbox filters them out. Nothing ever leaves the table.
alter table crm_sms_messages add column if not exists deleted_at timestamptz;

-- The inbox reads the live rows only, newest first, either across the channel
-- or inside one conversation.
create index if not exists crm_sms_messages_live_idx
  on crm_sms_messages (channel, created_at desc) where deleted_at is null;
create index if not exists crm_sms_messages_phone_live_idx
  on crm_sms_messages (phone, created_at) where deleted_at is null;

-- No index for starred / archived_at on purpose: crm_imessage_threads is one
-- small row per conversation and the API reads the whole table at once.

-- Voice notes need no new column. A voice note is an attachment on
-- crm_sms_messages.attachments (docs/sql/media.sql) with two more keys, filled
-- in by the server with ElevenLabs speech to text when the message is saved:
-- attachments: [{ url, type: 'audio', name, mime, size, transcript, duration_ms }]
