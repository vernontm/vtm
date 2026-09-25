# VTM iMessage bridge

The CRM Inbox texts clients over iMessage from the business number. The CRM
itself runs in the cloud and cannot use Messages.app, so this small program runs
on the Mac that is signed into the business Apple ID and carries messages both
ways:

- **Outbound:** the CRM queues a text, the bridge picks it up within a few
  seconds and sends it through Messages (iMessage, or SMS relayed through the
  paired iPhone for non-Apple numbers).
- **Inbound:** the bridge watches the Messages history and forwards replies from
  known clients and leads into the CRM Inbox. Texts from numbers the CRM does
  not know are personal and never leave this Mac.

## One-time setup

1. **Database update** (Supabase SQL editor, project `ssllepovajmohdhvhzsa`):

   ```sql
   alter table crm_sms_messages
     add column if not exists channel text not null default 'sms',
     add column if not exists imsg_guid text;
   create index if not exists crm_sms_messages_channel_status_idx
     on crm_sms_messages (channel, direction, status);
   create unique index if not exists crm_sms_messages_imsg_guid_idx
     on crm_sms_messages (imsg_guid) where imsg_guid is not null;

   -- Per-conversation employee assignment (colored pill in the Inbox).
   create table if not exists crm_imessage_threads (
     phone text primary key,
     assigned_to text,
     assigned_to_name text,
     updated_at timestamptz default now()
   );

   -- Internal notes on a conversation, attributed to the employee who wrote them.
   create table if not exists crm_imessage_notes (
     id uuid primary key default gen_random_uuid(),
     phone text not null,
     body text not null,
     author_email text,
     author_name text,
     created_at timestamptz default now()
   );
   create index if not exists crm_imessage_notes_phone_idx on crm_imessage_notes (phone);
   ```

2. **Shared secret on Vercel:** add an environment variable
   `IMESSAGE_BRIDGE_TOKEN` (Project Settings > Environment Variables, all
   environments), then redeploy. Use the value in `config.json`.

3. **Bridge config:** copy `config.example.json` to `config.json` and set
   `bridgeToken` to that same value. `config.json` and `state.json` are
   gitignored.

4. **Mac permissions** (both are one-time prompts or toggles):
   - Automation access to Messages: granted the first time a send runs.
   - Full Disk Access for the terminal app you run the bridge from (System
     Settings > Privacy & Security > Full Disk Access). Needed to read the
     Messages history for inbound. Without it, outbound still works.

5. **Messages.app:** signed into the business Apple ID, with the business
   number listed under "You can be reached for messages at" and set as "Start
   new conversations from". For non-iPhone recipients, the paired iPhone needs
   Settings > Messages > Text Message Forwarding turned on for this Mac.

## Run it

```bash
cd imessage-bridge && npm start
```

Leave it running. It logs each send and each forwarded reply. The Mac must stay
awake and logged in; if it sleeps, texting pauses and resumes when it wakes
(queued messages are not lost).

## How a message flows

1. You send from the CRM Inbox. The row is saved with status `queued`.
2. The bridge claims it (`sending`), sends it through Messages, then marks it
   `sent` or `failed` with the reason. The Inbox shows the status under the
   bubble.
3. A reply arrives in Messages. The bridge sees it, checks the sender is a
   client or lead in the CRM, and posts it into the same thread.

`sent` means Messages accepted it. Delivery to Android depends on the paired
iPhone being on with forwarding enabled.
