# Role homes, money, nudges, agreements: build contracts

Shared spec for the 2026-09-25 build. Three workstreams run in parallel and
meet at these shapes. Change a shape here first, then in code.

Rules for everyone: no em dashes or en dashes anywhere (code, comments, UI,
commits); do not commit or push (the lead commits); never write customer data
into the repo; schema changes go in `docs/sql/role-homes.sql` for Ray to run,
and every endpoint that needs them must answer `503 { error }` with a
`needs_migration: true` field when the table or column is missing; API files
under `New/api/crm/` are CommonJS (`require`, `module.exports`) unless the file
already uses ESM; mobile code is Expo SDK 57 / React Native 0.86, Aura
primitives from `mobile/components/ui.js`, tokens from `mobile/lib/theme.js`.

## Who a person is: `role`

Resolved server-side in `New/api/crm/home.js` and returned on every `/home`
reply. Order of precedence:

1. `crm_app_settings` key `home_roles`, a JSON map `{ "<auth user id>": "ceo" | "hr" | "assistant" | "sales" | "general" }` (admins edit it from the app).
2. Auth admin (`user.is_admin`) is `ceo`.
3. Roster row (`crm_team_members` matched by `user_id`, else by email): `title` containing `appointment`, `sales`, `setter`, `outreach` is `sales`; `assistant`, `scheduler`, `coordinator` is `assistant`; `hr`, `creative`, `director` is `hr`; roster `role = 'admin'` is `hr`.
4. Otherwise `general` (the current home).

## `GET /api/crm/home?role=<optional override>`

One call per home load. Everything is optional except `role` and `me`; a
section the role does not use is omitted. Money figures are numbers in
dollars. Dates are ISO strings. "Today" and "this month" are America/Chicago.

```json
{
  "role": "ceo",
  "me": { "id": "uuid", "name": "Ray", "email": "ray@vernontm.com", "is_admin": true },
  "next_up": { "id": "...", "title": "Website kickoff", "start_time": "...", "end_time": "...", "location": null, "meet_link": "https://meet.google.com/...", "attendees": ["priya@..."] },
  "team_today": {
    "week_minutes": 2280, "week_target_minutes": 3600,
    "people": [
      { "user_id": "uuid", "name": "Kaitlyn", "minutes_today": 130, "clocked_in": true, "since": "2026-09-25T13:02:00Z",
        "counters": { "lead_created": 12, "meeting_created": 1, "text_sent": 9, "chat_sent": 3, "routine_checked": 4 } }
    ]
  },
  "held_up": [
    { "kind": "agreement", "id": "uuid", "title": "SEO retainer unsigned 3 days", "sub": "Nair Family Dental · sent Sep 22", "days": 3, "severity": "amber",
      "client_id": "uuid", "client_name": "Nair Family Dental", "phone": "+1...", "email": "priya@...", "amount": 600, "link": "https://vernontm.com/sign?token=..." },
    { "kind": "invoice", "id": "...", "title": "INV-0043 · $2,400 overdue", "sub": "Lupe's Mexican Cafe · 2 days late", "days": 2, "severity": "red", "client_id": "...", "client_name": "...", "phone": "...", "email": "...", "amount": 2400, "link": "https://invoice.stripe.com/..." }
  ],
  "money": {
    "month": "September",
    "collected_month": 12450, "collected_prev_month": 9800, "payments_this_week": 3,
    "outstanding": { "total": 3000, "count": 2, "overdue": 1 },
    "client_plans": { "mrr": 2828, "active": 5, "past_due": 1 },
    "tools": { "monthly": 341, "count": 6, "next": { "service": "HeyGen", "date": "2026-10-01" } },
    "unpaid": [ { "kind": "invoice", "id": "...", "label": "INV-0043", "amount": 2400, "client_id": "...", "client_name": "...", "phone": "...", "email": "...", "due": "2026-09-23", "days_late": 2, "last_nudged_at": null, "link": "..." } ],
    "recent_payments": [ { "id": "...", "client_name": "Sanabreh", "amount": 950, "paid_at": "...", "label": "Marketing · September", "source": "stripe" } ],
    "plans": [ { "id": "...", "client_id": "...", "client_name": "CC Network", "label": "CRM care", "amount": 400, "cadence": "monthly", "next_renewal": "...", "status": "past_due", "days_past_due": 4, "phone": "...", "email": "..." } ],
    "tools_list": [ { "id": "...", "service": "HeyGen", "amount": 99, "billing_cycle": "monthly", "next_renewal": "2026-10-01", "category": "software" } ]
  },
  "team_unread": 2,
  "clients_active": 17,
  "review_queue": [ { "id": "todo uuid", "title": "Review Sanabreh reel v2", "from_name": "Marco", "age_hours": 20, "urgent": false, "link_label": null } ],
  "onboarding": [ { "member_id": "uuid", "name": "Lucy Moreno", "steps_done": 2, "steps_total": 5, "next_step": "Sign the contractor agreement" } ],
  "payroll": { "period_label": "Sep 16 to 30", "due_on": "2026-10-01", "total": 4120, "people": [ { "user_id": "...", "name": "Kaitlyn", "minutes": 1260, "amount": 420 } ] },
  "outreach": { "period_key": "2026-09-25", "items": [ { "routine_id": "...", "item_id": "...", "text": "Reach out to 50 leads", "target": 50, "count": 32 } ], "counters": { "lead_created": 12, "text_sent": 20, "meeting_created": 2 } },
  "route": [ { "id": "...", "title": "Nair Family Dental · kickoff", "start_time": "...", "end_time": "...", "location": "...", "maps_url": "https://maps.apple.com/?q=...", "who": ["Ray"] } ],
  "before_call": { "client_id": "...", "name": "Marcus Bell", "business": "Bell Roofing", "notes": "...", "last_contact_summary": "...", "discovery_notes_url": null, "last_texts": [ { "direction": "in", "body": "...", "created_at": "..." } ] },
  "leads": { "hot": 2, "warm": 4, "open": 11 }
}
```

