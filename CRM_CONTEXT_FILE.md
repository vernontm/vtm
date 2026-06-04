# The CRM Context File — for Claude

> **How to use this file (do this first):**
> 1. Put this file in the **root folder of your CRM project** and keep the name **`CLAUDE.md`**. Claude (the desktop app's Code side, or Claude Code) reads a file named `CLAUDE.md` automatically every time, so it always knows your whole project.
> 2. If you'd rather not rename it, just **drag this file into your Claude chat** and say *"Use this as the full context for my project."*
> 3. Then tell Claude what you want next in plain English. It already knows the stack, the file layout, and how to set everything up — the instructions are all below.

You are helping a **non-coder** build and run a real CRM. Do all technical work for them: create files, install dependencies, run commands, and explain only what they need to click. Never assume terminal knowledge. If something errors, read the error, fix it, and continue.

---

## 1. What this project is

A simple, modern **CRM web app** the user owns outright. It has a login, a dashboard, and a foundation for Leads / Contacts / Deals. It is intentionally small and easy to extend.

**Stack (do not swap these without asking):**
- **React 18** + **Vite** (fast dev server + build)
- **react-router-dom v6** for pages
- **@supabase/supabase-js v2** for the database + authentication
- **lucide-react** for icons
- Styling is **plain CSS + inline style objects** (no Tailwind, no CSS framework). A small set of design tokens lives in `src/styles/global.css`.
- Hosting: **Vercel**. Database + auth: **Supabase**. Both have free tiers.

---

## 2. File map (what each file does)

```
crm/
├─ index.html                  # app entry; loads Google Fonts (Plus Jakarta Sans + DM Sans) and src/main.jsx
├─ vite.config.js              # Vite + React plugin; dev server config
├─ vercel.json                 # SPA rewrite so refreshing a route doesn't 404
├─ .env.example                # template: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├─ .gitignore                  # ignores node_modules, dist, .env (NEVER commit .env)
├─ package.json                # scripts: dev / build / preview
└─ src/
   ├─ main.jsx                 # mounts <App/> inside <BrowserRouter>
   ├─ App.jsx                  # auth gate: loading -> LoadingScreen; no session -> <Login/>; else <AppShell/> with routes
   ├─ lib/supabase.js          # the Supabase client; reads VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY; throws if missing
   ├─ context/AuthContext.jsx  # tracks the session (getSession + onAuthStateChange); exposes signIn / signOut / user
   ├─ components/
   │  ├─ Sidebar.jsx           # fixed 220px left nav: Dashboard, Leads, Contacts, Deals, Meetings, Email, Settings + user chip + Sign out
   │  ├─ Header.jsx            # sticky top bar: page title, search, notifications bell, "New" button
   │  └─ StatCard.jsx          # reusable metric card (label, value, icon, delta) used on the dashboard
   ├─ pages/
   │  ├─ Login.jsx             # email/password sign-in card (calls AuthContext.signIn)
   │  ├─ Dashboard.jsx         # 4 StatCards + a "Recent Activity" panel (currently shows zeros / empty state)
   │  └─ Placeholder.jsx       # generic empty page used for Leads/Contacts/Deals/etc. until built out
   └─ styles/global.css        # design tokens + base styles (see Design System below)
```

**Routing** is defined in `App.jsx`: `/dashboard`, `/leads`, `/contacts`, `/deals`, `/meetings`, `/email`, `/settings`. Today everything except `/dashboard` renders `Placeholder`. Replace placeholders with real pages as you build.

**Auth flow:** `AuthContext` calls `supabase.auth.getSession()` on load and subscribes to `onAuthStateChange`. `App.jsx` shows `<Login/>` when there's no session and the app when there is. `signIn(email, password)` uses `supabase.auth.signInWithPassword`.

---

## 3. Design system (match this when you build new UI)

Defined in `src/styles/global.css`. Keep everything consistent with these tokens:

```
--bg: #111112        (page background, near-black)
--surface: #1a1a1c   (cards/sidebar)
--surface-2: #222226 (inputs, chips)
--border: rgba(255,255,255,0.07)
--text: #f0f0f0
--muted: #6b6b72
accent gradient: linear-gradient(135deg, #ef4444, #b91c1c)   (red)
--font-display: 'Plus Jakarta Sans'   (headings, labels, buttons)
--font-body: 'DM Sans'                (body text)
```
Reusable classes already exist: `.card`, `.input`, `.btn-primary`, `.btn-secondary`, `.pill` (`.pill-success`, `.pill-warning`, `.pill-muted`), `.fade-up`. **Dark theme, rounded corners (14–16px), red accent, subtle borders.** When the user shows you a screenshot, match its fonts, colors, gradients, and spacing exactly.

---

## 4. First-run setup — do these in order for the user

### Step A — Install dependencies
Run `npm install` in the project folder. (If Node/npm isn't available on their machine, install it for them or guide the one-click installer, then continue. The user should never have to figure this out.)

### Step B — Set up Supabase (the database + login)
1. Tell the user to create a free project at **supabase.com**, then open **Project Settings → API**.
2. Have them copy the **Project URL** and the **anon public key**.
3. Create a `.env` file in the project root (copy from `.env.example`) and fill in:
   ```
   VITE_SUPABASE_URL=their-project-url
   VITE_SUPABASE_ANON_KEY=their-anon-key
   ```
   Never hard-code these in source files, and never commit `.env` (it's gitignored).
4. **Create the data tables.** In the Supabase **SQL Editor**, run the schema below (start with `leads`; add `contacts` and `deals` the same way as you build them):
   ```sql
   create table leads (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     email text,
     company text,
     status text default 'new',      -- new | qualified | negotiation | won
     value numeric default 0,
     created_at timestamptz default now()
   );
   ```
5. **Turn on Row Level Security and add safe policies — this is critical.** Supabase's `anon` key is public (it ships in the app), so the database must protect itself. For each table you create:
   ```sql
   alter table leads enable row level security;

   -- Only logged-in users can use the table. Do NOT write policies for the
   -- "anon" or "public" role, and never use a permissive "using (true)" policy
   -- for public — that would let anyone with the public key read or delete data.
   create policy "authenticated can read leads"   on leads for select to authenticated using (true);
   create policy "authenticated can insert leads" on leads for insert to authenticated with check (true);
   create policy "authenticated can update leads" on leads for update to authenticated using (true);
   create policy "authenticated can delete leads" on leads for delete to authenticated using (true);
   ```
   (Later, when there are multiple users, tighten these to per-user/per-owner rules. For a single-owner CRM, "authenticated only" is the right baseline.)

5b. **Ready-made Contacts and Deals tables.** When the user asks for those pages, create these in the SQL Editor (same RLS pattern as `leads` above — enable RLS, then four `authenticated`-only policies per table):
   ```sql
   create table contacts (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     email text,
     phone text,
     company text,
     title text,
     notes text,
     created_at timestamptz default now()
   );

   create table deals (
     id uuid primary key default gen_random_uuid(),
     title text not null,
     contact_id uuid references contacts(id) on delete set null,
     stage text default 'new',        -- new | qualified | proposal | negotiation | won | lost
     value numeric default 0,
     expected_close date,
     created_at timestamptz default now()
   );

   alter table contacts enable row level security;
   alter table deals    enable row level security;
   -- repeat the four authenticated-only policies (select/insert/update/delete) from step 5 for each table.
   ```
   For the Deals page, a kanban grouped by `stage` (drag a card to change its `stage`) is the nicest UX. The `contact_id` link lets a deal belong to a contact.

6. **Create a login user.** In Supabase **Authentication → Users**, add the user's email + password so they can sign in. (Or build a signup screen if they want one.)

### Step C — Run it locally
Run `npm run dev` and give the user the local URL it prints (usually `http://localhost:5173`). They sign in with the user you created in Step B6. Keep the dev server running while you work.

### Step D — Wire real data into the app
Replace the static zeros in `Dashboard.jsx` and the placeholder pages with real Supabase queries, e.g.:
```js
const { data: leads } = await supabase
  .from('leads')
  .select('*')
  .order('created_at', { ascending: false })
```
Build each screen as: a table that reads from Supabase + a form that inserts into it. That pattern covers Leads, Contacts, and Deals.

---

## 5. Going live + saving work (GitHub + Vercel)

Do all of the Git and deploy work for the user — they should only click approvals.

### Save to GitHub
1. Have the user create a free account at **github.com** (and a new **private** repo if they want it private).
2. Initialize Git, commit everything, and push:
   - `git init`, stage all files, commit with a clear message, add the remote, and `git push`.
   - Confirm `.env` is **not** included (it's gitignored — verify before the first push).
3. **Ongoing updates:** whenever the user changes something, run `git add -A`, commit with a short message, and `git push`. When the user says *"save my changes and push,"* do exactly this.

### Deploy on Vercel (free)
1. Go to **vercel.com**, **Import** the GitHub repo.
2. Framework preset: **Vite**. Build command `npm run build`, output dir `dist` (Vercel usually auto-detects).
3. In the Vercel project's **Environment Variables**, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `.env`). These are safe to set in Vercel; they are not "secret" but must not be hard-coded in source.
4. Deploy. Every future `git push` to the main branch auto-deploys the live site.

---

## 6. How to extend it (the repeatable move)

Every new feature is the same three steps — do all three when the user asks for a new section:
1. **Table:** create the Supabase table (+ RLS policies as in Step B5).
2. **Read:** add a page that fetches and displays the rows.
3. **Write:** add a form/button that inserts (and edits/deletes) rows.

Examples the user might ask for: a **Contacts** page, a **Deals** kanban pipeline (drag cards between stages), notes on a contact, a search box, tags, or an email reminder when a new lead is added.

---

## 7. Hard rules (security + safety)

- **Never** put the Supabase **service_role** key in this app or in the browser. This is a front-end app; it only ever uses the **anon** key. The service key is server-only and would give anyone full database access if exposed.
- **Never** commit `.env`, API keys, passwords, or tokens. Confirm `.gitignore` covers `.env` before any push.
- **Always** enable Row Level Security on every table and scope policies to `authenticated` (never a permissive public/anon `using (true)`).
- If you generate any server-side code or secrets later, keep them out of the client bundle and out of Git.
- When in doubt, explain the trade-off to the user in plain English and pick the safer default.
