# Web CRM batch 3: role dashboards, leads, calendar, team access

Ray's list from 2026-09-26. Four streams, one file set each.

## Rules for everyone

- NO em dash or en dash anywhere: code, comments, UI copy. Use a comma, a
  period, a colon, the house middle dot, or the word "to". Pre-existing ones
  in a file you touch are not yours to chase, just never add one.
- Do not commit, push, or run any git write command. Do not run build-crm.sh.
  Do not start dev servers or open browsers. The lead builds and commits.
- Only touch the files your stream owns. Read anything.
- Match the existing look: CSS variables (`var(--text)`, `var(--muted)`,
  `var(--border)`, `var(--card)`, `var(--surface-2)`, `var(--orange)`),
  lucide-react icons, the patterns already in `pages/Settings.jsx` and
  `pages/Inbox.jsx`. Do not add a styling system or a new dependency.
- Verify with `npm run build` inside `CRM/client` and fix anything it reports.
  Then scan every file you touched for dashes with node and fix any you added.
- Keep customer data out of the code.

## How the web app is wired

- Routes: `src/App.jsx`, `<Route path="/x" element={<Gated slug="x"><Page/></Gated>} />`.
- `Gated` calls `canAccess(slug)` from `useClient()` (`src/context/ClientContext.jsx`);
  `adminOnly` also checks `isAdmin`.
- Access today comes from `/api/crm/me`: `user.allowed_pages_global` (a global
  page list) and per client grants `allowed_pages`. Admins bypass everything.
- The sidebar is `src/components/Sidebar.jsx`, arrays of `{ to, icon, label, slug }`.
- Page slugs are listed in `PAGE_GROUPS` in `src/pages/AdminUsers.jsx`.
- API helpers live in `src/api.js` and go through `request()`.

## Endpoints that already exist (build none of them)

- `GET /api/crm/home` with no role parameter resolves the caller's own role
  server side and returns only that role's sections. The full reply shape is
  in `docs/engineer/role-homes-contracts.md`. `role` comes back on the reply.
  Roles: `ceo`, `hr`, `assistant`, `sales`, `general`.
- `GET /api/crm/settings` and `POST /api/crm/settings?action=bulk` with
  `{ settings: [{ key, value }] }` store arbitrary JSON under a key. This is
  how `automations` and `home_roles` are stored, and how access roles will be.
- `/api/crm/meetings`: `?action=upcoming`, `?action=past`, `?action=create`,
  `PUT ?id=`, `DELETE ?id=`. Events carry `title`, `start_time`, `end_time`,
  `location`, `meet_link`, `attendees`, `all_day`.
- Nudges, client activity and money are described in
  `docs/engineer/web-parity-contracts.md`.

## The iPhone app is the design reference

The app already has role dashboards. Read these for behavior and content, and
re-style for the web (they are React Native, so port the ideas not the code):
`mobile/components/homes/CeoHome.js`, `HrHome.js`, `AssistantHome.js`,
`SalesHome.js`, `GeneralHome.js`, and `shared.js` for the tile shapes.

## Ownership

- Dashboard stream: `src/pages/Dashboard.jsx`, plus new files under
  `src/components/home/`.
- Leads stream: `src/pages/Leads.jsx`.
- Calendar stream: `src/pages/Meetings.jsx`, `src/pages/MeetingDetail.jsx`.
- Access stream: `src/pages/AdminUsers.jsx`, `src/context/ClientContext.jsx`,
  `src/components/Sidebar.jsx`, `src/App.jsx`.
- Lead: `src/api.js`, the build, the commits.

Every stream may add helpers to `src/api.js`: do NOT edit that file. Name the
helper and its URL in your reply and the lead adds it. Assume it exists.