Sections by role:

- `ceo`: next_up, team_today, held_up, money, team_unread, clients_active, payroll.
- `hr`: next_up, team_today, review_queue, onboarding, payroll, team_unread.
- `assistant`: next_up, route, outreach, team_unread, leads.
- `sales`: next_up (only events whose attendees include `me.email`), outreach, leads, before_call, team_unread.
- `general`: next_up, leads, team_unread (the app keeps its current tiles).

Where the numbers come from:

- `team_today`: `crm_time_entries` for today (Central) per `user_id` plus open entries (`ended_at` null) as `clocked_in`; `week_minutes` sums Monday to today; `week_target_minutes` = 60h; names from `crm_team_members` (by `user_id`) else auth users. `counters` = today's rows in `crm_app_events` grouped by `name` for that user (table from `docs/sql/app-events.sql`; missing table means empty counters, never an error).
- `held_up`: agreements with `status = 'sent'` and `sent_at` older than 3 days; `crm_invoices` with a non-paid status older than 7 days from `created_at`; `crm_manual_invoices` not paid older than 14 days; `crm_payments` with `status` not paid whose `due_condition` says "on signing" or "at signing" and the agreement is signed; client plans past due (`crm_deals.subscription_status = 'past_due'`); hot leads (`crm_clients.stage = 'lead'`, `lead_temperature = 'hot'`) with `last_contact_at` older than 5 days. Sorted red first, then by days.
- `money`: `collected_month` = `crm_payments` with `paid_at` this month plus paid `crm_invoices` this month (do not double count a payment that has a `stripe_invoice_id` also present in `crm_invoices`); `outstanding` = unpaid `crm_invoices`, `crm_manual_invoices`, and `crm_payments` due; `client_plans` from `crm_deals` rows with a `stripe_subscription_id` (`subscription_status` active or past_due) and `crm_agreements` with `maintenance_subscription_id`; amounts: deal `value` when the deal is a plan, else the agreement `total_amount`; `tools` from `crm_subscriptions` (`status` not cancelled), monthly = sum normalised to a month (yearly / 12).
- `review_queue` (hr): open `crm_team_todos` assigned to `me`, newest first, `from_name` = `created_by_name`, `age_hours` from `created_at`.
- `onboarding` (hr): roster rows with `invite_status = 'pending'` or `started_on` within 30 days; steps: invited, has a login (`user_id`), app installed (`crm_push_tokens`), first clock-in (`crm_time_entries`), contractor agreement signed (`crm_agreements` with `title` containing "contractor" for that email, else skip the step).
- `payroll`: the half-month period containing today (1 to 15, 16 to end); unpaid minutes (`paid_at` null) per user times `crm_employee_rates.hourly_rate`; `due_on` = first day after the period.
- `outreach`: today's `period_key` for daily routines; items from `crm_routines.items` that carry a numeric `target`; `count` from `crm_routine_checks.count` for that item and period (new column, see SQL); `counters` from `crm_app_events` today for `me`.
- `route`: today's events from the shared calendar (all of `getUpcomingMeetings` for today) ordered by start; `maps_url` from the location; `who` from attendee emails mapped to roster first names.
- `before_call`: for `next_up`, match an attendee email to `crm_contacts.email` or `crm_clients.contact_email`, return the record's notes, `last_contact_summary`, `discovery_notes_url`, and the last 5 texts from `crm_sms_messages` for that phone.

