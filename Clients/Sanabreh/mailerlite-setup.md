# Sanabreh — MailerLite Setup Guide

Step-by-step build for the email side. Do the **one-time setup** once; the **weekly /
holiday campaigns** repeat (the skill writes the copy each week).

> MailerLite generates the *email*, not POS coupon codes. Use simple static codes the
> restaurant honors at the register/online (e.g. `BDAY`, `WRAPDAY`, `DADSFREE`).
> Confirm with Sanabreh how codes are redeemed before launching.

---

## PART 1 — One-time foundation

### 1. Custom fields (Subscribers → Fields)
Create these if they don't exist:
- **Birthday** — type **Date** (field key `birthday`)
- **First name** — type Text (usually exists as `name`)
- *(optional)* **Anniversary** — Date, if they ever collect it

### 2. Collect birthdays
Add the **Birthday** field to every intake point:
- MailerLite signup **form / landing page** → add the Birthday date field (mark required).
- In-store tablet/QR signup → same form.
- Backfill: if birthdays live in the POS/old list, export and **import** with the Birthday
  column mapped to the `birthday` field.

### 3. Groups (Subscribers → Groups)
- **All Customers** (master)
- *(optional)* **VIP / Regulars**, **Catering Leads**, **Hookah Lounge** for targeting.

---

## PART 2 — 🎂 Birthday coupon automation (set once, runs forever)

**Automations → Create automation → Start from scratch.**

1. **Trigger:** choose **"Based on a date field."**
   - Date field: **Birthday**
   - Timing: **3 days before** the date (gives them the birthday week to come in)
   - **Repeat every year: ON** (ignore the year — fires annually). ✅ critical for birthdays
2. **(Optional) Condition/Filter:** subscriber is in group **All Customers** and is
   subscribed (skip unsubscribes automatically).
3. **Action → Email.** Subject + body from the skill's birthday template. Include:
   - Personalized greeting (`{$name}`)
   - The **birthday offer** + **code** (see below)
   - Validity window (e.g., "valid through your birthday week")
   - Halal note, address (Clear Lake / Bay Area), hours, order line, IG.
4. *(Optional) Delay 7 days → Email 2:* "Last chance — your birthday treat expires soon 🎂"
5. **Set status to Active.**

**Recommended birthday offer (pick one, confirm with owner):**
- 🥇 **Free Mini Kunafa** (dessert) with any entrée — low cost, high delight, on-brand.
- Or **Free Chicken Shawarma Wrap** with any purchase.
- Or **20% off** the whole birthday table.

**Code convention:** static `BDAY` is simplest. For tracking, generate a yearly code like
`BDAY26`. (Truly unique per-person codes need a POS/coupon tool MailerLite doesn't provide.)

---

## PART 3 — 🗓️ Weekly specials (Mon $10 platter / Wed $7 wrap)

Specials change creative weekly, so run them as **scheduled regular campaigns** (the skill
generates copy + image each week). Keep email to the **2 highest-intent sends**; social
carries the daily ramp.

**Suggested weekly email rhythm**
| Send | When | Content |
|------|------|---------|
| **"This Week at Sanabreh"** | **Sun evening** | Both specials + any event/holiday tie-in for the week |
| **"Today only: $7 Wrap"** | **Wed ~10 AM** | Day-of reminder for the bigger hook (the wrap) |

**To schedule each (Campaigns → Create campaign → Regular campaign):**
1. Name it `YYYY-MM-DD Weekly Roundup` / `YYYY-MM-DD Wed Wrap`.
2. Recipients: **All Customers** (or a segment).
3. Subject + content: paste from the weekly outline the skill produced.
4. **Schedule** for the date/time above (don't send immediately).

> Optional automation alternative: a repeating workflow that fires every Tuesday/Wednesday
> with evergreen copy. Manual scheduling is recommended so creative stays fresh and ties to
> events. The skill's weekly outline gives you paste-ready copy each time.

---

## PART 4 — 🎉 Holiday / event campaigns (as they come up)

Triggered from the **events calendar**. These are one-off **scheduled campaigns**, ramped
2–4 days before the date (build hype — never day-of only):

- **Father's Day** → "Dads Eat Free" — send ramp (Thu/Fri) + reminder (Sat) before Sun.
- **World Cup watch parties / catering** → per-fixture sends during Jun 14–Jul 4.
- **Eid / Ramadan** → iftar & celebration catering (flagship; verify dates ~2 wks out).
- **Other holidays** → 20% off, scheduled with a 2–3 day ramp.

Build exactly like Part 3 (Regular campaign → schedule), using the skill's copy + the
brand promo rules.

---

## Quick reference — what's automated vs. manual

| Item | Type | Frequency |
|------|------|-----------|
| Birthday coupon | **Automation** (date-based, annual) | Set once, runs forever |
| Weekly specials | Scheduled campaigns | ~2 emails/week (skill writes copy) |
| Holidays / World Cup / Eid | Scheduled campaigns | Per event, ramped early |

> When we do the live MailerLite pass, this doc is the checklist. Re-confirm field keys
> and the exact trigger labels in the current MailerLite UI — wording shifts occasionally,
> but "date-field trigger + repeat yearly" is the birthday mechanism.
