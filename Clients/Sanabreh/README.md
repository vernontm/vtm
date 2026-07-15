# Sanabreh Mediterranean — Marketing System

A reusable system for running Sanabreh's weekly restaurant marketing (Halal Jordanian/
Palestinian, Clear Lake / Bay Area Houston). Built for Vernon Tech & Media.

## How to run a week

In any Claude Code session in this repo, say:

> **"Run Sanabreh this week"** (or "generate Sanabreh's outline for Father's Day week", etc.)

That triggers the **`sanabreh-marketing`** skill, which:
1. Reads `brand-brief.md` (menu, prices, specials, voice, hype cadence) +
   `events-calendar-2026.md` (dated opportunities in the next ~2–3 weeks).
2. Builds a dated **weekly outline** with: the day-by-day ramp, **Nano Banana image
   prompts**, paste-ready **email + social copy**, and the **MailerLite action list**.
3. Saves it to `weekly-outlines/YYYY-MM-DD-week.md`.

## Files

| File | What it is | Update when |
|------|------------|-------------|
| `brand-brief.md` | Menu, prices, specials, voice, **hype cadence**, promo rules | Menu/price/special changes |
| `events-calendar-2026.md` | Real Houston/Clear Lake events + marketing angles (World Cup, holidays, sports, local) | New event found / monthly refresh |
| `mailerlite-setup.md` | Step-by-step: birthday automation + weekly/holiday campaigns | MailerLite process changes |
| `weekly-outlines/` | One generated outline per week | Auto, each run |
| `../../.claude/skills/sanabreh-marketing/SKILL.md` | The engine | Workflow/format changes |

## Core principles baked in

- **Ramp, don't announce.** Every special/holiday gets a multi-day build-up ending on the
  day — never day-of only. Social = daily drumbeat; email = the 1–2 highest-intent sends.
- **Halal-forward.** It's the key differentiator — lead with it.
- **Catering is the high-ticket goal** for events (World Cup, Eid, Father's Day, Thanksgiving).

## The recurring promos

- **Monday:** $10 Chicken Shawarma Platter (reg $17.99)
- **Wednesday:** $7 Chicken Shawarma Wrap (reg $14.99)
- **Birthday:** auto coupon ~3 days before (MailerLite, runs forever)
- **Father's/Mother's Day:** parent eats free (with paying guest) · **Other holidays:** 20% off
- **World Cup (Jun 14–Jul 4):** Houston is a host city — watch parties + group catering

## Status / open items

- [ ] MailerLite: build the **birthday automation** + add the **Birthday date field** to forms
- [ ] Confirm with owner: birthday reward + code, World Cup catering pricing, Father's Day mechanic
- [ ] Optional live MailerLite pass to build the automations together
