# Simple CRM — React + Supabase

A clean, modern starter CRM you own outright. Built with React (Vite) and Supabase — login, a dashboard, and a foundation you extend by just describing what you want to your AI assistant.

This is the exact starting point from **The Simple CRM Blueprint** by Vernon Tech & Media.

## What's inside

- **Login** — email/password auth via Supabase (or demo mode, see below)
- **Dashboard** — live stat cards (leads, active deals, won revenue, meetings) + a real activity feed
- **Leads** — sortable table with status filter, add / edit / delete
- **Contacts** — full contact book with add / edit / delete
- **Deals** — kanban pipeline (Qualified → Proposal → Negotiation → Won) with per-column totals and one-click stage moves
- **Meetings** — schedule calls with notes, upcoming / past states
- **Email** — demo composer that logs to the activity feed (wire a provider to send for real)
- **Settings** — account, backend status, reset / clear demo data
- **App shell** — sidebar, header search, global "New" button, routing
- Clean dark theme, ready to make your own

## Demo mode (no backend required)

If no Supabase keys are configured, the app runs in **demo mode**: sign in with
any email/password (or click "explore instantly"), and all data lives in your
browser via `localStorage`. Create/edit/delete all work and survive refreshes.
This is the fastest way to see the CRM. To go live, just add real Supabase keys
(next section) and restart — the app switches to Supabase auth automatically.

## Quick start

```bash
# 1. install
npm install

# 2. (optional) add your Supabase keys — skip this to run in demo mode
cp .env.example .env

# 3. run it
npm run dev
```

Then open the local URL it prints (http://localhost:5180).

## Your Supabase keys

In your Supabase project go to **Project Settings → API** and copy:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon public key** → `VITE_SUPABASE_ANON_KEY`

Put both in your `.env` file. Never commit `.env` — it's already in `.gitignore`.

## Deploy

Push to GitHub, import the repo on [Vercel](https://vercel.com), add the two environment variables in the Vercel project settings, and deploy.

---

Built by [Vernon Tech & Media](https://vernontm.com).
