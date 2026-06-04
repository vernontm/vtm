# CRM Funnel — Setup & Launch Checklist

Everything for the "Build Your Own CRM (With AI)" funnel is built and wired into the VTM site (`New/`). This is what you fill in before it goes live. Scripts live in [CRM_FUNNEL_SCRIPTS.md](CRM_FUNNEL_SCRIPTS.md).

---

## What was built

**Pages** (in `New/`, routed in `New/vercel.json`):

| URL | File | Role |
|-----|------|------|
| `/crm-blueprint` | `crm-blueprint.html` | Opt-in — free Simple CRM Blueprint |
| `/crm-build` | `crm-build.html` | Tripwire — $17 repo + $9 Context File bump + decline modal |
| `/crm-lab` | `crm-lab.html` | One-click OTO — CRM Lab founding annual $297 |
| `/crm-welcome` | `crm-welcome.html` | Confirmation + asset delivery + second-chance CRM Lab offer |

**API** (`New/api/funnel/`): `subscribe.js`, `checkout.js`, `oto.js`, `decline.js`, `stripe-webhook.js`.
**Libs** (`New/api/_lib/`): `stripe.js` (REST wrapper), `funnel.js` (contact tagging into `crm_email_contacts`).

**Flow:** opt-in → tripwire → (buy) one-click OTO → welcome · (decline) → welcome in blueprint mode. The card saved on the $17 checkout is what powers the one-click $297 upsell.

**Done-For-You is parked, not live.** The click-path tops out at the $297 CRM Lab annual. The `$997 Done-For-You` offer is sold later by email + a booked call, not as a funnel page. The `done-for-you-crm.html` page and its VSL script are built and sitting on disk, but the route is removed from `vercel.json` and nothing links to it — flip it on when you're ready (re-add the rewrite, link it from the welcome page or an email).

---

## 1. Environment variables (Vercel)

Already set on the project (reused): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (or the `CRM_*` equivalents), `STRIPE_SECRET_KEY`.

Add these:

| Var | Value | Notes |
|-----|-------|-------|
| `FUNNEL_DOMAIN` | `https://vernontm.com` | Used for Stripe success/cancel URLs. Defaults to this if unset. |
| `FUNNEL_STRIPE_WEBHOOK_SECRET` | `whsec_…` | Signing secret for the funnel webhook (step 3). Falls back to `STRIPE_WEBHOOK_SECRET` if you reuse one endpoint. |
| `FUNNEL_CLIENT_ID` | *(optional)* | Defaults to VTM's email-list client `27231196-0aac-45f6-ad3c-427bf09310ae` (same as the public lead form). |

## 2. Fill in the asset URLs

Open `New/crm-welcome.html` and replace the `ASSETS` block placeholders (all marked `#TODO`):

- `blueprint` — the free Simple CRM Blueprint PDF/guide link
- `repo` — the CRM Build GitHub repo (or a repo-access/invite page)
- `context` — the Context File for Claude download (the $9 bump)
- `lab` — the CRM Lab member area
- `bookCall` — already set to `/book-call` (your existing Google Calendar redirect)

## 3. Stripe webhook

In the Stripe dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://vernontm.com/api/funnel/stripe-webhook`
- Events: `checkout.session.completed`, `payment_intent.succeeded`
- Copy the signing secret into `FUNNEL_STRIPE_WEBHOOK_SECRET`.

No Stripe products to create — prices are inline ($17 / $9 / $297 / $700-or-997 fallback) in the endpoint code.

## 4. Upload the videos

The pages point at these paths in the `landing-media` Supabase bucket (record the CRM versions of the scripts, then upload to exactly these names):

- `crm-landing.mp4` (opt-in) · `crm-tripwire.mp4` · `crm-lab.mp4` (OTO) · `crm-dfy.mp4`

## 5. Analytics (optional but recommended)

Each page has a `<!-- TODO(analytics) -->` comment in the `<head>`. Paste your Meta Pixel + GA4 base tags there. All `fbq`/`gtag` event calls are already in place and guarded (they no-op until the base tags exist). Events wired: `Lead` (opt-in), `ViewContent` + `InitiateCheckout` (tripwire/OTO/DFY), `Purchase` (welcome).

---

## Test before launch (Stripe test mode, card 4242 4242 4242 4242)

1. `/crm-blueprint` → submit email → lands on `/crm-build`; contact appears in `crm_email_contacts` tagged `funnel:crm-lead`, `blueprint:pending`.
2. On `/crm-build`, click the decline ghost button → modal → confirm → lands on `/crm-welcome?product=blueprint` showing the blueprint link; contact tagged `declined:tripwire`.
3. Fresh email → opt-in → buy $17 (tick the $9 bump) → Stripe → back on `/crm-lab?session=cs_…`; webhook tags `buyer:crm-build` (+ `bump:context-file`).
4. On `/crm-lab`, click yes → $297 charges the same card with no re-entry → `/crm-welcome?product=crm-lab&upgraded=1`; tagged `buyer:crm-lab`. (3DS test cards route to the fallback checkout — confirm that path too.)
5. Decline the OTO instead → `/crm-welcome?product=crm-build` shows the downloads plus a second-chance "join CRM Lab" card linking back to `/crm-lab` with the session.

---

## Known follow-ups (deliberately deferred)

- **CRM Lab auto-renew.** The $297 OTO currently charges the founding year as a single payment (reliable for a one-click against a saved card). True yearly auto-renew = a Stripe subscription; add it when you want hands-off renewals. The `$37/mo` monthly tier (email/pricing-page path) isn't built yet — it's an email-sold fallback per the strategy doc.
- **Done-For-You ($997).** Parked for now — page + script exist on disk but it's unrouted and sold later by email + call. When you turn it on, the $700 credit for existing CRM Lab buyers (page shows $997; close the $297 credit on the call) is the small remaining piece to automate.
- **Email delivery.** Assets are delivered on the welcome page (reliable, no email dependency). The drip/nurture sequences in `CRM_FUNNEL_SCRIPTS.md` still need to be built in MailerLite; contacts are already tagged for that automation.
- **Decline-as-delivery email safety net.** Bouncers who never click buy or decline keep the `blueprint:pending` tag — wire a MailerLite automation to email them the blueprint after ~15 min.