## Nudges: `New/api/crm/nudges.js`

`POST /api/crm/nudges?action=draft` body `{ kind, id }` where `kind` is `invoice` | `manual_invoice` | `payment` | `agreement` | `plan`. Reply:

```json
{ "target": { "kind": "invoice", "id": "...", "label": "INV-0043", "amount": 2400, "due": "2026-09-23", "days_late": 2, "client_id": "...", "client_name": "Lupe's Mexican Cafe", "first_name": "Lupe", "phone": "+1...", "email": "lupe@...", "link": "https://..." },
  "channels": { "text": { "available": true, "to": "(281) 555-0142" }, "email": { "available": true, "to": "lupe@..." } },
  "template_key": "invoice_reminder",
  "message": "Hi Lupe, quick reminder that invoice INV-0043 for $2,400 was due Sep 23. You can pay here: https://... Thank you!",
  "email_subject": "Invoice INV-0043 from Vernon Tech & Media",
  "history": [ { "sent_at": "...", "channels": ["text"], "by_name": "Ray", "status": "sent" } ] }
```

`POST /api/crm/nudges` body `{ kind, id, channels: ["text","email"], message, email_subject?, schedule_at? }`. Text goes out as a queued row in `crm_sms_messages` (`direction: 'out'`, `status: 'queued'`, `channel: 'imessage'`, the bridge sends it, same as follow-ups in `_lib/followups.js`). Email goes through `sendEmail` from `New/api/_lib/gmail.js` (plain body plus a simple HTML version). With `schedule_at`, store the row with `status: 'scheduled'` and let `followups-cron.js` send it when due (add a nudges pass to that cron). Every send is logged in `crm_nudges`. Reply `{ ok: true, sent: ["text","email"], skipped: [], nudge_id }`.

`GET /api/crm/nudges?kind=&id=` returns `{ history: [...] }`.

Templates (add to `New/api/_lib/automations.js` DEFAULTS and PLACEHOLDERS, and mirror in `mobile/lib/templates.js`):

- `invoice_reminder`: `Hi {first_name}, quick reminder that {invoice} for {amount} was due {due}. You can pay here: {link} Thank you!` placeholders `first_name, business, invoice, amount, due, days_late, link`.
- `agreement_reminder`: `Hi {first_name}, when you get a minute, the {title} agreement is ready for your signature: {link}` placeholders `first_name, business, title, link`.
- `plan_past_due`: `Hi {first_name}, the card on file for {plan} did not go through. You can update it here: {link}` placeholders `first_name, business, plan, amount, link`.

## Client activity: `GET /api/crm/client-activity?client_id=`

```json
{ "client": { "id": "...", "name": "Nair Family Dental", "owner_name": "Priya Nair", "phone": "...", "email": "...", "stage": "client", "since": "2026-08-01", "delivery_stage": "build" },
  "files": [ { "id": "...", "name": "Website copy v2.docx", "url": "...", "kind": "doc", "by_name": "Priya", "at": "..." } ],
  "activity": [ { "kind": "text" | "agreement" | "payment" | "meeting" | "note" | "nudge", "at": "...", "title": "...", "sub": "...", "direction": "in", "severity": "amber", "link": null } ],
  "next_up": { ... same shape as home.next_up ... },
  "balance": { "due": 2400, "due_on": "2026-10-15", "paid": 2400, "total": 4800 },
  "plan": { "label": "Premium site + SEO", "monthly": 600, "starts": "2026-10-15", "status": "unsigned" } }
```

