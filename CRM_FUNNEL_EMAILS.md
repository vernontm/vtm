# CRM Funnel — Email Automations

**Sender:** Ray - Vernon Tech And Media · ray@vernontm.com
**ESP:** MailerLite (client "rayvaughnceo"). **Voice:** no em dashes, contractions on, big-brother tone.

## How it works
The funnel drops each contact into a MailerLite **group** based on what they do. Each group triggers one **automation** (you build these in the MailerLite dashboard — MailerLite's API can't create automations, only groups). The groups are already created:

| Group | Created when | Group ID |
|-------|--------------|----------|
| **CRM Lead** | opt-in (free guide) | 189348300446500792 |
| **CRM Decliner** | declined the $17 tripwire | 189348300773655766 |
| **CRM Build Buyer** | bought the $17 build | 189348301098714576 |
| **CRM Context Buyer** | added the $9 Context File | 189348301538068261 |
| **CRM Lab Member** | bought the $297 CRM Lab | 189348301857883238 |

**Mutual exclusion (set in each automation's trigger settings):**
- When someone enters **CRM Build Buyer**, stop the **CRM Lead** and **CRM Decliner** automations (they bought — stop selling them the build).
- When someone enters **CRM Lab Member**, stop the **CRM Build Buyer** automation (they're at the top of the ladder).

Links used below: free guide `https://vernontm.com/crm-blueprint-guide` · build `https://vernontm.com/crm-build` · CRM Lab `https://vernontm.com/crm-lab`.

---

## Sequence A — CRM Lead (opt-in, hasn't bought)
*Goal: deliver the guide as a safety net, then move them to the $17 build. Trigger: joins "CRM Lead".*

### A1 — immediately
**Subject:** Here's your Simple CRM Blueprint
Hey, you're in. Here's the free guide I promised: build your own CRM with AI, in plain English, step by step.

👉 Read it here: https://vernontm.com/crm-blueprint-guide

Start with Step 1 (it's about five minutes of setup) and just follow the prompts. You talk, Claude builds. If you get stuck anywhere, hit reply and tell me.

Talk soon,
Ray

### A2 — +1 day
**Subject:** the part nobody tells you about building a CRM
Quick truth. Reading how to build a CRM is the easy part. The hard part is everything after: the setup, the database, the hundred little decisions, the midnight "why won't this connect" moments.

That's exactly why I packaged up the finished build. It's the exact CRM from the guide, done. You don't rebuild it, you open it and make it yours.

If you'd rather skip straight to a working CRM: https://vernontm.com/crm-build

Ray

### A3 — +2 days
**Subject:** I'm not a "real" developer either
I want to kill the excuse before it stops you. I'm not a classically trained developer. I built this entire CRM by talking to AI in plain English, and I filmed every step.

If I can do it, you can. The blueprint shows you how, and the build hands you the finished thing so you're not starting from a blank screen.

The shortcut: https://vernontm.com/crm-build

Ray

### A4 — +3 days
**Subject:** $17 once vs $497 a month
Let me do quick math with you. GoHighLevel runs anywhere from $99 to $497 a month. Every month. Forever. And you never own it.

The full CRM build is $17. One time. Yours to keep, clone, and customize forever. That's less than one month of the tool you'd otherwise rent for life.

Grab it here: https://vernontm.com/crm-build

Ray

### A5 — +5 days
**Subject:** last nudge on this
I'll stop emailing you about the build after this. If owning your own CRM instead of renting one sounds good, the door's right here:

https://vernontm.com/crm-build

Either way, the free blueprint is yours to keep. Go build something.

Ray

---

## Sequence B — CRM Decliner (declined the tripwire)
*Goal: they have the free guide; win them back to the $17 build. Trigger: joins "CRM Decliner".*

### B1 — immediately
**Subject:** your blueprint's inside
No worries at all. As promised, your Simple CRM Blueprint is yours: https://vernontm.com/crm-blueprint-guide

Work through it at your pace. And if you ever decide you'd rather skip the building and just open the finished CRM, it's one click away. No pressure.

Ray

### B2 — +2 days
**Subject:** if the setup feels like a lot...
Totally normal. The guide walks you through it, but building from scratch still takes some patience. If you'd rather have the finished build in your hands and just customize it, that's exactly what the $17 version is for.

https://vernontm.com/crm-build

Ray

### B3 — +4 days
**Subject:** own it, don't rent it
You're already paying (or about to pay) for a CRM you'll never own. $17 one time gets you one you do. That math doesn't really have two sides.

Last time I'll mention it: https://vernontm.com/crm-build

Ray

---

## Sequence C — CRM Build Buyer (bought the $17 build)
*Goal: make sure they win with it, then move them to CRM Lab. Trigger: joins "CRM Build Buyer". Stops Sequences A & B.*

### C1 — immediately
**Subject:** your CRM Build is ready 🎉
You're in. Here's how to actually use it:

1. Download the build .zip from your welcome page (the link I sent on checkout).
2. Open the Claude desktop app, drag the folder in, and say "set this up and run it for me."
3. Follow the blueprint from there: https://vernontm.com/crm-blueprint-guide

If you grabbed the Context File too, drop it in the folder as CLAUDE.md and Claude will know exactly what to do. Stuck on anything? Reply to this email.

Ray

### C2 — +2 days
**Subject:** the part that eats your weekend
Owning the build is one thing. Wiring it up your way (Gmail, AI, voice, deploying it live) is the part that quietly eats your weekend if you're doing it alone.

That's what CRM Lab is for. I teach you to wire in every piece, with me there to answer questions, and the whole thing is built around the exact CRM you already have.

Take a look: https://vernontm.com/crm-lab

Ray

### C3 — +4 days
**Subject:** founding rate on CRM Lab
Quick heads up. CRM Lab has a founding rate locked for life: a full year for less than you'd pay for a single month of GoHighLevel. New modules, integration walkthroughs, and me answering your questions.

The founding rate won't last forever. If you want in: https://vernontm.com/crm-lab

Ray

---

## Sequence D — CRM Context Buyer (added the $9 Context File)
*Short, runs alongside Sequence C. Trigger: joins "CRM Context Buyer".*

### D1 — immediately
**Subject:** how to use your Context File
You grabbed the Context File, nice. Here's the move: drop that file into your project folder and keep the name **CLAUDE.md**. Claude reads it automatically every time, so it always knows your whole build, how to set up Supabase, deploy to Vercel, everything.

Then just tell Claude what you want next. It already knows the rest.

Ray

---

## Sequence E — CRM Lab Member (bought $297)
*Goal: onboard, keep them, and open the DFY side-door. Trigger: joins "CRM Lab Member". Stops Sequence C.*

### E1 — immediately
**Subject:** welcome to CRM Lab — start here
You're a founding member. Here's how to get rolling:

1. Book your founding 1-on-1 onboarding call (link in your welcome page).
2. Open your build and the blueprint side by side.
3. Hop into the first integration walkthrough and wire one thing in (start with Gmail or AI).

Reply here anytime you hit a wall. That's what the Lab is for.

Ray

### E2 — +3 days
**Subject:** new in the Lab
Dropped a fresh walkthrough inside the Lab this week. This is what membership looks like: every time something new gets added, your CRM gets more powerful without you rebuilding from scratch.

Jump in: https://vernontm.com/crm-lab

Ray

### E3 — +10 days
**Subject:** want me to just build it for you?
If life's busy and you'd rather not build it yourself, my team can do the whole thing for you, done-for-you, and your CRM Lab year credits toward it.

Reply "DFY" and I'll send you the details.

Ray

---

## Setting up the automations in MailerLite (one-time)
The groups exist; build one automation per group:

1. MailerLite → **Automations** → **Create workflow**.
2. Trigger: **"When subscriber joins a group"** → pick the group (e.g. *CRM Lead*).
3. Add the emails above as steps, with a **Delay** step before each timed one (A2 = 1 day, A3 = 2 days, etc.).
4. From name/email: **Ray - Vernon Tech And Media / ray@vernontm.com**.
5. For the buyer/member workflows, open **workflow settings** and set it to **remove the subscriber from the Lead/Decliner workflows** on entry (the mutual-exclusion rules above).
6. Turn the workflow **on**. Repeat for each group (A→Lead, B→Decliner, C→Build Buyer, D→Context Buyer, E→Lab Member).

*(MailerLite builds automations in the dashboard only — there's no API to create the workflows, which is why this step is manual. The funnel already drops people into the right group automatically.)*
