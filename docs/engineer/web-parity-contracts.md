# Web CRM parity with the app: contracts

The iPhone app got team chat, media in the inbox, role homes, a Money space
and nudges on 2026-09-25. The web CRM at vernontm.com/admin is behind. Two
workstreams bring it level. Shared facts and rules live here.

## Rules for everyone

- NO em dashes or en dashes anywhere: code, comments, UI copy. Use a comma, a
  period, a colon, the house middle dot, or the word "to".
- Do not commit, push, or run git write commands. Do not run `build-crm.sh`.
  The lead builds and commits.
- Only touch files under `CRM/client/src`. Do not edit `New/api/**`: the
  endpoints below already exist and are deployed.
- Match the existing look: CSS variables (`var(--text)`, `var(--muted)`,
  `var(--border)`, `var(--card)`), lucide-react icons, the page and Section
  patterns already used in `pages/Settings.jsx` and `pages/Inbox.jsx`. Do not
  introduce a styling system.
- Keep customer data out of the code.
- Verify with `npm run build` inside `CRM/client` and fix anything it reports.
  That writes `CRM/client/dist` only, which is fine.
- Scan every file you touch for dashes with node (`/[\u2013\u2014]/`) and fix any.

## How the web app is wired

- Routes are declared in `src/App.jsx` as
  `<Route path="/x" element={<Gated slug="x"><Page /></Gated>} />`.
- `Gated` checks `canAccess(slug)` from `useClient()`; `adminOnly` also checks
  `isAdmin`.
- The sidebar lives in `src/components/Sidebar.jsx` as arrays of
  `{ to, icon, label, slug }` (nav, navWork, navMarketing, navTeam, navTools).
- Page access checkboxes come from `PAGE_GROUPS` in `src/pages/AdminUsers.jsx`.
  A new page needs its slug added there or nobody can be granted it.
- `LANDING_ORDER` in `App.jsx` decides where "/" lands.
- API helpers live in `src/api.js` and go through `request()`, which attaches
  `status`, `needs_migration` and `body` to thrown errors.

## Endpoints that already exist (do not build these)

- `GET /api/crm/home?role=ceo` returns `{ role, me, next_up, team_today,
  held_up, money, team_unread, clients_active, review_queue, onboarding,
  payroll, outreach, route, before_call, leads }`. The full shape is in
  `docs/engineer/role-homes-contracts.md`. `money` carries `collected_month`,
  `collected_prev_month`, `payments_this_week`, `outstanding {total,count,overdue}`,
  `client_plans {mrr,active,past_due}`, `tools {monthly,count,next}`,
  `unpaid[]`, `recent_payments[]`, `plans[]`, `tools_list[]`.
- `POST /api/crm/nudges?action=draft` and `POST /api/crm/nudges` and
  `GET /api/crm/nudges?kind=&id=`. Already wrapped in `src/api.js` as
  `draftNudge`, `sendNudge`, `getNudges`, and already used by
  `src/components/NudgeModal.jsx`. Reuse that modal, do not write another.
- `GET /api/crm/client-activity?client_id=` returns the RAW activity array the
  existing Clients Activity tab reads. Do not change how that is called.
  `GET /api/crm/client-activity?client_id=&view=overview` returns the merged
  object `{ client, files[], activity[], next_up, balance, plan }`.
- Team chat: `GET /api/crm/chat?action=rooms` returns
  `{ rooms: [{ id, kind, name, members:[{user_id,user_name,role}], unread,
  last_message_at, last_message_preview, last_sender_name }], needs_migration? }`;
  `GET /api/crm/chat?action=messages&room=<id>&after=<iso>` returns
  `{ messages: [{ id, room_id, body, sender_id, sender_name, created_at }] }`;
  `GET /api/crm/chat?action=people` returns `{ people: [{ id, name, email,
  is_admin, on_app }] }`; `POST /api/crm/chat?action=create` body
  `{ kind: 'dm'|'group', name?, member_ids: [] }`; `?action=send` body
  `{ room, body }`; `?action=rename` body `{ room, name }`;
  `?action=members` body `{ room, add: [], remove: [] }`; `?action=read` body
  `{ room }`; `?action=leave` body `{ room }`.
- iMessage media: `GET /api/crm/imessage?phone=` message rows may carry
  `attachments: [{ url, type: 'image'|'video'|'audio'|'file', name, mime,
  size, width, height }]`. To send media: `POST /api/crm/imessage?action=upload-url`
  body `{ name }` returns `{ uploadUrl, publicUrl }`; PUT the bytes to
  `uploadUrl` with the right `Content-Type`; then
  `POST /api/crm/imessage?action=send` body `{ phone, body, attachments }`.
  `body` may be empty when there is at least one attachment.

## Reference implementation: the app

Read these for behavior, not for styling. They are React Native, the web is
plain React, so port the logic and re-style with the web's CSS variables.

- `mobile/screens/MessagesScreen.js`: the Clients / Team split, the unread
  badges on each tab, the team room list, the new chat sheet.
- `mobile/screens/TeamChatScreen.js`: a room, its 5 second poll with `after`,
  the members sheet, rename, add and remove, leave.
- `mobile/screens/ConversationScreen.js`: attachment rendering in bubbles, the
  attach button, the pending thumbnail, the full screen viewer.
- `mobile/lib/api.js`: every helper name and URL.

## Ownership

- Inbox agent: `src/pages/Inbox.jsx`, plus any new component it needs under
  `src/components/` (for example `TeamChatPanel.jsx`, `NewChatModal.jsx`,
  `MessageAttachments.jsx`), and the chat and media helpers in `src/api.js`.
- Money agent: `src/pages/Money.jsx` (new), `src/App.jsx`, `src/components/Sidebar.jsx`,
  `src/pages/AdminUsers.jsx` (the slug only), `src/pages/Clients.jsx` (the
  overview tab), and the `getClientOverview` helper in `src/api.js`.
- Both may add to `src/api.js`. Add helpers, never change or remove an existing
  one, so the two streams cannot collide.