Files come from what `New/api/crm/client-files.js` already lists; activity merges `crm_sms_messages` for the client's phone, `crm_agreements`, `crm_payments` (paid), meetings for the client (`crm_meetings` by `client_id` or attendee email), quick notes (`quick-notes.js`), and `crm_nudges`. Newest first, max 60.

## Agreements from a conversation

The web CRM already has the AI drafting in `New/api/crm/agreement-ai.js` (`analyze`, `chat`, `generate`, `approve`) and sending in `New/api/crm/agreements.js` (`send` emails the sign link). The app calls them in this order; the API agent documents the exact bodies in `docs/engineer/agreement-flow.md` after reading both files, and adds:

- `POST /api/crm/agreements?action=text-sign-link&id=` queues an iMessage to the client's phone with the sign link (same queue as nudges), reply `{ ok, phone }`.
- `generate` accepts `instruction` (free text, e.g. "add a rush fee") and applies it on top of `base` when present.

App helpers (already in `mobile/lib/api.js`): `agreementAnalyze(client_id)`, `agreementGenerate(data)`, `agreementApprove(data)`, `sendAgreement(id)`, `textSignLink(id)`.

## Count-to-target tasks

`crm_routines.items[]` may carry `target` (number). `POST /api/crm/routines?action=count` body `{ routine_id, item_id, period_key, count }` upserts `crm_routine_checks` (`count` column, `done_by`, `done_at`; the row counts as done when `count >= target`). The routines GET reply includes `count` on each check row. App helper: `countRoutineItem(routine_id, item_id, period_key, count)`.

## SQL for Ray: `docs/sql/role-homes.sql`

```sql
create table if not exists crm_nudges (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  target_id text not null,
  client_id uuid,
  channels text[] not null,
  message text,
  email_subject text,
  sent_by uuid,
  sent_by_name text,
  status text not null default 'sent',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists crm_nudges_target_idx on crm_nudges (kind, target_id, created_at desc);
alter table crm_routine_checks add column if not exists done_count integer;
-- (the API exposes it as `count`; the column is done_count because PostgREST reads a bare "count" in a select as the aggregate)
```

## Mobile helpers (in `mobile/lib/api.js`, already added)

`getHome(role?)`, `draftNudge({ kind, id })`, `sendNudge(data)`, `getNudges(kind, id)`, `getClientActivity(client_id)`, `agreementAnalyze`, `agreementGenerate`, `agreementApprove`, `sendAgreement`, `textSignLink`, `countRoutineItem`, `getHomeRoles()`, `setHomeRoles(map)`.

## Screens and ownership

- API agent: everything under `New/api/`, `docs/sql/role-homes.sql`, `docs/engineer/agreement-flow.md`, `New/vercel.json` only if a cron changes.
- Screens agent: `mobile/screens/MoneyScreen.js`, `mobile/components/NudgeSheet.js`, `mobile/screens/AgreementDraftScreen.js`, and the Overview / Files / Activity tabs inside `mobile/screens/ClientDetailScreen.js`.
- Homes agent: `mobile/components/homes/CeoHome.js`, `HrHome.js`, `AssistantHome.js`, `SalesHome.js`, `LeadQuickAdd.js`, the Home layout picker inside `mobile/screens/SettingsScreen.js` (admins only), count-to-target rows in `mobile/screens/TasksScreen.js` and `mobile/components/RemindersView.js` only if needed, and the attendee filter in `mobile/screens/CalendarScreen.js` for the sales role.
- Lead: `mobile/screens/HomeScreen.js` dispatch, `mobile/App.js` routes (`Money`, `AgreementDraft` in the Home stack), `mobile/lib/api.js`, `mobile/lib/templates.js`, commits.

Navigation names the screens use: `navigation.navigate('Money', { tab: 'overview' | 'invoices' | 'subscriptions' })`, `navigation.navigate('ClientDetail', { client, tab: 'overview' | 'money' | 'files' | 'activity' })`, `navigation.navigate('AgreementDraft', { client })`, `goToConversation(phone)` from `mobile/lib/nav.js`, `openAssistant({ prompt })`.
